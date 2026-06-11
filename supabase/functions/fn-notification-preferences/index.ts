import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["profile_id"]);
    const db = admin();
    if (body.preferences) {
      const rows = body.preferences.map((p: Record<string, unknown>) => ({ profile_id: body.profile_id, notification_type: p.notification_type, enabled: p.enabled, quiet_hours_start: p.quiet_hours_start, quiet_hours_end: p.quiet_hours_end }));
      await db.from("notification_preferences").upsert(rows, { onConflict: "profile_id,notification_type" });
    }
    const { data, error } = await db.from("notification_preferences").select("*").eq("profile_id", body.profile_id);
    if (error) throw error;
    await recordMetric("fn-notification-preferences", started, "success");
    return json({ success: true, preferences: data });
  } catch (e) {
    await recordMetric("fn-notification-preferences", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
