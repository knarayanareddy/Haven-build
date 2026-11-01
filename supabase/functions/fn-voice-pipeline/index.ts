import { admin, dispatchNotification, json, readJsonBody, recordMetric, userClient } from "../_shared/core.ts";
import { settleQuery } from "../_shared/settle.ts";
import { companionReply, synthesizeSpeechToStorage, transcribeDutchAudio } from "../_shared/ai.ts";
import { assertElderOrFamilyCan, assertCarerCan, AuthzError, getJwtUserId } from "../_shared/authz.ts";
import { validateBody, assertMaxLength, MAX_AUDIO_BASE64 } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { assertNoBsnInPayload, scrubBsnFromLogs } from "../_shared/bsn_guard.ts";
import { asyncWrapper } from "../_shared/async_wrapper.ts";

function classify(transcript: string, locale: "en-GB" | "en-US" | "nl-NL" = "nl-NL") {
  const t = transcript.toLowerCase();
  const isEn = locale === "en-GB" || locale === "en-US";

  const INTENT_PATTERNS_NL = [
    { intent: "bevestig_ingenomen", regex: /(ingenomen|genomen|slikken|geslikt|opgedronken|klaar)/ },
    { intent: "crisis", regex: /(gevallen|help|bang|ambulance|niet goed|pijn op de borst|nood|ongeluk)/ },
    { intent: "life_story", regex: /(verhaal|herinnering|toen ik vroeger|mijn jeugd)/ },
    { intent: "family_message", regex: /(familie|sarah|bericht|boodschap|stuur foto)/ },
  ];

  const INTENT_PATTERNS_EN = [
    { intent: "bevestig_ingenomen", regex: /(taken|took|swallowed|drank|done|finished)/ },
    { intent: "crisis", regex: /(help|fallen|fell|scared|ambulance|chest pain|emergency|not feeling well)/ },
    { intent: "life_story", regex: /(story|memory|when i was young|my childhood|remember)/ },
    { intent: "family_message", regex: /(family|sarah|message|send photo)/ },
  ];

  const patterns = isEn ? INTENT_PATTERNS_EN : INTENT_PATTERNS_NL;
  for (const p of patterns) {
    if (p.regex.test(t)) return { intent: p.intent, action: p.intent.toUpperCase() };
  }

  return { intent: "companion", action: "COMPANION_REPLY" };
}

function localizedResponse(locale: "en-GB" | "nl-NL", text: string) {
  return {
    response_text_nl: locale === "nl-NL" ? text : null,
    response_text_en: locale === "en-GB" ? text : null,
  };
}

async function returnsFalseForExpectedDeny(check: Promise<unknown>): Promise<boolean> {
  try {
    await check;
    return true;
  } catch (error) {
    if (error instanceof AuthzError && error.reasonCode !== "SYSTEM_UNCERTAINTY" && error.reasonCode !== "INVALID_TOKEN") {
      return false;
    }
    throw error;
  }
}

async function selectVoiceConfig(adminClient: ReturnType<typeof admin>, elderId: string, locale: "en-GB" | "nl-NL"): Promise<{ voiceId?: string; useFamiliar: boolean; crisisOverride: boolean; disclosure: "always" | "first_of_day" | "none" }> {
  const { data: pref } = await adminClient.from("elder_voice_preferences").select("voice_profile_id, use_familiar_voice, disclosure_mode").eq("elder_id", elderId).maybeSingle();
  if (!pref?.use_familiar_voice || !pref.voice_profile_id) return { useFamiliar: false, crisisOverride: false, disclosure: "none" };
  const { data: profile } = await adminClient.from("voice_profiles").select("status, provider_voice_id").eq("id", pref.voice_profile_id).maybeSingle();
  if (!profile || profile.status !== "ready") return { useFamiliar: false, crisisOverride: false, disclosure: "none" };
  return { voiceId: profile.provider_voice_id ?? undefined, useFamiliar: true, crisisOverride: false, disclosure: pref.disclosure_mode ?? "first_of_day" };
}

