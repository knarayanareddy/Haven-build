import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "carer_id", "visit_date"]);
    const db = admin();
    const { data, error } = await db.from("carer_visit_logs").insert({ elder_id: body.elder_id, carer_id: body.carer_id, visit_date: body.visit_date, check_in_time: body.check_in_time ?? new Date().toISOString(), check_out_time: body.check_out_time, activities_nl: body.activities_nl ?? [], observations_nl: body.observations_nl, mood_observed: body.mood_observed, concerns_nl: body.concerns_nl, follow_up_required: Boolean(body.follow_up_required) }).select().single();
    if (error) throw error;
    await recordMetric("fn-care-visit-log", started, "success");
    return json({ success: true, visit_log_id: data.id });
  } catch (e) {
    await recordMetric("fn-care-visit-log", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
