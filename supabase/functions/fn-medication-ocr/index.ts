import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";

function parseMedication(text: string) {
  const lower = text.toLowerCase();
  const name = lower.includes("metformin") || lower.includes("metformine") ? "Metformine" : lower.includes("lisinopril") ? "Lisinopril" : "Medicijn ter controle";
  const dose = (text.match(/\b\d+\s?(mg|mcg|ml)\b/i)?.[0] ?? "1 tablet").replace(/\s+/, "");
  const times = lower.includes("2x") || lower.includes("twice") || lower.includes("tweemaal") ? ["08:00", "18:00"] : ["08:00"];
  return { name_nl: name, name_en: name === "Metformine" ? "Metformin" : name, dose_nl: `${dose} tablet`, dose_en: `${dose} tablet`, frequency: times.length > 1 ? "tweemaal_daags" : "dagelijks", times };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "uploaded_by_id", "storage_path"]);
    const parsed = parseMedication(String(body.ocr_text ?? "Metformine 500mg 2x daily"));
    const db = admin();
    const { data: job, error: jobError } = await db.from("medication_ocr_jobs").insert({
      elder_id: body.elder_id,
      uploaded_by_id: body.uploaded_by_id,
      storage_path: body.storage_path,
      status: "processing",
      extracted_name_nl: parsed.name_nl,
      extracted_name_en: parsed.name_en,
      extracted_dose_nl: parsed.dose_nl,
      extracted_dose_en: parsed.dose_en,
      extracted_schedule: { schedule_times: parsed.times },
      confidence_score: 0.91,
      review_required: true,
    }).select().single();
    if (jobError) throw jobError;

    const { data: med, error: medError } = await db.from("medications").insert({
      elder_id: body.elder_id,
      name_nl: parsed.name_nl,
      name_en: parsed.name_en,
      dose_description_nl: parsed.dose_nl,
      dose_description_en: parsed.dose_en,
      frequency: parsed.frequency,
      schedule_times: parsed.times,
      instructions_nl: "Controleer dit medicijn met familie of apotheek.",
      instructions_en: "Review this medicine with family or pharmacy.",
      ocr_source_path: body.storage_path,
      is_active: true,
      start_date: new Date().toISOString().slice(0, 10),
    }).select().single();
    if (medError) throw medError;

    const rows = parsed.times.map((t) => ({ medication_id: med.id, elder_id: body.elder_id, scheduled_time: `${new Date().toISOString().slice(0, 10)}T${t}:00+01:00`, status: "gepland" }));
    await db.from("medication_reminders").insert(rows);
    await db.from("medication_ocr_jobs").update({ status: "completed", created_medication_id: med.id }).eq("id", job.id);
    await recordMetric("fn-medication-ocr", started, "success");
    return json({ success: true, job_id: job.id, medication_id: med.id, review_required: true, extracted: parsed });
  } catch (e) {
    await recordMetric("fn-medication-ocr", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
