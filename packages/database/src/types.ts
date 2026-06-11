// Generated production DB type surface for HAVEN. Regenerate with Supabase CLI in a linked environment.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'elder' | 'family' | 'carer' | 'admin';
export type AlertLevel = 'none' | 'amber' | 'rood' | 'zwart';
export type ReminderStatus = 'gepland' | 'herinnerd' | 'gesnoozed_1' | 'gesnoozed_2' | 'geëscaleerd' | 'ingenomen' | 'laat_ingenomen' | 'gemist' | 'overgeslagen';
export type ConnectionStatus = 'pending_initiator' | 'pending_recipient' | 'accepted' | 'declined' | 'withdrawn' | 'ended';

export interface Database {
  public: {
    Tables: {
      profiles: { Row: { id: string; role: UserRole; full_name: string; preferred_name: string | null; locale: string; timezone: string; deleted_at: string | null } };
      elder_profiles: { Row: { id: string; elder_id: string; safe_zone_radius_m: number | null; medical_summary_nl: string | null; deleted_at: string | null } };
      family_relationships: { Row: { id: string; elder_id: string; family_member_id: string; elder_consented: boolean; is_active: boolean; can_view_medications: boolean; can_view_messages: boolean; can_view_location_events: boolean; can_view_alerts: boolean; can_view_stories: boolean; can_view_financials: boolean } };
      carer_relationships: { Row: { id: string; elder_id: string; carer_member_id: string; elder_consented: boolean; is_active: boolean } };
      medications: { Row: { id: string; elder_id: string; name_nl: string; name_en: string | null; dose_description_nl: string; schedule_times: string[]; is_active: boolean; deleted_at: string | null } };
      medication_reminders: { Row: { id: string; medication_id: string; elder_id: string; scheduled_time: string; status: ReminderStatus; snooze_count: number } };
      scam_events: { Row: { id: string; elder_id: string; alert_level: AlertLevel; score_composite: number; explanation_nl: string; deleted_at: string | null } };
      location_events: { Row: { id: string; elder_id: string; event_type: string; location_fuzzed: unknown; location_precise?: never; deleted_at: string | null } };
      companion_memory: { Row: { id: string; elder_id: string; memory_type: string; content_nl: string; importance_score: number; deleted_at: string | null } };
      neighbourhood_profiles: { Row: { id: string; elder_id: string; postcode_pc4: string; is_active: boolean; family_can_see_connections: boolean; deleted_at: string | null } };
      notifications: { Row: { id: string; recipient_id: string; elder_id: string | null; notification_type: string; title_nl: string; body_nl: string; read: boolean } };
      audit_log: { Row: { id: number; actor_id: string | null; action: string; table_name: string; record_id: string | null; elder_id: string | null; created_at: string } };
    };
    Functions: {
      family_dashboard_summary: { Args: { p_elder_id: string }; Returns: Json };
      get_emergency_profile: { Args: { p_token: string }; Returns: Json };
      export_elder_data: { Args: { p_elder_id: string }; Returns: Json };
      match_companion_memory: { Args: { p_elder_id: string; p_query_embedding: number[]; p_match_threshold?: number; p_match_count?: number }; Returns: Json[] };
      evaluate_feature_flag: { Args: { p_flag_key: string; p_elder_id: string }; Returns: boolean };
    };
  };
}
