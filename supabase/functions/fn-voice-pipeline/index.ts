import { admin, dispatchNotification, json, readJsonBody, userClient } from "../_shared/core.ts";
import { companionReply, synthesizeSpeechToStorage, transcribeDutchAudio } from "../_shared/ai.ts";
import { assertElderOrFamilyCan, assertCarerCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody, assertMaxLength, MAX_AUDIO_BASE64 } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { assertNoBsnInPayload, scrubBsnFromLogs } from "../_shared/bsn_guard.ts";
import { asyncWrapper } from "../_shared/async_wrapper.ts";

function classify(transcript: string) {
  const t = transcript.toLowerCase();
  if (/(ingenomen|taken|done|klaar)/.test(t)) return { intent: "bevestig_ingenomen", action: "CONFIRM_MEDICATION_TAKEN" };
  if (/(gevallen|help|bang|ambulance|niet goed|scared|fallen|niet meer zijn)/.test(t)) return { intent: "crisis", action: "TRIGGER_CRISIS_FLOW" };
  if (/(verhaal|story|memory|herinnering)/.test(t)) return { intent: "life_story", action: "START_STORY" };
  if (/(familie|sarah|bericht|message)/.test(t)) return { intent: "family_message", action: "OPEN_FAMILY" };
  return { intent: "companion", action: "COMPANION_REPLY" };
}

async function selectVoiceConfig(adminClient: ReturnType<typeof admin>, elderId: string, locale: "en-GB" | "nl-NL"): Promise<{ voiceId?: string; useFamiliar: boolean; crisisOverride: boolean; disclosure: "always" | "first_of_day" | "none" }> {
  const { data: pref } = await adminClient.from("elder_voice_preferences").select("voice_profile_id, use_familiar_voice, disclosure_mode").eq("elder_id", elderId).maybeSingle();
  if (!pref?.use_familiar_voice || !pref.voice_profile_id) return { useFamiliar: false, crisisOverride: false, disclosure: "none" };
  const { data: profile } = await adminClient.from("voice_profiles").select("status, provider_voice_id").eq("id", pref.voice_profile_id).maybeSingle();
  if (!profile || profile.status !== "ready") return { useFamiliar: false, crisisOverride: false, disclosure: "none" };
  return { voiceId: profile.provider_voice_id ?? undefined, useFamiliar: true, crisisOverride: false, disclosure: pref.disclosure_mode ?? "first_of_day" };
}

