import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertActorMatches, assertElderOrFamilyCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { family_member_id: 'uuid', elder_id: 'uuid', display_name: 'string', message_type: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertActorMatches(userId, String(body.family_member_id), 'family_member_id');
    await assertElderOrFamilyCan(userId, String(body.elder_id), 'messages');

    const db = userClient(req);
    const existing = await db.from('grandchild_profiles').select('*').eq('family_member_id', userId).eq('elder_id', body.elder_id).eq('display_name', body.display_name).is('deleted_at', null).maybeSingle();
    if (existing.error) throw existing.error;
    let child = existing.data;
    if (child) {
      const updated = await db.from('grandchild_profiles').update({ age_band: body.age_band ?? child.age_band, guardian_consented: true, elder_consented: Boolean(body.elder_consented ?? child.elder_consented) }).eq('id', child.id).select().single();
      if (updated.error) throw updated.error;
      child = updated.data;
    } else {
      const inserted = await db.from('grandchild_profiles').insert({ family_member_id: userId, elder_id: body.elder_id, display_name: body.display_name, age_band: body.age_band ?? 'unknown', guardian_consented: true, elder_consented: Boolean(body.elder_consented ?? true) }).select().single();
      if (inserted.error) throw inserted.error;
      child = inserted.data;
    }
    const { data: msg, error: msgError } = await db.from('family_messages').insert({ elder_id: body.elder_id, sender_id: userId, sender_role: 'family', message_type: body.message_type, content_nl: body.content_nl ?? `${body.display_name} stuurde een bericht.`, content_en: body.content_en ?? `${body.display_name} sent a message.`, storage_path: body.storage_path, duration_seconds: body.duration_seconds }).select().single();
    if (msgError) throw msgError;
    await dispatchNotification({ recipient_id: body.elder_id, elder_id: body.elder_id, notification_type: 'familiebericht', title_nl: 'Videogroet van kleinkind', title_en: 'Grandchild video hello', body_nl: 'Er staat een lieve groet klaar in HAVEN.', body_en: 'A loving hello is ready in HAVEN.', data: { message_id: msg.id, grandchild_profile_id: child.id } });
    await recordMetric('fn-grandchild-message-send', started, 'success');
    return json({ success: true, grandchild_profile_id: child.id, message_id: msg.id });
  } catch (e) {
    await recordMetric('fn-grandchild-message-send', started, 'error');
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});