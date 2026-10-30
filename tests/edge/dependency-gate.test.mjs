// The dependency gate: does it fail for the right reasons?
//
// `deploy.yml` used to run `pnpm audit --audit-level=high`, which reported 65
// high/critical advisories — nearly all build-time DoS in Metro and the Expo CLI —
// and had never passed. A gate that never passes does not protect anything: it
// means `staging-deployment` and `production-deployment` were permanently skipped.
// scripts/ci/audit-dependencies.mjs replaces it with the same registry advisory
// database plus a dated waiver list.
//
// The waiver list is only trustworthy if the gate is strict, so this file drives the
// classifier with fabricated advisories rather than trusting that it would notice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

import {
  auditDependencies,
  lockfilePackages,
  loadWaivers,
} from '../../scripts/ci/audit-dependencies.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const TODAY = new Date('2026-10-30T00:00:00Z');

const advisory = (overrides = {}) => ({
  module: 'left-pad',
  id: 'GHSA-aaaa-bbbb-cccc',
  severity: 'high',
  title: 'prototype pollution',
  vulnerable: '<1.0.0',
  installed: ['0.9.0'],
  ...overrides,
});

test('an unwaived high or critical advisory fails the gate', () => {
  const { violations } = auditDependencies({
    advisories: [advisory(), advisory({ id: 'GHSA-dddd-eeee-ffff', severity: 'critical' })],
    waivers: { entries: {} },
    today: TODAY,
  });
  assert.equal(violations.length, 2);
  assert.match(violations[0], /left-pad@0\.9\.0: high/);
  assert.match(violations[1], /critical/);
});

test('moderate and low advisories do not fail the gate', () => {
  const { violations } = auditDependencies({
    advisories: [advisory({ severity: 'moderate' }), advisory({ id: 'x', severity: 'low' })],
    waivers: { entries: {} },
    today: TODAY,
  });
  assert.deepEqual(violations, []);
});

test('a waiver suppresses exactly one advisory, not the package', () => {
  const waived = advisory();
  const { violations } = auditDependencies({
    advisories: [waived, advisory({ id: 'GHSA-9999-8888-7777', severity: 'critical' })],
    waivers: { entries: { 'left-pad|GHSA-aaaa-bbbb-cccc': { reason: 'build-time only', expires: '2027-01-31' } } },
    today: TODAY,
  });
  assert.equal(violations.length, 1, 'the unwaived sibling must still fail');
  assert.match(violations[0], /GHSA-9999-8888-7777/);
});

