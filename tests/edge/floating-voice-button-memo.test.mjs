// The floating voice button's memo boundary, driven through the real component module.
//
// Replaces tests/edge/floating-voice-rerender-closure.test.mjs, which defined its own
// `SimulatedReactReconciler` and its own `propsEqual` inside the test and then asserted that
// the copies agreed with each other. Neither the component, nor React, nor React's memo
// semantics were involved; the "589 of 600 frames skipped" and "95% CPU reduction" numbers
// were properties of the simulation.
//
// What can be established here without a renderer is what React itself consults: the memo
// boundary and its comparator. React.memo stores the comparator on the memo object, so
// FloatingVoiceButton.compare is the function React calls to decide whether to re-render —
// the same one production uses, not a re-implementation.
//
// State of the meter: nothing supplies audioVolumePct today. ScreenRenderer renders the
// button without it and voiceRecorder exposes no metering, so the ring never appears and the
// throttle is a guard for the day a meter is wired up. The synthetic frame stream below is
// therefore a specification of the comparator, not a measurement of a live screen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { loadAppModule } from './support/edge-function-harness.mjs';

// The transpiled module lands in /tmp, where React does not resolve. Point the specifier at
// the copy the elder app actually renders with — stubbing React would put the memo decision
// back in this test's hands, which is the defect being fixed.
const REACT_ENTRY = pathToFileURL(
  createRequire(import.meta.url).resolve('react', { paths: [new URL('../..', import.meta.url).pathname + 'apps/elder'] }),
).href;

// The component pulls in React Native and the elder app's auth/voice/safety services. None of
// them participate in the memo decision; the stubs only have to satisfy the module graph.
const stubs = {
  // JSX never executes here (nothing is rendered), so the runtime only has to exist.
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
  'react-native': `
    const noop = () => {};
    const Animated = {
      Value: class { constructor(v) { this.v = v; } setValue(v) { this.v = v; } stopAnimation() {} },
      timing: (value, config) => ({ start: noop, ...config }),
      sequence: (steps) => ({ start: noop, steps }),
      loop: (animation) => ({ start: noop, animation }),
    };
    class Component {}
    export { Animated, Component };
    export const Alert = { alert: noop };
    export const Easing = { inOut: (fn) => fn, ease: (x) => x };
    export const Platform = { OS: 'ios', select: (options) => options.ios ?? options.default };
    export const Text = 'Text';
    export const TouchableOpacity = 'TouchableOpacity';
    export const View = 'View';
    export default { Animated, Alert, Easing, Platform, Text, TouchableOpacity, View };
  `,
  'expo-haptics': `
    export const NotificationFeedbackType = { Error: 'error', Success: 'success' };
    export const ImpactFeedbackStyle = { Medium: 'medium', Light: 'light' };
    export const notificationAsync = async () => {};
    export const impactAsync = async () => {};
    export const selectionAsync = async () => {};
  `,
  '@haven/ui/src/tokens': `
    export const colors = new Proxy({}, { get: (_t, key) => String(key) });
    export const touch = {};
    export default { colors, touch };
  `,
  '@haven/contracts/src/haven': `export const locales = ['nl-NL', 'en-GB'];`,
  '../auth/AuthProvider': `export const useAuth = () => ({ session: null });`,
  '../services/havenClient': `export class HavenClient { async speak() { return {}; } }`,
  '../services/voiceRecorder': `
    export async function startVoiceRecording() { return { stop: async () => ({ uri: 'file://stub.m4a', durationMs: 1000 }) }; }
  `,
  '../services/safetyEscalation': `
    export function decideEscalation() { return { level: 'none', message: '' }; }
    export function decideEscalationForError() { return { level: 'none', message: '' }; }
  `,
};

const component = await loadAppModule('apps/elder/src/components/FloatingVoiceButton.tsx', { stubs });
const Button = component.FloatingVoiceButton;

const props = (overrides = {}) => ({
  locale: 'nl-NL',
  screenId: 'HOME',
  voiceFallback: 'Ik help u.',
  elderId: 'elder-a',
  hapticTrigger: () => {},
  audioVolumePct: 0,
  ...overrides,
});

