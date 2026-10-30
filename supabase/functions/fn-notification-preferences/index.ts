import { rateLimit } from "../_shared/ratelimit.ts";
import { corsHeaders, json, readJsonBody, recordMetric, userClient, errorResponse } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-notification-preferences");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { profile_id: 'uuid' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.profile_id), 'notification preferences');
    const db = userClient(req);
    if (Array.isArray(body.preferences)) {
      const rows = body.preferences.map((p: Record<string, unknown>) => ({ profile_id: userId, notification_type: p.notification_type, enabled: p.enabled, quiet_hours_start: p.quiet_hours_start, quiet_hours_end: p.quiet_hours_end }));
      const { error: upsertError } = await db.from("notification_preferences").upsert(rows, { onConflict: "profile_id,notification_type" });
      if (upsertError) throw upsertError;
    }
    const { data, error } = await db.from("notification_preferences").select("*").eq("profile_id", userId);
    if (error) throw error;
    await recordMetric("fn-notification-preferences", started, "success");
    return json({ success: true, preferences: data }, 200, req);
  } catch (e) {
    await recordMetric("fn-notification-preferences", started, "error");
    return errorResponse(e, req);
  }
});