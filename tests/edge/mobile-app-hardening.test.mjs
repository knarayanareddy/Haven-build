// The ten blockers from PR #3, driven rather than described.
//
// PR #3 (devin/1782682103-fix-blockers-owasp) could never be merged: it branched from an
// unrelated root, so git has no merge base and no rebase exists. Its changes were ported by
// hand instead — each one re-checked against this tree, two of them rejected, and the rest
// given a test so they cannot silently regress.
//
// What this file covers:
//   * parseStoredSession — corrupted keychain data must not crash the app (it used to);
//   * the three ErrorBoundary copies — they must actually catch and render recovery UI;
//   * the Android back guard — press consumes, pops, or stays put, never closes the app;
//   * computeColors — high contrast must be real contrast, not a slightly darker grey.
//
// Rejected from PR #3, with the reason recorded in docs §15: its ScreenRenderer "fix" wrote
// the useMemo result back into the same module-level `let` (the race it claimed to fix), and
// its carer navigation rewrite replaced react-native-screens — which is installed and correct —
// with hand-rolled state navigation, losing transitions, the back gesture and deep links for a
// crash nobody has reproduced.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { loadAppModule } from './support/edge-function-harness.mjs';

// ─── the session in the keychain ─────────────────────────────────────────────

const { parseStoredSession } = await loadAppModule('packages/contracts/src/session.ts');

const VALID = JSON.stringify({
  access_token: 'header.payload.signature',
  refresh_token: 'refresh-value',
  expires_at: 1_800_000_000,
  user: { id: '11111111-1111-4111-8111-111111111111' },
});

test('a well-formed session is returned intact', () => {
  const parsed = parseStoredSession(VALID);
  assert.ok(parsed);
  assert.equal(parsed.access_token, 'header.payload.signature');
  assert.equal(parsed.refresh_token, 'refresh-value');
  assert.equal(parsed.expires_at, 1_800_000_000);
  assert.equal(parsed.user?.id, '11111111-1111-4111-8111-111111111111');
});

test('corrupted keychain data returns null instead of throwing', () => {
  // This is the crash: JSON.parse inside a .then() during app start, which React cannot catch
  // and which left the app on a blank screen with no way to reach the sign-in form.
  const corrupted = [
    '{"access_token": "abc", "refresh_token":',   // truncated write
    'not json at all',
    '{"access_token": "abc",}',                    // trailing comma
    '\u0000\u0001binary',                          // restored from a different keychain
  ];
  for (const raw of corrupted) {
    assert.equal(parseStoredSession(raw), null, `${JSON.stringify(raw)} must not throw`);
  }
});

test('JSON of the wrong shape is rejected, not cast', () => {
  for (const raw of ['null', '{}', '[]', '"string"', '42', 'true',
    '{"access_token": "abc"}',                      // no refresh token: setSession would fail
    '{"refresh_token": "abc"}',                      // no access token
    '{"access_token": "", "refresh_token": "abc"}',  // empty token
    '{"access_token": "   ", "refresh_token": "abc"}',
    '{"access_token": "abc", "refresh_token": "def", "user": "not-an-object"}']) {
    assert.equal(parseStoredSession(raw), null, `${raw} must be rejected`);
  }
});

test('nothing at all, and a non-string, are not sessions', () => {
  for (const raw of [null, undefined, '']) {
    assert.equal(parseStoredSession(raw), null);
  }
});

// ─── the error boundary ──────────────────────────────────────────────────────
//
// Three apps each carry their own copy (apps are separate bundles). The copies are identical,
// so the same driving code runs against all three and a divergence fails here.

// The transpiled module lands in /tmp, where React does not resolve. Point at the copy the
// apps actually render with: the boundary extends React.Component, so it must be the real one.
const REACT_ENTRY = pathToFileURL(
  createRequire(import.meta.url).resolve('react', { paths: [`${new URL('../..', import.meta.url).pathname}apps/elder`] }),
).href;

const REACT_STUBS = {
  'react/jsx-runtime': `
    export const Fragment = Symbol.for('react.fragment');
    export const jsx = (type, props) => ({ type, props });
    export const jsxs = jsx;
    export const jsxDEV = jsx;
  `,
  react: `
    export * from '${REACT_ENTRY}';
    import * as React from '${REACT_ENTRY}';
    export default React;
  `,
};

const BOUNDARY_STUBS = {
  ...REACT_STUBS,
  'react-native': `
    export const View = 'View';
    export const Text = 'Text';
    export const TouchableOpacity = 'TouchableOpacity';
  `,
  '@haven/ui/src/tokens': `
    export const colors = new Proxy({}, { get: (_t, key) => String(key) });
    export const touch = { minimum: 72, button: 80 };
  `,
};

