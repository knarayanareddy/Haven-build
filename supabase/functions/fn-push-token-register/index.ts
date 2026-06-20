import { corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { profile_id: 'uuid', token: 'string', platform: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.profile_id), 'push token');
    const { data, error } = await userClient(req)
      .from("push_tokens")
      .upsert({ profile_id: userId, token: body.token, platform: body.platform, is_active: true }, { onConflict: "token" })
      .select()
      .single();
    if (error) throw error;
    await recordMetric("fn-push-token-register", started, "success");
    return json({ success: true, push_token_id: data.id });
  } catch (e) {
    await recordMetric("fn-push-token-register", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});