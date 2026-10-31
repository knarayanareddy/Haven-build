// The listening ring on the floating voice button, and the rule that keeps it cheap.
//
// expo-audio reports a level in dBFS: 0 is the loudest the input path can carry and -160 is
// silence. The ring wants 0..100.
//
// A single absolute floor cannot work. Microphone gain, automatic gain control and the
// acoustic environment between handsets differ by tens of decibels: a level of -25 dBFS is a
// normal speaking voice on one device and an air-conditioning hum on another. Calibrating
// against a constant means the ring sits at 44% in a silent room on a hot microphone — telling
// an older adult "HAVEN hears you" when it hears nothing — and stays dark while they talk into
// a quiet one.
//
// So the floor is measured rather than assumed: a rolling low percentile of the levels seen
// during this recording is the noise floor of *this* microphone in *this* room, and the ring
// spans the thirty decibels above it. `METER_FLOOR_DB` is only the starting guess for the first
// few samples, and an estimator that has not seen enough samples yet declines to guess at all.

/** The starting floor, used only until the estimator has enough samples to measure one. */
export const METER_FLOOR_DB = -50;

/** How far above the measured floor the ring starts to move at all. */
export const NOISE_GATE_DB = 4;

/**
 * Decibels between the gate and a full ring.
 *
 * With the gate at +4 and the range at 26, the ring spans the thirty decibels above the room's
 * own noise. Speech is typically twenty to thirty decibels above the room it is spoken in, so
 * that span covers a quiet voice on a poor microphone and a loud one on a good one.
 */
export const SPEECH_RANGE_DB = 26;

/** Samples kept for the noise-floor estimate (12 s at 10 Hz). */
export const CALIBRATION_WINDOW = 120;

/** Which quantile of the window counts as "the quiet level". */
export const CALIBRATION_PERCENTILE = 0.1;

/** Below this many samples the estimate is not trusted and the starting floor is used. */
export const MIN_CALIBRATION_SAMPLES = 12;

/** Emit at most one update per ten percentage points. */
export const METER_BUCKET_PCT = 10;

/** The floor a handset could plausibly report; anything outside is clamped, not trusted. */
const MIN_PLAUSIBLE_FLOOR_DB = -80;
const MAX_PLAUSIBLE_FLOOR_DB = -10;

/**
 * Converts an expo-audio metering reading to the 0..100 the ring renders, relative to a noise
 * floor.
 *
 * Anything that is not a finite number — the key is absent on platforms without metering
 * support, and null appears while the recorder is being torn down — reads as silence rather
 * than throwing or rendering NaN.
 */
export function meteringDbToPercent(
  db: number | null | undefined,
  floorDb: number = METER_FLOOR_DB,
  rangeDb: number = SPEECH_RANGE_DB,
): number {
  if (db === null || db === undefined) return 0;
  const value = Number(db);
  if (!Number.isFinite(value)) return 0;
  // A gate, not just a floor: room tone wobbles by a few decibels, and a ring that twitches
  // at 3% while nobody is speaking is the same lie as one that sits at 44%.
  const gateDb = floorDb + NOISE_GATE_DB;
  if (value <= gateDb) return 0;
  const percent = ((value - gateDb) / rangeDb) * 100;
  return Math.min(100, Math.round(percent));
}

/** The bucket a level falls into. Deliberately the same arithmetic as the memo comparator. */
export function meterBucket(percent: number): number {
  return Math.floor(percent / METER_BUCKET_PCT);
}

/** Linear-interpolated quantile of a sorted numeric sample. */
export function quantile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, fraction));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export interface NoiseFloorEstimator {
  /** Records a level. Returns the floor to map against, or null until it can be measured. */
  observe(db: number | null | undefined): number | null;
  /** The floor currently in use, or null before calibration. */
  floor(): number | null;
  /** How many usable samples have been seen. */
  samples(): number;
}

/**
 * Tracks the quiet level of the current recording.
 *
 * A low percentile of a moving window, rather than a minimum, because a single click, a door
 * or the microphone's own AGC recovery can produce one very low sample that a minimum would
 * then anchor to for the rest of the session. The percentile is the level the room is at when
 * nobody is talking, which is exactly what the ring should treat as zero.
 */
export function createNoiseFloorEstimator(): NoiseFloorEstimator {
  const window: number[] = [];
  let sortedCache: number[] | null = null;

  return {
    observe(db) {
      if (typeof db === 'number' && Number.isFinite(db)) {
        window.push(db);
        if (window.length > CALIBRATION_WINDOW) window.shift();
        sortedCache = null;
      }
      if (window.length < MIN_CALIBRATION_SAMPLES) return null;
      if (sortedCache === null) sortedCache = [...window].sort((a, b) => a - b);
      const measured = quantile(sortedCache, CALIBRATION_PERCENTILE);
      return Math.min(MAX_PLAUSIBLE_FLOOR_DB, Math.max(MIN_PLAUSIBLE_FLOOR_DB, measured));
    },
    floor() {
      return window.length < MIN_CALIBRATION_SAMPLES ? null : this.observe(null);
    },
    samples() {
      return window.length;
    },
  };
}

export interface MeterThrottle {
  /**
   * Records a reading and returns the percentage to render, or null when the level is in the
   * same bucket as the last one emitted and the component can skip the render entirely.
   */
  push(db: number | null | undefined): number | null;
}

export function createMeterThrottle(estimator: NoiseFloorEstimator = createNoiseFloorEstimator()): MeterThrottle {
  let lastBucket = -1;
  return {
    push(db) {
      const measuredFloor = estimator.observe(db);
      // No floor yet means no evidence yet. Mapping against the starting guess is exactly the
      // bug this replaced: on a hot microphone that guess puts the ring at 44% in a silent
      // room. Staying dark for the first second is honest; guessing is not.
      if (measuredFloor === null) return null;
      const percent = meteringDbToPercent(db, measuredFloor);
      const bucket = meterBucket(percent);
      if (bucket === lastBucket) return null;
      lastBucket = bucket;
      return percent;
    },
  };
}

/** The part of a recording this needs. Kept structural so a test needs no audio module. */
export interface MeterSource {
  onLevel: (listener: (meteringDb: number | null) => void) => () => void;
}

/**
 * Subscribes the ring to a recording, rendering only when the level crosses a bucket.
 *
 * This is the glue the button runs, kept here rather than inline in the component so it can
 * be driven directly: a fresh throttle per binding means the first level of every recording
 * always renders, and the returned function detaches.
 */
export function bindRecordingMeter(
  source: MeterSource,
  onRender: (percent: number) => void,
): () => void {
  const throttle = createMeterThrottle();
  return source.onLevel((meteringDb) => {
    const next = throttle.push(meteringDb);
    if (next !== null) onRender(next);
  });
}
