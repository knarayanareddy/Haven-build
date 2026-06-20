import { corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { profile_id: 'uuid' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.profile_id), 'notification preferences');
    const db = userClient(req);
    if (body.preferences) {
      const rows = body.preferences.map((p: Record<string, unknown>) => ({ profile_id: userId, notification_type: p.notification_type, enabled: p.enabled, quiet_hours_start: p.quiet_hours_start, quiet_hours_end: p.quiet_hours_end }));
      const { error: upsertError } = await db.from("notification_preferences").upsert(rows, { onConflict: "profile_id,notification_type" });
      if (upsertError) throw upsertError;
    }
    const { data, error } = await db.from("notification_preferences").select("*").eq("profile_id", userId);
    if (error) throw error;
    await recordMetric("fn-notification-preferences", started, "success");
    return json({ success: true, preferences: data });
  } catch (e) {
    await recordMetric("fn-notification-preferences", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});