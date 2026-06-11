import { admin, cors, dispatchNotification, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "event_type"]);
    const score = Math.min(100, Number(body.anomaly_score ?? 0));
    const share = Boolean(body.elder_shared_with_family);
    const db = admin();
    const { data: event, error } = await db.from('driving_events').insert({ elder_id: body.elder_id, event_type: body.event_type, trip_started_at: body.trip_started_at, trip_ended_at: body.trip_ended_at, trip_duration_minutes: body.trip_duration_minutes, anomaly_score: score, anomaly_description_nl: body.anomaly_description_nl, anomaly_description_en: body.anomaly_description_en, elder_reviewed: Boolean(body.elder_reviewed), elder_reviewed_at: body.elder_reviewed ? new Date().toISOString() : null, elder_shared_with_family: share }).select().single();
    if (error) throw error;
    if (share && score >= 70) {
      const { data: family } = await db.from('family_relationships').select('family_member_id').eq('elder_id', body.elder_id).eq('elder_consented', true).eq('is_active', true).eq('can_view_alerts', true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: body.elder_id, notification_type: 'systeem', title_nl: 'Rijgebeurtenis gedeeld', title_en: 'Driving event shared', body_nl: 'De oudere heeft een rijgebeurtenis met u gedeeld.', body_en: 'The elder shared a driving event with you.', data: { driving_event_id: event.id } })));
      await db.from('driving_events').update({ family_notified_at: new Date().toISOString() }).eq('id', event.id);
    }
    await recordMetric('fn-driving-event', started, 'success');
    return json({ success: true, driving_event_id: event.id, family_notified: share && score >= 70 });
  } catch (e) {
    await recordMetric('fn-driving-event', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
