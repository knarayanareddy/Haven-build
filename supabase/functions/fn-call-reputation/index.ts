import { admin, cors, json, recordMetric, requireFields, sha256 } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["phone", "provider"]);
    const db = admin();
    const phoneHash = await sha256(String(body.phone));
    const { data: cached } = await db.from('phone_reputation_cache').select('*').eq('phone_hashed', phoneHash).gt('expires_at', new Date().toISOString()).maybeSingle();
    const score = cached?.reputation_score ?? Math.min(100, Number(body.report_count ?? 0) * 12 + (/^\+3188|^\+3190/.test(String(body.phone)) ? 20 : 0));
    const reportCount = cached?.report_count ?? Number(body.report_count ?? 0);
    await db.from('phone_reputation_cache').upsert({ phone_hashed: phoneHash, reputation_score: score, source: body.provider, report_count: reportCount, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }, { onConflict: 'phone_hashed' });
    const { data: lookup, error } = await db.from('call_reputation_lookups').insert({ elder_id: body.elder_id ?? null, phone_hash: phoneHash, provider: body.provider, reputation_score: score, report_count: reportCount, categories: body.categories ?? [], explanation_nl: score >= 70 ? 'Dit nummer heeft veel risicosignalen.' : 'Er zijn weinig risicosignalen voor dit nummer.', explanation_en: score >= 70 ? 'This number has many risk signals.' : 'This number has few risk signals.', cache_hit: Boolean(cached) }).select().single();
    if (error) throw error;
    await recordMetric('fn-call-reputation', started, 'success');
    return json({ success: true, lookup_id: lookup.id, reputation_score: score, report_count: reportCount, cache_hit: Boolean(cached) });
  } catch (e) {
    await recordMetric('fn-call-reputation', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
