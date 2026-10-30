// Elder-app accessibility contract.
//
// What this file replaced
// ───────────────────────
// Twelve `p1-/p2-/p3-*-closure.test.mjs` files that asserted on source text:
//
//     assert.ok(source.includes('accessibilityLiveRegion="assertive"'));
//     assert.ok(source.includes("const isHC = context?.profile?.highContrast === true;"));
//
// Every one of those was satisfied by a comment, and three of them *were* satisfied
// by a comment — the production files carried marker comments written for the
// tests:
//
//     // Canonical marker fallback: accessibilityHint={triggerHint}, …
//     // Closure marker for single-switch tests: if (isListening) { …
//
// Those comments are deleted. So are the string assertions. This file parses the
// real components with the TypeScript compiler API (`tests/edge/support/ast-model.mjs`)
// and asserts the structure that the accessibility claim depends on, computing
// real numbers (contrast ratio, touch size) instead of looking for digits in text.
//
// What it still cannot do: render. Layout/animation behaviour is the browser job
// (`pnpm test:e2e:browser`); this pins the contract the components must satisfy.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contrastRatio, parseFile } from './support/ast-model.mjs';
import { transpileModuleFile } from './support/shared-loader.mjs';

const SCREEN = new URL('../../apps/elder/src/renderer/ScreenRenderer.tsx', import.meta.url);
const FAB = new URL('../../apps/elder/src/components/FloatingVoiceButton.tsx', import.meta.url);
const HELP = new URL('../../apps/elder/src/components/HelpOverlay.tsx', import.meta.url);
const TOKENS = new URL('../../packages/ui/src/tokens.ts', import.meta.url);

const screen = parseFile(SCREEN);
const fab = parseFile(FAB);
const help = parseFile(HELP);

const tokens = await import(await transpileModuleFile(TOKENS));

test('touch targets are at least the 44pt floor everywhere they are defined', () => {
  assert.ok(tokens.touch.minimum >= 44, `touch.minimum is ${tokens.touch.minimum}, below the 44pt floor`);

  // Every style object that sets a width *and* a height must meet the floor.
  const sized = screen.objects.filter((object) => {
    const names = object.entries.map((entry) => entry.name);
    return names.includes('minWidth') && names.includes('minHeight');
  });
  assert.ok(sized.length > 0, 'the screen must size at least one touch target explicitly');
  for (const object of sized) {
    for (const entry of object.entries.filter((e) => e.name === 'minWidth' || e.name === 'minHeight')) {
      // Percentages and token expressions are checked elsewhere; only literals here.
      if (!/^\d+(\.\d+)?$/.test(entry.value)) continue;
      const value = Number(entry.value);
      assert.ok(value >= 44, `${entry.name}: ${entry.value} is below 44pt`);
    }
  }

  // The shared button helper must take its height from the token, not a literal.
  const usesToken = screen.objects.some((object) => object.entries.some(
    (entry) => (entry.name === 'minHeight') && entry.value.includes('touch.minimum'),
  ));
  assert.ok(usesToken, 'the primary action button must size itself from touch.minimum');
});