// React's own decision: true means "props are equal, skip the render".
const same = (a, b) => Button.compare(a, b) === true;

test('the export is a React.memo boundary, not a plain function', () => {
  assert.equal(typeof Button, 'object');
  assert.equal(Button.$$typeof, Symbol.for('react.memo'));
  assert.equal(typeof Button.compare, 'function');
});

test('identical props are equal — the boundary cannot re-render itself forever', () => {
  // A comparator that answers "not equal" for untouched props is the re-render loop itself.
  const value = props({ audioVolumePct: 42 });
  assert.equal(same(value, value), true);
  assert.equal(same(props(), props()), true);
});

test('volume changes inside a ten percent bucket are dropped', () => {
  for (const [from, to] of [[0, 9], [10, 19], [20, 29], [90, 99], [30, 30]]) {
    assert.equal(same(props({ audioVolumePct: from }), props({ audioVolumePct: to })), true,
      `${from}% → ${to}% must not cross the boundary`);
  }
});

test('crossing a bucket does re-render, so the ring still moves', () => {
  for (const [from, to] of [[9, 10], [19, 20], [0, 10], [89, 90], [99, 100]]) {
    assert.equal(same(props({ audioVolumePct: from }), props({ audioVolumePct: to })), false,
      `${from}% → ${to}% must cross the boundary`);
  }
});

test('every prop that identifies whose voice this is re-renders immediately', () => {
  // This is the half a broken throttle would get wrong in the dangerous direction: with the
  // button memoised on volume alone, a supervisor switching elder would keep recording under
  // the previous elder's identity.
  for (const change of [
    { locale: 'en-GB' },
    { screenId: 'MEDICATION' },
    { voiceFallback: 'Shall I call someone?' },
    { elderId: 'elder-b' },
  ]) {
    assert.equal(same(props(), props(change)), false,
      `${Object.keys(change)[0]} changing must re-render`);
  }
});

test('an absent meter reads as silence, not as a change', () => {
  const withoutMeter = props();
  delete withoutMeter.audioVolumePct;
  assert.equal(same(withoutMeter, props({ audioVolumePct: 0 })), true);
  assert.equal(same(withoutMeter, props({ audioVolumePct: 7 })), true);
  assert.equal(same(withoutMeter, props({ audioVolumePct: 40 })), false);
});

// A minute of 60fps meter frames of someone speaking: an envelope that swells and falters.
function meterFrames(count) {
  return Array.from({ length: count }, (_unused, frame) => {
    const volume = Math.round(55 + 40 * Math.sin(frame / 24) + 4 * Math.sin(frame / 1.7));
    return Math.min(100, Math.max(0, volume));
  });
}

test('a minute of 60fps meter frames renders once per bucket, and only then', () => {
  const frames = meterFrames(3600);
  let current = props({ audioVolumePct: frames[0] });
  let renders = 0;

  for (const volume of frames.slice(1)) {
    // Every prop except the meter is identical between frames, as ScreenRenderer passes it.
    const next = props({ audioVolumePct: volume });
    if (!same(current, next)) {
      renders += 1;
      current = next;
    }
  }

  // The comparator's promise, checked exactly: a render happens when and only when the
  // signal changes ten-percent bucket. No missed movement, no extra renders.
  let bucketChanges = 0;
  for (let index = 1; index < frames.length; index += 1) {
    if (Math.floor(frames[index] / 10) !== Math.floor(frames[index - 1] / 10)) bucketChanges += 1;
  }
  assert.equal(renders, bucketChanges);
  assert.equal(bucketChanges > 0, true, 'the meter must still move the ring');
});

test('the boundary is what removes the work: the same frames un-bucketed are all renders', () => {
  const frames = meterFrames(3600);
  const rawChanges = frames.slice(1).filter((volume, index) => volume !== frames[index]).length;
  const bucketed = frames.slice(1)
    .filter((volume, index) => Math.floor(volume / 10) !== Math.floor(frames[index] / 10)).length;

  assert.ok(rawChanges > 1800, `a raw meter changes on most frames (saw ${rawChanges})`);
  assert.ok(bucketed * 3 < rawChanges,
    `bucketing must remove most renders: ${bucketed} of ${rawChanges}`);
});
