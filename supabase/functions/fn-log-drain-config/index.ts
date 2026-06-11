import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    const db = admin();
    if (body.drain_key) {
      requireFields(body, ['provider']);
      const { data, error } = await db.from('log_drain_configs').upsert({ drain_key: body.drain_key, provider: body.provider, endpoint_url: body.endpoint_url, enabled: Boolean(body.enabled), pii_scrubbing_enabled: body.pii_scrubbing_enabled !== false }, { onConflict: 'drain_key' }).select().single();
      if (error) throw error;
      await recordMetric('fn-log-drain-config', started, 'success');
      return json({ success: true, drain: data });
    }
    const { data, error } = await db.from('log_drain_configs').select('drain_key,provider,enabled,pii_scrubbing_enabled').order('drain_key');
    if (error) throw error;
    await recordMetric('fn-log-drain-config', started, 'success');
    return json({ success: true, drains: data });
  } catch (e) {
    await recordMetric('fn-log-drain-config', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
