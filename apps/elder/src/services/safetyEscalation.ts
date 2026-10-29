/**
 * What the elder app must do with a voice-pipeline answer.
 *
 * The app used to treat every reply identically:
 *
 *     const message = response.response_text || voiceFallback;
 *     Alert.alert('HAVEN', message);
 *
 * fn-voice-pipeline returns `distress_detected` (crisis), `intent`
 * ('hijacking_attempt', 'clarification_needed') and `action_taken`
 * ('PIPELINE_HALTED', 'AWAIT_REPEAT_BACK', …), and the app ignored all of them. So a
 * fall or a cry for help produced the same neutral text bubble as "I took my pills",
 * with no help affordance, no call button and nothing that survives a screen reader
 * reading only the first line. This module is the decision layer; it is pure so the
 * escalation ladder can be tested without a device.
 *
 * Escalation ladder (highest wins):
 *   crisis      → show help, offer an immediate call, keep the message on screen
 *   blocked     → calm refusal, no medication action
 *   clarify     → ask again (repeat-back), never assume confirmation
 *   unavailable → retry prompt (STT failed), never a guessed transcript
 *   medication  → repeat-back confirmation prompt
 *   normal      → plain reply
 */

import { detectCrisisPhrase } from './crisis';

export type EscalationLevel = 'crisis' | 'blocked' | 'clarify' | 'unavailable' | 'medication' | 'normal';

export interface VoiceAnswer {
  response_text?: string | null;
  intent?: string | null;
  action_taken?: string | null;
  distress_detected?: boolean | null;
  transcript?: string | null;
  audio_url?: string | null;
}

export interface Escalation {
  level: EscalationLevel;
  /** Text to present to the older adult. Always non-empty. */
  message: string;
  /** Emergency affordances to surface immediately. */
  actions: Array<'show_help' | 'call_family' | 'call_emergency'>;
  /** Speak the message without waiting for a tap (crisis only). */
  speakImmediately: boolean;
  /** True when the caller may simply retry the same request. */
  retryable: boolean;
}

const CRISIS_ACTIONS: Escalation['actions'] = ['show_help', 'call_family', 'call_emergency'];

const COPY = {
  crisisNl: 'Ik blijf bij u. Ik waarschuw nu uw familie. Wilt u dat ik iemand bel?',
  crisisEn: 'I am staying with you. I am alerting your family now. Shall I call someone?',
  blockedNl: 'Dat kan ik niet doen. Ik laat uw medicatie met rust.',
  blockedEn: 'I cannot do that. I will leave your medication alone.',
  clarifyNl: 'Ik wil het graag goed begrijpen. Kunt u het nog één keer rustig zeggen?',
  clarifyEn: 'I want to be sure I understand. Could you say that once more, calmly?',
  unavailableNl: 'Ik kon u niet verstaan. Probeer het alstublieft nog een keer.',
  unavailableEn: 'I could not hear you clearly. Please try again.',
  medicationNl: 'Ik heb u gehoord. Klopt het dat u uw medicijn heeft ingenomen? Zeg ja of nee.',
  medicationEn: 'I heard you. Did you take your medicine? Please say yes or no.',
  normalNl: 'Ik ben bij u.',
  normalEn: 'I am here with you.',
} as const;

type Locale = 'nl-NL' | 'en-GB' | 'en-US';

const pick = (locale: Locale, nl: string, en: string) => (locale === 'nl-NL' ? nl : en);

/**
 * Decides how the app responds to one voice-pipeline answer.
 *
 * `distress_detected` from the server is authoritative, but a locally detected
 * crisis phrase still escalates: if the server mis-scored the transcript, the app
 * must not be the reason an older adult gets no help. (Defence in depth, not a
 * substitute for the server.)
 */
export function decideEscalation(answer: VoiceAnswer | null | undefined, locale: Locale = 'nl-NL'): Escalation {
  if (!answer) {
    return {
      level: 'unavailable',
      message: pick(locale, COPY.unavailableNl, COPY.unavailableEn),
      actions: [],
      speakImmediately: false,
      retryable: true,
    };
  }

  const transcript = typeof answer.transcript === 'string' ? answer.transcript : '';
  const localCrisis = transcript ? detectCrisisPhrase(transcript).distressDetected : false;
  const serverCrisis = answer.distress_detected === true || answer.intent === 'crisis';

  if (serverCrisis || localCrisis) {
    return {
      level: 'crisis',
      message: answer.response_text?.trim() || pick(locale, COPY.crisisNl, COPY.crisisEn),
      actions: CRISIS_ACTIONS,
      speakImmediately: true,
      retryable: false,
    };
  }

  if (answer.intent === 'hijacking_attempt' || answer.action_taken === 'PIPELINE_HALTED') {
    return {
      level: 'blocked',
      message: answer.response_text?.trim() || pick(locale, COPY.blockedNl, COPY.blockedEn),
      actions: [],
      speakImmediately: false,
      retryable: false,
    };
  }

  if (answer.intent === 'clarification_needed' || answer.action_taken === 'CLARIFICATION_REQUESTED') {
    return {
      level: 'clarify',
      message: answer.response_text?.trim() || pick(locale, COPY.clarifyNl, COPY.clarifyEn),
      actions: [],
      speakImmediately: false,
      retryable: true,
    };
  }

  if (answer.intent === 'bevestig_ingenomen' || answer.action_taken === 'AWAIT_REPEAT_BACK') {
    return {
      level: 'medication',
      message: answer.response_text?.trim() || pick(locale, COPY.medicationNl, COPY.medicationEn),
      actions: [],
      speakImmediately: false,
      retryable: false,
    };
  }

  return {
    level: 'normal',
    message: answer.response_text?.trim() || pick(locale, COPY.normalNl, COPY.normalEn),
    actions: [],
    speakImmediately: false,
    retryable: false,
  };
}

/** Maps a transport failure onto the same ladder, so error handling is uniform. */
export function decideEscalationForError(error: unknown, locale: Locale = 'nl-NL'): Escalation {
  const status = Number((error as { status?: unknown })?.status ?? (error as { statusCode?: unknown })?.statusCode);
  if (status === 503) {
    return {
      level: 'unavailable',
      message: pick(locale, COPY.unavailableNl, COPY.unavailableEn),
      actions: [],
      speakImmediately: false,
      retryable: true,
    };
  }
  if (status === 429) {
    return {
      level: 'unavailable',
      message: pick(locale, 'Het is nu even druk. Probeer het over een minuut opnieuw.', 'It is busy right now. Please try again in a minute.'),
      actions: [],
      speakImmediately: false,
      retryable: true,
    };
  }
  return {
    level: 'unavailable',
    message: pick(locale, 'Er ging iets mis. Probeer het alstublieft nog een keer.', 'Something went wrong. Please try again.'),
    actions: [],
    speakImmediately: false,
    retryable: true,
  };
}
