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

test('a BSN glued into a longer digit run is no longer claimed as a detection', () => {
  // This assertion used to be the opposite, and the change is deliberate.
  //
  // The windowed scan it required is what produced a real outage: any run of 15+ digits
  // contains a 9-window that satisfies the modulo-11 test about one time in eleven, and
  // `000000000` satisfies it outright. Carer handover notes were being rejected with 422
  // for a BSN nobody had sent, because an elder id ended in zeros. The guard now treats a
  // run of exactly nine digits as a BSN — which is how one arrives on the wire, with or
  // without separators — and declines to guess when a number is embedded in a longer
  // identifier, where the false-positive rate made the check unusable.
  assert.equal(guard.containsBsn(`ref 991${VALID_BSN}887`), false,
    'a 15-digit reference is ambiguous; rejecting every request that contains one is not acceptable');
  assert.equal(guard.containsBsn(`mijn bsn is ${VALID_BSN}.`), true,
    'the same value on its own is still a BSN');
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

// ─── False positives: the guard must not reject ordinary requests ────────────
//
// The scanner used to slide a 9-character window across every position of the whole
// serialised request. Any run of 15+ digits therefore contained a sub-window that
// satisfied the modulo-11 test about one time in eleven, and `000000000` satisfies it
// outright — so a carer handover note was rejected with 422 because an elder id ended in
// zeros. These cases come from that incident.

test('a request whose ids contain long digit runs is not treated as a BSN', () => {
  const payload = {
    elder_id: 'eeee0000-0000-4000-8000-0000000000e1',
    appetite: 3,
    mood: 4,
    notes_nl: 'Mevrouw heeft slecht gegeten vandaag.',
    idempotency_key: 'c9946e8b-323b-4d57-a1c5-7bbaaf1b7b0b',
  };
  assert.doesNotThrow(() => guard.assertNoBsnInPayload(payload),
    'ordinary identifiers must not be mistaken for a citizen service number');
});

test('nine zeros are not a BSN', () => {
  assert.equal(guard.containsBsn('000000000'), false,
    'the modulo-11 sum is zero for nine zeros, but no BSN is 000000000');
});

test('a BSN adjacent to other digits is not claimed to be detected', () => {
  // Documented limitation rather than a silent guess: a 19-digit run is ambiguous, and
  // guessing at it rejected legitimate requests. Runs of exactly nine are the rule.
  assert.equal(guard.containsBsn('1234567890123456789'), false);
});

test('a BSN inside prose is still detected', () => {
  assert.equal(guard.containsBsn('mijn burgerservicenummer is 111 222 333, graag noteren'), true);
});
