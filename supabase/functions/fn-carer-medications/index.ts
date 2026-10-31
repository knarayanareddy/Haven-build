// The medications a carer may record as administered during a visit.
//
// Why this exists: `HandoverForm` offered a picker of three fixed UUIDs
// ('99999999-0000-0000-0000-00000000000{1,2,3}') as "Metformine 500 mg", "Lisinopril 10 mg" and
// "Vitamine D 20 mcg". None of those ids exist in any database, and
// `carer_handover_notes.administered_medication_id` is a foreign key to `medications(id)`. So a
// carer who recorded "I gave the Metformine" either got a 23503 foreign-key error and lost the
// whole handover note, or — where the insert succeeded — recorded a medication that was never
// prescribed.
//
// Carers cannot read `medications` directly: the RLS policies on that table admit the elder
// and consented family, and nobody else. This endpoint is the one authorised path, so it does
// the authorisation itself (`assertCarerCan`) and then reads with the service role.
import { rateLimit } from "../_shared/ratelimit.ts";
import { admin, corsHeaders, errorResponse, json, readJsonBody, recordMetric } from "../_shared/core.ts";
import { assertCarerCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

interface MedicationRow {
  id: string;
  name_nl: string;
  name_en: string | null;
  dose_description_nl: string;
  dose_description_en: string | null;
  frequency: string;
  schedule_times: string[] | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-carer-medications");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: "uuid" }, { allowUnknown: true });

    const userId = await getJwtUserId(req);
    const elderId = String(body.elder_id);
    // No active carer relationship means no medication list: a 403, not an empty array, so a
    // caller cannot tell "not prescribed anything" from "not allowed to ask".
    await assertCarerCan(userId, elderId);

    const { data, error } = await admin()
      .from("medications")
      .select("id,name_nl,name_en,dose_description_nl,dose_description_en,frequency,schedule_times")
      .eq("elder_id", elderId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name_nl", { ascending: true });

    if (error) throw error;

    const medications = ((data ?? []) as MedicationRow[]).map((row) => ({
      id: row.id,
      name_nl: row.name_nl,
      name_en: row.name_en ?? row.name_nl,
      dose_description_nl: row.dose_description_nl,
      dose_description_en: row.dose_description_en ?? row.dose_description_nl,
      frequency: row.frequency,
      schedule_times: row.schedule_times ?? [],
    }));

    await recordMetric("fn-carer-medications", started, "success");
    return json({ medications }, 200, req);
  } catch (e) {
    await recordMetric("fn-carer-medications", started, "error");
    return errorResponse(e, req);
  }
});
