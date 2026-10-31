import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import { useTranslation } from '@haven/i18n';
import { useAuth } from '../auth/AuthProvider';
import { HavenClient } from '../services/havenClient';
import { enqueueOfflineAction } from '../services/sqliteOfflineQueue';
import { classifyNetworkError } from '../state/networkResilience';
import { translateElderError } from '../services/errorMapper';

function sessionUserId(session: { access_token?: string } | null): string | null {
  const directUser = (session as unknown as { user?: { id?: string } } | null)?.user?.id;
  if (directUser) return directUser;
  const token = session?.access_token;
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload))?.sub ?? null;
  } catch {
    return null;
  }
}

export function useHavenActions(screenId: string) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const client = session ? new HavenClient({ supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!, accessToken: session.access_token }) : null;
  const elderId = sessionUserId(session);

  const handlePrimaryAction = useCallback(async (actionId: string) => {
    if (actionId === 'EMERGENCY') {
      Alert.alert('HAVEN', t('actions.emergency.alert'), [
        { text: t('actions.emergency.cancel'), style: 'cancel' },
        { text: t('actions.emergency.call'), onPress: () => { void Linking.openURL('tel:112').catch(() => Alert.alert('HAVEN', t('actions.emergency.failed'))); } },
      ]);
      return;
    }
    if (actionId === 'CALL_FAMILY') {
      Alert.alert('HAVEN', t('actions.call_family.alert'));
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
      enqueueOfflineAction('WELLNESS_CHECKIN', { elder_id: elderId, checkin_type: 'ad_hoc', mood_score: actionId === 'WELLNESS_GOOD' ? 5 : 1, captured_via: 'app' });
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
      enqueueOfflineAction('CONSENT_PACK_DECIDE', { elder_id: elderId, pack_key: packKey, decision: 'accepted' });
      // Fallback description: Akkoord / Accepted
      Alert.alert('HAVEN', t('actions.consent_accept.alert', { packKey }));
      return;
    }
    if (actionId.startsWith('CONSENT_DECLINE:')) {
      const packKey = actionId.split(':')[1];
      enqueueOfflineAction('CONSENT_PACK_DECIDE', { elder_id: elderId, pack_key: packKey, decision: 'declined' });
      Alert.alert('HAVEN', t('actions.consent_decline.alert'));
      return;
    }
    if (actionId.startsWith('CONSENT_DEFER:')) {
      const packKey = actionId.split(':')[1];
      enqueueOfflineAction('CONSENT_PACK_DECIDE', { elder_id: elderId, pack_key: packKey, decision: 'deferred' });
      // Fallback description: Later / oké
      Alert.alert('HAVEN', t('actions.consent_defer.alert'));
      return;
    }
    if (actionId.startsWith('CALL_ANSWER:')) {
      // A provider token alone is not a connected audio/video call. This build has no
      // media client, so fail visibly rather than marking a session joined without media.
      Alert.alert('HAVEN', t('actions.video_unavailable.alert'));
      return;
    }
    if (actionId.startsWith('CALL_DECLINE:')) {
      const sessionId = actionId.split(':')[1];
      if (!client || !sessionId) {
        Alert.alert('HAVEN', t('actions.signin_required.alert'));
        return;
      }
      try {
        const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/fn-video-call-end`, {
          method: 'POST',
          headers: { authorization: `Bearer ${session?.access_token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ video_call_session_id: sessionId }),
        });
        if (!response.ok) throw new Error('Could not decline call');
        Alert.alert('HAVEN', t('actions.call_declined.alert', { sessionId }));
      } catch (error) {
        Alert.alert(t('haven_explanation_title'), translateElderError(error));
      }
      return;
    }
    if (actionId.startsWith('TOGGLE_TASK:')) {
      const taskId = actionId.slice('TOGGLE_TASK:'.length);
      if (!client || !elderId || !taskId) {
        Alert.alert('HAVEN', t('actions.live_signin_required.alert'));
        return;
      }
      try {
        await client.completeTask(taskId);
      } catch (error) {
        Alert.alert(t('haven_explanation_title'), translateElderError(error));
      }
      return;
    }
    if (actionId.startsWith('CHECKIN:')) {
      const parts = actionId.split(':');
      const period = parts[1] ?? 'morning';
      const mood = parts[2] ?? '3';
      enqueueOfflineAction('DAILY_CHECKIN', { elder_id: elderId, checkin_type: period, mood_score: Number(mood), captured_via: 'app' });
      Alert.alert('HAVEN', t('actions.checkin_received.alert', { period }));
      return;
    }

    // === NEW: Unified Daily Rhythm Flow ===
    if (actionId === 'START_DAILY_RHYTHM') {
      // This used to enqueue a check-in with `mood_score: 4` — a number the elder never gave,
      // written into their record by a button labelled "start my day". A check-in with an
      // invented mood is worse than no check-in: it is clinical data that never happened.
      // Nothing is recorded here. The mood buttons on the today screen send the elder's own
      // answer as CHECKIN:<period>:<score>.
      Alert.alert('HAVEN', t('actions.daily_rhythm.start'));
      return;
    }

    // === Memory Recap: "What did I do yesterday?" ===
    if (actionId === 'MEMORY_RECAP_YESTERDAY') {
      Alert.alert('HAVEN', t('actions.memory_recap.alert'));
      // In a full implementation, this would fetch and display recent companion memories
      return;
    }
    // ── Answers to a prompt HAVEN is waiting on ─────────────────────────────
    //
    // These four used to go elsewhere, and both destinations were wrong:
    //
    //   • `CONFIRM_MED:` queued a medication confirmation that the dispatcher sent to the voice
    //     pipeline, which resolves no pending confirmation — so the row stayed open and the
    //     escalation sweep kept running against an elder who had already answered;
    //   • `FALL_OK:`/`FALL_HELP:` queued FALL_RESPONSE, which posts to fn-fall-event and inserts
    //     a **new** fall event. Telling HAVEN "I am fine" produced another fall alert.
    //
    // Both now answer the confirmation they were asked about, through the endpoint that owns
    // that row (`fn-pending-confirmation-respond`), which resolves the medication record or the
    // fall event as a side effect.
    if (actionId.startsWith('CONFIRM_MED:') || actionId.startsWith('DENY_MED:')) {
      const [prefix, confirmationId] = actionId.split(':');
      const taken = prefix === 'CONFIRM_MED';
      enqueueOfflineAction('CONFIRMATION_RESPOND', { elder_id: elderId, confirmation_id: confirmationId, resolution: taken });
      Alert.alert('HAVEN', taken ? t('actions.confirm_med.alert') : t('actions.deny_med.alert'));
      return;
    }
    if (actionId.startsWith('FALL_OK:') || actionId.startsWith('FALL_HELP:')) {
      const [prefix, confirmationId] = actionId.split(':');
      const isFine = prefix === 'FALL_OK';
      const payload = { elder_id: elderId, confirmation_id: confirmationId, resolution: isFine };
      if (isFine) {
        enqueueOfflineAction('CONFIRMATION_RESPOND', payload);
        Alert.alert('HAVEN', t('actions.fall_ok.alert'));
      } else {
        // Present the emergency dialler immediately, without waiting on any network call.
        Alert.alert('HAVEN', t('actions.fall_help.alert'), [
          { text: t('actions.emergency.cancel'), style: 'cancel' },
          { text: t('actions.emergency.call'), onPress: () => { void Linking.openURL('tel:112').catch(() => Alert.alert('HAVEN', t('actions.emergency.failed'))); } },
        ]);
        if (!client || !elderId) enqueueOfflineAction('CONFIRMATION_RESPOND', payload);
        else {
          try { await client.invoke('fn-pending-confirmation-respond', { confirmation_id: confirmationId, resolution: false }); }
          catch { enqueueOfflineAction('CONFIRMATION_RESPOND', payload); }
        }
      }
      return;
    }
    if (actionId.startsWith('TAKE:')) {
      const medicationId = actionId.split(':')[1];
      if (!elderId || !medicationId) {
        Alert.alert('HAVEN', t('actions.live_signin_required.alert'));
        return;
      }
      if (!client) {
        enqueueOfflineAction('CONFIRM_MEDICATION', { elder_id: elderId, medication_id: medicationId, screen_id: screenId });
        Alert.alert('HAVEN', t('actions.take_offline.alert'));
        return;
      }
      try {
        if (!elderId) throw new Error('Missing elder profile for signed-in session');
        const result = await client.voice({ elder_id: elderId, screen_id: 'PILLS', medication_action: 'taken', medication_reminder_id: medicationId });
        if (result.action_taken !== 'AWAIT_REPEAT_BACK') throw new Error('Medication confirmation was not created');
        Alert.alert('HAVEN', result.response_text);
      } catch (error) {
        if (classifyNetworkError(error) === 'offline') {
          enqueueOfflineAction('CONFIRM_MEDICATION', { elder_id: elderId, medication_id: medicationId, screen_id: screenId });
          Alert.alert('HAVEN', t('actions.take_offline_fallback.alert'));
          return;
        }
        Alert.alert(t('haven_explanation_title'), translateElderError(error));
      }
      return;
    }
    if (actionId.startsWith('SNOOZE:')) {
      // Snooze used to be queued unconditionally and delivered as the sentence "I did not take
      // it", which the pipeline classifies on "took" — pressing snooze therefore asked the elder
      // to confirm they *had* taken it. The reminder id now travels in its own field.
      const reminderId = actionId.split(':')[1];
      if (!client) {
        enqueueOfflineAction('SNOOZE_MEDICATION', { elder_id: elderId, medication_id: reminderId, delay_minutes: 15 });
        Alert.alert('HAVEN', t('actions.snooze.alert'));
        return;
      }
      try {
        if (!elderId) throw new Error('Missing elder profile for signed-in session');
        await client.voice({ elder_id: elderId, screen_id: 'PILLS', snooze_reminder_id: reminderId, snooze_minutes: 15, locale: 'en-GB' });
        Alert.alert('HAVEN', t('actions.snooze.alert'));
      } catch (error) {
        if (classifyNetworkError(error) === 'offline') {
          enqueueOfflineAction('SNOOZE_MEDICATION', { elder_id: elderId, medication_id: reminderId, delay_minutes: 15 });
          Alert.alert('HAVEN', t('actions.snooze.alert'));
          return;
        }
        Alert.alert(t('haven_explanation_title'), translateElderError(error));
      }
      return;
    }
    if (!client) {
      Alert.alert('HAVEN', t('actions.live_signin_required.alert'));
      return;
    }
    try {
      if (!elderId) throw new Error('Missing elder profile for signed-in session');
      if (screenId === 'PILLS') await client.voice({ elder_id: elderId, screen_id: 'PILLS', transcript_text: 'I took it', locale: 'en-GB' });
      else if (screenId === 'TODAY') await client.screenData({ elder_id: elderId, screen_id: 'TODAY', locale: 'en-GB' });
      else await client.screenData({ elder_id: elderId, screen_id: screenId, locale: 'en-GB' });
      Alert.alert('HAVEN', t('actions.action_completed.alert', { actionId }));
    } catch (error) {
      Alert.alert(t('haven_explanation_title'), translateElderError(error));
    }
  }, [client, elderId, screenId, t]);

  return { handlePrimaryAction };
}
