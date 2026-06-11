import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { HavenClient } from './havenClient';

export async function registerPushToken(client: HavenClient, profileId: string) {
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Push notification permission is required');
  const token = await Notifications.getExpoPushTokenAsync();
  return client.registerPushToken({ profile_id: profileId, token: token.data, platform: Platform.OS });
}

export async function scheduleMedicationLocalNotification(input: { reminderId: string; title: string; body: string; date: Date }) {
  await Notifications.scheduleNotificationAsync({
    identifier: input.reminderId,
    content: { title: input.title, body: input.body, data: { reminder_id: input.reminderId, screen: 'PILLS' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: input.date },
  });
}
