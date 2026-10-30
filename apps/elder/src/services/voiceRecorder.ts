import { requestRecordingPermissionsAsync, RecordingPresets } from 'expo-audio';
import AudioModule from 'expo-audio/src/AudioModule';
import * as FileSystem from 'expo-file-system';

/** How often the recorder's level is read. Ten samples a second is smooth to the eye. */
export const DEFAULT_METERING_INTERVAL_MS = 100;

export interface VoiceRecordingOptions {
  /** Level sampling interval. Tests shorten it; production keeps the default. */
  meteringIntervalMs?: number;
}

export interface ActiveVoiceRecording {
  stop: () => Promise<{ uri: string; audioBase64: string }>;
  /**
   * Subscribes to the microphone level in dBFS, sampled at the interval above. Returns an
   * unsubscribe function; when the last subscriber leaves, sampling stops so the recorder is
   * not polled for the rest of the session.
   *
   * The listener receives `null` when the platform reports no level (metering unsupported,
   * or the recorder has been torn down), which the ring reads as silence.
   */
  onLevel: (listener: (meteringDb: number | null) => void) => () => void;
}

export async function startVoiceRecording(
  options: VoiceRecordingOptions = {},
): Promise<ActiveVoiceRecording> {
  const permission = await requestRecordingPermissionsAsync();
  if (!permission.granted) throw new Error('Microphone permission is required');

  // isMeteringEnabled is off by default and costs an extra buffer per sample, so it is turned
  // on deliberately: without it `getStatus().metering` is undefined and the ring never moves.
  const recorder = new AudioModule.AudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  await recorder.prepareToRecordAsync();
  recorder.record();

  const intervalMs = options.meteringIntervalMs ?? DEFAULT_METERING_INTERVAL_MS;
  const listeners = new Set<(meteringDb: number | null) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let finished = false;

  const readLevel = (): number | null => {
    try {
      const status = recorder.getStatus();
      return typeof status?.metering === 'number' ? status.metering : null;
    } catch {
      // A recorder interrupted by the OS (a phone call, a media-services reset on iOS)
      // throws from getStatus(). The recording is over either way; report silence instead of
      // tearing down the button while the older adult is mid-sentence.
      return null;
    }
  };

  const sample = () => {
    if (finished) return;
    const level = readLevel();
    for (const listener of listeners) listener(level);
  };

  const startSampling = () => {
    if (timer !== null || finished) return;
    timer = setInterval(sample, intervalMs);
    // In Node the handle keeps the process alive; on a device it is a number.
    (timer as { unref?: () => void }).unref?.();
  };

  const stopSampling = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  return {
    onLevel: (listener) => {
      listeners.add(listener);
      startSampling();
      // Give the first reading immediately: waiting 100ms for the ring to appear reads as a
      // dead button.
      listener(readLevel());
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopSampling();
      };
    },
    stop: async () => {
      finished = true;
      stopSampling();
      listeners.clear();
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('Recording URI missing');
      const audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      return { uri, audioBase64 };
    },
  };
}

export async function recordVoiceOnce(maxDurationMs = 30000) {
  const recording = await startVoiceRecording();
  await new Promise((resolve) => setTimeout(resolve, maxDurationMs));
  return recording.stop();
}