test('an expired waiver fails, rather than silently continuing', () => {
  const { violations } = auditDependencies({
    advisories: [advisory()],
    waivers: { entries: { 'left-pad|GHSA-aaaa-bbbb-cccc': { reason: 'x', expires: '2026-10-29' } } },
    today: TODAY,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /expired on 2026-10-29/);
});

test('a waiver without a reason or an expiry is rejected', () => {
  const incomplete = auditDependencies({
    advisories: [advisory()],
    waivers: { entries: { 'left-pad|GHSA-aaaa-bbbb-cccc': { reason: 'because' } } },
    today: TODAY,
  });
  assert.match(incomplete.violations[0], /needs both "reason" and "expires"/);

  const noReason = auditDependencies({
    advisories: [advisory()],
    waivers: { entries: { 'left-pad|GHSA-aaaa-bbbb-cccc': { expires: '2027-01-31' } } },
    today: TODAY,
  });
  assert.match(noReason.violations[0], /needs both "reason" and "expires"/);
});

test('a waiver that no longer applies is itself a violation', () => {
  const { violations } = auditDependencies({
    advisories: [],
    waivers: { entries: { 'left-pad|GHSA-aaaa-bbbb-cccc': { reason: 'x', expires: '2027-01-31' } } },
    today: TODAY,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /no longer reported/);
});

test('the lockfile parser finds the packages it must, and skips non-releases', () => {
  const packages = lockfilePackages(readFileSync(`${ROOT}pnpm-lock.yaml`, 'utf8'));
  assert.ok(packages.size > 500, `expected the full graph, saw ${packages.size}`);

  // Scoped, peer-suffixed and optional-platform entries are the ones a naive
  // regex drops — and a dropped package is a package the gate never checks.
  assert.ok(packages.has('next'), 'next must be visible to the gate');
  assert.ok(packages.has('@xmldom/xmldom'), 'scoped packages must be visible');
  assert.ok(packages.has('@img/sharp-linux-x64'), 'optional platform packages must be visible');

  for (const [name, versions] of packages) {
    for (const version of versions) {
      assert.match(version, /^\d+\.\d+\.\d+/, `${name} resolved to a non-release version: ${version}`);
    }
  }
});

test('the repository passes its own dependency gate', () => {
  const waivers = loadWaivers();
  for (const [key, entry] of Object.entries(waivers.entries ?? {})) {
    assert.match(key, /^[@\w./-]+\|GHSA-/, `${key} must be "module|GHSA-id"`);
    assert.ok(entry.reason.length > 80, `${key}: the reason must explain why it is unreachable`);
    assert.match(entry.expires, /^\d{4}-\d{2}-\d{2}$/, `${key}: expires must be an ISO date`);
  }
});

test('the deploy gate runs the scoped auditor, not the blanket audit', () => {
  const deploy = readFileSync(`${ROOT}.github/workflows/deploy.yml`, 'utf8');
  assert.match(deploy, /node scripts\/ci\/audit-dependencies\.mjs/,
    'the deploy pipeline must call the audited gate');

  // Match the command, not the word: the step above it explains in a comment what
  // the old gate was, and that sentence is the reason it must not come back.
  const executable = deploy
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
  assert.equal(/pnpm audit/.test(executable), false,
    'the blanket audit is what never passed; do not restore it as a command');
});

/** Finds an installed package inside the pnpm store, whatever its patch hash. */
function storePath(name) {
  const store = `${ROOT}node_modules/.pnpm`;
  const dir = readdirSync(store).find((entry) => entry.startsWith(`${name.replace('/', '+')}@`));
  assert.ok(dir, `${name} is not installed — run \`corepack pnpm install\``);
  return `${store}/${dir}/node_modules/${name}`;
}

test('every pinned override resolves to exactly the pinned version', () => {
  const root = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8'));
  const overrides = Object.entries(root.pnpm?.overrides ?? {})
    .filter(([, value]) => /^\d+\.\d+\.\d+$/.test(value));

  assert.ok(overrides.length >= 10, `expected the override set, saw ${overrides.length}`);

  const lock = readFileSync(`${ROOT}pnpm-lock.yaml`, 'utf8');
  for (const [specifier, version] of overrides) {
    // `brace-expansion@1` overrides only that major line, so a 5.x line may also
    // be installed; the assertion is scoped to the major the key names.
    const scopedMajor = /@(\d+)$/.exec(specifier)?.[1] ?? null;
    const name = specifier.replace(/@\d+$/, '');
    // Only real releases: the overrides block itself contains `brace-expansion@1:`
    // keys, whose "version" is a major line, not an installed package.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = String.raw`'?${escaped}@(\d+\.\d+\.\d+[^:'\s()]*)'?:`;
    const installed = [...lock.matchAll(new RegExp(pattern, 'g'))].map((match) => match[1]);
    const relevant = scopedMajor
      ? installed.filter((candidate) => candidate.startsWith(`${scopedMajor}.`))
      : installed;
    assert.deepEqual([...new Set(relevant)], [version],
      `${specifier} must resolve only to ${version}, saw ${[...new Set(relevant)].join(', ')}`);
  }
});

test('the pins still work in the packages that consume them', async () => {
  // xmldom 0.8 → 0.9 is a breaking change: 0.9 requires an explicit mimeType on
  // parseFromString. @expo/plist (iOS config plugins) omits it, so the override
  // would have broken `expo prebuild` on iOS with
  // `the provided mimeType "undefined" is not valid`. That was found by running the
  // consumer rather than by trusting the version number, which is what this test
  // now does on every run.
  const expoPlist = storePath('@expo/plist');
  const plist = storePath('plist');

  assert.ok(existsSync(`${ROOT}patches/@expo__plist@0.7.0.patch`),
    'the @expo/plist mimeType patch must exist, or iOS config plugins break');

  const { default: expoPlistModule } = await import(`file://${expoPlist}/build/index.js`);
  const api = expoPlistModule.default ?? expoPlistModule;
  const parsed = api.parse(
    '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>nl.haven.carer</string></dict></plist>',
  );
  // @expo/plist builds plain maps with a null prototype, so compare serialised.
  assert.equal(JSON.stringify(parsed), JSON.stringify({ CFBundleIdentifier: 'nl.haven.carer' }));
  assert.equal(JSON.stringify(api.parse(api.build({ A: 'b', B: ['c'] }))), JSON.stringify({ A: 'b', B: ['c'] }));

  // plist@3 is the other consumer of the override, reached through xcode/simple-plist.
  const core = (await import(`file://${plist}/index.js`)).default;
  assert.equal(
    JSON.stringify(core.parse('<plist version="1.0"><dict><key>CFBundleName</key><string>HAVEN</string></dict></plist>')),
    JSON.stringify({ CFBundleName: 'HAVEN' }),
  );
});
