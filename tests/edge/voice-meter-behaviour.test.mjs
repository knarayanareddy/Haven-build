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
  for (const reading of [null, undefined, Number.NaN, Number.NEGATIVE_INFINITY, -160, -80, -50]) {
    assert.equal(meter.meteringDbToPercent(reading), 0, `${String(reading)} must read as silence`);
  }
});

test('a normal speaking voice moves the ring through its middle', () => {
  // -40 dB is a quiet room far from the mic; -10 dB is someone talking right at it.
  assert.equal(meter.meteringDbToPercent(-40), 20);
  assert.equal(meter.meteringDbToPercent(-25), 50);
  assert.equal(meter.meteringDbToPercent(-10), 80);
  assert.equal(meter.meteringDbToPercent(0), 100);
  assert.equal(meter.meteringDbToPercent(6), 100, 'over-driving the input clamps, never overflows');
});

test('the mapping is monotonic — a louder voice never makes the ring smaller', () => {
  let previous = -1;
  for (let db = -120; db <= 10; db += 1) {
    const percent = meter.meteringDbToPercent(db);
    assert.ok(percent >= previous, `${db} dB dropped from ${previous} to ${percent}`);
    assert.ok(percent >= 0 && percent <= 100, `${db} dB gave ${percent}`);
    previous = percent;
  }
});

test('readings inside one bucket are swallowed; a crossing is emitted', () => {
  const throttle = meter.createMeterThrottle();
  assert.equal(throttle.push(-25), 50, 'the first reading always renders');

  // -25 dB → 50%, -22 dB → 56%: same bucket, no render.
  assert.equal(throttle.push(-22), null);
  assert.equal(throttle.push(-21), null);

  // -18 dB → 64%: a new bucket.
  assert.equal(throttle.push(-18), 64);
  assert.equal(throttle.push(-17), null);
});

test('one reading of a new stream always renders, whatever the previous stream ended on', () => {
  const first = meter.createMeterThrottle();
  first.push(-25);            // 50%
  assert.equal(first.push(-21), null, 'inside the same bucket');

  // bindRecordingMeter gives every recording its own throttle, so a second recording that
  // starts at the level the first ended on must still draw its ring.
  const second = meter.createMeterThrottle();
  assert.equal(second.push(-21), 58, 'the same level must render again for a new recording');
});

test('the throttle’s buckets are the memo comparator’s buckets', () => {
  // If these two disagreed, the component would either re-render on every sample or skip
  // a level it should have shown.
  for (const percent of [0, 9, 10, 19, 20, 50, 99, 100]) {
    assert.equal(meter.meterBucket(percent), Math.floor(percent / 10));
  }
});

test('the binding the button uses subscribes once, throttles, and detaches', () => {
  // This is the exact function FloatingVoiceButton calls from attachMeter; the test supplies
  // the recording and records what would have been rendered.
  let listener = null;
  let subscriptions = 0;
  let detaches = 0;
  const source = {
    onLevel(push) {
      subscriptions += 1;
      listener = push;
      return () => { detaches += 1; };
    },
  };

  const renders = [];
  const detach = meter.bindRecordingMeter(source, (percent) => renders.push(percent));

  assert.equal(subscriptions, 1);
  listener(-25);  // 50%
  listener(-22);  // 56% — same bucket
  listener(-18);  // 64% — new bucket
  assert.deepEqual(renders, [50, 64]);

  detach();
  assert.equal(detaches, 1);
});

test('a platform without metering never renders NaN into the ring', () => {
  let listener = null;
  const renders = [];
  meter.bindRecordingMeter({ onLevel: (push) => { listener = push; return () => {}; } },
    (percent) => renders.push(percent));

  listener(null);
  assert.deepEqual(renders, [0]);
  assert.equal(Number.isNaN(renders[0]), false);
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

test('a second of a steady voice renders the ring once, not a hundred times', async () => {
  resetAudioGlobals();
  globalThis.__meteringDb = -25;
  // 10ms sampling = 100 readings in a second, the same order as the 60fps stream the old
  // simulation claimed to throttle.
  const recording = await recorderModule.startVoiceRecording({ meteringIntervalMs: 10 });
  const renders = [];
  const unsubscribe = meter.bindRecordingMeter(recording, (percent) => renders.push(percent));

  try {
    await wait(200);
    assert.equal(renders.length, 1,
      `a voice that does not change bucket must not re-render the ring (saw ${renders.join(', ')})`);

    // Now the older adult speaks louder. One crossing, one render.
    globalThis.__meteringDb = -12;
    assert.equal(await waitFor(() => renders.length > 1), true);
    const afterCrossing = renders.length;
    await wait(150);
    assert.equal(renders.length, afterCrossing, 'and no further renders while the level holds');
    assert.equal(renders[renders.length - 1], 76, '-12 dB is 76%');
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
