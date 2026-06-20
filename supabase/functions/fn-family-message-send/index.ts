import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertActorMatches, assertElderOrFamilyCan, getJwtUserId, getProfileRole } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-family-message-send");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', message_type: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertActorMatches(userId, typeof body.sender_id === 'string' ? body.sender_id : undefined, 'sender_id');
    const senderRole = await getProfileRole(userId);
    if (!['elder', 'family', 'carer', 'admin'].includes(senderRole)) throw new Error('Unsupported sender role');
    if (userId !== body.elder_id) await assertElderOrFamilyCan(userId, String(body.elder_id), 'messages');

    if (userId === body.elder_id && body.recipient_id) {
      const { count } = await admin()
        .from('family_relationships')
        .select('id', { count: 'exact', head: true })
        .eq('elder_id', body.elder_id)
        .eq('family_member_id', body.recipient_id)
        .eq('elder_consented', true)
        .eq('is_active', true);
      if (!count) throw new Error('recipient_id is not an active family member for this elder');
    }

    const db = userClient(req);
    const { data: msg, error } = await db.from("family_messages").insert({
      elder_id: body.elder_id,
      sender_id: userId,
      sender_role: senderRole,
      message_type: body.message_type,
      content_nl: body.content_nl,
      content_en: body.content_en,
      storage_path: body.storage_path,
      duration_seconds: body.duration_seconds,
    }).select().single();
    if (error) throw error;

    const recipient = userId === body.elder_id ? body.recipient_id : body.elder_id;
    if (recipient) {
      await dispatchNotification({
        recipient_id: recipient,
        elder_id: body.elder_id,
        notification_type: "familiebericht",
        title_nl: "Nieuw familiebericht",
        title_en: "New family message",
        body_nl: "Er staat een warm bericht klaar in HAVEN.",
        body_en: "A warm message is ready in HAVEN.",
        data: { message_id: msg.id },
      });
    }

    await recordMetric("fn-family-message-send", started, "success");
    return json({ success: true, message_id: msg.id, sender_id: userId, sender_role: senderRole });
  } catch (e) {
    await recordMetric("fn-family-message-send", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});