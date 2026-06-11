import { admin, cors, dispatchNotification, json, recordMetric } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const db = admin();
    const { data: vitals, error } = await db.from("vital_signs").select("id,elder_id,vital_type,value,unit").eq("threshold_flag", true).is("family_notified_at", null).gte("recorded_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (error) throw error;
    let notified = 0;
    for (const vital of vitals ?? []) {
      const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", vital.elder_id).eq("elder_consented", true).eq("is_active", true).eq("can_view_medications", true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: vital.elder_id, notification_type: "welzijnscheck", title_nl: "Gezondheidswaarde vraagt aandacht", title_en: "Health reading needs attention", body_nl: "HAVEN zag een gezondheidswaarde buiten de ingestelde grens.", body_en: "HAVEN saw a health reading outside the configured threshold.", data: { vital_sign_id: vital.id } })));
      await db.from("vital_signs").update({ family_notified_at: new Date().toISOString() }).eq("id", vital.id);
      notified++;
    }
    await recordMetric("fn-vital-threshold-check", started, "success");
    return json({ success: true, notified });
  } catch (e) {
    await recordMetric("fn-vital-threshold-check", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
