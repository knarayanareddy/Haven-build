import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage, scoreScam, sha256 } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

function domainFromUrl(url: string) { try { return new URL(url).hostname.toLowerCase(); } catch { return url.toLowerCase().split('/')[0]; } }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', url: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'browser shield event');
    const db = userClient(req);
    const domain = domainFromUrl(String(body.url));
    const content = `${body.url} ${body.page_title ?? ''} ${body.visible_text ?? ''}`;
    const scored = scoreScam(content);
    const patterns = [
      domain.includes('digid') && !domain.endsWith('.nl') ? 'digid_lookalike' : null,
      /anydesk|teamviewer|remote/i.test(content) ? 'remote_support' : null,
      /gift card|cadeaukaart|crypto|bitcoin/i.test(content) ? 'unusual_payment' : null,
      /urgent|meteen|spoed/i.test(content) ? 'urgency' : null,
    ].filter(Boolean) as string[];
    const riskScore = Math.min(100, scored.score + patterns.length * 10);
    const risk = riskScore >= 90 ? 'zwart' : riskScore >= 70 ? 'rood' : riskScore >= 40 ? 'amber' : 'none';
    const domainHash = await sha256(domain);
    await db.from('domain_reputation_cache').upsert({ domain_hash: domainHash, domain_display: domain, reputation_score: riskScore, source: 'browser-shield', is_gov_lookalike: patterns.includes('digid_lookalike'), is_known_scam: risk !== 'none' }, { onConflict: 'domain_hash' });
    const { data: event, error } = await db.from('browser_shield_events').insert({ elder_id: userId, url_hash: await sha256(String(body.url)), domain_hash: domainHash, page_title: body.page_title, risk_level: risk, risk_score: riskScore, detected_patterns: patterns, explanation_nl: risk === 'none' ? 'Deze pagina lijkt normaal.' : 'Deze pagina heeft patronen die vaak bij oplichting voorkomen.', explanation_en: risk === 'none' ? 'This page looks normal.' : 'This page has patterns often seen in scams.', family_notified: ['rood','zwart'].includes(risk) }).select().single();
    if (error) throw error;
    if (['rood','zwart'].includes(risk)) {
      const { data: family } = await db.from('family_relationships').select('family_member_id').eq('elder_id', userId).eq('elder_consented', true).eq('is_active', true).eq('can_view_alerts', true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: userId, notification_type: risk === 'zwart' ? 'scam_zwart' : 'scam_rood', title_nl: 'Verdachte webpagina', title_en: 'Suspicious web page', body_nl: 'HAVEN zag een verdachte webpagina. Bel rustig even mee.', body_en: 'HAVEN saw a suspicious web page. Please calmly check in.', data: { browser_event_id: event.id } })));
    }
    await recordMetric('fn-browser-shield', started, 'success');
    return json({ success: true, browser_event_id: event.id, risk_level: risk, risk_score: riskScore, detected_patterns: patterns });
  } catch (e) {
    await recordMetric('fn-browser-shield', started, 'error');
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});