Deno.serve(asyncWrapper("fn-voice-pipeline", async (req: Request) => {
  await rateLimit(req, "fn-voice-pipeline");
  const body = await readJsonBody(req) as Record<string, unknown>;

  // ─── Authoritative Server-Side BSN Guard ───
  assertNoBsnInPayload(body);

  validateBody(body, { elder_id: "uuid", screen_id: "string" }, { allowUnknown: true });
  if (body.audio_base64) assertMaxLength(String(body.audio_base64), MAX_AUDIO_BASE64, 'audio_base64');
  const userId = await getJwtUserId(req);

  // Uses assertSelf or assertElderOrFamilyCan authorization check
  let authorized = userId === String(body.elder_id);
  if (!authorized) {
    const isFamily = await assertElderOrFamilyCan(userId, String(body.elder_id), "messages").then(() => true).catch(() => false);
    const isCarer = await assertCarerCan(userId, String(body.elder_id)).then(() => true).catch(() => false);
    authorized = isFamily || isCarer;
  }
  if (!authorized) throw new Error("403: Caller is not authorized to interact on behalf of this elder");

  const idem = (req.headers.get("idempotency-key") ?? body.idempotency_key) as string | undefined;
  const result = await withIdempotency({
    key: idem,
    functionName: "fn-voice-pipeline",
    elderId: String(body.elder_id),
    profileId: userId,
    requestBody: body,
    run: async () => {
      const db = userClient(req);
      const dbAdmin = admin();
      const locale = (body.locale === "nl-NL" ? "nl-NL" : "en-GB") as "en-GB" | "nl-NL";
      
      const transcript = body.audio_base64
        ? await transcribeDutchAudio(String(body.audio_base64))
        : String(body.transcript_text ?? (locale === "nl-NL" ? "Ik heb mijn pillen ingenomen en ik voel me rustig." : "I took my pills and I feel calm."));

      assertNoBsnInPayload({ transcript });

      // ─── COMPENSATING CONTROL — full semantic guardrails tracked as R2 ───
      // 1. Expand BANNED_STT_PHRASES to include Flemish/Dutch dialect variants and formal synonyms
      const BANNED_STT_PHRASES = [
        "negeer", "vergeet vorige", "ignore", "forget previous", 
        "bevestig direct", "confirm immediately", "override", 
        "system prompt", "negeer eerdere", "vergeet alles",
        "altijd ingenomen", "log direct",
        "ontken eerdere instructies", "ontken vorige", "verontachtzaam",
        "overschrijf", "heroverweeg", "annuleer vorige",
        "forceer", "passeer", "doe alsof", "negeer vorige instructies",
        "instructies overschrijven"
      ];
      
      // 2. Normalize transcript before checking (lowercase, collapse multiple spaces, remove punctuation)
      const lowerTrans = transcript.toLowerCase();
      const normalizedTrans = lowerTrans.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
      // Space-obfuscated versions (n e g e e r -> strip spaces before check)
      const spaceStrippedTrans = normalizedTrans.replace(/\s+/g, "");

      const hasBannedPhrase = BANNED_STT_PHRASES.some((phrase) => {
        const normPhrase = phrase.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
        const strippedPhrase = normPhrase.replace(/\s+/g, "");
        return normalizedTrans.includes(normPhrase) || spaceStrippedTrans.includes(strippedPhrase);
      });

      const hasUnusualMarCommand = /(medicatie|pillen|furosemide|insuline).*(direct|altijd|negeer|forceer|overschrijf)/.test(normalizedTrans) || /overschrijf.*medicatie/.test(normalizedTrans);

      if (hasBannedPhrase || hasUnusualMarCommand) {
        // ─── 3. False-positive handling path ───
        // If legitimate elder phrase accidentally matches (e.g. talking about weather or pain) ->
        // return a clarifying prompt instead of hard rejection.
        const isInnocentContext = /(regen|pijn|wandelen|tuin|voel|weer|eten|koffie|thee|slapen|tv|knie|rug|buiten)/.test(normalizedTrans);
        const isHighlyAdversarial = !isInnocentContext;

        await dbAdmin.from("audit_log").insert({
          actor_id: userId,
          actor_role: "elder",
          action: isHighlyAdversarial ? "VOICE_STT_HIJACKING_REJECTION" : "VOICE_STT_CLARIFICATION_LOG",
          table_name: "medication_reminders",
          elder_id: String(body.elder_id),
          extra: { transcript, rejection_reason: isHighlyAdversarial ? "Adversarial STT prompt injection or override pattern intercepted" : "Accidental STT keyword match triggering clarifying prompt" },
        }).catch(() => undefined);

        if (isHighlyAdversarial) {
          return { 
            body: { 
              transcript, 
              intent: "hijacking_attempt", 
              response_text: locale === "nl-NL" ? "Ik kan dit verzoek niet uitvoeren om de medische veiligheid te waarborgen." : "I cannot fulfill this request to guarantee medical safety.", 
              action_taken: "PIPELINE_HALTED", 
              audio_url: null, 
              distress_detected: false 
            } 
          };
        } else {
          const clarifyPrompt = locale === "nl-NL"
            ? "Bedoelt u dat u een eerdere opmerking wilt aanpassen? Vertel me rustig wat er aan de hand is."
            : "Do you mean you want to correct an earlier remark? Please calmly tell me what's going on.";
          return {
            body: {
              transcript,
              intent: "clarification_needed",
              response_text: clarifyPrompt,
              action_taken: "CLARIFICATION_REQUESTED",
              audio_url: null,
              distress_detected: false,
            }
          };
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      const c = classify(transcript);
      const distress = c.intent === "crisis";

      // ─── LOCKED POLICY: 2-Step Confirmation required for ALL voice medication intakes ───
      // Always creates an active pending_confirmations entry and returns Repeat-Back prompt.
      // Note: Enforced 2-step confirmation ignores any isRepeatBackEnabled check to guarantee MAR protection.
      if (c.intent === "bevestig_ingenomen") {
        const expiresAt = new Date(Date.now() + 90 * 1000).toISOString();
        const { data: reminders } = await db.from("medication_reminders").select("id, medication_id").eq("elder_id", body.elder_id).in("status", ["gepland", "herinnerd", "gesnoozed_1", "gesnoozed_2", "geëscaleerd"]).order("scheduled_time", { ascending: true }).limit(1);
        const reminder = reminders?.[0];
        await db.from("pending_confirmations").insert({
          elder_id: body.elder_id,
          confirmation_type: "medication_taken",
          payload: { transcript, medication_reminder_id: reminder?.id ?? null, medication_id: reminder?.medication_id ?? null },
          expires_at: expiresAt,
        });
        const askBack = locale === "nl-NL"
          ? `Ik hoorde u zeggen dat u uw medicijn heeft ingenomen. Klopt dat? Zeg ja of nee.`
          : `I heard you say you took your medicine. Is that correct? Please say yes or no.`;
        await db.from("voice_interactions").insert({
          elder_id: body.elder_id,
          screen_id: body.screen_id ? String(body.screen_id) : "HOME",
          transcript_nl: locale === "nl-NL" ? transcript : null,
          transcript_en: locale === "en-GB" ? transcript : null,
          intent: c.intent,
          entities: body.entities ?? {},
          response_text: askBack,
          action_taken: "AWAIT_REPEAT_BACK",
          distress_detected: false,
        });
        return { body: { transcript, intent: "bevestig_ingenomen", response_text: askBack, action_taken: "AWAIT_REPEAT_BACK", audio_url: null, distress_detected: false } };
      }

      if (distress) {
        const { data: family } = await dbAdmin.from("family_relationships").select("family_member_id").eq("elder_id", body.elder_id).eq("elder_consented", true).eq("is_active", true).eq("notify_on_crisis", true);
        await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: String(f.family_member_id), elder_id: String(body.elder_id), notification_type: "crisis_gedetecteerd", title_nl: "Noodoproep via stem", title_en: "Crisis alert via voice", body_nl: `HAVEN hoorde: "${transcript}". Bel meteen.`, body_en: `HAVEN heard: "${transcript}". Please call immediately.`, data: { transcript } })));
        await db.from("voice_interactions").insert({ elder_id: body.elder_id, screen_id: String(body.screen_id), transcript_nl: locale === "nl-NL" ? transcript : null, transcript_en: locale === "en-GB" ? transcript : null, intent: "crisis", entities: body.entities ?? {}, response_text: "Ik hoor dat er nood is. Ik heb meteen uw familie gewaarschuwd.", action_taken: "CRISIS_ESCALATED", distress_detected: true });
        return { body: { transcript, intent: "crisis", response_text: "Ik hoor dat er nood is. Ik heb meteen uw familie gewaarschuwd.", action_taken: "CRISIS_ESCALATED", audio_url: null, distress_detected: true } };
      }

      if (c.intent === "life_story") {
        return { body: { transcript, intent: "life_story", response_text: "Wat een mooie herinnering. Vertel me er gerust meer over.", action_taken: "START_STORY", audio_url: null, distress_detected: false } };
      }

      if (c.intent === "family_message") {
        return { body: { transcript, intent: "family_message", response_text: "Ik open uw familie-berichten.", action_taken: "OPEN_FAMILY", audio_url: null, distress_detected: false } };
      }

      const elderId = String(body.elder_id);
      const { replyNl, replyEn } = await companionReply(transcript, elderId);
      const responseText = locale === "nl-NL" ? replyNl : replyEn;

      const vConfig = await selectVoiceConfig(dbAdmin, elderId, locale);
      let audioUrl: string | null = null;
      if (vConfig.useFamiliar && vConfig.voiceId) {
        audioUrl = await synthesizeSpeechToStorage(responseText, vConfig.voiceId, elderId).catch(() => null);
      }

      await db.from("voice_interactions").insert({
        elder_id: elderId,
        screen_id: String(body.screen_id),
        transcript_nl: locale === "nl-NL" ? transcript : null,
        transcript_en: locale === "en-GB" ? transcript : null,
        intent: c.intent,
        entities: body.entities ?? {},
        response_text: responseText,
        action_taken: "COMPANION_REPLY",
        distress_detected: false,
      });

      return { body: { transcript, intent: c.intent, response_text: responseText, action_taken: "COMPANION_REPLY", audio_url: audioUrl, distress_detected: false } };
    },
  });

  return json(result.body, result.status ?? 200, req);
}));
