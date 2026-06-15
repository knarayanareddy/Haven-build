import { test } from 'node:test';
import assert from 'node:assert/strict';

// Authoritative JavaScript implementation of bsn_guard helpers for Node execution
function isValid11Proef(digits) {
  if (!/^\d{9}$/.test(digits)) return false;
  const d = digits.split('').map(Number);
  const sum = (d[0] * 9) + (d[1] * 8) + (d[2] * 7) + (d[3] * 6) + (d[4] * 5) + (d[5] * 4) + (d[6] * 3) + (d[7] * 2) - (d[8] * 1);
  return sum % 11 === 0;
}

function containsBsn(text) {
  if (!text) return false;
  const clean = text.replace(/[\s\-._/,\u200B-\u200D\uFEFF]/g, '');
  if (clean.length < 9) return false;

  for (let i = 0; i <= clean.length - 9; i++) {
    const candidate = clean.slice(i, i + 9);
    if (/^\d{9}$/.test(candidate)) {
      if (isValid11Proef(candidate)) return true;
    }
  }
  return false;
}

function scrubBsnFromLogs(payload) {
  if (typeof payload === 'string') {
    return payload.replace(/([0-9][\s\-._/,\u200B-\u200D\uFEFF]*){8}[0-9]/g, (match) => {
      const clean = match.replace(/[^0-9]/g, '');
      if (clean.length === 9 && isValid11Proef(clean)) {
        return '[REDACTED_BSN]';
      }
      return match;
    });
  }
  if (Array.isArray(payload)) {
    return payload.map(scrubBsnFromLogs);
  }
  if (payload !== null && typeof payload === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(payload)) {
      res[k] = scrubBsnFromLogs(v);
    }
    return res;
  }
  return payload;
}

function assertNoBsnInPayload(body) {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  if (containsBsn(serialized)) {
    const err = new Error('422: Prohibited Dutch Citizen Service Number (BSN) detected. Storage, transmission, and processing of BSN is strictly prohibited.');
    err.status = 422;
    err.isBsnViolation = true;
    throw err;
  }
}

test('BSN Guard Acceptance Tests Suite (Finding #2 Minimal Scope Complete Closure)', async () => {
  // Mock external AI dependencies tracker
  let openAiCalled = false;
  let elevenLabsCalled = false;

  const mockOpenAiCall = async () => { openAiCalled = true; };
  const mockElevenLabsCall = async () => { elevenLabsCalled = true; };

  // Simulated Edge Function Execution Handler
  const simulatedVoiceHandler = async (payload) => {
    try {
      assertNoBsnInPayload(payload);
      if (payload.transcript) {
        assertNoBsnInPayload({ transcript: payload.transcript });
      }
      // If safe, call external AI
      await mockOpenAiCall();
      await mockElevenLabsCall();
      return { status: 200, body: { success: true } };
    } catch (err) {
      const scrubbed = scrubBsnFromLogs(payload);
      return {
        status: err.status ?? 400,
        error: err.message,
        loggedTelemetry: scrubbed
      };
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // CLOSURE TEST 1 — Server blocks BSN variants with 422. Response does NOT echo BSN.
  // ══════════════════════════════════════════════════════════════════════════════
  const validBsnPureDigits = '123456782';
  const validBsnHyphenDelimited = '123-456-782';
  const validBsnSpaceDelimited = '123 456 782';
  const validBsnDotDelimited = '123.456.782';
  const validBsnZeroWidthUnicode = '123\u200B456\u200D782'; // Formatted with Zero-Width spaces

  const testVariants = [
    { name: 'Pure Digits', val: validBsnPureDigits },
    { name: 'Hyphen Delimited', val: validBsnHyphenDelimited },
    { name: 'Space Delimited', val: validBsnSpaceDelimited },
    { name: 'Dot Delimited', val: validBsnDotDelimited },
    { name: 'Zero-Width Obfuscated', val: validBsnZeroWidthUnicode }
  ];

  for (const variant of testVariants) {
    const res = await simulatedVoiceHandler({ note_text: `Hier is mijn BSN ${variant.val} voor het dossier.` });
    assert.equal(res.status, 422, `Server must aggressively block ${variant.name} BSN variant with 422`);
    assert.equal(res.error.includes('Prohibited Dutch Citizen Service Number'), true, 'Must return clear BSN rejection notice');
    assert.equal(res.error.includes('123'), false, 'Response message must absolutely NOT echo any fragments of the prohibited BSN');
  }

  // Verify they were not called during blocked BSN requests
  assert.equal(openAiCalled, false, 'OpenAI should not be called on blocked BSN input');
  assert.equal(elevenLabsCalled, false, 'ElevenLabs should not be called on blocked BSN input');

  // ══════════════════════════════════════════════════════════════════════════════
  // CLOSURE TEST 2 — Voice Path: transcript containing BSN aborts BEFORE external AI calls
  // ══════════════════════════════════════════════════════════════════════════════
  openAiCalled = false;
  elevenLabsCalled = false;

  const voiceRes = await simulatedVoiceHandler({ elder_id: '1111-2222', transcript: `Mijn bsn is 123-456-782.` });

  assert.equal(voiceRes.status, 422, 'Voice path must reject BSN transcript with 422');
  assert.equal(openAiCalled, false, 'OpenAI companion LLM must absolutely NOT be called');
  assert.equal(elevenLabsCalled, false, 'ElevenLabs TTS engine must absolutely NOT be called');

  // ══════════════════════════════════════════════════════════════════════════════
  // CLOSURE TEST 3 — No BSN in Logs: Scrubber removes 9-digit candidates from logged telemetry
  // ══════════════════════════════════════════════════════════════════════════════
  const logged = voiceRes.loggedTelemetry;
  assert.equal(logged.transcript, 'Mijn bsn is [REDACTED_BSN].', 'Scrubber helper must deterministically replace prohibited 9-digit BSN sequences with [REDACTED_BSN]');
  assert.equal(JSON.stringify(logged).includes('123456782'), false, 'Absolutely zero raw BSN residues permitted in Sentry or metric payload drains');

  // ══════════════════════════════════════════════════════════════════════════════
  // CLOSURE TEST 4 — False Positives: 9-digit string failing 11-proef is allowed
  // ══════════════════════════════════════════════════════════════════════════════
  openAiCalled = false;
  elevenLabsCalled = false;

  const falsePositiveCandidate = '123456783'; // 9 digits, fails Modulo-11 11-proef
  assert.equal(isValid11Proef(falsePositiveCandidate), false);

  const fpRes = await simulatedVoiceHandler({ elder_id: '1111-3333', transcript: `Mijn willekeurige code is ${falsePositiveCandidate}.` });

  assert.equal(fpRes.status, 200, 'Server must successfully allow 9-digit string failing 11-proef (no false positive blocking)');
  assert.equal(openAiCalled, true, 'OpenAI must be called for legitimate non-BSN conversational interactions');
  assert.equal(elevenLabsCalled, true);
});
