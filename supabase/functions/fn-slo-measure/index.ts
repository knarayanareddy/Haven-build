import { corsHeaders, json, readJsonBody, recordMetric, requireFields, safeErrorMessage, userClient } from "../_shared/core.ts";
import { requireAdminBearer } from "../_shared/internal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await requireAdminBearer(req);
    const body = await readJsonBody(req) as Record<string, unknown>;
    requireFields(body, ['fn_name', 'p95_budget_ms']);
    const { data, error } = await userClient(req).rpc('measure_function_slo', { p_fn_name: body.fn_name, p_p95_budget_ms: body.p95_budget_ms });
    if (error) throw error;
    await recordMetric('fn-slo-measure', started, 'success');
    return json({ success: true, slo: data });
  } catch (e) {
    await recordMetric('fn-slo-measure', started, 'error');
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});