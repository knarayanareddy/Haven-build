// Platform configuration and layout contract (Android, iPad, macOS, web/PWA).
//
// What this file replaced
// ───────────────────────
// Four `*-closure.test.mjs` suites that mixed two very different things:
//
//   1. real configuration assertions (parse app.json, assert `web.output`), which
//      are fine and are kept here;
//   2. `source.includes('width >= 768')` against components — assertions that were
//      satisfied by *comments*. In `ResponsiveDrawerTabNavigator.tsx` the number 768
//      appeared only in comments; the component actually reads `isIpad` from
//      `useResponsiveLayout()`. In `dozeGuard.ts` the test looked for
//      `IGNORE_BATTERY_OPTIMIZATIONS`, which appears only in a comment — the real
//      enum is `IGNORE_BATTERY_OPTIMIZATION_SETTINGS`. Both suites had been green
//      for months against strings that no code path executes.
//
// The layout decision is now a pure function (`resolveLayout` in
// `apps/carer/src/services/platform.ts`) and is executed here for real device
// sizes; component wiring is checked against the syntax tree rather than the text.
//
// Run with: `node --test tests/edge/platform-config-contract.test.mjs`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFile } from './support/ast-model.mjs';
import { transpileModuleFile } from './support/shared-loader.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

// The layout module imports react-native for the hook; transpiling it keeps the
// pure `resolveLayout` importable, and `TABLET_BREAKPOINT` carries the threshold.
const platform = await import(await transpileModuleFile(join(ROOT, 'apps/carer/src/services/layout.ts')));

// ─── Layout, executed ────────────────────────────────────────────────────────

test('the tablet breakpoint is 768pt', () => {
  assert.equal(platform.TABLET_BREAKPOINT, 768);
});

test('an iPhone stays on bottom tabs', () => {
  const layout = platform.resolveLayout(390, 844, 'ios');
  assert.equal(layout.isIpad, false);
  assert.equal(layout.isLandscape, false);
});

test('an iPad gets the sidebar, in either orientation', () => {
  for (const [w, h] of [[1024, 1366], [1366, 1024]]) {
    const layout = platform.resolveLayout(w, h, 'ios');
    assert.equal(layout.isIpad, true, `${w}x${h} must be treated as a tablet`);
  }
});

test('landscape is decided by width, not by device class', () => {
  assert.equal(platform.resolveLayout(1366, 1024, 'ios').isLandscape, true);
  assert.equal(platform.resolveLayout(1024, 1366, 'ios').isLandscape, false);
  assert.equal(platform.resolveLayout(844, 390, 'ios').isLandscape, true, 'a landscape phone is still landscape');
});

test('the drawer reads the shared hook instead of hard-coding a breakpoint', () => {
  const model = parseFile(join(ROOT, 'apps/carer/src/navigation/ResponsiveDrawerTabNavigator.tsx'));
  assert.ok(model.called('useResponsiveLayout'), 'the navigator must use the shared layout hook');
  assert.ok(model.code.includes('isIpad'), 'the navigator must branch on isIpad');
  // A literal breakpoint here would drift from the hook; there must be none.
  assert.equal(/\b768\b/.test(model.code), false, 'the breakpoint belongs in platform.ts, not in the navigator');
});

// ─── Component wiring ────────────────────────────────────────────────────────

test('iPad split view is limited to landscape shift summaries', () => {
  const model = parseFile(join(ROOT, 'apps/carer/src/screens/ShiftSummary.tsx'));
  assert.ok(model.code.includes('isIpad && isLandscape'), 'split view must require both tablet and landscape');
});

test('the carer app no longer mounts a voice button that records nothing', () => {
  // FloatingVoiceButton showed "HAVEN WACHT luistert…" for 60 seconds and recorded nothing:
  // no recorder, no upload, no transcript. It was mounted twice in ShiftSummary, so a carer
  // dictating a handover got a listening animation and lost the note. It is deleted, and this
  // guards against it (or a copy of its promise) coming back without a recorder behind it.
  assert.equal(
    existsSync(join(ROOT, 'apps/carer/src/components/FloatingVoiceButton.tsx')),
    false,
    'the render-only voice button must stay deleted',
  );
  const summary = readFileSync(join(ROOT, 'apps/carer/src/screens/ShiftSummary.tsx'), 'utf8');
  assert.equal(summary.includes('FloatingVoiceButton'), false, 'ShiftSummary must not mount it');
  assert.equal(/luistert/i.test(summary), false, 'no screen may claim to be listening with no recorder');
});

test('large accessibility text scales by 1.5', () => {
  const model = parseFile(join(ROOT, 'apps/carer/src/services/accessibility.ts'));
  assert.ok(model.code.includes('accessibility-large'), 'the large text level must be handled');
  assert.ok(/1\.5/.test(model.code), 'the large text level must apply a 1.5 multiplier');
});

// ─── Android ─────────────────────────────────────────────────────────────────

test('both apps respect Android safe areas', () => {
  for (const rel of ['apps/elder/App.tsx', 'apps/carer/App.tsx']) {
    const model = parseFile(join(ROOT, rel));
    assert.ok(model.imports.some((imp) => imp.from.includes('react-native-safe-area-context')), `${rel} must use the safe-area library`);
    assert.ok(model.code.includes('SafeAreaView'), `${rel} must render inside SafeAreaView`);
  }
  const elder = parseFile(join(ROOT, 'apps/elder/App.tsx'));
  assert.ok(elder.code.includes("Platform.OS === 'android'"), 'edge-to-edge insets are Android-specific');
});

