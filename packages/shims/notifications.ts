import { Platform } from 'react-native';
import * as ExpoNotifications from 'expo-notifications';

export const Notifications = {
  // Retain standard expo-notifications behavior specifically for iOS/Android
  getPermissionsAsync: async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      return await ExpoNotifications.getPermissionsAsync();
    }
    return { status: 'granted', granted: true, canAskAgain: true };
  },
  requestPermissionsAsync: async () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      return await ExpoNotifications.requestPermissionsAsync();
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      await window.Notification.requestPermission().catch(() => undefined);
    }
    return { status: 'granted', granted: true, canAskAgain: true };
  },
  scheduleNotificationAsync: async (request: ExpoNotifications.NotificationRequestInput) => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      return await ExpoNotifications.scheduleNotificationAsync(request);
    }
    // macOS / Desktop Native UserNotifications conversion via HTML5 Notification API
    if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
      const content = request.content as { title?: string; body?: string };
      new window.Notification(content.title ?? "HAVEN Melding", {
        body: content.body ?? "",
        icon: "./assets/icon.png",
      });
    }
    return "macos_note_" + Date.now();
  },
  // Subsystem entry subscribing to Supabase Realtime channels
  initializeRealtimeMacOsNotifications: (supabaseClient: any, currentUserId: string) => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') return;

    if (typeof window !== 'undefined' && 'Notification' in window) {
      window.Notification.requestPermission().catch(() => undefined);
    }

    supabaseClient
      .channel('macos-notifications-stream')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload: any) => {
        const row = payload.new;
        if (row && (row.recipient_id === currentUserId || !row.recipient_id || row.elder_id === currentUserId)) {
          if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
            new window.Notification(String(row.title_nl ?? "HAVEN Veiligheidsmelding"), {
              body: String(row.body_nl ?? "Er is een nieuwe update in uw HAVEN-netwerk."),
              icon: "./assets/icon.png",
            });
          }
        }
      })
      .subscribe();
  },
};
