// The listening ring on the floating voice button, and the rule that keeps it cheap.
//
// expo-audio reports a level in dBFS: 0 is the loudest the input path can carry and -160 is
// silence. The ring wants 0..100 and the component wants to re-render as rarely as the eye
// can tell, so both conversions live here — away from React, where a test can drive them
// with a real frame stream instead of describing them.
//
// Why this matters for an older adult: the ring is the only signal that the microphone is
// actually hearing them. A meter that moves when they speak and stops when they stop is the
// difference between "HAVEN is listening" and "HAVEN is waiting and I don't know why".

/**
 * Level treated as silence.
 *
 * Conversational speech sits around -30 to -12 dBFS; a quiet room sits below -50. Using the
 * full -160 dB scale would compress every normal voice into the top few percent and make the
 * ring jump from nothing to full.
 */
export const METER_FLOOR_DB = -50;

/** Emit at most one update per ten percentage points. */
export const METER_BUCKET_PCT = 10;

/**
 * Converts an expo-audio metering reading to the 0..100 the ring renders.
 *
 * Anything that is not a finite number — the key is absent on platforms without metering
 * support, and null appears while the recorder is being torn down — reads as silence rather
 * than throwing or rendering NaN.
 */
export function meteringDbToPercent(db: number | null | undefined): number {
  if (db === null || db === undefined) return 0;
  const value = Number(db);
  if (!Number.isFinite(value)) return 0;
  if (value <= METER_FLOOR_DB) return 0;
  if (value >= 0) return 100;
  return Math.round(((value - METER_FLOOR_DB) / -METER_FLOOR_DB) * 100);
}

/** The bucket a level falls into. Deliberately the same arithmetic as the memo comparator. */
export function meterBucket(percent: number): number {
  return Math.floor(percent / METER_BUCKET_PCT);
}

export interface MeterThrottle {
  /**
   * Records a reading and returns the percentage to render, or null when the level is in the
   * same bucket as the last one emitted and the component can skip the render entirely.
   */
  push(db: number | null | undefined): number | null;
}

export function createMeterThrottle(): MeterThrottle {
  let lastBucket = -1;
  return {
    push(db) {
      const percent = meteringDbToPercent(db);
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
