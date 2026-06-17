import { Platform, Alert } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const FALL_LOCATION_TASK = 'HAVEN_FALL_LOCATION_FOREGROUND_TASK';

TaskManager.defineTask(FALL_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  // Background telemetry heartbeat maintaining persistent GPS lock during Doze DoS
});

export async function initializeAndroidDozeGuard() {
  if (Platform.OS !== 'android') return;

  // 1. Show a clear explanation to the elder why this is needed (patient safety -- not just app preference)
  Alert.alert(
    "HAVEN Patiëntveiligheid",
    "Om ervoor te zorgen dat uw automatische valdetectie en noodlocatie blijven werken wanneer uw telefoon in slaapstand (Doze-modus) staat, is het van medisch levensbelang dat u batterij-optimalisaties uitschakelt voor HAVEN.",
    [
      {
        text: "Begrepen & Instellen",
        onPress: async () => {
          try {
            // Add battery optimization whitelist request on first launch: IntentAction IGNORE_BATTERY_OPTIMIZATIONS prompt
            await IntentLauncher.startActivityAsync(
              IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATIONS,
              { data: "package:nl.haven.elder" }
            );
          } catch {
            await IntentLauncher.startActivityAsync(
              IntentLauncher.ActivityAction.SECURITY_SETTINGS
            ).catch(() => undefined);
          }
        }
      },
      { text: "Later", style: "cancel" }
    ]
  );

  // 2. Add a foreground service for fall detection / location tracking so it survives Doze mode
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      await Location.startLocationUpdatesAsync(FALL_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 60_000,
        distanceInterval: 10,
        foregroundService: {
          notificationTitle: "HAVEN Veiligheidsmonitor Actief",
          notificationBody: "Actieve valdetectie en achtergrond GPS monitoring voor uw levensveiligheid.",
          notificationColor: "#1A2B4C",
        },
      });
    }
  } catch {
    // Graceful fallback if permissions or emulator drivers sit unavailable
  }
}
