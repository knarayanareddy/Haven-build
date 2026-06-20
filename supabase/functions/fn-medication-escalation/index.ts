import { admin, corsHeaders, dispatchNotification, json, recordMetric, safeErrorMessage } from "../_shared/core.ts";
import { requireInternalAccess } from "../_shared/internal.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    requireInternalAccess(req);
    const db = admin();
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: reminders, error } = await db.from("medication_reminders").select("id, elder_id, status, scheduled_time").in("status", ["herinnerd", "gesnoozed_1", "gesnoozed_2"]).lt("scheduled_time", cutoff);
    if (error) throw error;
    let escalated = 0;
    for (const r of reminders ?? []) {
      await db.from("medication_reminders").update({ status: "geëscaleerd", escalated_at: new Date().toISOString() }).eq("id", r.id);
      const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", r.elder_id).eq("elder_consented", true).eq("is_active", true).eq("notify_on_missed_meds", true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: r.elder_id, notification_type: "medicijn_gemist", title_nl: "Medicijn nog niet bevestigd", title_en: "Medication not confirmed yet", body_nl: "HAVEN heeft rustig herinnerd. Misschien is een telefoontje fijn.", body_en: "HAVEN reminded calmly. A call may help.", data: { reminder_id: r.id } })));
      escalated++;
    }
    await recordMetric("fn-medication-escalation", started, "success");
    return json({ success: true, escalated });
  } catch (e) {
    await recordMetric("fn-medication-escalation", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});