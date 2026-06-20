import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', action: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'skill exchange');
    if (body.action === 'offer') {
      if (!body.title_nl) throw new Error('title_nl is required');
      const { data, error } = await userClient(req).from('skill_offerings').insert({ elder_id: userId, title_nl: body.title_nl, title_en: body.title_en, description_nl: body.description_nl, description_en: body.description_en, category: body.category, format: body.format ?? 'family_mediated', family_visible: Boolean(body.family_visible) }).select().single();
      if (error) throw error;
      await recordMetric('fn-skill-exchange', started, 'success');
      return json({ success: true, skill_offering_id: data.id });
    }
    if (body.action === 'match') {
      if (!body.skill_offering_id || !body.matched_partner_label) throw new Error('skill_offering_id and matched_partner_label are required');
      const { data, error } = await admin().from('skill_exchange_matches').insert({ elder_id: userId, skill_offering_id: body.skill_offering_id, matched_partner_label: body.matched_partner_label, scheduled_at: body.scheduled_at }).select().single();
      if (error) throw error;
      await recordMetric('fn-skill-exchange', started, 'success');
      return json({ success: true, skill_exchange_match_id: data.id });
    }
    throw new Error('Unsupported skill exchange action');
  } catch (e) {
    await recordMetric('fn-skill-exchange', started, 'error');
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});