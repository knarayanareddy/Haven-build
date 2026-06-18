import { admin } from './core.ts';

const OPENAI_BASE = 'https://api.openai.com/v1';
const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';

function mockEnabled() {
  return Deno.env.get('HAVEN_AI_MOCK') === 'true' || Boolean(Deno.env.get('HAVEN_AI_MOCK_URL'));
}

async function mockJson(path: string, body: unknown) {
  const base = Deno.env.get('HAVEN_AI_MOCK_URL');
  if (!base) return null;
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Mock AI endpoint failed: ${path}`);
  return response.json();
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function transcribeDutchAudio(audioBase64: string, locale: "en-GB" | "nl-NL" = "nl-NL") {
  if (mockEnabled()) {
    const mocked = await mockJson('/transcribe', { audio_base64 });
    return String(mocked?.text ?? (locale === "nl-NL" ? 'Ik heb mijn pillen ingenomen.' : 'I took my pills.'));
  }
  const key = requireEnv('OPENAI_API_KEY');
  const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
  const file = new File([bytes], 'voice.wav', { type: 'audio/wav' });
  const form = new FormData();
  form.append('file', file);
  form.append('model', 'whisper-1');
  form.append('language', locale.startsWith('en') ? 'en' : 'nl');
  form.append('response_format', 'json');
  const response = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? 'Speech transcription failed');
  return String(json.text ?? '').trim();
}

export async function generateEmbedding(input: string) {
  if (mockEnabled()) {
    const mocked = await mockJson('/embedding', { input });
    return (mocked?.embedding ?? Array.from({ length: 1536 }, (_, i) => ((input.charCodeAt(i % Math.max(input.length, 1)) || 1) % 100) / 1000)) as number[];
  }
  const key = requireEnv('OPENAI_API_KEY');
  const response = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input, dimensions: 1536 }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? 'Embedding generation failed');
  return json.data?.[0]?.embedding as number[];
}

export async function companionReply(
  paramsOrTranscript: string | { locale: 'en-GB' | 'nl-NL'; transcript: string; memories?: string[]; screenId?: string },
  elderId?: string,
  localeOpt: 'en-GB' | 'nl-NL' = 'nl-NL'
) {
  const transcript = typeof paramsOrTranscript === 'string' ? paramsOrTranscript : paramsOrTranscript.transcript;
  const locale = typeof paramsOrTranscript === 'string' ? localeOpt : paramsOrTranscript.locale;
  const memories = typeof paramsOrTranscript === 'string' ? [] : (paramsOrTranscript.memories ?? []);
  const screenId = typeof paramsOrTranscript === 'string' ? 'HOME' : (paramsOrTranscript.screenId ?? 'HOME');

  if (mockEnabled()) {
    const mocked = await mockJson('/chat', { locale, transcript, memories, screenId });
    const fallbackText = locale === 'nl-NL' ? 'Ik ben bij u. Ik help rustig verder.' : 'I am with you. I will help calmly.';
    const textOut = String(mocked?.text ?? fallbackText);
    return { replyNl: textOut, replyEn: textOut, text: textOut };
  }
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) {
    const fallbackText = locale === 'nl-NL' ? 'Ik heb u gehoord. Ik help u rustig verder.' : 'I heard you. I will help calmly.';
    return { replyNl: fallbackText, replyEn: fallbackText, text: fallbackText };
  }
  const system = locale === 'nl-NL'
    ? 'Je bent HAVEN, een vriendelijke digitale hulp voor een oudere in Nederland. Spreek met u en uw. Maximaal twee korte zinnen. Je bent geen arts en geen mens; wees eerlijk.'
    : 'You are HAVEN, a warm digital helper for an older adult. Use respectful, calm language. Maximum two short sentences. You are not a doctor and not a human; be honest.';
  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_CHAT_MODEL') ?? 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Screen: ${screenId}\nMemories:\n${memories.map((m) => `- ${m}`).join('\n')}\nTranscript: ${transcript}` },
      ],
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? 'Companion response failed');
  const content = String(json.choices?.[0]?.message?.content ?? '').trim();
  return { replyNl: content, replyEn: content, text: content };
}

export async function synthesizeSpeechToStorage(params: { elderId: string; interactionId: string; text: string; locale: 'en-GB' | 'nl-NL' }) {
  if (mockEnabled()) {
    const mocked = await mockJson('/tts', params);
    if (mocked?.audio_url) return String(mocked.audio_url);
    return null;
  }
  const key = Deno.env.get('ELEVENLABS_API_KEY');
  const voiceId = Deno.env.get(params.locale === 'nl-NL' ? 'ELEVENLABS_VOICE_ID_NL' : 'ELEVENLABS_VOICE_ID_EN');
  if (!key || !voiceId) return null;
  const response = await fetch(`${ELEVEN_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: params.text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.72, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
    }),
  });
  if (!response.ok) throw new Error('Speech synthesis failed');
  const audio = new Uint8Array(await response.arrayBuffer());
  const path = `${params.elderId}/${params.interactionId}.mp3`;
  const { error } = await admin().storage.from('tts-cache').upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
  if (error) throw error;
  const signed = await admin().storage.from('tts-cache').createSignedUrl(path, 300);
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
}
