import { corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-wearable-event");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', event_type: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'wearable event');

    // P1-16 FIX: Use userClient(req) instead of admin() — respects RLS
    const db = userClient(req);
    let deviceId = body.wearable_device_id;
    if (!deviceId && body.device_label) {
      const { data: device, error: deviceError } = await db.from('wearable_devices').insert({
        elder_id: userId, device_type: body.device_type ?? 'phone',
        label: body.device_label, vendor: body.vendor,
        last_seen_at: new Date().toISOString(), battery_pct: body.battery_pct,
      }).select().single();
      if (deviceError) throw deviceError;
      deviceId = device?.id;
    }

    const { data: event, error } = await db.from('wandering_events').insert({
      elder_id: userId, wearable_device_id: deviceId,
      event_type: body.event_type, location_event_id: body.location_event_id,
      family_notified: ['safe_zone_exit', 'night_exit', 'no_response'].includes(String(body.event_type)),
    }).select().single();
    if (error) throw error;

    if (event.family_notified) {
      // dispatchNotification uses admin() internally for push tokens — this is correct
      const { data: family } = await db.from('family_relationships')
        .select('family_member_id')
        .eq('elder_id', userId)
        .eq('elder_consented', true)
        .eq('is_active', true)
        .eq('notify_on_safe_zone_exit', true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({
        recipient_id: f.family_member_id, elder_id: userId,
        notification_type: 'veilige_zone_verlaten',
        title_nl: 'Oriëntatiehulp nodig', title_en: 'Orientation support may be needed',
        body_nl: 'HAVEN zag een dwaal- of nachtgebeurtenis. Bel rustig even mee.',
        body_en: 'HAVEN saw a wandering or night event. Please calmly check in.',
        data: { wandering_event_id: event.id },
      })));
    }

    await recordMetric('fn-wearable-event', started, 'success');
    return json({ success: true, wandering_event_id: event.id, family_notified: event.family_notified }, 200, req);
  } catch (e) {
    await recordMetric('fn-wearable-event', started, 'error');
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
