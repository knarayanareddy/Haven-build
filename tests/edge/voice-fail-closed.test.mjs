// P1.5 — voice pipeline must fail closed.
//
// The pipeline used to synthesize a medication-taken statement in two places:
//   • fn-voice-pipeline: `body.transcript_text ?? "Ik heb mijn pillen ingenomen en
//     ik voel me rustig."` when no audio was sent;
//   • _shared/ai.ts: `mocked?.text ?? "Ik heb mijn pillen ingenomen."` whenever
//     transcription yielded nothing.
// Both sentences match the medication intent classifier, so a failed recording
// could open a MAR confirmation (and record a calm mood) for a dose that was never
// reported. These tests pin the fail-closed behaviour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { installDenoShim, linkSharedModules } from './support/shared-loader.mjs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

test('the pipeline no longer contains a fabricated medication transcript', () => {
  const pipeline = read('supabase/functions/fn-voice-pipeline/index.ts');
  assert.equal(
    /Ik heb mijn pillen ingenomen en ik voel me rustig/.test(pipeline),
    false,
    'the fabricated NL fallback transcript must not exist',
  );
  assert.equal(
    /I took my pills and I feel calm/.test(pipeline),
    false,
    'the fabricated EN fallback transcript must not exist',
  );
});

test('the STT helper never invents a transcript', () => {
  const ai = read('supabase/functions/_shared/ai.ts');
  const stt = ai.slice(ai.indexOf('export async function transcribeDutchAudio'), ai.indexOf('export async function generateEmbedding'));
  assert.ok(stt.length > 200, 'the transcribe function must be present');
  // The only permitted shape is `String(mocked?.text ?? '')`, i.e. an empty string
  // that the guard below rejects — never a sentence.
  assert.match(stt, /mocked\?\.text \?\? ''\s*\)\s*\.trim\(\)/, 'mock text must default to an empty string');
  assert.match(stt, /if \(!mockedText\)/, 'an empty mock transcript must be rejected');
  assert.equal(/Ik heb mijn pillen|I took my pills/.test(stt), false, 'no fabricated clinical statement');
  assert.match(stt, /TranscriptUnavailableError/, 'a typed failure must be raised instead');
});

test('transcribeDutchAudio throws when no audio is supplied', async () => {
  installDenoShim({ HAVEN_AI_MOCK: 'true' });
  const sharedDir = await linkSharedModules();
  const ai = await import(`${sharedDir}/ai.mjs`);

  await assert.rejects(() => ai.transcribeDutchAudio('', 'nl-NL'), (error) => {
    assert.equal(error.name, 'TranscriptUnavailableError');
    assert.equal(error.status, 503);
    assert.equal(error.reason, 'not-configured');
    return true;
  });
});

test('transcribeDutchAudio throws instead of returning empty text in mock mode', async () => {
  // HAVEN_AI_MOCK=true without a mock server: previously returned
  // "Ik heb mijn pillen ingenomen." — now it fails.
  installDenoShim({ HAVEN_AI_MOCK: 'true' });
  const sharedDir = await linkSharedModules();
  const ai = await import(`${sharedDir}/ai.mjs`);

  await assert.rejects(
    () => ai.transcribeDutchAudio('AAECAw==', 'nl-NL'),
    /Mock transcript endpoint returned no text/,
  );
});

test('a transcription failure maps to 503 with no intent, never a medication intent', () => {
  const pipeline = read('supabase/functions/fn-voice-pipeline/index.ts');
  assert.match(pipeline, /status: 503/, 'STT failure must answer 503');
  assert.match(pipeline, /code: "SERVICE_UNAVAILABLE"/);
  assert.match(pipeline, /VOICE_TRANSCRIPTION_UNAVAILABLE/, 'the failure must be audited');
  // The failure branch must be thrown before any MAR write can happen.
  const failIdx = pipeline.indexOf('VOICE_TRANSCRIPTION_UNAVAILABLE');
  const marIdx = pipeline.indexOf('pending_confirmations');
  assert.ok(failIdx > 0 && marIdx > failIdx, 'the fail-closed branch must precede the MAR confirmation');
});

test('a missing audio field is a 400, not a fabricated statement', () => {
  const pipeline = read('supabase/functions/fn-voice-pipeline/index.ts');
  assert.match(pipeline, /if \(!body\.audio_base64 && !body\.transcript_text\)/);
  assert.match(pipeline, /status: 400/);
});
