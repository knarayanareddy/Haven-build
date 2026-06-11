import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "action"]);
    const db = admin();
    if (body.action === 'offer') {
      requireFields(body, ['title_nl']);
      const { data, error } = await db.from('skill_offerings').insert({ elder_id: body.elder_id, title_nl: body.title_nl, title_en: body.title_en, description_nl: body.description_nl, description_en: body.description_en, category: body.category, format: body.format ?? 'family_mediated', family_visible: Boolean(body.family_visible) }).select().single();
      if (error) throw error;
      await recordMetric('fn-skill-exchange', started, 'success');
      return json({ success: true, skill_offering_id: data.id });
    }
    if (body.action === 'match') {
      requireFields(body, ['skill_offering_id', 'matched_partner_label']);
      const { data, error } = await db.from('skill_exchange_matches').insert({ elder_id: body.elder_id, skill_offering_id: body.skill_offering_id, matched_partner_label: body.matched_partner_label, scheduled_at: body.scheduled_at }).select().single();
      if (error) throw error;
      await recordMetric('fn-skill-exchange', started, 'success');
      return json({ success: true, skill_exchange_match_id: data.id });
    }
    throw new Error('Unsupported skill exchange action');
  } catch (e) {
    await recordMetric('fn-skill-exchange', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
