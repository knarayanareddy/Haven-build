import { admin, cors, dispatchNotification, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "event_type"]);
    const db = admin();
    let deviceId = body.wearable_device_id;
    if (!deviceId && body.device_label) {
      const { data: device } = await db.from('wearable_devices').insert({ elder_id: body.elder_id, device_type: body.device_type ?? 'phone', label: body.device_label, vendor: body.vendor, last_seen_at: new Date().toISOString(), battery_pct: body.battery_pct }).select().single();
      deviceId = device?.id;
    }
    const { data: event, error } = await db.from('wandering_events').insert({ elder_id: body.elder_id, wearable_device_id: deviceId, event_type: body.event_type, location_event_id: body.location_event_id, family_notified: ['safe_zone_exit','night_exit','no_response'].includes(body.event_type) }).select().single();
    if (error) throw error;
    if (event.family_notified) {
      const { data: family } = await db.from('family_relationships').select('family_member_id').eq('elder_id', body.elder_id).eq('elder_consented', true).eq('is_active', true).eq('notify_on_safe_zone_exit', true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: body.elder_id, notification_type: 'veilige_zone_verlaten', title_nl: 'Oriëntatiehulp nodig', title_en: 'Orientation support may be needed', body_nl: 'HAVEN zag een dwaal- of nachtgebeurtenis. Bel rustig even mee.', body_en: 'HAVEN saw a wandering or night event. Please calmly check in.', data: { wandering_event_id: event.id } })));
    }
    await recordMetric('fn-wearable-event', started, 'success');
    return json({ success: true, wandering_event_id: event.id, family_notified: event.family_notified });
  } catch (e) {
    await recordMetric('fn-wearable-event', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
