import { rateLimit } from "../_shared/ratelimit.ts";
import { corsHeaders, json, readJsonBody, recordMetric, requireFields, userClient, errorResponse } from "../_shared/core.ts";
import { requireAdminBearer } from "../_shared/internal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-slo-measure");
    await requireAdminBearer(req);
    const body = await readJsonBody(req) as Record<string, unknown>;
    requireFields(body, ['fn_name', 'p95_budget_ms']);
    const { data, error } = await userClient(req).rpc('measure_function_slo', { p_fn_name: body.fn_name, p_p95_budget_ms: body.p95_budget_ms });
    if (error) throw error;
    await recordMetric('fn-slo-measure', started, 'success');
    return json({ success: true, slo: data }, 200, req);
  } catch (e) {
    await recordMetric('fn-slo-measure', started, 'error');
    return errorResponse(e, req);
  }
});