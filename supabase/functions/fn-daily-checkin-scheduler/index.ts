import { admin, corsHeaders, json, recordMetric, safeErrorMessage } from "../_shared/core.ts";
import { requireInternalAccess } from "../_shared/internal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    requireInternalAccess(req);
    const db = admin();
    const now = Date.now();
    const { data: elders } = await db.from("profiles").select("id").eq("role", "elder").is("deleted_at", null);

    const scheduled: Array<{ elder_id: string; checkin_type: string; next_due_at: string }> = [];
    for (const elder of elders ?? []) {
      const hour = new Date().getHours();
      // Plan three daily check-ins: morning 09:00, midday 13:00, evening 19:00
      const plan = [
        { checkin_type: "morning", dueHour: 9 },
        { checkin_type: "midday", dueHour: 13 },
        { checkin_type: "evening", dueHour: 19 },
      ];
      for (const slot of plan) {
        const dueAt = new Date(); dueAt.setHours(slot.dueHour, 0, 0, 0);
        const minutesUntilDue = (dueAt.getTime() - now) / 60000;
        // Pre-create a wellness_checkins row placeholder only when the slot is approaching (next 60 min).
        if (minutesUntilDue > 0 && minutesUntilDue <= 60) {
          const { data: existing } = await db.from("wellness_checkins")
            .select("id").eq("elder_id", elder.id).eq("checkin_type", slot.checkin_type)
            .gte("checked_in_at", new Date(dueAt.getTime() - 30 * 60000).toISOString())
            .maybeSingle();
          if (!existing) {
            // We don't actually insert a placeholder — the elder app prompts the user and writes via fn-wellness-checkin.
            // This job is responsible for computing upcoming check-ins for the schedule UI.
            scheduled.push({ elder_id: elder.id, checkin_type: slot.checkin_type, next_due_at: dueAt.toISOString() });
          }
        }
        if (hour === slot.dueHour && minutesUntilDue > -10) {
          // Within the check-in window: the elder app's notification prompt is fired by the
          // companion on next open. We record an app_events row for observability.
          await db.from("app_events").insert({
            profile_id: elder.id,
            elder_id: elder.id,
            surface: "elder_app",
            event_name: "scheduled_checkin_due",
            properties: { checkin_type: slot.checkin_type, due_at: dueAt.toISOString() },
          });
        }
      }
    }

    await recordMetric("fn-daily-checkin-scheduler", started, "success");
    return json({ ok: true, scheduled: scheduled.length });
  } catch (e) {
    await recordMetric("fn-daily-checkin-scheduler", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
