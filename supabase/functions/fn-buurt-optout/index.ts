import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id"]);
    const db = admin();
    const now = new Date().toISOString();
    await db.from("neighbourhood_profiles").update({ is_active: false, opted_out_at: now, deleted_at: now }).eq("elder_id", body.elder_id);
    await db.from("elder_interest_tags").delete().eq("elder_id", body.elder_id);
    await db.from("neighbourhood_connections").update({ status: "ended", ended_by: body.elder_id, ended_reason_internal: "elder_opted_out" }).or(`initiator_elder_id.eq.${body.elder_id},recipient_elder_id.eq.${body.elder_id}`);
    await recordMetric("fn-buurt-optout", started, "success");
    return json({ success: true, opted_out_at: now });
  } catch (e) {
    await recordMetric("fn-buurt-optout", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
