// The listening ring: metering from the microphone to the pixels.
//
// Until now audioVolumePct had no producer — ScreenRenderer rendered FloatingVoiceButton
// without it and voiceRecorder had no metering at all, so the ring never appeared and the
// memo throttle guarded a signal nothing sent. The suite that claimed otherwise fed a
// simulated reconciler 600 fabricated frames per second.
//
// What is proven here, and what is not:
//   * proven — the dB→percent mapping, the bucket throttle, that the recorder is constructed
//     with metering enabled, that levels are sampled and delivered, that unsubscribing and
//     stopping end sampling, and that a recorder torn down by the OS reports silence rather
//     than throwing into the render path;
//   * NOT proven — that a real microphone on a real device produces a useful dBFS range. That
//     needs hardware. The mapping's floor is documented against iOS/Android averages and the
//     constant is in one place (METER_FLOOR_DB) for the day someone can listen to it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadAppModule } from './support/edge-function-harness.mjs';

const meter = await loadAppModule('apps/elder/src/services/voiceMeter.ts');

// ─── the pure half: dB in, percent out, and the throttle in between ──────────

test('silence and absent readings are zero, not NaN and not a guess', () => {
  for (const reading of [null, undefined, Number.NaN, Number.NEGATIVE_INFINITY]) {
    assert.equal(meter.meteringDbToPercent(reading, -50), 0, `${String(reading)} must read as silence`);
  }
  assert.equal(meter.meteringDbToPercent(-80, -50), 0, 'below the floor is silence, not negative');
});

test('the ring spans the thirty decibels above whatever floor it is given', () => {
  // A gate of NOISE_GATE_DB above the floor, then SPEECH_RANGE_DB to full.
  assert.equal(meter.meteringDbToPercent(-50, -50), 0, 'the floor itself is silence');
  assert.equal(meter.meteringDbToPercent(-46, -50), 0, 'room tone inside the gate is silence');
  assert.equal(meter.meteringDbToPercent(-33, -50), 50);
  assert.equal(meter.meteringDbToPercent(-20, -50), 100);
  assert.equal(meter.meteringDbToPercent(0, -50), 100, 'over-driving clamps, never overflows');

  // The same voice on a different microphone: the floor moves, the ring does not.
  assert.equal(meter.meteringDbToPercent(-35, -65), 100);
  assert.equal(meter.meteringDbToPercent(-48, -65), 50);
  assert.equal(meter.meteringDbToPercent(-65, -65), 0);
});

test('the mapping is monotonic — a louder voice never makes the ring smaller', () => {
  let previous = -1;
  for (let db = -120; db <= 10; db += 1) {
    const percent = meter.meteringDbToPercent(db, -55);
    assert.ok(percent >= previous, `${db} dB dropped from ${previous} to ${percent}`);
    assert.ok(percent >= 0 && percent <= 100, `${db} dB gave ${percent}`);
    previous = percent;
  }
});

// ─── the noise floor is measured, not assumed ────────────────────────────────

test('an estimator refuses to guess before it has seen enough samples', () => {
  const estimator = meter.createNoiseFloorEstimator();
  for (let i = 0; i < meter.MIN_CALIBRATION_SAMPLES - 1; i += 1) {
    assert.equal(estimator.observe(-40), null, 'no floor may be reported yet');
  }
  assert.equal(estimator.observe(-40), -40, 'the next sample completes the measurement');
  assert.equal(estimator.samples(), meter.MIN_CALIBRATION_SAMPLES);
});

test('the floor follows the quiet level, not the loud one', () => {
  const estimator = meter.createNoiseFloorEstimator();
  // A room at -62 with one burst of speech at -20.
  for (let i = 0; i < 30; i += 1) estimator.observe(-62 + (i % 3));
  for (let i = 0; i < 5; i += 1) estimator.observe(-20);
  const floor = estimator.floor();
  assert.ok(floor !== null && floor <= -58 && floor >= -66,
    `a few loud samples must not drag the floor up (got ${floor})`);
});

test('a single very quiet click does not anchor the floor forever', () => {
  const estimator = meter.createNoiseFloorEstimator();
  for (let i = 0; i < 40; i += 1) estimator.observe(-45);
  estimator.observe(-95); // a click, or the AGC recovering
  const floor = estimator.floor();
  assert.ok(floor !== null && floor > -60,
    `one outlier must not become the floor (got ${floor})`);
});