/** Collects every element in a tree produced by the stubbed jsx runtime. */
function elements(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const child of node) elements(child, found);
    return found;
  }
  if (node.type) found.push(node);
  if (node.props) elements(node.props.children, found);
  return found;
}

for (const app of ['elder', 'carer', 'grandchild']) {
  test(`${app}: a render crash renders a way out instead of a blank screen`, async () => {
    const module = await loadAppModule(`apps/${app}/src/components/ErrorBoundary.tsx`, { stubs: BOUNDARY_STUBS });
    const Boundary = module.ErrorBoundary;

    // The state transition React performs when a descendant throws.
    const next = Boundary.getDerivedStateFromError(new Error('boom'));
    assert.deepEqual(next, { hasError: true });

    const instance = new Boundary({ children: 'the app' });
    instance.state = { hasError: false };
    assert.equal(instance.render(), 'the app', 'a healthy tree is passed through untouched');

    instance.state = { hasError: true };
    const tree = instance.render();
    const nodes = elements(tree);

    const texts = nodes.filter((node) => node.type === 'Text').map((node) => node.props.children).flat().filter(Boolean);
    assert.ok(texts.some((text) => /Er ging iets mis/.test(String(text))), 'the person must be told what happened');
    assert.ok(texts.some((text) => /data is safe/i.test(String(text))),
      'and reassured, because a blank screen reads as "I have lost everything"');

    const retry = nodes.find((node) => node.props?.accessibilityRole === 'button');
    assert.ok(retry, 'there must be a control to try again');
    assert.ok(String(retry.props.accessibilityLabel).length > 0, 'it must be labelled for a screen reader');
    assert.ok(retry.props.style.minHeight >= 72 && retry.props.style.minWidth >= 72,
      'and be large enough for a shaking hand');
  });

  test(`${app}: the boundary logs the error name, never its message`, () => {
    // A message can carry whatever was being rendered — a name, a note, a phone number.
    const source = readFileSync(
      new URL(`../../apps/${app}/src/components/ErrorBoundary.tsx`, import.meta.url), 'utf8');
    const logLine = source.split('\n').find((line) => line.includes('console.error'));
    assert.ok(logLine, 'a crash must be logged');
    assert.ok(logLine.includes('error?.name'), 'the name is the diagnostic part');
    assert.equal(/error\?\.message|\.message\b/.test(logLine), false,
      `the message must not be logged: ${logLine.trim()}`);
  });
}

test('the three boundary copies are byte-identical, so a fix cannot land in one app only', () => {
  const read = (app) => readFileSync(new URL(`../../apps/${app}/src/components/ErrorBoundary.tsx`, import.meta.url), 'utf8');
  assert.equal(read('elder'), read('carer'));
  assert.equal(read('elder'), read('grandchild'));
});

// ─── the Android hardware back button ────────────────────────────────────────

const { attachBackGuard } = await loadAppModule('apps/elder/src/navigation/backGuard.ts');

function fakeBackHandler() {
  let handler = null;
  let removed = 0;
  return {
    addEventListener(_event, fn) {
      handler = fn;
      return { remove: () => { removed += 1; handler = null; } };
    },
    press: () => (handler ? handler() : undefined),
    get removed() { return removed; },
    get registered() { return handler !== null; },
  };
}

test('back pops the stack when there is somewhere to go', () => {
  const back = fakeBackHandler();
  let popped = 0;
  const detach = attachBackGuard(back, { canGoBack: () => true, goBack: () => { popped += 1; } });

  const consumed = back.press();
  assert.equal(popped, 1);
  assert.equal(consumed, true, 'the press must be consumed, or Android also closes the app');
  detach();
});

test('back on the root screen stays put instead of exiting HAVEN', () => {
  // The reflexive gesture for this audience. Exiting mid-recording or mid-form loses work that
  // cannot be recovered, so the guard swallows the press.
  const back = fakeBackHandler();
  let popped = 0;
  let consumedElsewhere = 0;
  const detach = attachBackGuard(
    back,
    { canGoBack: () => false, goBack: () => { popped += 1; } },
    () => { consumedElsewhere += 1; },
  );

  assert.equal(back.press(), true);
  assert.equal(popped, 0, 'there was nowhere to go');
  assert.equal(consumedElsewhere, 1, 'the caller is told the press was swallowed');
  detach();
});

test('detaching removes the listener, so an unmounted navigator cannot intercept back', () => {
  const back = fakeBackHandler();
  const detach = attachBackGuard(back, { canGoBack: () => true, goBack: () => {} });
  assert.equal(back.registered, true);

  detach();
  assert.equal(back.removed, 1);
  assert.equal(back.registered, false);
  assert.equal(back.press(), undefined, 'nothing may answer after detaching');
});

