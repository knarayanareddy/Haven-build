import { cors, dispatchNotification, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["recipient_id", "notification_type", "title_nl", "body_nl"]);
    const note = await dispatchNotification(body);
    await recordMetric("fn-notification-dispatch", started, "success");
    return json({ success: true, notification_id: note.id });
  } catch (e) {
    await recordMetric("fn-notification-dispatch", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
