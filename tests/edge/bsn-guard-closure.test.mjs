// Behavioural tests for the server-side BSN guard.
//
// What this file replaced
// ───────────────────────
// The previous version of this file pasted `isValid11Proef`, `containsBsn`,
// `scrubBsnFromLogs` and `assertNoBsnInPayload` into the test as local functions,
// built a fake "simulatedVoiceHandler" on top of those copies, and asserted the
// copies worked. `supabase/functions/_shared/bsn_guard.ts` was never imported. The
// suite therefore stayed green if the real guard was broken, weakened, or deleted —
// for the one control that stops Dutch citizen service numbers (BSN) reaching an
// LLM, a TTS vendor or an audit log.
//
// These tests import the real module and call it.
//
// Run with: `node tests/edge/bsn-guard-closure.test.mjs`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { transpileModuleFile } from './support/shared-loader.mjs';

const MODULE = new URL('../../supabase/functions/_shared/bsn_guard.ts', import.meta.url);

// bsn_guard.ts imports nothing, so it transpiles without a Deno shim or a client.
const guard = await import(await transpileModuleFile(MODULE));

/** A number that satisfies the Dutch 11-proef. */
const VALID_BSN = '123456782';

const FORMATTED = [
  ['plain digits', '123456782'],
  ['hyphens', '123-456-782'],
  ['spaces', '123 456 782'],
  ['dots', '123.456.782'],
  ['zero-width characters', '123\u200B456\u200D782'],
  ['byte-order mark', '123\uFEFF456\uFEFF782'],
];

test('the 11-proef accepts a valid BSN and rejects an invalid one', () => {
  assert.equal(guard.isValid11Proef(VALID_BSN), true);
  assert.equal(guard.isValid11Proef('123456783'), false, 'fails modulo 11');
  assert.equal(guard.isValid11Proef('12345678'), false, 'too short');
  assert.equal(guard.isValid11Proef('1234567820'), false, 'too long');
  assert.equal(guard.isValid11Proef('12345678a'), false, 'not numeric');
});

for (const [label, value] of FORMATTED) {
  test(`a BSN written with ${label} is detected`, () => {
    assert.equal(guard.containsBsn(`Hier is mijn BSN ${value} voor het dossier.`), true);
  });

  test(`a BSN written with ${label} is rejected with 422 before anything else runs`, () => {
    const error = (() => {
      try {
        guard.assertNoBsnInPayload({ note_text: `Hier is mijn BSN ${value} voor het dossier.` });
        return null;
      } catch (err) {
        return err;
      }
    })();

    assert.ok(error, 'the guard must throw');
    assert.equal(error.status, 422);
    assert.equal(error.isBsnViolation, true);
    assert.equal(error.code, 'UNPROCESSABLE_ENTITY');
    assert.match(error.message, /Prohibited Dutch Citizen Service Number/);
    // The rejection must not hand the BSN back to whoever sent it.
    for (const digits of ['123', '456', '782', VALID_BSN]) {
      assert.equal(error.message.includes(digits), false, `the message must not echo "${digits}"`);
    }
  });
}

test('a 9-digit number that fails the 11-proef is allowed', () => {
  assert.equal(guard.containsBsn('Mijn willekeurige code is 123456783.'), false);
  assert.doesNotThrow(() => guard.assertNoBsnInPayload({ transcript: 'Mijn willekeurige code is 123456783.' }));
});

test('a BSN embedded in a longer digit run is still found', () => {
  // Sliding window: the guard must not only look at whole fields.
  assert.equal(guard.containsBsn(`ref 991${VALID_BSN}887`), true);
});

test('a BSN nested inside an object is rejected', () => {
  assert.throws(
    () => guard.assertNoBsnInPayload({ elder: { note: { body: `bsn ${VALID_BSN}` } } }),
    (err) => err.status === 422,
  );
});

test('short or empty input is not mistaken for a BSN', () => {
  for (const value of ['', null, undefined, '12345678', 'geen nummer hier']) {
    assert.equal(guard.containsBsn(value), false, `must not flag ${String(value)}`);
  }
});

test('the scrubber redacts a BSN in strings, arrays and nested objects', () => {
  const scrubbed = guard.scrubBsnFromLogs({
    transcript: `Mijn bsn is ${VALID_BSN}.`,
    formatted: 'bsn 123-456-782',
    list: [`weer ${VALID_BSN}`, 'niets hier'],
    safe_number: '123456783',
    count: 7,
    nothing: null,
  });

  assert.equal(scrubbed.transcript, 'Mijn bsn is [REDACTED_BSN].');
  assert.equal(scrubbed.formatted, 'bsn [REDACTED_BSN]');
  assert.equal(scrubbed.list[0], 'weer [REDACTED_BSN]');
  assert.equal(scrubbed.list[1], 'niets hier');
  assert.equal(scrubbed.safe_number, '123456783', 'a number failing the 11-proef is left alone');
  assert.equal(scrubbed.count, 7);
  assert.equal(scrubbed.nothing, null);
  assert.equal(JSON.stringify(scrubbed).includes(VALID_BSN), false, 'no raw BSN may survive');
});

test('the scrubber is applied to the whole payload, not just known fields', () => {
  const scrubbed = guard.scrubBsnFromLogs({ unexpected_field: { deep: `x ${VALID_BSN} y` } });
  assert.equal(scrubbed.unexpected_field.deep, 'x [REDACTED_BSN] y');
});

test('the guard lives in _shared so every function shares one rule set', async () => {
  const { readFileSync } = await import('node:fs');
  // The point of this test is not the import statement, it is that no function
  // carries a private copy of the rule: a divergent copy is how the earlier test
  // suite stayed green while the production guard could drift.
  const callers = [
    'supabase/functions/fn-voice-pipeline/index.ts',
    'supabase/functions/fn-document-analyse/index.ts',
    'supabase/functions/fn-carer-handover-note/index.ts',
  ];
  for (const caller of callers) {
    const source = readFileSync(new URL(`../../${caller}`, import.meta.url), 'utf8');
    assert.match(source, /from ["']\.\.\/_shared\/bsn_guard\.ts["']/, `${caller} must import the shared guard`);
    assert.equal(/function\s+isValid11Proef/.test(source), false, `${caller} must not define its own 11-proef`);
  }
});
