import { admin, cors, dispatchNotification, json, recordMetric } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const db = admin();
    const week = new Date();
    week.setDate(week.getDate() - week.getDay() + 1);
    const week_starting = week.toISOString().slice(0, 10);
    const { data: elders } = await db.from("profiles").select("id").eq("role", "elder").is("deleted_at", null);
    let created = 0;
    for (const elder of elders ?? []) {
      const [scams, meds, wellness, messages] = await Promise.all([
        db.from("scam_events").select("alert_level", { count: "exact", head: false }).eq("elder_id", elder.id).gte("created_at", week_starting),
        db.from("medication_reminders").select("status", { count: "exact", head: false }).eq("elder_id", elder.id).gte("scheduled_time", week_starting),
        db.from("wellness_checkins").select("mood_score").eq("elder_id", elder.id).gte("checked_in_at", week_starting),
        db.from("family_messages").select("id", { count: "exact", head: false }).eq("elder_id", elder.id).gte("created_at", week_starting),
      ]);
      const medRows = meds.data ?? [];
      const taken = medRows.filter((m) => ["ingenomen", "laat_ingenomen"].includes(m.status)).length;
      const moodRows = wellness.data ?? [];
      const mood = moodRows.length ? moodRows.reduce((s, m) => s + Number(m.mood_score ?? 0), 0) / moodRows.length : null;
      const digest = {
        elder_id: elder.id,
        week_starting,
        scam_events_count: scams.count ?? (scams.data?.length ?? 0),
        amber_count: (scams.data ?? []).filter((s) => s.alert_level === "amber").length,
        rood_count: (scams.data ?? []).filter((s) => s.alert_level === "rood").length,
        zwart_count: (scams.data ?? []).filter((s) => s.alert_level === "zwart").length,
        medications_taken_pct: medRows.length ? Math.round((taken / medRows.length) * 10000) / 100 : null,
        wellness_avg_score: mood,
        family_interactions: messages.count ?? (messages.data?.length ?? 0),
        summary_nl: "Rustig weekoverzicht met veiligheid, medicijnen, welzijn en familiecontact.",
        summary_en: "Calm weekly overview with safety, medication, wellbeing and family contact.",
      };
      await db.from("safety_digests").upsert(digest, { onConflict: "elder_id,week_starting" });
      const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", elder.id).eq("elder_consented", true).eq("is_active", true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: elder.id, notification_type: "wekelijks_overzicht", title_nl: "HAVEN weekoverzicht", title_en: "HAVEN weekly digest", body_nl: "Het rustige weekoverzicht staat klaar.", body_en: "The calm weekly digest is ready.", data: { week_starting } })));
      created++;
    }
    await recordMetric("fn-weekly-digest", started, "success");
    return json({ success: true, digests_created: created });
  } catch (e) {
    await recordMetric("fn-weekly-digest", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
