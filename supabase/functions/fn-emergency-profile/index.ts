import { corsHeaders, json, publicClient, readJsonBody, recordMetric, safeErrorMessage, sha256, userClient } from "../_shared/core.ts";
import { assertSelf, AuthzError, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    if (body.action === "create_token") {
      await rateLimit(req, "fn-emergency-profile-create");
      validateBody(body, { action: 'string', elder_id: 'uuid', label: 'string' }, { allowUnknown: true });
      const userId = await getJwtUserId(req);
      
      // Authoritative 403 Forbidden gate enforcing non-repudiable access control
      assertSelf(userId, String(body.elder_id), 'emergency profile exposure token');

      const raw = crypto.randomUUID() + crypto.randomUUID();
      const tokenHash = await sha256(raw);
      const { data, error } = await userClient(req)
        .from("emergency_access_tokens")
        .insert({ elder_id: userId, token_hash: tokenHash, label: body.label, expires_at: body.expires_at ?? null })
        .select()
        .single();
      if (error) throw error;
      await recordMetric("fn-emergency-profile", started, "success");
      return json({ success: true, token_id: data.id, emergency_token: raw }, 200, req);
    }

    await rateLimit(req, "fn-emergency-profile-lookup");
    validateBody(body, { emergency_token: 'string' }, { allowUnknown: true });
    const { data, error } = await publicClient().rpc("get_emergency_profile", { p_token: body.emergency_token });
    if (error) throw error;

    if (!data) {
      throw new AuthzError("403: Emergency brief unavailable or token expired", "INVALID_TOKEN");
    }

    await recordMetric("fn-emergency-profile", started, "success");
    return json({ success: true, emergency_profile: data }, 200, req);
  } catch (error) {
    const isAuthzErr = (error as { name?: string }).name === "AuthzError" || (error as { status?: number }).status === 403;
    const errMsg = String((error as Error)?.message ?? error);
    const status = errMsg.includes("404") ? 404 : ((error as { status?: number }).status ?? (isAuthzErr ? 403 : 400));

    await recordMetric("fn-emergency-profile", started, "error");
    return json({ error: safeErrorMessage(error) }, status, req);
  }
});
