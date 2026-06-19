import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from '@haven/i18n';
import { useAuth } from '../auth/AuthProvider';
import { HavenClient } from '../services/havenClient';
import { enqueueOfflineAction } from '../services/sqliteOfflineQueue';
import { classifyNetworkError } from '../state/networkResilience';
import { translateElderError } from '../services/errorMapper';

const DEMO_ELDER_ID = '00000000-0000-0000-0000-000000000001';

export function useHavenActions(screenId: string) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const client = session ? new HavenClient({ supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!, accessToken: session.access_token }) : null;

  const handlePrimaryAction = useCallback(async (actionId: string) => {
    if (actionId === 'CALL_FAMILY' || actionId === 'EMERGENCY') {
      Alert.alert('HAVEN', actionId === 'EMERGENCY' ? t('actions.emergency.alert') : t('actions.call_family.alert'));
      return;
    }
    if (actionId === 'LANG_TOGGLE') {
      Alert.alert('HAVEN', t('actions.lang_toggle.alert'));
      return;
    }
    if (actionId === 'CONTRAST_TOGGLE') {
      Alert.alert('HAVEN', t('actions.contrast_toggle.alert'));
      return;
    }
    if (actionId === 'FONT_BIGGER') {
      Alert.alert('HAVEN', t('actions.font_bigger.alert'));
      return;
    }
    if (actionId === 'TELL_PILLS') {
      Alert.alert('HAVEN', t('actions.tell_pills.alert'));
      return;
    }
    if (actionId === 'REVIEW_ALERTS') {
      Alert.alert('HAVEN', t('actions.review_alerts.alert'));
      return;
    }
    if (actionId === 'SEND_HEART') {
      Alert.alert('HAVEN', t('actions.send_heart.alert'));
      return;
    }
    if (actionId === 'RECORD_STORY') {
      Alert.alert('HAVEN', t('actions.record_story.alert'));
      return;
    }
    if (actionId === 'BUURT_MATCH' || actionId === 'BUURT_INTRO') {
      Alert.alert('HAVEN', t('actions.buurt_privacy.alert'));
      return;
    }
    if (actionId === 'OPT_IN_BUURT') {
      Alert.alert('HAVEN', t('actions.opt_in_buurt.alert'));
      return;
    }
    if (actionId === 'CRISIS') {
      Alert.alert('HAVEN', t('actions.crisis.alert'));
      return;
    }
    if (actionId === 'TALK') {
      Alert.alert('HAVEN', t('actions.talk.alert'));
      return;
    }
    if (actionId === 'SCAN_DOC') {
      Alert.alert('HAVEN', t('actions.scan_doc.alert'));
      return;
    }
    if (actionId === 'TOGGLE_NIGHT') {
      Alert.alert('HAVEN', t('actions.toggle_night.alert'));
      return;
    }
    if (actionId === 'WELLNESS_GOOD' || actionId === 'WELLNESS_OK') {
      enqueueOfflineAction('WELLNESS_CHECKIN', { mood: actionId === 'WELLNESS_GOOD' ? 5 : 3 });
      Alert.alert('HAVEN', actionId === 'WELLNESS_GOOD' ? t('actions.wellness_good.alert') : t('actions.wellness_ok.alert'));
      return;
    }
    if (actionId === 'COGNITIVE') {
      Alert.alert('HAVEN', t('actions.cognitive.alert'));
      return;
    }
    if (actionId === 'MODE_ELDER' || actionId === 'MODE_FAMILY' || actionId === 'MODE_CARER') {
      Alert.alert('HAVEN', t('actions.mode_switch.alert'));
      return;
    }
    if (actionId.startsWith('CONSENT_ACCEPT:')) {
      const packKey = actionId.split(':')[1];
      enqueueOfflineAction('CONSENT_PACK_DECIDE', { pack_key: packKey, decision: 'accepted' });
      // Fallback description: Akkoord / Accepted
      Alert.alert('HAVEN', t('actions.consent_accept.alert', { packKey }));
      return;
    }
    if (actionId.startsWith('CONSENT_DECLINE:')) {
      const packKey = actionId.split(':')[1];
      enqueueOfflineAction('CONSENT_PACK_DECIDE', { pack_key: packKey, decision: 'declined' });
      Alert.alert('HAVEN', t('actions.consent_decline.alert'));
      return;
    }
    if (actionId.startsWith('CONSENT_DEFER:')) {
      const packKey = actionId.split(':')[1];
      enqueueOfflineAction('CONSENT_PACK_DECIDE', { pack_key: packKey, decision: 'deferred' });
      // Fallback description: Later / oké
      Alert.alert('HAVEN', t('actions.consent_defer.alert'));
      return;
    }
    if (actionId.startsWith('CALL_ANSWER:')) {
      const sessionId = actionId.split(':')[1];
      if (!client) {
        Alert.alert('HAVEN', t('actions.signin_required.alert'));
        return;
      }
      try {
        const videoCallJoinToken = await client.screenData({ elder_id: DEMO_ELDER_ID, screen_id: 'INCOMING_CALL', locale: 'nl-NL' });
        Alert.alert('HAVEN', t('actions.call_answered.alert', { sessionId }));
      } catch (error) {
        Alert.alert(t('haven_explanation_title'), translateElderError(error));
      }
      return;
    }
    if (actionId.startsWith('CALL_DECLINE:')) {
      const sessionId = actionId.split(':')[1];
      if (client) {
        try {
          await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/fn-video-call-end`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${session?.access_token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ session_id: sessionId }),
          });
        } catch (_) {}
      }
      Alert.alert('HAVEN', t('actions.call_declined.alert', { sessionId }));
      return;
    }
    if (actionId.startsWith('CHECKIN:')) {
      const parts = actionId.split(':');
      const period = parts[1] ?? 'morning';
      const mood = parts[2] ?? '3';
      enqueueOfflineAction('DAILY_CHECKIN', { period, mood_score: Number(mood) });
      Alert.alert('HAVEN', t('actions.checkin_received.alert', { period }));
      return;
    }

    // === NEW: Unified Daily Rhythm Flow ===
    if (actionId === 'START_DAILY_RHYTHM') {
      Alert.alert('HAVEN', t('actions.daily_rhythm.start'));
      // In a real implementation, this would open a guided modal with 3 steps
      // For now we trigger the first check-in
      enqueueOfflineAction('DAILY_CHECKIN', { period: 'morning', mood_score: 4 });
      return;
    }

    // === Memory Recap: "What did I do yesterday?" ===
    if (actionId === 'MEMORY_RECAP_YESTERDAY') {
      Alert.alert('HAVEN', t('actions.memory_recap.alert'));
      // In a full implementation, this would fetch and display recent companion memories
      return;
    }
    if (actionId.startsWith('CONFIRM_MED:')) {
      const medId = actionId.split(':')[1];
      enqueueOfflineAction('CONFIRM_MEDICATION', { medication_id: medId, status: 'medication_taken' });
      Alert.alert('HAVEN', t('actions.confirm_med.alert'));
      return;
    }
    if (actionId.startsWith('DENY_MED:')) {
      const medId = actionId.split(':')[1];
      enqueueOfflineAction('DENY_MEDICATION', { medication_id: medId });
      Alert.alert('HAVEN', t('actions.deny_med.alert'));
      return;
    }
    if (actionId === 'FALL_OK:' || actionId.startsWith('FALL_OK:')) {
      enqueueOfflineAction('FALL_RESPONSE', { status: 'ok', fall_response: 'self_resolved' });
      Alert.alert('HAVEN', t('actions.fall_ok.alert'));
      return;
    }
    if (actionId === 'FALL_HELP:' || actionId.startsWith('FALL_HELP:')) {
      enqueueOfflineAction('FALL_RESPONSE', { status: 'help_needed', fall_response: 'escalated' });
      Alert.alert('HAVEN', t('actions.fall_help.alert'));
      return;
    }
    if (actionId.startsWith('TAKE:')) {
      const medicationId = actionId.split(':')[1];
      if (!client) {
        enqueueOfflineAction('CONFIRM_MEDICATION', { medication_id: medicationId, screen_id: screenId });
        Alert.alert('HAVEN', t('actions.take_offline.alert'));
        return;
      }
      try {
        await client.voice({ elder_id: DEMO_ELDER_ID, screen_id: 'PILLS', transcript_text: 'I took it', locale: 'en-GB' });
        Alert.alert('HAVEN', t('actions.take_success.alert'));
      } catch (error) {
        if (classifyNetworkError(error) === 'offline') {
          enqueueOfflineAction('CONFIRM_MEDICATION', { medication_id: medicationId, screen_id: screenId });
          Alert.alert('HAVEN', t('actions.take_offline_fallback.alert'));
          return;
        }
        Alert.alert(t('haven_explanation_title'), translateElderError(error));
      }
      return;
    }
    if (actionId.startsWith('SNOOZE:')) {
      enqueueOfflineAction('SNOOZE_MEDICATION', { medication_id: actionId.split(':')[1], delay_minutes: 15 });
      Alert.alert('HAVEN', t('actions.snooze.alert'));
      return;
    }
    if (!client) {
      Alert.alert('HAVEN', t('actions.live_signin_required.alert'));
      return;
    }
    try {
      if (screenId === 'PILLS') await client.voice({ elder_id: DEMO_ELDER_ID, screen_id: 'PILLS', transcript_text: 'I took it', locale: 'en-GB' });
      else if (screenId === 'TODAY') await client.screenData({ elder_id: DEMO_ELDER_ID, screen_id: 'TODAY', locale: 'en-GB' });
      else await client.screenData({ elder_id: DEMO_ELDER_ID, screen_id: screenId, locale: 'en-GB' });
      Alert.alert('HAVEN', t('actions.action_completed.alert', { actionId }));
    } catch (error) {
      Alert.alert(t('haven_explanation_title'), translateElderError(error));
    }
  }, [client, screenId, t]);

  return { handlePrimaryAction };
}