test('Android keyboard layout and battery permissions are declared', () => {
  const android = json('apps/elder/app.json').expo.android;
  assert.equal(android.softwareKeyboardLayoutMode, 'resize', 'Expo maps this to adjustResize');
  assert.ok((android.permissions ?? []).includes('android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'),
    'the doze whitelist must be declared');
});

test('the doze guard requests the real Expo intent action', () => {
  const model = parseFile(join(ROOT, 'apps/elder/src/services/dozeGuard.ts'));
  // The previous test asserted `IGNORE_BATTERY_OPTIMIZATIONS`, which exists only in a
  // comment. The enum Expo actually exposes is IGNORE_BATTERY_OPTIMIZATION_SETTINGS.
  assert.ok(model.code.includes('IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'),
    'the guard must request the battery-optimisation exemption');
  assert.ok(model.callees().some((callee) => callee.includes('startLocationUpdatesAsync')),
    'fall detection needs a foreground location service');
  assert.ok(/Patiëntveiligheid/.test(read('apps/elder/src/services/dozeGuard.ts')),
    'the OEM prompt must state the patient-safety rationale');
});

test('the macOS Touch ID prompt is translated, not hard-coded', () => {
  const model = parseFile(join(ROOT, 'apps/carer/src/auth/AuthProvider.tsx'));
  const keys = model.calls.filter((call) => call.callee === 'translate').flatMap((call) => call.args);
  assert.ok(keys.some((arg) => arg.includes('auth.biometric.macos')), 'the macOS prompt must come from the bundle');

  const nl = json('packages/i18n/locales/nl-NL.json');
  assert.match(nl['auth.biometric.macos'], /HAVEN verificatie op Mac/);
});

test('the Android biometric prompt is branded and translated', () => {
  const model = parseFile(join(ROOT, 'apps/carer/src/auth/AuthProvider.tsx'));
  const keys = model.calls.filter((call) => call.callee === 'translate').flatMap((call) => call.args);
  assert.ok(keys.some((arg) => arg.includes('auth.biometric.android.prompt')), 'prompt title must be translated');
  assert.ok(keys.some((arg) => arg.includes('auth.biometric.android.subtitle')), 'prompt subtitle must be translated');

  const nl = json('packages/i18n/locales/nl-NL.json');
  assert.equal(nl['auth.biometric.android.prompt'], 'HAVEN Verificatie');
  assert.equal(nl['auth.biometric.android.subtitle'], 'Bevestig uw identiteit om door te gaan');
});

// ─── macOS / Mac Catalyst ────────────────────────────────────────────────────

test('the carer build keeps its iOS identity and does not set an unsupported mac key', () => {
  const carer = json('apps/carer/app.json').expo;
  assert.equal(carer.ios.supportsTablet, true);
  assert.equal(carer.ios.bundleIdentifier, 'nl.haven.carer');
  assert.equal(carer.mac, undefined, 'SDK 50 prebuild rejects a top-level mac config');
});

test('desktop haptics are a no-op rather than a crash', () => {
  const model = parseFile(join(ROOT, 'packages/shims/haptics.ts'));
  assert.ok(model.code.includes("Platform.OS === 'ios'"), 'the shim must branch on the platform');
});

test('desktop notifications, push-to-talk and the toolbar are wired', () => {
  const notifications = parseFile(join(ROOT, 'packages/shims/notifications.ts'));
  assert.ok(notifications.code.includes('window.Notification'), 'desktop alerts must use the Web Notification API');

  const voice = parseFile(join(ROOT, 'apps/elder/src/components/FloatingVoiceButton.tsx'));
  assert.ok(voice.code.includes('shiftKey'), 'push-to-talk needs a modifier check');
  assert.ok(/toLowerCase\(\)\s*===\s*'v'/.test(voice.code), 'push-to-talk must bind the V key');
  assert.ok(voice.hasProp('accessibilityRole', 'toolbar'), 'the desktop control must expose the toolbar role');
});

// ─── Web / PWA ───────────────────────────────────────────────────────────────

test('both apps export a static web build', () => {
  for (const rel of ['apps/elder/app.json', 'apps/carer/app.json']) {
    assert.equal(json(rel).expo.web?.output, 'static', `${rel} must build for web`);
  }
});

test('the PWA manifest is installable', () => {
  const manifest = json('apps/elder/public/manifest.json');
  assert.equal(manifest.display, 'standalone');
  assert.match(manifest.name, /HAVEN/);
});

test('the service worker caches offline and shows push notifications', () => {
  const model = parseFile(join(ROOT, 'apps/carer/public/service-worker.js'));
  assert.ok(model.code.includes('caches.match'), 'the worker must serve from cache when offline');
  assert.ok(model.code.includes('showNotification'), 'the worker must surface push notifications');
});

test('the install prompt and keyboard focus styles exist', () => {
  const html = read('apps/carer/public/index.html');
  assert.match(html, /beforeinstallprompt/, 'the page must capture the install event');
  assert.match(html, /deferredPrompt\.prompt\(\)/, 'the page must be able to trigger the install prompt');
  assert.match(html, /:focus\s*\{[^}]*outline/, 'focus must be visible for keyboard users');
});

test('web shims replace native modules instead of crashing', () => {
  const sqlite = parseFile(join(ROOT, 'packages/shims/sqlite.ts'));
  assert.ok(sqlite.code.includes("Platform.OS === 'ios'") || sqlite.code.includes('Platform.OS === "ios"'),
    'the SQLite shim must branch on platform');

  const secure = parseFile(join(ROOT, 'packages/shims/secureStore.ts'));
  assert.ok(secure.code.includes('sessionStorage'), 'web storage must fall back to sessionStorage');
});
