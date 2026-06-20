import { corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'feature flag context');

    const db = userClient(req);
    const { data: flags, error } = await db.from("feature_flags").select("flag_key");
    if (error) throw error;
    const entries: Record<string, boolean> = {};
    for (const f of flags ?? []) {
      const { data, error: rpcError } = await db.rpc("evaluate_feature_flag", { p_flag_key: f.flag_key, p_elder_id: userId });
      if (rpcError) throw rpcError;
      entries[f.flag_key] = Boolean(data);
    }
    await recordMetric("fn-feature-flags", started, "success");
    return json({ success: true, flags: entries });
  } catch (e) {
    await recordMetric("fn-feature-flags", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});