import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const db = admin();
    let query = db.from("medications").select("id, elder_id, schedule_times").eq("is_active", true).is("deleted_at", null);
    if (body.elder_id) query = query.eq("elder_id", body.elder_id);
    const { data: meds, error } = await query;
    if (error) throw error;
    const days = Number(body.days ?? 7);
    const rows = [];
    for (const med of meds ?? []) {
      for (let d = 0; d < days; d++) {
        const date = new Date();
        date.setDate(date.getDate() + d);
        const day = date.toISOString().slice(0, 10);
        for (const t of med.schedule_times ?? []) rows.push({ medication_id: med.id, elder_id: med.elder_id, scheduled_time: `${day}T${t}+01:00`, status: "gepland" });
      }
    }
    if (rows.length) await db.from("medication_reminders").upsert(rows, { onConflict: "medication_id,elder_id,scheduled_time" });
    await recordMetric("fn-daily-reminder-scheduler", started, "success");
    return json({ success: true, reminders_scheduled: rows.length });
  } catch (e) {
    await recordMetric("fn-daily-reminder-scheduler", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
