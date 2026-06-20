import { requestRecordingPermissionsAsync, RecordingPresets } from 'expo-audio';
import AudioModule from 'expo-audio/src/AudioModule';
import * as FileSystem from 'expo-file-system';

export interface ActiveVoiceRecording {
  stop: () => Promise<{ uri: string; audioBase64: string }>;
}

export async function startVoiceRecording(): Promise<ActiveVoiceRecording> {
  const permission = await requestRecordingPermissionsAsync();
  if (!permission.granted) throw new Error('Microphone permission is required');
  const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
  await recorder.prepareToRecordAsync();
  recorder.record();
  return {
    stop: async () => {
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