test('the floor stays inside a plausible range for any microphone', () => {
  const quiet = meter.createNoiseFloorEstimator();
  for (let i = 0; i < 40; i += 1) quiet.observe(-160);
  assert.equal(quiet.floor(), -80, 'a digital-silence reading clamps to the plausible minimum');

  const hot = meter.createNoiseFloorEstimator();
  for (let i = 0; i < 40; i += 1) hot.observe(-2);
  assert.equal(hot.floor(), -10, 'a very hot input clamps to the plausible maximum');
});

test('quantile interpolates and clamps its inputs', () => {
  const sorted = [0, 10, 20, 30, 40];
  assert.equal(meter.quantile(sorted, 0), 0);
  assert.equal(meter.quantile(sorted, 1), 40);
  assert.equal(meter.quantile(sorted, 0.5), 20);
  assert.equal(meter.quantile(sorted, 0.125), 5);
  assert.equal(meter.quantile([], 0.5), 0);
  assert.equal(meter.quantile(sorted, -1), 0, 'a fraction below zero clamps');
  assert.equal(meter.quantile(sorted, 2), 40, 'a fraction above one clamps');
});

test('readings inside one bucket are swallowed; a crossing is emitted', () => {
  // A fixed floor isolates the throttle from the calibration, which is tested above.
  const fixed = { observe: () => -50, floor: () => -50, samples: () => 99 };
  const throttle = meter.createMeterThrottle(fixed);
  assert.equal(throttle.push(-25), 81, 'the first reading always renders');
  assert.equal(throttle.push(-24), null, '85% is the same ten-percent bucket');
  assert.equal(throttle.push(-22), 92, 'a crossing renders');
  assert.equal(throttle.push(-21), null, 'and the next reading inside it does not');
});

test('nothing is drawn until the floor has been measured', () => {
  // Showing a guessed floor for the first second is what put the ring at 44% in a silent
  // room on a hot microphone. Until the estimator has evidence, the ring stays dark.
  const throttle = meter.createMeterThrottle();
  const renders = [];
  for (let i = 0; i < meter.MIN_CALIBRATION_SAMPLES - 1; i += 1) {
    const next = throttle.push(-28);
    if (next !== null) renders.push(next);
  }
  assert.deepEqual(renders, [], 'no percentage may be rendered before calibration');
});

test('the throttle’s buckets are the memo comparator’s buckets', () => {
  for (const percent of [0, 9, 10, 19, 20, 50, 99, 100]) {
    assert.equal(meter.meterBucket(percent), Math.floor(percent / 10));
  }
});

// ─── the question a device would have answered ───────────────────────────────
//
// The old mapping used one absolute floor for every handset. On a hot microphone the room's
// own hum reads as speech, and on a quiet one a raised voice barely moves the ring. These
// three profiles are the range real devices sit in; each must produce a ring that is flat
// when the room is quiet and open when the person speaks.

const PROFILES = [
  { name: 'hot input (close mic, high gain)', ambient: -28, speech: -8 },
  { name: 'typical phone', ambient: -52, speech: -22 },
  { name: 'quiet input (distant mic, low gain)', ambient: -68, speech: -45 },
];

function driveRecording(profile, { ambientSamples = 30, speechSamples = 20 } = {}) {
  const renders = [];
  let emit = () => {};
  const detach = meter.bindRecordingMeter(
    { onLevel: (listener) => { emit = listener; return () => {}; } },
    (percent) => renders.push(percent),
  );

  for (let i = 0; i < ambientSamples; i += 1) emit(profile.ambient + (i % 2));
  const ambientRenders = renders.slice();
  for (let i = 0; i < speechSamples; i += 1) emit(profile.speech + (i % 3));
  detach();
  return { ambientRenders, all: renders };
}

for (const profile of PROFILES) {
  test(`${profile.name}: a quiet room draws nothing and a voice opens the ring`, () => {
    const { ambientRenders, all } = driveRecording(profile);

    assert.deepEqual(
      ambientRenders.filter((percent) => percent > 0), [],
      `the room alone must not move the ring (saw ${ambientRenders.join(', ')})`,
    );

    const speechPeak = Math.max(...all);
    assert.ok(speechPeak >= 55,
      `speech must open the ring at ${profile.name} (peak ${speechPeak}%)`);
  });
}