// ─── high contrast ───────────────────────────────────────────────────────────

const screen = await loadAppModule('apps/elder/src/renderer/ScreenRenderer.tsx', {
  stubs: {
    ...REACT_STUBS,
    'react-native': `export const ScrollView='ScrollView'; export const Text='Text'; export const TouchableOpacity='TouchableOpacity'; export const View='View';`,
    'expo-haptics': `export const impactAsync = async () => {}; export const ImpactFeedbackStyle = { Medium: 'medium' }; export const selectionAsync = async () => {};`,
    '@haven/schema/src/screenSchema': `export const productionScreens = []; export class ScreenSchema {}`,
    '@haven/ui/src/tokens': `
      export const colors = { linen:'#F5F3EE', paper:'#FFFFFF', ink:'#1A1F2E', graphite:'#3D4558',
        pewter:'#6B7490', mist:'#E8EBF2', sage:'#4A7B5A', sagePale:'#EBF4EE', amber:'#E8A030',
        amberPale:'#FDF3E0', rose:'#C94A4A', rosePale:'#FAE8E8', slate:'#2C3E6B',
        slatePale:'#E8EEF7', terracotta:'#C96B3A', terracottaPale:'#FAF0E8' };
      export const touch = { minimum: 72, button: 80 };
      export default { colors, touch };
    `,
    '@haven/contracts/src/haven': `export const locales = ['nl-NL','en-GB'];`,
    '@haven/i18n': `export const translate = (_l, key) => key; export const useTranslation = () => ({ t: (_l, key) => key });`,
    '../services/crisis': `export function detectCrisisPhrase() { return false; }`,
    '../services/notifications': `export function shouldSuppressForQuietHours() { return false; }`,
    '../components/FloatingVoiceButton': `export const FloatingVoiceButton = 'FloatingVoiceButton';`,
    '../components/HelpOverlay': `export const HelpOverlay = 'HelpOverlay';`,
  },
});

/** WCAG relative luminance and contrast ratio. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test('high contrast is actually high contrast, not a slightly darker grey', () => {
  const normal = screen.computeColors(false);
  const high = screen.computeColors(true);

  assert.equal(normal.ink, '#1A1F2E', 'the default palette is the shared one');
  for (const [text, background] of [
    ['ink', 'linen'], ['ink', 'paper'], ['graphite', 'paper'], ['slate', 'paper'],
    ['sage', 'paper'], ['rose', 'paper'], ['pewter', 'paper'],
  ]) {
    const ratio = contrast(high[text], high[background]);
    assert.ok(ratio >= 7, `high contrast ${text} on ${background} is ${ratio.toFixed(1)}:1, WCAG AAA needs 7`);
  }
});

test('the high-contrast palette is complete — no token is left at its normal value', () => {
  const normal = screen.computeColors(false);
  const high = screen.computeColors(true);
  for (const key of Object.keys(normal)) {
    if (normal[key] === high[key]) continue;
    assert.ok(['#000000', '#FFFFFF', '#DDDDDD', '#888888'].includes(high[key]),
      `${key} was only nudged to ${high[key]} rather than replaced`);
  }
  // Every colour a screen paints text or a surface with must have been considered.
  for (const key of ['linen', 'paper', 'ink', 'graphite', 'pewter', 'mist', 'sage', 'sagePale', 'slate', 'rose', 'amber']) {
    assert.notEqual(high[key], normal[key], `${key} is unchanged in high contrast`);
  }
});

test('the palette travels in the context instead of a module-level binding', async () => {
  // The regression this guards: a screen must draw with the palette it was given, even if a
  // different profile was rendered first. There is no module-level `colors` to leak through.
  const rendered = screen.__test__.renderFor('HOME', {
    locale: 'nl-NL', now: new Date('2026-10-30T09:00:00Z'),
    profile: { id: 'e1', preferredName: 'Mevrouw Jansen', locale: 'nl-NL', highContrast: false },
    family: [], medications: [], tasks: [], messages: [], scamEvents: [],
    buurt: { events: [] }, visits: [], onPrimaryAction: () => {},
    colors: screen.computeColors(true),
  });
  const texts = elements(rendered).map((node) => node.props?.style);
  const colours = texts.filter(Boolean).map((style) => style.color).filter(Boolean);
  assert.ok(colours.length > 0, 'the home screen must paint some text');
  assert.ok(colours.every((colour) => colour === '#FFFFFF' || colour === '#DDDDDD' || colour === '#000000'),
    `a high-contrast context must draw only high-contrast colours, saw ${[...new Set(colours)].join(', ')}`);
});
