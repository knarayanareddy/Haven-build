// P1.4 — elder app safety loops.
//
// The voice UI treated every pipeline answer identically:
//     Alert.alert('HAVEN', response.response_text || voiceFallback)
// `distress_detected`, `intent` and `action_taken` were ignored, so a detected fall
// or a cry for help rendered exactly like "I took my pills": a neutral text bubble,
// no help affordance, no call button, nothing spoken immediately.
//
// These tests exercise the real decision module (apps/elder/src/services/safetyEscalation.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { transpileModuleFile } from './support/shared-loader.mjs';

// crisis.ts is imported by safetyEscalation.ts; transpile it first so the rewritten
// specifier resolves, then load the decision module itself.
const crisisPath = await transpileModuleFile(new URL('../../apps/elder/src/services/crisis.ts', import.meta.url));
const outDir = crisisPath.replace(/\/crisis\.mjs$/, '');
const escalationPath = await transpileModuleFile(
  new URL('../../apps/elder/src/services/safetyEscalation.ts', import.meta.url),
  { outDir },
);
const { decideEscalation, decideEscalationForError } = await import(escalationPath);

test('a server-side distress signal escalates to crisis with help affordances', () => {
  const escalation = decideEscalation(
    { distress_detected: true, intent: 'crisis', response_text: 'Ik waarschuw uw familie.', transcript: 'help' },
    'nl-NL',
  );
  assert.equal(escalation.level, 'crisis');
  assert.deepEqual(escalation.actions, ['show_help', 'call_family', 'call_emergency']);
  assert.equal(escalation.speakImmediately, true, 'a crisis reply must not wait for a tap');
  assert.equal(escalation.retryable, false);
  assert.equal(escalation.message, 'Ik waarschuw uw familie.');
});

test('a locally detected crisis phrase escalates even when the server missed it', () => {
  // Defence in depth: the app must not be the reason an older adult gets no help.
  const escalation = decideEscalation({ distress_detected: false, intent: 'chat', transcript: 'ik ben gevallen' }, 'nl-NL');
  assert.equal(escalation.level, 'crisis');
  assert.ok(escalation.actions.includes('call_family'));
});

test('a crisis answer with no response text still says something useful', () => {
  const dutch = decideEscalation({ distress_detected: true, transcript: 'ik ben bang' }, 'nl-NL');
  assert.match(dutch.message, /familie|blijf bij u/i);
  const english = decideEscalation({ distress_detected: true }, 'en-GB');
  assert.match(english.message, /family|staying with you/i);
});

test('a prompt-injection answer is blocked and never treated as a medication confirmation', () => {
  const escalation = decideEscalation(
    { intent: 'hijacking_attempt', action_taken: 'PIPELINE_HALTED', response_text: 'Dat kan ik niet doen.' },
    'nl-NL',
  );
  assert.equal(escalation.level, 'blocked');
  assert.equal(escalation.actions.length, 0);
  assert.notEqual(escalation.level, 'medication');
});

test('a repeat-back prompt stays a confirmation prompt', () => {
  const escalation = decideEscalation({ intent: 'bevestig_ingenomen', action_taken: 'AWAIT_REPEAT_BACK' }, 'nl-NL');
  assert.equal(escalation.level, 'medication');
  assert.match(escalation.message, /ja of nee/i);
});

test('a clarification request is retryable and asks again', () => {
  const escalation = decideEscalation({ intent: 'clarification_needed' }, 'nl-NL');
  assert.equal(escalation.level, 'clarify');
  assert.equal(escalation.retryable, true);
});

test('a null answer is treated as unavailable, never as a reply', () => {
  const escalation = decideEscalation(null, 'nl-NL');
  assert.equal(escalation.level, 'unavailable');
  assert.equal(escalation.retryable, true);
});

test('transport failures map onto the same ladder', () => {
  assert.equal(decideEscalationForError({ status: 503 }).level, 'unavailable');
  assert.equal(decideEscalationForError({ status: 503 }).retryable, true);
  assert.match(decideEscalationForError({ status: 429 }, 'nl-NL').message, /druk|minuut/i);
  assert.equal(decideEscalationForError(new Error('socket hang up')).level, 'unavailable');
});

test('the voice button actually uses the ladder instead of alerting raw text', () => {
  const button = readFileSync(
    new URL('../../apps/elder/src/components/FloatingVoiceButton.tsx', import.meta.url),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  assert.match(button, /decideEscalation\(response, locale\)/, 'must classify the answer');
  assert.match(button, /decideEscalationForError\(error, locale\)/, 'must classify failures');
  assert.equal(
    /Alert\.alert\('HAVEN', message\);/.test(button),
    false,
    'the raw-text path that ignored distress_detected must be gone',
  );
  assert.match(button, /escalation\.level === 'crisis'/, 'crisis must get a dedicated presentation');
  assert.match(button, /navigation\?\.navigate\?\.\('HOME'\)/, 'help must navigate to a real screen');
  assert.match(button, /navigation\?\.navigate\?\.\('FAMILY'\)/, 'calling must navigate to a real screen');
});