test('no handset leaves the ring stuck, and none pegs it at rest', () => {
  // The ring is a relative indicator, so the peaks differ across microphones by design — the
  // property worth holding is that every handset lands in a usable band: clearly open when
  // the person speaks, flat when they do not. An identical peak on all three would be a
  // coincidence of these constants rather than a property of the product.
  for (const profile of PROFILES) {
    const { ambientRenders, all } = driveRecording(profile);
    const peak = Math.max(...all);
    assert.ok(peak >= 55, `${profile.name} left the ring stuck at ${peak}%`);
    assert.ok(peak <= 100, '% cannot exceed a full ring');
    assert.deepEqual(ambientRenders.filter((percent) => percent > 0), [],
      `${profile.name} drew a ring over an empty room`);
  }
});

// ─── the recorder half: a real polling loop over a fake audio module ─────────

const stubs = {
  // The preset the app actually ships, minus the platform-specific junk that does not affect
  // what this test watches.
  'expo-audio': `
    export const RecordingPresets = {
      HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100, numberOfChannels: 2, bitRate: 128000 },
    };
    export async function requestRecordingPermissionsAsync() {
      return globalThis.__micPermission ?? { granted: true };
    }
  `,
  'expo-audio/src/AudioModule': `
    class AudioRecorder {
      constructor(options) {
        this.options = options;
        this.uri = null;
        this.stopped = false;
        (globalThis.__recorders ??= []).push(this);
      }
      async prepareToRecordAsync() { this.prepared = true; }
      record() { this.recording = true; }
      getStatus() {
        if (globalThis.__statusThrows) throw new Error('media services did not reset');
        const status = { canRecord: true, isRecording: !this.stopped, durationMillis: 0, mediaServicesDidReset: false, url: null };
        if (globalThis.__meteringSupported !== false) status.metering = globalThis.__meteringDb;
        return status;
      }
      async stop() {
        this.stopped = true;
        this.uri = globalThis.__recordingUri === undefined ? 'file:///cache/voice.m4a' : globalThis.__recordingUri;
      }
    }
    export default { AudioRecorder };
  `,
  'expo-file-system': `
    export const EncodingType = { Base64: 'base64' };
    export async function readAsStringAsync(uri) { return 'AAECAwQ='; }
  `,
};

function resetAudioGlobals() {
  globalThis.__recorders = [];
  globalThis.__meteringDb = -25;
  delete globalThis.__micPermission;
  delete globalThis.__statusThrows;
  delete globalThis.__meteringSupported;
  delete globalThis.__recordingUri;
}

const recorderModule = await loadAppModule('apps/elder/src/services/voiceRecorder.ts', { stubs });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(5);
  }
  return false;
}

test('the recorder is created with metering on, keeping the shipped preset', async () => {
  resetAudioGlobals();
  const recording = await recorderModule.startVoiceRecording({ meteringIntervalMs: 5 });
  try {
    const recorder = globalThis.__recorders[0];
    assert.equal(recorder.options.isMeteringEnabled, true,
      'without this getStatus().metering is undefined and the ring can never move');
    assert.equal(recorder.options.sampleRate, 44100, 'the preset must be extended, not replaced');
    assert.equal(recorder.options.extension, '.m4a');
  } finally {
    await recording.stop();
  }
});

test('levels are sampled while recording and delivered as dBFS', async () => {
  resetAudioGlobals();
  globalThis.__meteringDb = -25;
  const recording = await recorderModule.startVoiceRecording({ meteringIntervalMs: 5 });
  const seen = [];
  const unsubscribe = recording.onLevel((db) => seen.push(db));

  try {
    assert.equal(seen[0], -25, 'the first reading arrives immediately, not one interval later');
    globalThis.__meteringDb = -12;
    assert.equal(await waitFor(() => seen.includes(-12)), true, 'the loop keeps sampling');
  } finally {
    unsubscribe();
    await recording.stop();
  }
});

test('unsubscribing stops the polling — an idle button must not read the recorder forever', async () => {
  resetAudioGlobals();
  const recording = await recorderModule.startVoiceRecording({ meteringIntervalMs: 5 });
  let calls = 0;
  const unsubscribe = recording.onLevel(() => { calls += 1; });

  await waitFor(() => calls > 1);
  unsubscribe();
  const afterUnsubscribe = calls;

  await wait(40);
  assert.equal(calls, afterUnsubscribe, 'no sample may arrive after unsubscribe');
  await recording.stop();
});

