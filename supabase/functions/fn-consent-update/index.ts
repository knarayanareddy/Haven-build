import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "consent_type", "granted"]);
    const db = admin();
    const { data: consent, error } = await db.from("consent_records").insert({ elder_id: body.elder_id, consent_type: body.consent_type, granted: Boolean(body.granted), channel: body.channel ?? "elder_app", consent_version: body.consent_version ?? "1.2.1", withdrawn_at: body.granted ? null : new Date().toISOString() }).select().single();
    if (error) throw error;
    if (body.relationship_id && body.relationship_kind === "family") {
      await db.from("family_relationships").update({ elder_consented: Boolean(body.granted), elder_consented_at: body.granted ? new Date().toISOString() : null, is_active: Boolean(body.granted) }).eq("id", body.relationship_id).eq("elder_id", body.elder_id);
    }
    await recordMetric("fn-consent-update", started, "success");
    return json({ success: true, consent_record_id: consent.id });
  } catch (e) {
    await recordMetric("fn-consent-update", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
