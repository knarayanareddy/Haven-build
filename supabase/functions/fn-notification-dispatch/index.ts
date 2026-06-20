import { corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, requireFields, safeErrorMessage } from "../_shared/core.ts";
import { requireInternalAccess } from "../_shared/internal.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    requireInternalAccess(req);
    await rateLimit(req, "fn-notification-dispatch");
    const body = await readJsonBody(req) as Record<string, unknown>;
    requireFields(body, ["recipient_id", "notification_type", "title_nl", "body_nl"]);

    // P0-12 FIX: Destructure only known fields — no mass assignment.
    // This prevents arbitrary keys from being injected into the notifications table.
    const note = await dispatchNotification({
      recipient_id: String(body.recipient_id),
      elder_id: body.elder_id ? String(body.elder_id) : undefined,
      notification_type: String(body.notification_type),
      title_nl: String(body.title_nl),
      title_en: body.title_en ? String(body.title_en) : undefined,
      body_nl: String(body.body_nl),
      body_en: body.body_en ? String(body.body_en) : undefined,
      data: typeof body.data === 'object' && body.data !== null && !Array.isArray(body.data)
        ? body.data as Record<string, unknown>
        : undefined,
    });

    await recordMetric("fn-notification-dispatch", started, "success");
    return json({ success: true, notification_id: note.id }, 200, req);
  } catch (e) {
    await recordMetric("fn-notification-dispatch", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