test('two listeners both receive the level, and the last unsubscribe ends sampling', async () => {
  resetAudioGlobals();
  const recording = await recorderModule.startVoiceRecording({ meteringIntervalMs: 5 });
  const first = [];
  const second = [];
  const offFirst = recording.onLevel((db) => first.push(db));
  const offSecond = recording.onLevel((db) => second.push(db));

  try {
    await waitFor(() => first.length > 0 && second.length > 0);
    assert.equal(first.length > 0 && second.length > 0, true);
    assert.equal(first[0], second[0]);
  } finally {
    offFirst();
    offSecond();
    await recording.stop();
  }
});

test('stopping ends sampling and still returns the audio', async () => {
  resetAudioGlobals();
  const recording = await recorderModule.startVoiceRecording({ meteringIntervalMs: 5 });
  let calls = 0;
  recording.onLevel(() => { calls += 1; });

  await waitFor(() => calls > 1);
  const result = await recording.stop();
  const afterStop = calls;

  assert.deepEqual(result, { uri: 'file:///cache/voice.m4a', audioBase64: 'AAECAwQ=' });
  await wait(40);
  assert.equal(calls, afterStop, 'a stopped recorder must not keep reporting levels');
});

test('a recorder the OS tore down reports silence instead of throwing into the render path', async () => {
  resetAudioGlobals();
  globalThis.__statusThrows = true;
  const recording = await recorderModule.startVoiceRecording({ meteringIntervalMs: 5 });
  const seen = [];
  const unsubscribe = recording.onLevel((db) => seen.push(db));

  try {
    assert.equal(await waitFor(() => seen.length > 1), true, 'sampling must continue');
    assert.equal(seen.every((db) => db === null), true,
      'every reading is null, which the ring renders as silence — not an exception');
    assert.equal(meter.meteringDbToPercent(seen[0]), 0);
  } finally {
    unsubscribe();
    await recording.stop().catch(() => undefined);
  }
});

test('a platform without metering support reads as silence, not as a crash', async () => {
  resetAudioGlobals();
  globalThis.__meteringSupported = false;
  const recording = await recorderModule.startVoiceRecording({ meteringIntervalMs: 5 });
  const seen = [];
  const unsubscribe = recording.onLevel((db) => seen.push(db));

  try {
    assert.equal(await waitFor(() => seen.length > 0), true);
    assert.equal(seen[0], null);
  } finally {
    unsubscribe();
    await recording.stop();
  }
});

test('microphone permission is refused before any recorder exists', async () => {
  resetAudioGlobals();
  globalThis.__micPermission = { granted: false };

  await assert.rejects(
    () => recorderModule.startVoiceRecording({ meteringIntervalMs: 5 }),
    /Microphone permission is required/,
  );
  assert.equal(globalThis.__recorders.length, 0, 'no recorder may be constructed without consent');
});

// ─── end to end: a real polling loop through the real throttle ───────────────

test('a quiet room then a spoken word renders the ring a handful of times, not a hundred', async () => {
  resetAudioGlobals();
  // 10 ms sampling: the same order as the 60fps stream the old simulation claimed to throttle.
  globalThis.__meteringDb = -55;
  const recording = await recorderModule.startVoiceRecording({ meteringIntervalMs: 10 });
  const renders = [];
  const unsubscribe = meter.bindRecordingMeter(recording, (percent) => renders.push(percent));

  try {
    await wait(300);
    assert.deepEqual(renders.filter((percent) => percent !== 0), [],
      `a room alone must not move the ring (saw ${renders.join(', ')})`);

    // The older adult speaks. The level rises ~25 dB above the room.
    globalThis.__meteringDb = -30;
    assert.equal(await waitFor(() => renders.some((percent) => percent > 40)), true,
      `speech must open the ring (saw ${renders.join(', ')})`);

    const distinct = new Set(renders);
    assert.ok(distinct.size <= 6,
      `ten readings a second must collapse into a few buckets, not fifty renders (got ${distinct.size})`);
    assert.ok(Math.max(...renders) >= 55, 'and the ring must open clearly');
  } finally {
    unsubscribe();
    await recording.stop();
  }
});

test('a recording whose file is missing fails loudly instead of sending empty audio', async () => {
  resetAudioGlobals();
  globalThis.__recordingUri = null;
  const recording = await recorderModule.startVoiceRecording({ meteringIntervalMs: 5 });
  await assert.rejects(() => recording.stop(), /Recording URI missing/);
});
