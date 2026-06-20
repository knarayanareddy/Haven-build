import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-driving-event");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', event_type: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'driving event');

    const score = Math.min(100, Number(body.anomaly_score ?? 0));
    const share = Boolean(body.elder_shared_with_family);
    const db = userClient(req);
    const { data: event, error } = await db.from('driving_events').insert({ elder_id: userId, event_type: body.event_type, trip_started_at: body.trip_started_at, trip_ended_at: body.trip_ended_at, trip_duration_minutes: body.trip_duration_minutes, anomaly_score: score, anomaly_description_nl: body.anomaly_description_nl, anomaly_description_en: body.anomaly_description_en, elder_reviewed: Boolean(body.elder_reviewed), elder_reviewed_at: body.elder_reviewed ? new Date().toISOString() : null, elder_shared_with_family: share }).select().single();
    if (error) throw error;
    if (share && score >= 70) {
      const { data: family } = await admin().from('family_relationships').select('family_member_id').eq('elder_id', userId).eq('elder_consented', true).eq('is_active', true).eq('can_view_alerts', true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: userId, notification_type: 'systeem', title_nl: 'Rijgebeurtenis gedeeld', title_en: 'Driving event shared', body_nl: 'De oudere heeft een rijgebeurtenis met u gedeeld.', body_en: 'The elder shared a driving event with you.', data: { driving_event_id: event.id } })));
      const { error: updateError } = await db.from('driving_events').update({ family_notified_at: new Date().toISOString() }).eq('id', event.id);
      if (updateError) throw updateError;
    }
    await recordMetric('fn-driving-event', started, 'success');
    return json({ success: true, driving_event_id: event.id, family_notified: share && score >= 70 });
  } catch (e) {
    await recordMetric('fn-driving-event', started, 'error');
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});