import { admin, cors, dispatchNotification, json, recordMetric, requireFields } from "../_shared/core.ts";
import { companionReply, generateEmbedding, synthesizeSpeechToStorage, transcribeDutchAudio } from "../_shared/ai.ts";

function classify(transcript: string) {
  const t = transcript.toLowerCase();
  if (/(ingenomen|taken|done|klaar)/.test(t)) return { intent: "bevestig_ingenomen", action: "CONFIRM_MEDICATION_TAKEN" };
  if (/(gevallen|help|bang|ambulance|niet goed|scared|fallen|niet meer zijn)/.test(t)) return { intent: "crisis", action: "TRIGGER_CRISIS_FLOW" };
  if (/(verhaal|story|memory|herinnering)/.test(t)) return { intent: "life_story", action: "START_STORY" };
  if (/(familie|sarah|bericht|message)/.test(t)) return { intent: "family_message", action: "OPEN_FAMILY" };
  return { intent: "companion", action: "COMPANION_REPLY" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "screen_id"]);
    const locale = (body.locale === "nl-NL" ? "nl-NL" : "en-GB") as "en-GB" | "nl-NL";
    const transcript = body.audio_base64 ? await transcribeDutchAudio(String(body.audio_base64)) : String(body.transcript_text ?? (locale === "nl-NL" ? "Ik heb mijn pillen ingenomen en ik voel me rustig." : "I took my pills and I feel calm."));
    const c = classify(transcript);
    const distress = c.intent === "crisis";
    const db = admin();

    const memoriesResponse = await db.from("companion_memory").select("content_nl,content_en").eq("elder_id", body.elder_id).is("deleted_at", null).limit(6);
    const memories = (memoriesResponse.data ?? []).map((m) => locale === "nl-NL" ? m.content_nl : (m.content_en ?? m.content_nl));

    const responseText = distress
      ? (locale === "nl-NL" ? "Ik ben bij u. Ik waarschuw uw familie en toon de hulpknop." : "I am with you. I will notify your family and show the help button.")
      : c.intent === "bevestig_ingenomen"
        ? (locale === "nl-NL" ? "Goed gedaan. Ik heb het genoteerd." : "Well done. I recorded it.")
        : await companionReply({ locale, transcript, memories, screenId: body.screen_id });

    let embedding = null;
    try { embedding = await generateEmbedding(transcript); } catch (_) { embedding = null; }

    const { data: interaction, error } = await db.from("voice_interactions").insert({
      elder_id: body.elder_id,
      screen_id: body.screen_id,
      transcript_nl: locale === "nl-NL" ? transcript : null,
      transcript_en: locale === "en-GB" ? transcript : null,
      intent: c.intent,
      entities: body.entities ?? {},
      response_text_nl: locale === "nl-NL" ? responseText : null,
      response_text_en: locale === "en-GB" ? responseText : null,
      distress_detected: distress,
      distress_phrase: distress ? transcript : null,
      action_taken: c.action,
      duration_ms: Date.now() - started,
      embedding,
    }).select().single();
    if (error) throw error;

    if (c.intent === "bevestig_ingenomen") {
      const { data: reminders } = await db.from("medication_reminders").select("id").eq("elder_id", body.elder_id).in("status", ["gepland", "herinnerd", "gesnoozed_1", "gesnoozed_2", "geëscaleerd"]).order("scheduled_time", { ascending: true }).limit(1);
      if (reminders?.[0]) await db.rpc("mark_reminder_taken", { p_reminder_id: reminders[0].id, p_elder_id: body.elder_id });
    }

    if (c.intent === "companion" && transcript.length > 12) {
      await db.from("companion_memory").insert({ elder_id: body.elder_id, memory_type: "emotional_state", content_nl: locale === "nl-NL" ? transcript.slice(0, 240) : "Gesprek in Engels opgeslagen.", content_en: locale === "en-GB" ? transcript.slice(0, 240) : null, importance_score: 4, embedding, source: "voice_interaction", source_id: interaction.id });
    }

    if (distress) {
      const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", body.elder_id).eq("elder_consented", true).eq("is_active", true).eq("notify_on_crisis", true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: body.elder_id, notification_type: "crisis_gedetecteerd", title_nl: "HAVEN hulpvraag", title_en: "HAVEN help request", body_nl: "Er is een mogelijke hulpvraag uitgesproken. Bel rustig meteen even.", body_en: "A possible help request was spoken. Please calmly call now.", data: { interaction_id: interaction.id } })));
    }

    let audioUrl = null;
    try { audioUrl = await synthesizeSpeechToStorage({ elderId: body.elder_id, interactionId: interaction.id, text: responseText, locale }); } catch (_) { audioUrl = null; }
    if (audioUrl) await db.from("voice_interactions").update({ response_audio_path: `tts-cache/${body.elder_id}/${interaction.id}.mp3` }).eq("id", interaction.id);

    await recordMetric("fn-voice-pipeline", started, "success");
    return json({ transcript, intent: c.intent, entities: body.entities ?? {}, response_text: responseText, audio_url: audioUrl, action_taken: c.action, distress_detected: distress, interaction_id: interaction.id });
  } catch (e) {
    await recordMetric("fn-voice-pipeline", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
