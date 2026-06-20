import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertActorMatches, assertElderOrFamilyCan, assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { review_id: "uuid", decision: "string" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);

    if (!["approved", "rejected", "needs_clarification"].includes(String(body.decision))) {
      throw new Error("decision must be approved, rejected or needs_clarification");
    }

    const idem = req.headers.get("idempotency-key") ?? body.idempotency_key;
    const result = await withIdempotency({
      key: idem,
      functionName: "fn-medication-ocr-review",
      elderId: body.elder_id,
      profileId: userId,
      requestBody: body,
      run: async () => {
        const db = userClient(req);
        const { data: review, error: rErr } = await db.from("medication_ocr_reviews")
          .select("*").eq("id", body.review_id).maybeSingle();
        if (rErr) throw rErr;
        if (!review) throw new Error("Review not found");
        assertActorMatches(userId, review.elder_id, "review.elder_id");
        // Family members can review if they have medication permission
        if (userId !== review.elder_id) {
          await assertElderOrFamilyCan(userId, String(review.elder_id), "medications");
        }

        if (body.decision === "approved") {
          const approved = body.approved_payload ?? review.proposed_payload;
          const { data: med, error: mErr } = await db.from("medications").insert({
            elder_id: review.elder_id,
            name_nl: approved.name_nl,
            name_en: approved.name_en ?? null,
            brand_name_nl: approved.brand_name_nl ?? null,
            dose_description_nl: approved.dose_description_nl,
            dose_description_en: approved.dose_description_en ?? null,
            frequency: approved.frequency,
            schedule_times: approved.schedule_times ?? [],
            instructions_nl: approved.instructions_nl ?? null,
            instructions_en: approved.instructions_en ?? null,
            with_food: Boolean(approved.with_food),
            is_active: true,
            start_date: new Date().toISOString().slice(0, 10),
            prescribed_by_nl: approved.prescribed_by_nl ?? null,
          }).select().single();
          if (mErr) throw mErr;

          // Create medication_reminders for each schedule_time today
          const dbAdmin = admin();
          const scheduleTimes: string[] = Array.isArray(approved.schedule_times) ? approved.schedule_times : [];
          for (const t of scheduleTimes) {
            await dbAdmin.from("medication_reminders").insert({
              medication_id: med.id,
              elder_id: review.elder_id,
              scheduled_time: `${new Date().toISOString().slice(0, 10)}T${t}:00`,
              status: "gepland",
            });
          }
          await db.from("medication_ocr_jobs").update({
            status: "completed",
            review_required: false,
            created_medication_id: med.id,
          }).eq("id", review.ocr_job_id);

          await db.from("medication_ocr_reviews").update({
            reviewer_id: userId,
            status: "approved",
            approved_payload: approved,
            notes: body.notes ?? null,
            updated_at: new Date().toISOString(),
          }).eq("id", body.review_id);
          return { body: { review_id: body.review_id, decision: "approved", created_medication_id: med.id } };
        } else {
          await db.from("medication_ocr_reviews").update({
            reviewer_id: userId,
            status: body.decision,
            notes: body.notes ?? null,
            updated_at: new Date().toISOString(),
          }).eq("id", body.review_id);
          return { body: { review_id: body.review_id, decision: body.decision } };
        }
      },
    });

    await recordMetric("fn-medication-ocr-review", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-medication-ocr-review", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});