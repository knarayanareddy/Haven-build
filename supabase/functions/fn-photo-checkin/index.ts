import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertElderOrFamilyCan, assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { assertMaxLength, assertNoBsnText, MAX_STRING_FIELD, validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-photo-checkin");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: "uuid", action: "string" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    const elderId = String(body.elder_id);
    const action = String(body.action);
    if (!["request", "fulfill"].includes(action)) throw new Error("action must be 'request' or 'fulfill'");

    if (action === "fulfill") {
      assertSelf(userId, elderId, "photo check-in");
    } else {
      await assertElderOrFamilyCan(userId, elderId, "messages");
    }

    const result = await withIdempotency({
      key: (req.headers.get("idempotency-key") ?? body.idempotency_key ?? `${elderId}:${action}:${Date.now()}`) as string,
      functionName: "fn-photo-checkin",
      elderId,
      profileId: userId,
      requestBody: body,
      run: async () => {
        if (action === "request") {
          const requesterName = String(body.requester_name ?? "Familie");
          await dispatchNotification({
            recipient_id: elderId, elder_id: elderId,
            notification_type: "photo_checkin_requested",
            title_nl: `${requesterName} vraagt om een foto`,
            title_en: `${requesterName} is asking for a photo`,
            body_nl: "Tik om een foto te maken zodat uw familie weet dat alles goed gaat.",
            body_en: "Tap to take a photo so your family knows everything is fine.",
            data: { photo_checkin_action: "fulfill", requester_id: userId, requester_name: requesterName, requested_at: new Date().toISOString() },
          });
          return { body: { success: true, action: "request", message_nl: "Fotoverzoek verstuurd.", message_en: "Photo request sent." } };
        }

        if (body.photo_description) {
          assertNoBsnText(body.photo_description);
          assertMaxLength(body.photo_description, MAX_STRING_FIELD, "photo_description");
        }
        const db = userClient(req);
        const { data: msg, error } = await db.from("family_messages").insert({
          elder_id: elderId, sender_id: userId, sender_role: "elder",
          message_type: "photo_checkin",
          content_nl: body.photo_description ?? "Foto check-in",
          content_en: body.photo_description ?? "Photo check-in",
          storage_path: body.storage_path ?? null,
          photo_ttl_seconds: 86400,
        }).select().single();
        if (error) throw error;

        const requesterId = body.requester_id ? String(body.requester_id) : null;
        if (requesterId) {
          await dispatchNotification({
            recipient_id: requesterId, elder_id: elderId,
            notification_type: "photo_checkin_fulfilled",
            title_nl: "Foto check-in ontvangen", title_en: "Photo check-in received",
            body_nl: "Uw naaste heeft een foto gestuurd. Open HAVEN om te bekijken.",
            body_en: "Your loved one sent a photo. Open HAVEN to view.",
            data: { message_id: msg.id },
          });
        } else {
          const dbAdmin = admin();
          const { data: family } = await dbAdmin.from("family_relationships").select("family_member_id").eq("elder_id", elderId).eq("elder_consented", true).eq("is_active", true).eq("can_view_messages", true);
          for (const f of family ?? []) {
            await dispatchNotification({ recipient_id: f.family_member_id, elder_id: elderId, notification_type: "photo_checkin_fulfilled", title_nl: "Foto check-in ontvangen", title_en: "Photo check-in received", body_nl: "Uw naaste heeft een foto gestuurd. Open HAVEN om te bekijken.", body_en: "Your loved one sent a photo. Open HAVEN to view.", data: { message_id: msg.id } });
          }
        }
        return { body: { success: true, action: "fulfill", message_id: msg.id, message_nl: "Foto is gedeeld met uw familie.", message_en: "Photo has been shared with your family." } };
      },
    });

    await recordMetric("fn-photo-checkin", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-photo-checkin", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
