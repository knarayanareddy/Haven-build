import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export async function recordVoiceOnce(maxDurationMs = 30000) {
  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Microphone permission is required');
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await recording.startAsync();
  await new Promise((resolve) => setTimeout(resolve, maxDurationMs));
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  if (!uri) throw new Error('Recording URI missing');
  const audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return { uri, audioBase64 };
}
