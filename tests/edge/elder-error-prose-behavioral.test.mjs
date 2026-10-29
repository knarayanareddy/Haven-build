// Behavioural tests for the elder-facing error copy.
//
// What this file replaced
// ───────────────────────
// `p2-conversational-error-mapper-closure` and `p2-haven-client-error-mapper-closure`
// asserted that `errorMapper.ts` contained the strings '504' and
// 'veilig lokaal bewaard'. The second half of that was satisfied by a comment
// (`// Canonical fallback strings: 'veilig lokaal bewaard' …`) — the actual Dutch
// sentence lives in `packages/i18n/locales/nl-NL.json`. The comment is deleted and
// this file executes the mapper instead: it transpiles the real module, wires it to
// the real translation bundle, and asserts the sentence an older adult actually sees.
//
// Run with: `node --test tests/edge/elder-error-prose-behavioral.test.mjs`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFile } from './support/ast-model.mjs';
import { transpileModuleFile } from './support/shared-loader.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MAPPER = join(ROOT, 'apps/elder/src/services/errorMapper.ts');

const bundles = {
  'nl-NL': JSON.parse(readFileSync(join(ROOT, 'packages/i18n/locales/nl-NL.json'), 'utf8')),
  'en-GB': JSON.parse(readFileSync(join(ROOT, 'packages/i18n/locales/en-GB.json'), 'utf8')),
};

/**
 * The mapper imports `translate` from the workspace package. Rather than shipping a
 * fake, the stub resolves keys against the real locale JSON files, so a missing or
 * reworded key fails the test exactly as it would fail in the app.
 */
async function loadMapper() {
  const outDir = mkdtempSync(join(tmpdir(), 'haven-i18n-'));
  const stub = join(outDir, 'i18n-stub.mjs');
  writeFileSync(stub, `
const bundles = ${JSON.stringify(bundles)};
export function translate(key, locale = 'nl-NL') {
  const bundle = bundles[locale] ?? bundles['nl-NL'];
  const value = bundle[key];
  if (value === undefined) throw new Error('missing i18n key: ' + key + ' (' + locale + ')');
  return value;
}
`);
  const path = await transpileModuleFile(MAPPER, { outDir });
  const rewritten = readFileSync(path, 'utf8').replace(/from\s+['"]@haven\/i18n['"]/g, "from './i18n-stub.mjs'");
  writeFileSync(path, rewritten);
  return import(`${path}?v=${Math.random()}`);
}

const { translateElderError } = await loadMapper();

const cases = [
  ['504 gateway timeout', /veilig lokaal bewaard/, 'reassures the elder that nothing was lost'],
  ['Failed to fetch', /veilig lokaal bewaard/, 'offline reads as a slow connection, not an error'],
  ['429 Too Many Requests', /automatisch opnieuw/, 'a rate limit is explained without the words "rate limit"'],
  ['403 Forbidden', /specifieke actie/, 'a permission problem names the action, not the status'],
  ['409 conflict', /./, 'a duplicate submission gets its own message'],
  ['Prohibited Dutch Citizen Service Number (BSN) detected', /./, 'a BSN rejection is explained'],
  ['something entirely unexpected', /./, 'anything unknown still gets a human sentence'],
];

for (const [input, pattern, why] of cases) {
  test(`"${input}" maps to Dutch copy — ${why}`, () => {
    const message = translateElderError(new Error(input));
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 20, `too short to be prose: ${message}`);
    assert.match(message, pattern);
  });
}

test('the elder never sees a raw status code or an English technical phrase', () => {
  for (const [input] of cases) {
    const message = translateElderError(new Error(input));
    assert.doesNotMatch(message, /\b(4\d\d|5\d\d)\b/, `status code leaked for "${input}": ${message}`);
    assert.doesNotMatch(message, /\b(timeout|forbidden|unauthorized|rate limit|fetch|conflict|undefined|null)\b/i,
      `technical wording leaked for "${input}": ${message}`);
  }
});

test('the mapper accepts a string as well as an Error', () => {
  assert.equal(translateElderError('504 timeout'), translateElderError(new Error('504 timeout')));
});

test('English users get English copy, not Dutch', () => {
  const dutch = translateElderError(new Error('504 timeout'), 'nl-NL');
  const english = translateElderError(new Error('504 timeout'), 'en-GB');
  assert.notEqual(dutch, english);
  assert.match(english, /[a-z]/);
  assert.doesNotMatch(english, /uw gegevens blijven veilig/i, 'English locale must not fall back to Dutch text');
});

test('every mapped key exists in both bundles', () => {
  for (const input of ['504', '429', '403', '409', 'bsn', 'unknown']) {
    assert.doesNotThrow(() => translateElderError(new Error(input), 'nl-NL'));
    assert.doesNotThrow(() => translateElderError(new Error(input), 'en-GB'));
  }
});

test('the client and the action hook route errors through the mapper', () => {
  // Structural, but it is the wiring claim the old suites were making: if these
  // call sites disappear, users get raw Supabase messages again.
  for (const rel of ['apps/elder/src/services/havenClient.ts', 'apps/elder/src/hooks/useHavenActions.ts']) {
    const model = parseFile(join(ROOT, rel));
    assert.ok(model.imports.some((imp) => imp.names.includes('translateElderError') || imp.defaultName === 'translateElderError'),
      `${rel} must import translateElderError`);
    assert.ok(model.called('translateElderError'), `${rel} must call translateElderError`);
  }
});
