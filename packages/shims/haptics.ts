import { Platform } from 'react-native';
import * as ExpoHaptics from 'expo-haptics';

export const Haptics = {
  impactAsync: async (style?: ExpoHaptics.ImpactFeedbackStyle) => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await ExpoHaptics.impactAsync(style).catch(() => undefined);
    }
    // macOS/web: no-op (haptics don't exist on desktop compilation targets)
  },
  notificationAsync: async (type?: ExpoHaptics.NotificationFeedbackType) => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await ExpoHaptics.notificationAsync(type).catch(() => undefined);
    }
  },
  selectionAsync: async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await ExpoHaptics.selectionAsync().catch(() => undefined);
    }
  },
};
