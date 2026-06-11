import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ['fn_name', 'p95_budget_ms']);
    const { data, error } = await admin().rpc('measure_function_slo', { p_fn_name: body.fn_name, p_p95_budget_ms: body.p95_budget_ms });
    if (error) throw error;
    await recordMetric('fn-slo-measure', started, 'success');
    return json({ success: true, slo: data });
  } catch (e) {
    await recordMetric('fn-slo-measure', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
