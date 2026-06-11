import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { HavenClient } from '../services/havenClient';

const DEMO_ELDER_ID = '00000000-0000-0000-0000-000000000001';

export function useHavenActions(screenId: string) {
  const { session } = useAuth();
  const client = session ? new HavenClient({ supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!, accessToken: session.access_token }) : null;

  const handlePrimaryAction = useCallback(async (actionId: string) => {
    try {
      if (!client) {
        Alert.alert('HAVEN', 'Sign in is required for live backend actions.');
        return;
      }
      if (screenId === 'PILLS') await client.voice({ elder_id: DEMO_ELDER_ID, screen_id: 'PILLS', transcript_text: 'I took it', locale: 'en-GB' });
      else if (screenId === 'TODAY') await client.screenData({ elder_id: DEMO_ELDER_ID, screen_id: 'TODAY', locale: 'en-GB' });
      else await client.screenData({ elder_id: DEMO_ELDER_ID, screen_id: screenId, locale: 'en-GB' });
      Alert.alert('HAVEN', `Action completed: ${actionId}`);
    } catch (error) {
      Alert.alert('HAVEN', String((error as Error).message ?? error));
    }
  }, [client, screenId]);

  return { handlePrimaryAction };
}
