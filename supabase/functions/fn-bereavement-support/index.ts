import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertCarerCan, assertElderOrFamilyCan, assertSelf, AuthzError, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-bereavement-support");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', logged_by_id: 'uuid', deceased_name: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);

    if (userId === body.elder_id) {
      assertSelf(userId, String(body.elder_id), 'bereavement event');
    } else {
      let authorized = false;
      try {
        await assertElderOrFamilyCan(userId, String(body.elder_id), 'alerts');
        authorized = true;
      } catch (authError) {
        if (!(authError instanceof AuthzError) || authError.reasonCode === "SYSTEM_UNCERTAINTY" || authError.reasonCode === "INVALID_TOKEN") {
          throw authError;
        }
      }
      if (!authorized) await assertCarerCan(userId, String(body.elder_id));
    }
    if (String(body.logged_by_id) !== userId) throw new Error('logged_by_id must match the authenticated caller');

    // P1-18 FIX: Use admin() for writes since carers/family do not own elder_profiles or bereavement_events under RLS
    const db = admin();
    const until = body.tone_adjustment_until ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: event, error } = await db.from('bereavement_events').insert({
      elder_id: body.elder_id, logged_by_id: userId, deceased_name: body.deceased_name,
      relationship_to_elder: body.relationship_to_elder, date_of_death: body.date_of_death,
      tone_adjustment_until: until, resources_offered: true,
    }).select().single();
    if (error) throw error;

    const { error: profileError } = await db.from('elder_profiles')
      .update({ bereavement_active: true, bereavement_since: body.date_of_death ?? new Date().toISOString().slice(0, 10) })
      .eq('elder_id', body.elder_id);
    if (profileError) throw profileError;

    const { data: family } = await db.from('family_relationships')
      .select('family_member_id')
      .eq('elder_id', body.elder_id)
      .eq('elder_consented', true)
      .eq('is_active', true)
      .eq('notify_on_crisis', true);

    await Promise.all((family ?? []).map((f) => dispatchNotification({
      recipient_id: f.family_member_id, elder_id: body.elder_id as string,
      notification_type: 'welzijnscheck', title_nl: 'Rouwmodus actief', title_en: 'Bereavement mode active',
      body_nl: 'HAVEN spreekt de komende periode extra rustig en zorgvuldig.',
      body_en: 'HAVEN will speak extra calmly and carefully for the coming period.',
      data: { bereavement_event_id: event.id },
    })));

    await recordMetric('fn-bereavement-support', started, 'success');
    return json({ success: true, bereavement_event_id: event.id, tone_adjustment_until: until }, 200, req);
  } catch (e) {
    await recordMetric('fn-bereavement-support', started, 'error');
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
