import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "requested_by_id"]);
    const db = admin();
    const { data: requestRow, error } = await db.from("deletion_requests").insert({ elder_id: body.elder_id, requested_by_id: body.requested_by_id, reason: body.reason ?? "user_request", status: "processing" }).select().single();
    if (error) throw error;
    const now = new Date().toISOString();
    const softTables = ["medications", "tasks", "family_messages", "life_stories", "documents", "companion_memory", "scam_events", "location_events", "neighbourhood_profiles", "financial_transactions", "nutrition_logs"];
    for (const table of softTables) await db.from(table).update({ deleted_at: now }).eq("elder_id", body.elder_id);
    await db.from("voice_interactions").update({ transcript_nl: null, transcript_en: null, response_text_nl: null, response_text_en: null, deleted_at: now }).eq("elder_id", body.elder_id);
    await db.from("family_relationships").update({ is_active: false, elder_consented: false, deleted_at: now }).eq("elder_id", body.elder_id);
    await db.from("deletion_requests").update({ status: "completed", completed_at: now, confirmation_sent_at: now }).eq("id", requestRow.id);
    await recordMetric("fn-right-to-erasure", started, "success");
    return json({ success: true, deletion_request_id: requestRow.id, completed_at: now });
  } catch (e) {
    await recordMetric("fn-right-to-erasure", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
