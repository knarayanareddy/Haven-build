export type Locale = 'en-GB' | 'nl-NL';
export type UserRole = 'elder' | 'family' | 'carer' | 'admin';
export type AlertLevel = 'none' | 'amber' | 'rood' | 'zwart';
export type ReminderStatus = 'gepland' | 'herinnerd' | 'gesnoozed_1' | 'gesnoozed_2' | 'geëscaleerd' | 'ingenomen' | 'laat_ingenomen' | 'gemist' | 'overgeslagen';
export type MemoryType = 'personal_fact' | 'preference' | 'recurring_event' | 'life_event' | 'emotional_state' | 'medical_context';
export type ConnectionStatus = 'pending_initiator' | 'pending_recipient' | 'accepted' | 'declined' | 'withdrawn' | 'ended';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  preferred_name: string | null;
  locale: Locale;
  timezone: 'Europe/Amsterdam';
  high_contrast: boolean;
  font_size_multiplier: number;
}

export interface Medication {
  id: string;
  elder_id: string;
  name_nl: string;
  name_en: string | null;
  dose_description_nl: string;
  dose_description_en: string | null;
  schedule_times: string[];
  is_active: boolean;
}

export interface MedicationReminder {
  id: string;
  medication_id: string;
  elder_id: string;
  scheduled_time: string;
  status: ReminderStatus;
  snooze_count: number;
  confirmed_at: string | null;
}

export interface ScamPipelineInput {
  elder_id: string;
  channel: 'phone' | 'sms' | 'whatsapp' | 'email' | 'web' | 'in_person' | 'post';
  signal_reference: string;
  raw_content: string;
  contact_id?: string;
}

export interface ScamPipelineOutput {
  scam_event_id: string;
  alert_level: AlertLevel;
  composite_score: number;
  layer_scores: {
    reputation: number;
    pattern: number;
    nlp_intent: number;
    longitudinal: number;
  };
  explanation_nl: string;
  explanation_en: string;
  family_notified: boolean;
}

export interface VoicePipelineInput {
  elder_id: string;
  screen_id: string;
  audio_base64?: string;
  transcript_text?: string;
  locale?: Locale;
  entities?: Record<string, string>;
}

export interface VoicePipelineOutput {
  transcript: string;
  intent: string;
  entities: Record<string, string>;
  response_text: string;
  audio_url: string | null;
  action_taken: string | null;
  distress_detected: boolean;
  interaction_id: string;
}

export interface BuurtDiscoverOutput {
  nearby_haven_users_count: number;
  shared_interest_matches: Array<{
    tag_key: string;
    label_nl: string;
    label_en: string;
    nearby_count: number;
  }>;
  suggested_events: Array<{
    id: string;
    title_nl: string;
    title_en: string | null;
    event_date: string;
    event_time: string | null;
    is_free: boolean;
  }>;
  walk_buddy_available: boolean;
}

export interface NotificationPayload {
  recipient_id: string;
  elder_id?: string;
  notification_type: string;
  title_nl: string;
  title_en?: string;
  body_nl: string;
  body_en?: string;
  data?: Record<string, string>;
}
