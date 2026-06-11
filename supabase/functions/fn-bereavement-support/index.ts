import { admin, cors, dispatchNotification, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "logged_by_id", "deceased_name"]);
    const until = body.tone_adjustment_until ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const db = admin();
    const { data: event, error } = await db.from('bereavement_events').insert({ elder_id: body.elder_id, logged_by_id: body.logged_by_id, deceased_name: body.deceased_name, relationship_to_elder: body.relationship_to_elder, date_of_death: body.date_of_death, tone_adjustment_until: until, resources_offered: true }).select().single();
    if (error) throw error;
    await db.from('elder_profiles').update({ bereavement_active: true, bereavement_since: body.date_of_death ?? new Date().toISOString().slice(0,10) }).eq('elder_id', body.elder_id);
    const { data: family } = await db.from('family_relationships').select('family_member_id').eq('elder_id', body.elder_id).eq('elder_consented', true).eq('is_active', true).eq('notify_on_crisis', true);
    await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: body.elder_id, notification_type: 'welzijnscheck', title_nl: 'Rouwmodus actief', title_en: 'Bereavement mode active', body_nl: 'HAVEN spreekt de komende periode extra rustig en zorgvuldig.', body_en: 'HAVEN will speak extra calmly and carefully for the coming period.', data: { bereavement_event_id: event.id } })));
    await recordMetric('fn-bereavement-support', started, 'success');
    return json({ success: true, bereavement_event_id: event.id, tone_adjustment_until: until });
  } catch (e) {
    await recordMetric('fn-bereavement-support', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
