import { rateLimit } from "../_shared/ratelimit.ts";
import { corsHeaders, json, readJsonBody, recordMetric, requireFields, userClient, errorResponse } from "../_shared/core.ts";
import { requireAdminBearer } from "../_shared/internal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-observability-alert");
    await requireAdminBearer(req);
    const body = await readJsonBody(req) as Record<string, unknown>;
    requireFields(body, ["alert_key", "severity", "title"]);
    const { data, error } = await userClient(req).from('slo_alerts').insert({ alert_key: body.alert_key, severity: body.severity, title: body.title, details: body.details ?? {}, status: body.status ?? 'open' }).select().single();
    if (error) throw error;
    await recordMetric('fn-observability-alert', started, 'success');
    return json({ success: true, slo_alert_id: data.id }, 200, req);
  } catch (e) {
    await recordMetric('fn-observability-alert', started, 'error');
    return errorResponse(e, req);
  }
});