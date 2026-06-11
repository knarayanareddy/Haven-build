import { admin, cors, dispatchNotification, json, recordMetric } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const db = admin();
    let query = db.from("medications").select("id,elder_id,current_stock,refill_threshold,refill_pharmacy_nl,name_nl").eq("is_active", true).is("deleted_at", null).not("current_stock", "is", null).not("refill_threshold", "is", null);
    if (body.elder_id) query = query.eq("elder_id", body.elder_id);
    const { data: meds, error } = await query;
    if (error) throw error;
    let created = 0;
    for (const med of meds ?? []) {
      if (Number(med.current_stock) <= Number(med.refill_threshold)) {
        const { data: event } = await db.from("medication_refill_events").insert({ elder_id: med.elder_id, medication_id: med.id, current_stock: med.current_stock, threshold: med.refill_threshold, pharmacy_nl: med.refill_pharmacy_nl, status: "due_soon" }).select().single();
        const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", med.elder_id).eq("elder_consented", true).eq("is_active", true).eq("can_view_medications", true);
        await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: med.elder_id, notification_type: "systeem", title_nl: "Bijna nieuwe voorraad nodig", title_en: "Refill may be needed", body_nl: `${med.name_nl} raakt bijna op.`, body_en: `${med.name_nl} may need a refill soon.`, data: { refill_event_id: event?.id ?? "" } })));
        created++;
      }
    }
    await recordMetric("fn-medication-refill", started, "success");
    return json({ success: true, refill_events_created: created });
  } catch (e) {
    await recordMetric("fn-medication-refill", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