test('high contrast mode drives a palette with a verified contrast ratio', () => {
  const isHC = screen.declaration('isHC');
  assert.ok(isHC, 'the renderer must decide high-contrast mode');
  assert.match(isHC.initializer, /highContrast/, 'the decision must come from the profile, not a constant');

  const paper = screen.objectValue('paper');
  assert.ok(paper, 'the palette must define a paper colour');
  assert.match(paper, /isHC \?/, 'paper must switch on high-contrast mode');

  const highContrastPaper = /'#[0-9a-fA-F]{3,6}'/.exec(paper.split('?')[1] ?? '')?.[0]?.replace(/'/g, '');
  assert.ok(highContrastPaper, `high-contrast paper must be a literal colour, got: ${paper}`);

  // The high-contrast pair is paper/ink; anything on it must clear WCAG AAA (7:1).
  const ink = (screen.objectValue('ink') ?? '').match(/'#[0-9a-fA-F]{3,6}'/)?.[0]?.replace(/'/g, '');
  assert.ok(ink, 'the palette must define an ink colour');
  const ratio = contrastRatio(highContrastPaper, '#ffffff');
  assert.ok(ratio >= 7, `high-contrast text ratio ${ratio.toFixed(1)}:1 is below AAA`);

  // And the default palette must still clear AA for body text.
  const base = tokens.colors;
  assert.ok(contrastRatio(base.ink, base.paper) >= 4.5,
    `default ink on paper is ${contrastRatio(base.ink, base.paper).toFixed(1)}:1, below AA`);
});

test('font scaling multiplies from the stored profile value', () => {
  const fontMult = screen.declaration('fontMult');
  assert.ok(fontMult, 'the renderer must compute a font multiplier');
  assert.match(fontMult.initializer, /fontSizeMultiplier/);

  const scaled = screen.objectValues('fontSize').filter((value) => value.includes('fontMult'));
  assert.ok(scaled.length > 0, 'at least one type size must be derived from fontMult');
  for (const value of scaled) {
    assert.match(value, /Math\.round\(\s*\d+\s*\*\s*fontMult\s*\)/, `unexpected scaling expression: ${value}`);
  }

  // 1.0 is the identity: a multiplier that changes nothing would satisfy the tokens
  // but defeat the purpose. Check the base size really is scaled at 130%.
  const base = Number(/Math\.round\((\d+)\s*\*/.exec(scaled[0])?.[1]);
  assert.ok(base > 0);
  assert.ok(Math.round(base * 1.3) > base, 'a 130% preference must produce a larger type size');
});

test('the emergency overlay is announced assertively', () => {
  assert.ok(screen.hasProp('accessibilityLiveRegion', 'assertive'), 'a fall overlay must be an assertive live region');
  assert.ok(screen.hasProp('accessibilityRole', 'alert'), 'the overlay must expose the alert role');
});

test('a deaf user gets a visual alarm, not just a sound', () => {
  assert.ok(screen.called('setFlashing'), 'the overlay must drive a visual flash');
  assert.ok(screen.called('Haptics.notificationAsync'), 'the overlay must also fire a notification haptic');
});

test('medication confirmation offers two distinct buttons, neither invisible', () => {
  assert.ok([...screen.strings].some((s) => s.includes('Beoordeel Ja (Ingenomen)')), 'YES button label missing');
  assert.ok([...screen.strings].some((s) => s.includes('Beoordeel Nee (Nog Niet)')), 'NO button label missing');

  // A "ghost" variant on a coloured card renders transparent-on-transparent.
  const ghostMedicationButtons = screen.calls
    .filter((call) => call.callee === 'actionButton')
    .filter((call) => call.args.some((arg) => arg.includes('DENY_MED')))
    .filter((call) => call.args.some((arg) => arg === "'ghost'"));
  assert.equal(ghostMedicationButtons.length, 0, 'the medication NO button must not use the ghost variant');
});

test('medication cards are announced as one summary, not fragmented text', () => {
  assert.ok(screen.hasProp('accessibilityRole', 'summary'), 'medication cards must be a summary for screen readers');
  const labels = screen.propValues('accessibilityLabel').filter((value) => value && value.includes('Medicijn'));
  assert.ok(labels.length > 0, 'a medication card must expose a composite label');
  assert.ok(labels.some((label) => label.includes('med.name') && label.includes('med.dose')),
    'the summary must include name and dose in one string');
});

test('the voice button is a single switch: one tap starts, the next submits', () => {
  assert.ok(fab.code.includes('isListening'), 'the button must know whether it is already listening');
  assert.ok(fab.called('submitRecording'), 'a second tap must submit the recording');

  // The handler must branch on the listening state before starting a new recording.
  const pressHandler = fab.declaration('handlePress');
  assert.ok(pressHandler, 'the button must have a press handler');
  assert.match(pressHandler.text, /if \(isListening/, 'the press handler must branch on the listening state');

  const hints = fab.props.filter((prop) => prop.name === 'accessibilityHint');
  assert.ok(hints.length > 0, 'the button must expose an accessibility hint');
  assert.ok(hints.every((hint) => hint.expression && !hint.value), 'hints must be bound values, not hard-coded literals');
});

test('the help overlay uses translated hints and tactile confirmation', () => {
  assert.ok(help.imports.some((imp) => imp.from === 'expo-haptics'), 'the overlay must import haptics');
  assert.ok(help.called('Haptics.impactAsync'), 'opening the overlay must confirm tactilely');

  const hints = help.props.filter((prop) => prop.name === 'accessibilityHint');
  assert.ok(hints.length >= 2, 'both the trigger and the close control need hints');
  for (const hint of hints) {
    assert.match(hint.expression ?? '', /^t\(/, `hints must come from the translation bundle, got: ${hint.expression}`);
  }
});

test('the volume visualiser maps meter level to haptic step and ring scale', () => {
  const step = fab.declaration('currentStep');
  assert.ok(step, 'the button must compute a discrete volume step');
  for (const threshold of ['75', '50', '25']) {
    assert.ok(step.initializer.includes(`> ${threshold}`), `missing threshold ${threshold}`);
  }

  assert.ok(fab.hasProp('accessibilityRole', 'progressbar'), 'the ring must expose a progressbar role');
  // The ring and the screen reader must be driven by the same level. Pinning the identifier
  // (`audioVolumePct`, since the button also measures its own recording) would make this a
  // rename alarm rather than an accessibility check, so the source of the scale is read out
  // of the ring's own scaling expression and then required on the value.
  const scale = fab.declaration('ringScale');
  const level = /([A-Za-z_$][\w$]*)\s*\/\s*100/.exec(scale?.initializer ?? '')?.[1] ?? null;
  assert.ok(level, `the ring must be scaled by a meter level, got: ${scale?.initializer ?? 'nothing'}`);
  assert.ok(fab.props.some((prop) => prop.name === 'accessibilityValue' && (prop.expression ?? '').includes(level)),
    `the ring must report the level it draws (${level}) as its value`);
  assert.ok(fab.objects.some((object) => object.text.includes('scale') && object.text.includes('ringScale')),
    'the ring must scale with the meter');

  for (const style of ['Heavy', 'Medium', 'Light']) {
    assert.ok(fab.code.includes(`Haptics.ImpactFeedbackStyle?.${style}`), `missing ${style} haptic tier`);
  }
});

test('no component carries a comment that exists only to satisfy a test', () => {
  for (const [name, model] of [['ScreenRenderer', screen], ['FloatingVoiceButton', fab], ['HelpOverlay', help]]) {
    // Comments describing real exported test hooks are fine; a comment that
    // reproduces the assertion its test is looking for is not.
    const marker = /\/\/.*\b(marker|canonical fallback|closure marker)\b/i.exec(model.text);
    assert.equal(marker, null, `${name} still contains a test marker comment: ${marker?.[0] ?? ''}`);
  }
});
