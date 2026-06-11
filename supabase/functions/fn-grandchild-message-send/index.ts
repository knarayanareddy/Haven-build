import { admin, cors, dispatchNotification, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["family_member_id", "elder_id", "display_name", "message_type"]);
    const db = admin();
    const existing = await db.from('grandchild_profiles').select('*').eq('family_member_id', body.family_member_id).eq('elder_id', body.elder_id).eq('display_name', body.display_name).is('deleted_at', null).maybeSingle();
    let child = existing.data;
    if (child) {
      const updated = await db.from('grandchild_profiles').update({ age_band: body.age_band ?? child.age_band, guardian_consented: true, elder_consented: Boolean(body.elder_consented ?? child.elder_consented) }).eq('id', child.id).select().single();
      if (updated.error) throw updated.error;
      child = updated.data;
    } else {
      const inserted = await db.from('grandchild_profiles').insert({ family_member_id: body.family_member_id, elder_id: body.elder_id, display_name: body.display_name, age_band: body.age_band ?? 'unknown', guardian_consented: true, elder_consented: Boolean(body.elder_consented ?? true) }).select().single();
      if (inserted.error) throw inserted.error;
      child = inserted.data;
    }
    const { data: msg, error: msgError } = await db.from('family_messages').insert({ elder_id: body.elder_id, sender_id: body.family_member_id, sender_role: 'family', message_type: body.message_type, content_nl: body.content_nl ?? `${body.display_name} stuurde een bericht.`, content_en: body.content_en ?? `${body.display_name} sent a message.`, storage_path: body.storage_path, duration_seconds: body.duration_seconds }).select().single();
    if (msgError) throw msgError;
    await dispatchNotification({ recipient_id: body.elder_id, elder_id: body.elder_id, notification_type: 'familiebericht', title_nl: 'Videogroet van kleinkind', title_en: 'Grandchild video hello', body_nl: 'Er staat een lieve groet klaar in HAVEN.', body_en: 'A loving hello is ready in HAVEN.', data: { message_id: msg.id, grandchild_profile_id: child.id } });
    await recordMetric('fn-grandchild-message-send', started, 'success');
    return json({ success: true, grandchild_profile_id: child.id, message_id: msg.id });
  } catch (e) {
    await recordMetric('fn-grandchild-message-send', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
