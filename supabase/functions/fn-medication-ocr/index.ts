// Reading a medicine box from a photograph.
//
// What this replaces: the handler called `parseMedication(String(body.ocr_text ?? "Metformine
// 500mg 2x daily"))`. No client ever sent `ocr_text`, so every request — the only kind there was
// — created a prescription for Metformine 500 mg twice a day, with `confidence_score: 0.91`
// hardcoded, for an older adult who may never have taken it. There was also no reader: nothing in
// the function looked at the image.
//
// Now the image is the input. It is read from the private bucket with the service role (the
// client uploads to `ocr-inbox/<its own id>/…` and never gets to name a path this function will
// trust), a vision model extracts name, dose and schedule, and the result is only written after
// the reading is usable. Everything else fails closed with 503 and no medication.
import { rateLimit } from "../_shared/ratelimit.ts";
import { admin, corsHeaders, json, readJsonBody, recordMetric, errorResponse } from "../_shared/core.ts";
import { assertActorMatches, assertElderOrFamilyCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { extractMedicationLabel, VisionUnavailableError, type MedicationLabelReading } from "../_shared/ai.ts";

const BUCKET = "ocr-inbox";
/** Below this, a human checks the reading before it becomes a prescription. */
const AUTO_ACCEPT_CONFIDENCE = 0.85;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function arrayBufferToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * The object key must sit inside the uploader's own folder.
 *
 * The `ocr-inbox` insert policy already forces `folder[1] = auth.uid()`, but the path is a
 * request field: without this check a family member could point the reader at another elder's
 * document and have its contents written into their own medication list.
 */
function assertOwnedObjectPath(userId: string, storagePath: string) {
  if (storagePath.includes("..") || storagePath.includes("\\")) {
    throw Object.assign(new Error("Invalid storage path"), { status: 400, code: "BAD_REQUEST" });
  }
  if (!storagePath.startsWith(`${userId}/`)) {
    throw Object.assign(new Error("403: storage_path must live in the uploader's own folder"), {
      status: 403,
      code: "FORBIDDEN",
    });
  }
}

async function readLabelFromStorage(storagePath: string): Promise<MedicationLabelReading> {
  const extension = storagePath.toLowerCase().split(".").pop() ?? "";
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) {
    throw Object.assign(new Error("Only JPEG, PNG or WebP photographs can be read"), { status: 400, code: "BAD_REQUEST" });
  }

  const { data: object, error } = await admin().storage.from(BUCKET).download(storagePath);
  if (error || !object) {
    throw Object.assign(new Error("The photograph could not be read from storage"), { status: 400, code: "BAD_REQUEST" });
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw Object.assign(new Error("The photograph is empty"), { status: 400, code: "BAD_REQUEST" });
  }
  return extractMedicationLabel(arrayBufferToBase64(bytes), mimeType);
}

async function isReviewRequired(adminClient: ReturnType<typeof admin>) {
  const { data: flag } = await adminClient.from("feature_flags").select("enabled").eq("flag_key", "med_ocr_review_required").maybeSingle();
  return Boolean(flag?.enabled);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-medication-ocr");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: "uuid", uploaded_by_id: "uuid", storage_path: "string" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertActorMatches(userId, String(body.uploaded_by_id), "uploaded_by_id");
    await assertElderOrFamilyCan(userId, String(body.elder_id), "medications");

    const storagePath = String(body.storage_path);
    assertOwnedObjectPath(userId, storagePath);

    const reading = await readLabelFromStorage(storagePath);
    const db = admin();
    // A reading the model is not sure about, or one the operator has switched into review mode,
    // never becomes a prescription on its own.
    const reviewRequired = (await isReviewRequired(db)) || reading.confidence < AUTO_ACCEPT_CONFIDENCE;

    const { data: job, error: jobError } = await db.from("medication_ocr_jobs").insert({
      elder_id: body.elder_id,
      uploaded_by_id: userId,
      storage_path: storagePath,
      status: reviewRequired ? "needs_review" : "processing",
      extracted_name_nl: reading.name,
      extracted_name_en: reading.name,
      extracted_dose_nl: reading.dose,
      extracted_dose_en: reading.dose,
      extracted_schedule: { schedule_times: reading.times },
      // The provider's figure. It used to be the literal 0.91 for every job.
      confidence_score: reading.confidence,
      review_required: reviewRequired,
    }).select().single();
    if (jobError) throw jobError;

    if (reviewRequired) {
      // Always create a medication_ocr_reviews row. Do NOT write a medication or reminders until
      // approved: this is a photograph, not a prescription.
      await db.from("medication_ocr_reviews").insert({
        ocr_job_id: job.id,
        elder_id: body.elder_id,
        status: "pending",
        proposed_payload: {
          name_nl: reading.name,
          name_en: reading.name,
          brand_name_nl: null,
          dose_description_nl: reading.dose,
          dose_description_en: reading.dose,
          frequency: reading.frequency,
          schedule_times: reading.times,
          instructions_nl: "Te controleren door familie of apotheek.",
          instructions_en: "To be reviewed by family or pharmacy.",
          with_food: false,
          confidence: reading.confidence,
        },
      });
      await recordMetric("fn-medication-ocr", started, "success");
      return json({
        success: true,
        job_id: job.id,
        review_required: true,
        review_pending: true,
        confidence: reading.confidence,
        extracted: { name_nl: reading.name, dose_nl: reading.dose, frequency: reading.frequency, times: reading.times },
        uploaded_by_id: userId,
      }, 200, req);
    }

    const { data: med, error: medError } = await db.from("medications").insert({
      elder_id: body.elder_id,
      name_nl: reading.name,
      name_en: reading.name,
      dose_description_nl: reading.dose,
      dose_description_en: reading.dose,
      frequency: reading.frequency,
      schedule_times: reading.times,
      instructions_nl: "Controleer dit medicijn met familie of apotheek.",
      instructions_en: "Review this medicine with family or pharmacy.",
      ocr_source_path: storagePath,
      is_active: true,
      start_date: new Date().toISOString().slice(0, 10),
    }).select().single();
    if (medError) throw medError;

    const today = new Date().toISOString().slice(0, 10);
    const rows = reading.times.map((time) => ({
      medication_id: med.id,
      elder_id: body.elder_id,
      scheduled_time: `${today}T${time}:00+01:00`,
      status: "gepland",
    }));
    const { error: reminderError } = await db.from("medication_reminders").insert(rows);
    if (reminderError) throw reminderError;
    await db.from("medication_ocr_jobs").update({ status: "completed", created_medication_id: med.id }).eq("id", job.id);

    // The photograph has served its purpose; keeping it is retention without a reason.
    await db.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);

    await recordMetric("fn-medication-ocr", started, "success");
    return json({
      success: true,
      job_id: job.id,
      medication_id: med.id,
      review_required: false,
      confidence: reading.confidence,
      extracted: { name_nl: reading.name, dose_nl: reading.dose, frequency: reading.frequency, times: reading.times },
      uploaded_by_id: userId,
    }, 200, req);
  } catch (e) {
    // An unreadable label is a fallback, not an outage: the elder is asked to try again and no
    // prescription is written. A storage or database failure is an error.
    await recordMetric("fn-medication-ocr", started, e instanceof VisionUnavailableError ? "fallback" : "error");
    return errorResponse(e, req);
  }
});