Deno.serve(asyncWrapper("fn-voice-pipeline", async (req: Request) => {
  const started = Date.now();
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
    const isFamily = await returnsFalseForExpectedDeny(assertElderOrFamilyCan(userId, String(body.elder_id), "messages"));
    const isCarer = await returnsFalseForExpectedDeny(assertCarerCan(userId, String(body.elder_id)));
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

      const { data: elderProfile } = await dbAdmin.from("profiles").select("locale").eq("id", body.elder_id).maybeSingle();
      const locale = (elderProfile?.locale ?? (body.locale === "nl-NL" ? "nl-NL" : "en-GB")) as "en-GB" | "nl-NL";
      
      // ─── Snooze: an explicit target, not something to infer from a transcript ───
      //
      // The elder's "Snooze" button used to send the sentence "I did not take it", which the
      // English patterns below match on "took" — so pressing snooze created a *medication
      // taken* prompt, the opposite of what was asked. The reminder id travels in its own
      // field and is handled before any classification happens.
      const snoozeReminderId = typeof body.snooze_reminder_id === "string" ? body.snooze_reminder_id : null;
      if (snoozeReminderId) {
        const minutesRaw = Number(body.snooze_minutes);
        const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? Math.min(Math.round(minutesRaw), 120) : 15;
        const { data: snoozed } = await db
          .from("medication_reminders")
          .select("id, status")
          .eq("elder_id", body.elder_id)
          .eq("id", snoozeReminderId)
          .maybeSingle();
        if (!snoozed) {
          throw Object.assign(new Error("404: No such medication reminder for this elder"), { status: 404, code: "NOT_FOUND" });
        }
        // The schema allows two snoozes; a third is not a new state it can express, so the
        // reminder stays at the second and the time still moves.
        const nextStatus = snoozed.status === "gesnoozed_1" ? "gesnoozed_2" : "gesnoozed_1";
        const nextTime = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        const { error: snoozeError } = await db
          .from("medication_reminders")
          .update({ status: nextStatus, scheduled_time: nextTime })
          .eq("id", snoozeReminderId);
        if (snoozeError) throw snoozeError;
        const snoozeText = locale === "nl-NL"
          ? `Goed, ik herinner u over ${minutes} minuten opnieuw.`
          : `Alright, I will remind you again in ${minutes} minutes.`;
        const snoozeTranscript: string = typeof body.transcript_text === "string" ? body.transcript_text : "";
        await db.from("voice_interactions").insert({
          elder_id: body.elder_id,
          screen_id: body.screen_id ? String(body.screen_id) : "PILLS",
          transcript_nl: locale === "nl-NL" ? snoozeTranscript : null,
          transcript_en: locale === "en-GB" ? snoozeTranscript : null,
          intent: "snooze",
          entities: { medication_reminder_id: snoozeReminderId, minutes },
          ...localizedResponse(locale, snoozeText),
          action_taken: "SNOOZED",
          distress_detected: false,
        });
        return { body: { transcript: snoozeTranscript, intent: "snooze", response_text: snoozeText, action_taken: "SNOOZED", audio_url: null, distress_detected: false } };
      }

      // ─── FAIL CLOSED on missing or failed transcription (P1.5) ───
      // Previously this defaulted to "Ik heb mijn pillen ingenomen en ik voel me
      // rustig." when no audio was sent, and transcribeDutchAudio() returned
      // "Ik heb mijn pillen ingenomen." when STT produced nothing. Both fabricate a
      // medication-taken statement that the classifier below turns into a MAR
      // confirmation — for a dose the older adult never reported, and with a
      // positive mood reading nobody said. Neither may ever be synthesised.
      const medicationTap = body.medication_action === "taken";
      if (medicationTap && (typeof body.medication_reminder_id !== "string" || !body.medication_reminder_id)) {
        throw Object.assign(new Error("400: Medication reminder is required"), { status: 400, code: "BAD_REQUEST" });
      }
      if (!medicationTap && !body.audio_base64 && !body.transcript_text) {
        throw Object.assign(
          new Error(locale === "nl-NL"
            ? "Geen spraak ontvangen. Neem opnieuw op."
            : "No speech was received. Please record again."),
          { status: 400, code: "BAD_REQUEST" },
        );
      }

      let transcript: string;
      if (body.audio_base64) {
        try {
          transcript = await transcribeDutchAudio(String(body.audio_base64), locale);
        } catch (transcriptionError) {
          const unavailableReason = (transcriptionError as { reason?: string }).reason ?? "provider-error";
          // Record the failure so a silent STT outage is visible, then answer 503
          // with no intent — never a guessed transcript.
          await settleQuery(dbAdmin.from("audit_log").insert({
            actor_id: userId,
            actor_role: "system",
            action: "VOICE_TRANSCRIPTION_UNAVAILABLE",
            table_name: "voice_interactions",
            elder_id: String(body.elder_id),
            extra: { reason: unavailableReason, timestamp: new Date().toISOString() },
          }), "audit_log");
          await recordMetric("fn-voice-pipeline", started, "fallback");
          throw Object.assign(
            new Error(locale === "nl-NL"
              ? "Ik kon u niet verstaan. Probeer het alstublieft nog een keer."
              : "I could not hear you clearly. Please try again."),
            { status: 503, code: "SERVICE_UNAVAILABLE", retryAfterSeconds: 5, cause: transcriptionError },
          );
        }
      } else {
        transcript = typeof body.transcript_text === "string" ? body.transcript_text.trim() : "";
      }

      if (!transcript && !medicationTap) {
        throw Object.assign(
          new Error(locale === "nl-NL" ? "Geen spraak ontvangen." : "No speech was received."),
          { status: 422, code: "UNPROCESSABLE_ENTITY" },
        );
      }

      assertNoBsnInPayload({ transcript });

      // ─── COMPENSATING CONTROL — full semantic guardrails tracked as R2 ───
      // 1. Expand BANNED_STT_PHRASES to include Flemish/Dutch/English dialect variants and formal synonyms
      const BANNED_STT_PHRASES = [
        "negeer", "vergeet vorige", "ignore", "forget previous", 
        "bevestig direct", "confirm immediately", "override", 
        "system prompt", "negeer eerdere", "vergeet alles",
        "altijd ingenomen", "log direct",
        "ontken eerdere instructies", "ontken vorige", "verontachtzaam",
        "overschrijf", "heroverweeg", "annuleer vorige",
        "forceer", "passeer", "doe alsof", "negeer vorige instructies",
        "instructies overschrijven",
        // New English equivalents:
        "disregard", "bypass instructions", "pretend to",
        "do not follow", "erase all", "confirm without", "always taken"
      ];
      
      // 2. Normalize transcript before checking
      const lowerTrans = transcript.toLowerCase();
      const normalizedTrans = lowerTrans.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
      const spaceStrippedTrans = normalizedTrans.replace(/\s+/g, "");

      const hasBannedPhrase = BANNED_STT_PHRASES.some((phrase) => {
        const normPhrase = phrase.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
        const strippedPhrase = normPhrase.replace(/\s+/g, "");
        return normalizedTrans.includes(normPhrase) || spaceStrippedTrans.includes(strippedPhrase);
      });

      const hasUnusualMarCommand = /(medicatie|pillen|furosemide|insuline|pills|medication).*(direct|altijd|negeer|forceer|overschrijf|always|ignore|force|override)/.test(normalizedTrans) || /overschrijf.*medicatie/.test(normalizedTrans) || /override.*medication/.test(normalizedTrans);

      if (hasBannedPhrase || hasUnusualMarCommand) {
        const isInnocentContext = /(regen|pijn|wandelen|tuin|voel|weer|eten|koffie|thee|slapen|tv|knie|rug|buiten|rain|pain|walking|garden|feel|weather|food|coffee|tea|sleep|knee|back|outside)/.test(normalizedTrans);
        const isHighlyAdversarial = !isInnocentContext;

        const { error: hijackAuditError } = await dbAdmin.from("audit_log").insert({
          actor_id: userId,
          actor_role: "elder",
          action: isHighlyAdversarial ? "VOICE_STT_HIJACKING_REJECTION" : "VOICE_STT_CLARIFICATION_LOG",
          table_name: "medication_reminders",
          elder_id: String(body.elder_id),
          extra: { transcript, rejection_reason: isHighlyAdversarial ? "Adversarial STT prompt injection or override pattern intercepted" : "Accidental STT keyword match triggering clarifying prompt" },
        });
        if (hijackAuditError) {
          console.warn(`Voice STT security audit log failed: ${hijackAuditError.message}`);
          throw hijackAuditError;
        }

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

      const c = medicationTap ? { intent: "bevestig_ingenomen", action: "BEVESTIG_INGENOMEN" } : classify(transcript, locale);
      const distress = c.intent === "crisis";

      // ─── LOCKED POLICY: 2-Step Confirmation required for ALL voice medication intakes ───
      // Always creates an active pending_confirmations entry and returns Repeat-Back prompt.
      // Note: Enforced 2-step confirmation ignores any isRepeatBackEnabled check to guarantee MAR protection.
      if (c.intent === "bevestig_ingenomen") {
        const expiresAt = new Date(Date.now() + 90 * 1000).toISOString();
        // Which dose is being confirmed. A tap on a specific reminder ("I took *this* one")
        // sends its id; without it the earliest open reminder is used, which is what a spoken
        // sentence with no target needs. Taking the earliest for a tap meant that answering
        // the 20:00 pill at 08:00 confirmed — and later recorded — the 08:00 dose instead.
        const targetedReminderId = typeof body.medication_reminder_id === "string" ? body.medication_reminder_id : null;
        let reminder: { id: string; medication_id: string } | undefined;
        if (targetedReminderId) {
          const { data: targeted, error: targetError } = await db
            .from("medication_reminders")
            .select("id, medication_id")
            .eq("elder_id", body.elder_id)
            .eq("id", targetedReminderId)
            .in("status", ["gepland", "herinnerd", "gesnoozed_1", "gesnoozed_2", "geëscaleerd"])
            .maybeSingle();
          if (targetError) throw targetError;
          if (!targeted) throw Object.assign(new Error("404: No open medication reminder for this elder"), { status: 404, code: "NOT_FOUND" });
          reminder = targeted;
        }
        if (!reminder && !targetedReminderId) {
          const { data: reminders } = await db.from("medication_reminders").select("id, medication_id").eq("elder_id", body.elder_id).in("status", ["gepland", "herinnerd", "gesnoozed_1", "gesnoozed_2", "geëscaleerd"]).order("scheduled_time", { ascending: true }).limit(1);
          reminder = reminders?.[0];
        }
        const { error: confirmationError } = await db.from("pending_confirmations").insert({
          elder_id: body.elder_id,
          confirmation_type: "medication_taken",
          payload: { transcript, medication_reminder_id: reminder?.id ?? null, medication_id: reminder?.medication_id ?? null },
          expires_at: expiresAt,
          locale: locale,
        });
        if (confirmationError) throw confirmationError;
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
          ...localizedResponse(locale, askBack),
          action_taken: "AWAIT_REPEAT_BACK",
          distress_detected: false,
        });
        return { body: { transcript, intent: "bevestig_ingenomen", response_text: askBack, action_taken: "AWAIT_REPEAT_BACK", audio_url: null, distress_detected: false } };
      }

      if (distress) {
        const { data: family } = await dbAdmin.from("family_relationships").select("family_member_id").eq("elder_id", body.elder_id).eq("elder_consented", true).eq("is_active", true).eq("notify_on_crisis", true);
        await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: String(f.family_member_id), elder_id: String(body.elder_id), notification_type: "crisis_gedetecteerd", title_nl: "Noodoproep via stem", title_en: "Crisis alert via voice", body_nl: `HAVEN hoorde: "${transcript}". Bel meteen.`, body_en: `HAVEN heard: "${transcript}". Please call immediately.`, data: { transcript } })));
        const crisisText = locale === "nl-NL" ? "Ik hoor dat er nood is. Ik heb meteen uw familie gewaarschuwd." : "I hear this may be urgent. I alerted your family immediately.";
        await db.from("voice_interactions").insert({ elder_id: body.elder_id, screen_id: String(body.screen_id), transcript_nl: locale === "nl-NL" ? transcript : null, transcript_en: locale === "en-GB" ? transcript : null, intent: "crisis", entities: body.entities ?? {}, ...localizedResponse(locale, crisisText), action_taken: "CRISIS_ESCALATED", distress_detected: true });
        return { body: { transcript, intent: "crisis", response_text: crisisText, action_taken: "CRISIS_ESCALATED", audio_url: null, distress_detected: true } };
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
        audioUrl = await synthesizeSpeechToStorage({ elderId, interactionId: crypto.randomUUID(), text: responseText, locale, voiceId: vConfig.voiceId }).catch((error) => {
          console.warn(`TTS synthesis failed: ${String((error as Error).message ?? error).slice(0, 240)}`);
          return null;
        });
      }

      await db.from("voice_interactions").insert({
        elder_id: elderId,
        screen_id: String(body.screen_id),
        transcript_nl: locale === "nl-NL" ? transcript : null,
        transcript_en: locale === "en-GB" ? transcript : null,
        intent: c.intent,
        entities: body.entities ?? {},
        ...localizedResponse(locale, responseText),
        action_taken: "COMPANION_REPLY",
        distress_detected: false,
      });

      return { body: { transcript, intent: c.intent, response_text: responseText, action_taken: "COMPANION_REPLY", audio_url: audioUrl, distress_detected: false } };
    },
  });

  return json(result.body, result.status ?? 200, req);
}));
