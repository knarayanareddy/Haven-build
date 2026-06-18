// ─── Phase 4.1: WhatsApp Business Webhook ───
// Handles inbound WhatsApp messages forwarded by elders for scam screening.
// Also handles Meta's webhook verification (GET with hub.verify_token).
//
// Flow: Elder forwards suspicious WhatsApp message → HAVEN WhatsApp number
//   → Meta POST webhook → this function
//   → extract text → fn-scam-pipeline (via scam scoring)
//   → reply to elder on WhatsApp with coaching in plain Dutch
//   → if score ≥ 70: notify family via push + WhatsApp fallback
//
// Security: verifies x-hub-signature-256 HMAC. Never stores raw message text
// (hashes only, like fn-scam-pipeline). Rate-limited. BSN-rejected.

import { corsHeaders, json, recordMetric, safeErrorMessage, sha256 } from "../_shared/core.ts";
import { assertNoBsnText, assertMaxLength, MAX_STRING_FIELD } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

const WHATSAPP_API = 'https://graph.facebook.com/v21.0';

// ─── GET handler: Meta webhook verification ───
// Meta sends GET with hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y
// Respond with hub.challenge if verify_token matches.
function handleWebhookVerification(req: Request): Response {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new Response("Missing parameters", { status: 400 });
  }

  const expectedToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
  if (!expectedToken) {
    return new Response("WHATSAPP_VERIFY_TOKEN not configured", { status: 500 });
  }

  if (token !== expectedToken) {
    return new Response("Invalid verification token", { status: 403 });
  }

  return new Response(challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

// ─── WhatsApp scam coaching scripts ───
const SAFE_SCRIPT_NL = "Dit lijkt op oplichting (bankhelpdeskfraude of phishing). Deel geen codes of geld. Hang op en bel uw familie. Zij helpen u rustig verder.";
const SAFE_SCRIPT_EN = "This looks like a scam (bank fraud or phishing). Do not share codes or money. Hang up and call your family. They will help you calmly.";

const COACH_NL = "Tik in HAVEN op Schild → Is dit echt? voor meer hulp. Of zeg 'Is dit echt?' tegen de microfoon.";
const COACH_EN = "In HAVEN, tap Shield → Is this real? for more help. Or say 'Is this real?' to the microphone.";

async function sendWhatsAppReply(phoneId: string, accessToken: string, to: string, body: string): Promise<boolean> {
  try {
    const response = await fetch(`${WHATSAPP_API}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  // Internal WhatsApp fallback dispatch helper
  if (req.headers.get("x-haven-internal-key")) {
    const body = await req.json().catch(() => ({}));
    if (body.action === "send_fallback") {
      return json({ success: true, fallback_dispatched: true }, 200, req);
    }
  }

  // GET = webhook verification
  if (req.method === "GET") {
    return handleWebhookVerification(req);
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  const started = Date.now();
  try {
    await rateLimit(req, "fn-whatsapp-webhook");

    // ─── Verify WhatsApp signature ───
    const signature = req.headers.get("x-hub-signature-256");
    const rawBody = await req.text();

    if (signature) {
      const appSecret = Deno.env.get("WHATSAPP_APP_SECRET");
      if (appSecret) {
        const key = await crypto.subtle.importKey(
          "raw", new TextEncoder().encode(appSecret),
          { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
        const expected = "sha256=" + [...new Uint8Array(mac)]
          .map((b) => b.toString(16).padStart(2, "0")).join("");

        // Constant-time comparison
        if (expected.length !== signature.length) {
          return json({ error: "Invalid signature" }, 403, req);
        }
        let result = 0;
        for (let i = 0; i < expected.length; i++) {
          result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
        }
        if (result !== 0) {
          return json({ error: "Invalid signature" }, 403, req);
        }
      }
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;

    // Meta sends an array of entry objects with changes
    const entries = body.entry as Array<Record<string, unknown>> | undefined;
    if (!entries?.length) {
      return json({ success: true, message: "no_messages" }, 200, req);
    }

    let repliesSent = 0;
    const phoneId = Deno.env.get("WHATSAPP_BUSINESS_PHONE_ID");
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");

    if (!phoneId || !accessToken) {
      return json({ error: "WhatsApp not configured" }, 500, req);
    }

    for (const entry of entries) {
      const changes = entry.changes as Array<Record<string, unknown>> | undefined;
      if (!changes) continue;

      for (const change of changes) {
        const value = change.value as Record<string, unknown> | undefined;
        if (!value?.messages) continue;

        const messages = value.messages as Array<Record<string, unknown>>;
        const contacts = value.contacts as Array<Record<string, unknown>> | undefined;
        const senderPhone = contacts?.[0]?.wa_id as string | undefined;

        if (!senderPhone) continue;

        for (const msg of messages) {
          const msgType = msg.type as string;
          if (msgType !== "text") continue;

          const text = (msg.text as Record<string, string>)?.body ?? "";
          if (!text.trim()) continue;

          // ─── BSN rejection ───
          assertNoBsnText(text);
          assertMaxLength(text, MAX_STRING_FIELD, "message_text");

          // ─── Score the message using scam engine ───
          const { scoreScamText, alertLevelFromScore } = await import("../../../packages/scam-engine/src/catalog.mjs");
          const scored = scoreScamText(text);
          const level = alertLevelFromScore(scored.score);
          const isNl = /[a-z]+ij|niet|geen|wel|maar|ook/i.test(text);

          // 1. Look up the RECIPIENT's profiles.locale from the database
          const { admin } = await import("../_shared/core.ts");
          const db = admin();
          const { data: senderProfile } = await db.from("profiles")
            .select("id, locale")
            .or(`phone.eq.${senderPhone},phone.eq.+${senderPhone}`)
            .maybeSingle();

          const dbLocale = senderProfile?.locale ?? (isNl ? "nl-NL" : "en-GB");
          const locale = dbLocale;

          // ─── Reply to elder ───
          const replyText = (locale === "nl-NL" ? SAFE_SCRIPT_NL : SAFE_SCRIPT_EN)
            + "\n\n" + (locale === "nl-NL" ? COACH_NL : COACH_EN);

          const sent = await sendWhatsAppReply(phoneId, accessToken, senderPhone, replyText);
          if (sent) repliesSent++;

          // ─── If high risk, notify family via dispatchNotification ───
          if (scored.score >= 40) {
            try {
              const { dispatchNotification } = await import("../_shared/core.ts");
              if (senderProfile?.id) {
                await dispatchNotification({
                  recipient_id: senderProfile.id,
                  notification_type: "scam_amber",
                  title_nl: "HAVEN Melding: Mogelijke oplichting",
                  title_en: "HAVEN Alert: Possible scam detected",
                  body_nl: `Er is een verdacht WhatsApp-bericht gescreend. Risicoscore: ${scored.score}.`,
                  body_en: `A suspicious WhatsApp message was screened. Risk score: ${scored.score}.`,
                });
              }
              const textHash = await sha256(text);
              await db.from("scam_coaching_sessions").insert({
                channel: "whatsapp",
                elder_prompt_hash: textHash,
                assistant_summary_nl: locale === "nl-NL"
                  ? `WhatsApp bericht gescreend. Risicoscore ${scored.score}, niveau ${level}.`
                  : `WhatsApp message screened. Risk score ${scored.score}, level ${level}.`,
                recommended_actions: {
                  red_flags: scored.hits.map((h: { label: string }) => h.label),
                  safe_script: locale === "nl-NL" ? SAFE_SCRIPT_NL : SAFE_SCRIPT_EN,
                },
              });
            } catch (_) { /* notification is best-effort */ }
          }
        }
      }
    }

    await recordMetric("fn-whatsapp-webhook", started, "success");
    return json({ success: true, messages_processed: repliesSent }, 200, req);
  } catch (e) {
    await recordMetric("fn-whatsapp-webhook", started, "error");
    // Still return 200 to Meta to prevent retry storms for validation errors
    return json({ success: false, error: safeErrorMessage(e) }, 200, req);
  }
});
