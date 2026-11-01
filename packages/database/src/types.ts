export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_events: {
        Row: {
          elder_id: string | null
          event_name: string
          id: string
          occurred_at: string
          profile_id: string | null
          properties: Json
          surface: string
        }
        Insert: {
          elder_id?: string | null
          event_name: string
          id?: string
          occurred_at?: string
          profile_id?: string | null
          properties?: Json
          surface: string
        }
        Update: {
          elder_id?: string | null
          event_name?: string
          id?: string
          occurred_at?: string
          profile_id?: string | null
          properties?: Json
          surface?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "app_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "app_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_release_checks: {
        Row: {
          check_key: string
          check_name: string
          created_at: string
          evidence_path: string | null
          id: string
          notes: string | null
          release_version: string
          reviewed_at: string | null
          reviewed_by_id: string | null
          status: Database["public"]["Enums"]["release_check_status"]
          updated_at: string
        }
        Insert: {
          check_key: string
          check_name: string
          created_at?: string
          evidence_path?: string | null
          id?: string
          notes?: string | null
          release_version: string
          reviewed_at?: string | null
          reviewed_by_id?: string | null
          status?: Database["public"]["Enums"]["release_check_status"]
          updated_at?: string
        }
        Update: {
          check_key?: string
          check_name?: string
          created_at?: string
          evidence_path?: string | null
          id?: string
          notes?: string | null
          release_version?: string
          reviewed_at?: string | null
          reviewed_by_id?: string | null
          status?: Database["public"]["Enums"]["release_check_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_release_checks_reviewed_by_id_fkey"
            columns: ["reviewed_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "app_release_checks_reviewed_by_id_fkey"
            columns: ["reviewed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string
          created_by_id: string | null
          deleted_at: string | null
          elder_id: string
          ends_at: string | null
          id: string
          is_medical: boolean
          location_label: string | null
          medmij_reference: string | null
          provider_name: string | null
          provider_phone: string | null
          source: string | null
          starts_at: string
          title_en: string | null
          title_nl: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_id?: string | null
          deleted_at?: string | null
          elder_id: string
          ends_at?: string | null
          id?: string
          is_medical?: boolean
          location_label?: string | null
          medmij_reference?: string | null
          provider_name?: string | null
          provider_phone?: string | null
          source?: string | null
          starts_at: string
          title_en?: string | null
          title_nl: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_id?: string | null
          deleted_at?: string | null
          elder_id?: string
          ends_at?: string | null
          id?: string
          is_medical?: boolean
          location_label?: string | null
          medmij_reference?: string | null
          provider_name?: string | null
          provider_phone?: string | null
          source?: string | null
          starts_at?: string
          title_en?: string | null
          title_nl?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "appointments_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "appointments_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          created_at: string
          elder_id: string | null
          extra: Json | null
          id: number
          ip_address_hash: string | null
          record_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string
          elder_id?: string | null
          extra?: Json | null
          id?: number
          ip_address_hash?: string | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string
          elder_id?: string | null
          extra?: Json | null
          id?: number
          ip_address_hash?: string | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      bereavement_events: {
        Row: {
          created_at: string
          date_of_death: string | null
          deceased_name: string
          deleted_at: string | null
          elder_id: string
          family_notified_at: string | null
          id: string
          logged_by_id: string
          relationship_to_elder: string | null
          resources_offered: boolean
          tone_adjustment_active: boolean
          tone_adjustment_until: string | null
        }
        Insert: {
          created_at?: string
          date_of_death?: string | null
          deceased_name: string
          deleted_at?: string | null
          elder_id: string
          family_notified_at?: string | null
          id?: string
          logged_by_id: string
          relationship_to_elder?: string | null
          resources_offered?: boolean
          tone_adjustment_active?: boolean
          tone_adjustment_until?: string | null
        }
        Update: {
          created_at?: string
          date_of_death?: string | null
          deceased_name?: string
          deleted_at?: string | null
          elder_id?: string
          family_notified_at?: string | null
          id?: string
          logged_by_id?: string
          relationship_to_elder?: string | null
          resources_offered?: boolean
          tone_adjustment_active?: boolean
          tone_adjustment_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bereavement_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "bereavement_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bereavement_events_logged_by_id_fkey"
            columns: ["logged_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "bereavement_events_logged_by_id_fkey"
            columns: ["logged_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bereavement_resources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          phone: string | null
          provider: string
          resource_key: string
          title_en: string | null
          title_nl: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          provider: string
          resource_key: string
          title_en?: string | null
          title_nl: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          provider?: string
          resource_key?: string
          title_en?: string | null
          title_nl?: string
          url?: string | null
        }
        Relationships: []
      }
      browser_shield_events: {
        Row: {
          created_at: string
          deleted_at: string | null
          detected_patterns: string[]
          domain_hash: string
          elder_id: string
          explanation_en: string | null
          explanation_nl: string
          family_notified: boolean
          id: string
          linked_scam_event_id: string | null
          page_title: string | null
          risk_level: Database["public"]["Enums"]["browser_risk_level"]
          risk_score: number
          url_hash: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          detected_patterns?: string[]
          domain_hash: string
          elder_id: string
          explanation_en?: string | null
          explanation_nl: string
          family_notified?: boolean
          id?: string
          linked_scam_event_id?: string | null
          page_title?: string | null
          risk_level?: Database["public"]["Enums"]["browser_risk_level"]
          risk_score?: number
          url_hash: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          detected_patterns?: string[]
          domain_hash?: string
          elder_id?: string
          explanation_en?: string | null
          explanation_nl?: string
          family_notified?: boolean
          id?: string
          linked_scam_event_id?: string | null
          page_title?: string | null
          risk_level?: Database["public"]["Enums"]["browser_risk_level"]
          risk_score?: number
          url_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "browser_shield_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "browser_shield_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "browser_shield_events_linked_scam_event_id_fkey"
            columns: ["linked_scam_event_id"]
            isOneToOne: false
            referencedRelation: "scam_events"
            referencedColumns: ["id"]
          },
        ]
      }
      call_reputation_lookups: {
        Row: {
          cache_hit: boolean
          categories: string[]
          created_at: string
          elder_id: string | null
          explanation_en: string | null
          explanation_nl: string | null
          id: string
          phone_hash: string
          provider: string
          report_count: number
          reputation_score: number
        }
        Insert: {
          cache_hit?: boolean
          categories?: string[]
          created_at?: string
          elder_id?: string | null
          explanation_en?: string | null
          explanation_nl?: string | null
          id?: string
          phone_hash: string
          provider: string
          report_count?: number
          reputation_score: number
        }
        Update: {
          cache_hit?: boolean
          categories?: string[]
          created_at?: string
          elder_id?: string | null
          explanation_en?: string | null
          explanation_nl?: string | null
          id?: string
          phone_hash?: string
          provider?: string
          report_count?: number
          reputation_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_reputation_lookups_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "call_reputation_lookups_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      care_plan_items: {
        Row: {
          assigned_role: Database["public"]["Enums"]["user_role"] | null
          care_plan_id: string
          category: string
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          elder_id: string
          frequency: string | null
          id: string
          instruction_en: string | null
          instruction_nl: string
          updated_at: string
        }
        Insert: {
          assigned_role?: Database["public"]["Enums"]["user_role"] | null
          care_plan_id: string
          category: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          frequency?: string | null
          id?: string
          instruction_en?: string | null
          instruction_nl: string
          updated_at?: string
        }
        Update: {
          assigned_role?: Database["public"]["Enums"]["user_role"] | null
          care_plan_id?: string
          category?: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          frequency?: string | null
          id?: string
          instruction_en?: string | null
          instruction_nl?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_plan_items_care_plan_id_fkey"
            columns: ["care_plan_id"]
            isOneToOne: false
            referencedRelation: "care_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_plan_items_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "care_plan_items_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      care_plans: {
        Row: {
          approved_at: string | null
          approved_by_elder: boolean
          created_at: string
          created_by_id: string
          deleted_at: string | null
          elder_id: string
          goals_en: string[] | null
          goals_nl: string[] | null
          id: string
          review_due_date: string | null
          status: Database["public"]["Enums"]["care_plan_status"]
          title_en: string | null
          title_nl: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_elder?: boolean
          created_at?: string
          created_by_id: string
          deleted_at?: string | null
          elder_id: string
          goals_en?: string[] | null
          goals_nl?: string[] | null
          id?: string
          review_due_date?: string | null
          status?: Database["public"]["Enums"]["care_plan_status"]
          title_en?: string | null
          title_nl: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_elder?: boolean
          created_at?: string
          created_by_id?: string
          deleted_at?: string | null
          elder_id?: string
          goals_en?: string[] | null
          goals_nl?: string[] | null
          id?: string
          review_due_date?: string | null
          status?: Database["public"]["Enums"]["care_plan_status"]
          title_en?: string | null
          title_nl?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_plans_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "care_plans_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_plans_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "care_plans_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carer_handover_notes: {
        Row: {
          administered_at: string | null
          administered_medication_id: string | null
          appetite: number | null
          carer_id: string
          concerns_en: string | null
          concerns_nl: string | null
          created_at: string
          deleted_at: string | null
          elder_id: string
          id: string
          mobility: string | null
          mood: number | null
          notes_en: string | null
          notes_nl: string | null
          photo_path: string | null
          photo_paths: string[] | null
          visit_id: string | null
        }
        Insert: {
          administered_at?: string | null
          administered_medication_id?: string | null
          appetite?: number | null
          carer_id: string
          concerns_en?: string | null
          concerns_nl?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          id?: string
          mobility?: string | null
          mood?: number | null
          notes_en?: string | null
          notes_nl?: string | null
          photo_path?: string | null
          photo_paths?: string[] | null
          visit_id?: string | null
        }
        Update: {
          administered_at?: string | null
          administered_medication_id?: string | null
          appetite?: number | null
          carer_id?: string
          concerns_en?: string | null
          concerns_nl?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          id?: string
          mobility?: string | null
          mood?: number | null
          notes_en?: string | null
          notes_nl?: string | null
          photo_path?: string | null
          photo_paths?: string[] | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carer_handover_notes_administered_medication_id_fkey"
            columns: ["administered_medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carer_handover_notes_carer_id_fkey"
            columns: ["carer_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "carer_handover_notes_carer_id_fkey"
            columns: ["carer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carer_handover_notes_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "carer_handover_notes_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carer_handover_notes_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "carer_visit_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      carer_handover_recipients: {
        Row: {
          created_at: string
          family_member_id: string
          handover_id: string
          id: string
        }
        Insert: {
          created_at?: string
          family_member_id: string
          handover_id: string
          id?: string
        }
        Update: {
          created_at?: string
          family_member_id?: string
          handover_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carer_handover_recipients_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "carer_handover_recipients_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carer_handover_recipients_handover_id_fkey"
            columns: ["handover_id"]
            isOneToOne: false
            referencedRelation: "carer_handover_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carer_handover_recipients_handover_id_fkey"
            columns: ["handover_id"]
            isOneToOne: false
            referencedRelation: "effective_carer_handover_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      carer_relationships: {
        Row: {
          can_create_visit_logs: boolean | null
          can_file_incidents: boolean | null
          can_view_medications: boolean | null
          can_view_visit_logs: boolean | null
          carer_member_id: string
          carer_role: Database["public"]["Enums"]["carer_role"] | null
          created_at: string | null
          deleted_at: string | null
          elder_consented: boolean | null
          elder_consented_at: string | null
          elder_id: string
          id: string
          is_active: boolean | null
          notify_on_crisis: boolean | null
          organisation_nl: string | null
          role_label_nl: string | null
          updated_at: string | null
        }
        Insert: {
          can_create_visit_logs?: boolean | null
          can_file_incidents?: boolean | null
          can_view_medications?: boolean | null
          can_view_visit_logs?: boolean | null
          carer_member_id: string
          carer_role?: Database["public"]["Enums"]["carer_role"] | null
          created_at?: string | null
          deleted_at?: string | null
          elder_consented?: boolean | null
          elder_consented_at?: string | null
          elder_id: string
          id?: string
          is_active?: boolean | null
          notify_on_crisis?: boolean | null
          organisation_nl?: string | null
          role_label_nl?: string | null
          updated_at?: string | null
        }
        Update: {
          can_create_visit_logs?: boolean | null
          can_file_incidents?: boolean | null
          can_view_medications?: boolean | null
          can_view_visit_logs?: boolean | null
          carer_member_id?: string
          carer_role?: Database["public"]["Enums"]["carer_role"] | null
          created_at?: string | null
          deleted_at?: string | null
          elder_consented?: boolean | null
          elder_consented_at?: string | null
          elder_id?: string
          id?: string
          is_active?: boolean | null
          notify_on_crisis?: boolean | null
          organisation_nl?: string | null
          role_label_nl?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carer_relationships_carer_member_id_fkey"
            columns: ["carer_member_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "carer_relationships_carer_member_id_fkey"
            columns: ["carer_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carer_relationships_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "carer_relationships_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carer_visit_logs: {
        Row: {
          activities_nl: string[] | null
          carer_id: string
          check_in_time: string | null
          check_out_time: string | null
          concerns_nl: string | null
          created_at: string
          deleted_at: string | null
          elder_id: string
          follow_up_required: boolean
          id: string
          mood_observed: number | null
          observations_nl: string | null
          updated_at: string
          visit_date: string
        }
        Insert: {
          activities_nl?: string[] | null
          carer_id: string
          check_in_time?: string | null
          check_out_time?: string | null
          concerns_nl?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          follow_up_required?: boolean
          id?: string
          mood_observed?: number | null
          observations_nl?: string | null
          updated_at?: string
          visit_date: string
        }
        Update: {
          activities_nl?: string[] | null
          carer_id?: string
          check_in_time?: string | null
          check_out_time?: string | null
          concerns_nl?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          follow_up_required?: boolean
          id?: string
          mood_observed?: number | null
          observations_nl?: string | null
          updated_at?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "carer_visit_logs_carer_id_fkey"
            columns: ["carer_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "carer_visit_logs_carer_id_fkey"
            columns: ["carer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carer_visit_logs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "carer_visit_logs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_record_corrections: {
        Row: {
          corrected_at: string
          corrected_by_id: string
          corrected_payload: Json
          correction_reason: string
          id: string
          original_payload: Json
          record_id: string
          table_name: string
        }
        Insert: {
          corrected_at?: string
          corrected_by_id: string
          corrected_payload: Json
          correction_reason: string
          id?: string
          original_payload: Json
          record_id: string
          table_name: string
        }
        Update: {
          corrected_at?: string
          corrected_by_id?: string
          corrected_payload?: Json
          correction_reason?: string
          id?: string
          original_payload?: Json
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_record_corrections_corrected_by_id_fkey"
            columns: ["corrected_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "clinical_record_corrections_corrected_by_id_fkey"
            columns: ["corrected_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cognitive_checkins: {
        Row: {
          answer_nl: string | null
          checked_in_at: string
          confidence_score: number | null
          correct: boolean | null
          created_at: string
          elder_id: string
          expected_answer_nl: string | null
          id: string
          question_en: string | null
          question_nl: string
          rolling_score_7d: number | null
          significant_change: boolean
        }
        Insert: {
          answer_nl?: string | null
          checked_in_at?: string
          confidence_score?: number | null
          correct?: boolean | null
          created_at?: string
          elder_id: string
          expected_answer_nl?: string | null
          id?: string
          question_en?: string | null
          question_nl: string
          rolling_score_7d?: number | null
          significant_change?: boolean
        }
        Update: {
          answer_nl?: string | null
          checked_in_at?: string
          confidence_score?: number | null
          correct?: boolean | null
          created_at?: string
          elder_id?: string
          expected_answer_nl?: string | null
          id?: string
          question_en?: string | null
          question_nl?: string
          rolling_score_7d?: number | null
          significant_change?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cognitive_checkins_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "cognitive_checkins_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_event_sources: {
        Row: {
          base_url: string | null
          created_at: string
          id: string
          last_ingested_at: string | null
          source_key: string
          source_name: string
          source_type: string
          status: Database["public"]["Enums"]["partner_feed_status"]
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          id?: string
          last_ingested_at?: string | null
          source_key: string
          source_name: string
          source_type: string
          status?: Database["public"]["Enums"]["partner_feed_status"]
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          id?: string
          last_ingested_at?: string | null
          source_key?: string
          source_name?: string
          source_type?: string
          status?: Database["public"]["Enums"]["partner_feed_status"]
          updated_at?: string
        }
        Relationships: []
      }
      companion_memory: {
        Row: {
          content_en: string | null
          content_nl: string
          created_at: string | null
          deleted_at: string | null
          elder_id: string
          embedding: string | null
          expires_at: string | null
          id: string
          importance_score: number | null
          last_referenced: string | null
          memory_type: Database["public"]["Enums"]["memory_type"]
          source: string | null
          source_id: string | null
          updated_at: string | null
        }
        Insert: {
          content_en?: string | null
          content_nl: string
          created_at?: string | null
          deleted_at?: string | null
          elder_id: string
          embedding?: string | null
          expires_at?: string | null
          id?: string
          importance_score?: number | null
          last_referenced?: string | null
          memory_type: Database["public"]["Enums"]["memory_type"]
          source?: string | null
          source_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content_en?: string | null
          content_nl?: string
          created_at?: string | null
          deleted_at?: string | null
          elder_id?: string
          embedding?: string | null
          expires_at?: string | null
          id?: string
          importance_score?: number | null
          last_referenced?: string | null
          memory_type?: Database["public"]["Enums"]["memory_type"]
          source?: string | null
          source_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companion_memory_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "companion_memory_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_pack_status: {
        Row: {
          created_at: string
          decided_at: string | null
          elder_id: string
          id: string
          pack_key: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          elder_id: string
          id?: string
          pack_key: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          elder_id?: string
          id?: string
          pack_key?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_pack_status_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "consent_pack_status_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_pack_status_pack_key_fkey"
            columns: ["pack_key"]
            isOneToOne: false
            referencedRelation: "consent_packs"
            referencedColumns: ["pack_key"]
          },
        ]
      }
      consent_packs: {
        Row: {
          created_at: string
          description_en: string
          description_nl: string
          pack_key: string
          recommended_day: number
          title_en: string
          title_nl: string
        }
        Insert: {
          created_at?: string
          description_en: string
          description_nl: string
          pack_key: string
          recommended_day?: number
          title_en: string
          title_nl: string
        }
        Update: {
          created_at?: string
          description_en?: string
          description_nl?: string
          pack_key?: string
          recommended_day?: number
          title_en?: string
          title_nl?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          channel: string
          consent_type: string
          consent_version: string
          created_at: string
          delegate_id: string | null
          device_id: string | null
          elder_id: string
          granted: boolean
          granted_at: string
          id: string
          ip_address_hashed: string | null
          is_active: boolean | null
          withdrawn_at: string | null
        }
        Insert: {
          channel?: string
          consent_type: string
          consent_version?: string
          created_at?: string
          delegate_id?: string | null
          device_id?: string | null
          elder_id: string
          granted: boolean
          granted_at?: string
          id?: string
          ip_address_hashed?: string | null
          is_active?: boolean | null
          withdrawn_at?: string | null
        }
        Update: {
          channel?: string
          consent_type?: string
          consent_version?: string
          created_at?: string
          delegate_id?: string | null
          device_id?: string | null
          elder_id?: string
          granted?: boolean
          granted_at?: string
          id?: string
          ip_address_hashed?: string | null
          is_active?: boolean | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_delegate_id_fkey"
            columns: ["delegate_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "consent_records_delegate_id_fkey"
            columns: ["delegate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "consent_records_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string
          elder_id: string
          email_hashed: string | null
          grooming_risk_score: number | null
          id: string
          interaction_count: number
          is_trusted: boolean
          last_interaction_at: string | null
          notes: string | null
          phone_hashed: string | null
          relationship_label: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name: string
          elder_id: string
          email_hashed?: string | null
          grooming_risk_score?: number | null
          id?: string
          interaction_count?: number
          is_trusted?: boolean
          last_interaction_at?: string | null
          notes?: string | null
          phone_hashed?: string | null
          relationship_label?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          elder_id?: string
          email_hashed?: string | null
          grooming_risk_score?: number | null
          id?: string
          interaction_count?: number
          is_trusted?: boolean
          last_interaction_at?: string | null
          notes?: string | null
          phone_hashed?: string | null
          relationship_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "contacts_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_breach_incidents: {
        Row: {
          affected_data_categories: string[]
          affected_subject_count: number | null
          ap_notification_required: boolean | null
          ap_notified_at: string | null
          closed_at: string | null
          containment_action: string | null
          created_at: string
          detected_by_id: string | null
          dpo_profile_id: string | null
          id: string
          postmortem_path: string | null
          severity: string
          status: Database["public"]["Enums"]["breach_status"]
          summary: string
          updated_at: string
          users_notification_required: boolean | null
          users_notified_at: string | null
        }
        Insert: {
          affected_data_categories?: string[]
          affected_subject_count?: number | null
          ap_notification_required?: boolean | null
          ap_notified_at?: string | null
          closed_at?: string | null
          containment_action?: string | null
          created_at?: string
          detected_by_id?: string | null
          dpo_profile_id?: string | null
          id?: string
          postmortem_path?: string | null
          severity: string
          status?: Database["public"]["Enums"]["breach_status"]
          summary: string
          updated_at?: string
          users_notification_required?: boolean | null
          users_notified_at?: string | null
        }
        Update: {
          affected_data_categories?: string[]
          affected_subject_count?: number | null
          ap_notification_required?: boolean | null
          ap_notified_at?: string | null
          closed_at?: string | null
          containment_action?: string | null
          created_at?: string
          detected_by_id?: string | null
          dpo_profile_id?: string | null
          id?: string
          postmortem_path?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["breach_status"]
          summary?: string
          updated_at?: string
          users_notification_required?: boolean | null
          users_notified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_breach_incidents_detected_by_id_fkey"
            columns: ["detected_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "data_breach_incidents_detected_by_id_fkey"
            columns: ["detected_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_breach_incidents_dpo_profile_id_fkey"
            columns: ["dpo_profile_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "data_breach_incidents_dpo_profile_id_fkey"
            columns: ["dpo_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          completed_at: string | null
          confirmation_sent_at: string | null
          created_at: string
          elder_id: string
          id: string
          legal_hold_reason: string | null
          reason: string | null
          requested_at: string | null
          requested_by_id: string
          status: Database["public"]["Enums"]["deletion_request_status"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          elder_id: string
          id?: string
          legal_hold_reason?: string | null
          reason?: string | null
          requested_at?: string | null
          requested_by_id: string
          status?: Database["public"]["Enums"]["deletion_request_status"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          elder_id?: string
          id?: string
          legal_hold_reason?: string | null
          reason?: string | null
          requested_at?: string | null
          requested_by_id?: string
          status?: Database["public"]["Enums"]["deletion_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: true
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "deletion_requests_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deletion_requests_requested_by_id_fkey"
            columns: ["requested_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "deletion_requests_requested_by_id_fkey"
            columns: ["requested_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_health_events: {
        Row: {
          created_at: string
          details: Json
          device_session_id: string | null
          event_key: string
          id: string
          message_en: string | null
          message_nl: string
          profile_id: string
          severity: string
        }
        Insert: {
          created_at?: string
          details?: Json
          device_session_id?: string | null
          event_key: string
          id?: string
          message_en?: string | null
          message_nl: string
          profile_id: string
          severity: string
        }
        Update: {
          created_at?: string
          details?: Json
          device_session_id?: string | null
          event_key?: string
          id?: string
          message_en?: string | null
          message_nl?: string
          profile_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_health_events_device_session_id_fkey"
            columns: ["device_session_id"]
            isOneToOne: false
            referencedRelation: "device_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_health_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "device_health_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_sessions: {
        Row: {
          app_version: string | null
          battery_pct: number | null
          consecutive_auth_failures: number
          created_at: string
          device_id_hash: string
          device_label: string | null
          device_secret: string | null
          id: string
          is_low_power_mode: boolean | null
          last_background_refresh_ok: boolean | null
          last_error: string | null
          last_location_permission: string | null
          last_microphone_permission: string | null
          last_push_token_ok_at: string | null
          last_seen_at: string
          locale: string | null
          network_type: string | null
          os_version: string | null
          platform: string
          profile_id: string
          revoked_at: string | null
          timezone: string | null
        }
        Insert: {
          app_version?: string | null
          battery_pct?: number | null
          consecutive_auth_failures?: number
          created_at?: string
          device_id_hash: string
          device_label?: string | null
          device_secret?: string | null
          id?: string
          is_low_power_mode?: boolean | null
          last_background_refresh_ok?: boolean | null
          last_error?: string | null
          last_location_permission?: string | null
          last_microphone_permission?: string | null
          last_push_token_ok_at?: string | null
          last_seen_at?: string
          locale?: string | null
          network_type?: string | null
          os_version?: string | null
          platform: string
          profile_id: string
          revoked_at?: string | null
          timezone?: string | null
        }
        Update: {
          app_version?: string | null
          battery_pct?: number | null
          consecutive_auth_failures?: number
          created_at?: string
          device_id_hash?: string
          device_label?: string | null
          device_secret?: string | null
          id?: string
          is_low_power_mode?: boolean | null
          last_background_refresh_ok?: boolean | null
          last_error?: string | null
          last_location_permission?: string | null
          last_microphone_permission?: string | null
          last_push_token_ok_at?: string | null
          last_seen_at?: string
          locale?: string | null
          network_type?: string | null
          os_version?: string | null
          platform?: string
          profile_id?: string
          revoked_at?: string | null
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "device_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_telemetry_nonces: {
        Row: {
          device_session_id: string
          expires_at: string
          nonce: string
        }
        Insert: {
          device_session_id: string
          expires_at: string
          nonce: string
        }
        Update: {
          device_session_id?: string
          expires_at?: string
          nonce?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_telemetry_nonces_device_session_id_fkey"
            columns: ["device_session_id"]
            isOneToOne: false
            referencedRelation: "device_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_analysis_jobs: {
        Row: {
          bsn_detected: boolean
          created_at: string
          deleted_at: string | null
          doctor_questions_en: string[] | null
          doctor_questions_nl: string[] | null
          document_id: string | null
          elder_id: string
          id: string
          redaction_required: boolean
          status: Database["public"]["Enums"]["processing_job_status"]
          storage_path: string
          summary_en: string | null
          summary_nl: string | null
          updated_at: string
        }
        Insert: {
          bsn_detected?: boolean
          created_at?: string
          deleted_at?: string | null
          doctor_questions_en?: string[] | null
          doctor_questions_nl?: string[] | null
          document_id?: string | null
          elder_id: string
          id?: string
          redaction_required?: boolean
          status?: Database["public"]["Enums"]["processing_job_status"]
          storage_path: string
          summary_en?: string | null
          summary_nl?: string | null
          updated_at?: string
        }
        Update: {
          bsn_detected?: boolean
          created_at?: string
          deleted_at?: string | null
          doctor_questions_en?: string[] | null
          doctor_questions_nl?: string[] | null
          document_id?: string | null
          elder_id?: string
          id?: string
          redaction_required?: boolean
          status?: Database["public"]["Enums"]["processing_job_status"]
          storage_path?: string
          summary_en?: string | null
          summary_nl?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_analysis_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_analysis_jobs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "document_analysis_jobs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          document_type: string
          elder_id: string
          id: string
          in_emergency_profile: boolean
          is_sensitive_legal: boolean
          label_en: string | null
          label_nl: string
          storage_path: string
          summary_en: string | null
          summary_nl: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          document_type: string
          elder_id: string
          id?: string
          in_emergency_profile?: boolean
          is_sensitive_legal?: boolean
          label_en?: string | null
          label_nl: string
          storage_path: string
          summary_en?: string | null
          summary_nl?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          document_type?: string
          elder_id?: string
          id?: string
          in_emergency_profile?: boolean
          is_sensitive_legal?: boolean
          label_en?: string | null
          label_nl?: string
          storage_path?: string
          summary_en?: string | null
          summary_nl?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "documents_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_reputation_cache: {
        Row: {
          cached_at: string
          domain_age_days: number | null
          domain_display: string | null
          domain_hash: string
          expires_at: string
          id: string
          is_gov_lookalike: boolean
          is_known_scam: boolean
          reputation_score: number
          source: string
        }
        Insert: {
          cached_at?: string
          domain_age_days?: number | null
          domain_display?: string | null
          domain_hash: string
          expires_at?: string
          id?: string
          is_gov_lookalike?: boolean
          is_known_scam?: boolean
          reputation_score?: number
          source: string
        }
        Update: {
          cached_at?: string
          domain_age_days?: number | null
          domain_display?: string | null
          domain_hash?: string
          expires_at?: string
          id?: string
          is_gov_lookalike?: boolean
          is_known_scam?: boolean
          reputation_score?: number
          source?: string
        }
        Relationships: []
      }
      dpia_assessments: {
        Row: {
          assessment_key: string
          created_at: string
          deleted_at: string | null
          document_path: string | null
          dpo_profile_id: string | null
          id: string
          next_review_date: string | null
          notes: string | null
          residual_risk: string
          scope: string
          signed_at: string | null
          status: Database["public"]["Enums"]["compliance_record_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assessment_key: string
          created_at?: string
          deleted_at?: string | null
          document_path?: string | null
          dpo_profile_id?: string | null
          id?: string
          next_review_date?: string | null
          notes?: string | null
          residual_risk?: string
          scope: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["compliance_record_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assessment_key?: string
          created_at?: string
          deleted_at?: string | null
          document_path?: string | null
          dpo_profile_id?: string | null
          id?: string
          next_review_date?: string | null
          notes?: string | null
          residual_risk?: string
          scope?: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["compliance_record_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dpia_assessments_dpo_profile_id_fkey"
            columns: ["dpo_profile_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "dpia_assessments_dpo_profile_id_fkey"
            columns: ["dpo_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dpo_pii_incident_review: {
        Row: {
          flagged_at: string
          flagged_text: string
          id: string
          pii_type: string
          record_id: string
          table_name: string
        }
        Insert: {
          flagged_at?: string
          flagged_text: string
          id?: string
          pii_type: string
          record_id: string
          table_name: string
        }
        Update: {
          flagged_at?: string
          flagged_text?: string
          id?: string
          pii_type?: string
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      driving_events: {
        Row: {
          anomaly_description_en: string | null
          anomaly_description_nl: string | null
          anomaly_score: number
          created_at: string
          deleted_at: string | null
          elder_id: string
          elder_reviewed: boolean
          elder_reviewed_at: string | null
          elder_shared_with_family: boolean
          event_type: Database["public"]["Enums"]["driving_event_type"]
          family_notified_at: string | null
          id: string
          trip_duration_minutes: number | null
          trip_ended_at: string | null
          trip_started_at: string | null
        }
        Insert: {
          anomaly_description_en?: string | null
          anomaly_description_nl?: string | null
          anomaly_score?: number
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          elder_reviewed?: boolean
          elder_reviewed_at?: string | null
          elder_shared_with_family?: boolean
          event_type: Database["public"]["Enums"]["driving_event_type"]
          family_notified_at?: string | null
          id?: string
          trip_duration_minutes?: number | null
          trip_ended_at?: string | null
          trip_started_at?: string | null
        }
        Update: {
          anomaly_description_en?: string | null
          anomaly_description_nl?: string | null
          anomaly_score?: number
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          elder_reviewed?: boolean
          elder_reviewed_at?: string | null
          elder_shared_with_family?: boolean
          event_type?: Database["public"]["Enums"]["driving_event_type"]
          family_notified_at?: string | null
          id?: string
          trip_duration_minutes?: number | null
          trip_ended_at?: string | null
          trip_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driving_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "driving_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_baselines: {
        Row: {
          avg_daily_checkins: number | null
          avg_daily_voice_interactions: number | null
          avg_response_latency_seconds: number | null
          elder_id: string
          typical_active_hours: Json | null
          updated_at: string
        }
        Insert: {
          avg_daily_checkins?: number | null
          avg_daily_voice_interactions?: number | null
          avg_response_latency_seconds?: number | null
          elder_id: string
          typical_active_hours?: Json | null
          updated_at?: string
        }
        Update: {
          avg_daily_checkins?: number | null
          avg_daily_voice_interactions?: number | null
          avg_response_latency_seconds?: number | null
          elder_id?: string
          typical_active_hours?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "elder_baselines_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: true
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "elder_baselines_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_interest_tags: {
        Row: {
          created_at: string | null
          elder_id: string
          id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          elder_id: string
          id?: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          elder_id?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "elder_interest_tags_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "elder_interest_tags_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elder_interest_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "interest_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_profiles: {
        Row: {
          allergies_nl: string[] | null
          bereavement_active: boolean | null
          bereavement_since: string | null
          cognitive_support: boolean | null
          conditions_nl: string[] | null
          created_at: string | null
          deleted_at: string | null
          elder_id: string
          emergency_contacts: Json | null
          font_scale: number | null
          high_contrast: boolean | null
          huisarts_name: string | null
          huisarts_phone: string | null
          id: string
          medical_summary_nl: string | null
          night_mode_active: boolean | null
          night_mode_end: string | null
          night_mode_start: string | null
          safe_zone_centre: unknown
          safe_zone_label_nl: string | null
          safe_zone_radius_m: number | null
          updated_at: string | null
        }
        Insert: {
          allergies_nl?: string[] | null
          bereavement_active?: boolean | null
          bereavement_since?: string | null
          cognitive_support?: boolean | null
          conditions_nl?: string[] | null
          created_at?: string | null
          deleted_at?: string | null
          elder_id: string
          emergency_contacts?: Json | null
          font_scale?: number | null
          high_contrast?: boolean | null
          huisarts_name?: string | null
          huisarts_phone?: string | null
          id?: string
          medical_summary_nl?: string | null
          night_mode_active?: boolean | null
          night_mode_end?: string | null
          night_mode_start?: string | null
          safe_zone_centre?: unknown
          safe_zone_label_nl?: string | null
          safe_zone_radius_m?: number | null
          updated_at?: string | null
        }
        Update: {
          allergies_nl?: string[] | null
          bereavement_active?: boolean | null
          bereavement_since?: string | null
          cognitive_support?: boolean | null
          conditions_nl?: string[] | null
          created_at?: string | null
          deleted_at?: string | null
          elder_id?: string
          emergency_contacts?: Json | null
          font_scale?: number | null
          high_contrast?: boolean | null
          huisarts_name?: string | null
          huisarts_phone?: string | null
          id?: string
          medical_summary_nl?: string | null
          night_mode_active?: boolean | null
          night_mode_end?: string | null
          night_mode_start?: string | null
          safe_zone_centre?: unknown
          safe_zone_label_nl?: string | null
          safe_zone_radius_m?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "elder_profiles_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: true
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "elder_profiles_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_voice_preferences: {
        Row: {
          disclosure_mode: string
          elder_id: string
          updated_at: string
          use_familiar_voice: boolean
          voice_profile_id: string | null
        }
        Insert: {
          disclosure_mode?: string
          elder_id: string
          updated_at?: string
          use_familiar_voice?: boolean
          voice_profile_id?: string | null
        }
        Update: {
          disclosure_mode?: string
          elder_id?: string
          updated_at?: string
          use_familiar_voice?: boolean
          voice_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "elder_voice_preferences_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: true
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "elder_voice_preferences_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elder_voice_preferences_voice_profile_id_fkey"
            columns: ["voice_profile_id"]
            isOneToOne: false
            referencedRelation: "voice_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_access_tokens: {
        Row: {
          created_at: string
          elder_id: string
          expires_at: string | null
          id: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          elder_id: string
          expires_at?: string | null
          id?: string
          label: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          elder_id?: string
          expires_at?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_access_tokens_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "emergency_access_tokens_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_profile_access_log: {
        Row: {
          accessed_at: string
          elder_id: string
          id: string
          ip_address_hash: string | null
          token_id: string | null
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          elder_id: string
          id?: string
          ip_address_hash?: string | null
          token_id?: string | null
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          elder_id?: string
          id?: string
          ip_address_hash?: string | null
          token_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_profile_access_log_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "emergency_profile_access_log_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_profile_access_log_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "emergency_access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      event_interests: {
        Row: {
          elder_id: string
          event_id: string
          id: string
          interested_at: string | null
        }
        Insert: {
          elder_id: string
          event_id: string
          id?: string
          interested_at?: string | null
        }
        Update: {
          elder_id?: string
          event_id?: string
          id?: string
          interested_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_interests_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "event_interests_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_interests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "neighbourhood_events"
            referencedColumns: ["id"]
          },
        ]
      }
      external_care_sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          elder_id: string
          error_message: string | null
          id: string
          organisation_nl: string
          records_pulled: number
          records_pushed: number
          started_at: string | null
          status: Database["public"]["Enums"]["integration_job_status"]
          system_name: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          error_message?: string | null
          id?: string
          organisation_nl: string
          records_pulled?: number
          records_pushed?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["integration_job_status"]
          system_name: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          error_message?: string | null
          id?: string
          organisation_nl?: string
          records_pulled?: number
          records_pushed?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["integration_job_status"]
          system_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_care_sync_jobs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "external_care_sync_jobs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fall_events: {
        Row: {
          confidence: number | null
          created_at: string
          detected_at: string
          detection_source: string
          device_session_id: string | null
          elder_ack_at: string | null
          elder_id: string
          escalation_claimed_at: string | null
          family_notified_at: string | null
          id: string
          resolution_notes: string | null
          status: Database["public"]["Enums"]["fall_status"]
          wearable_device_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          detected_at?: string
          detection_source: string
          device_session_id?: string | null
          elder_ack_at?: string | null
          elder_id: string
          escalation_claimed_at?: string | null
          family_notified_at?: string | null
          id?: string
          resolution_notes?: string | null
          status?: Database["public"]["Enums"]["fall_status"]
          wearable_device_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          detected_at?: string
          detection_source?: string
          device_session_id?: string | null
          elder_ack_at?: string | null
          elder_id?: string
          escalation_claimed_at?: string | null
          family_notified_at?: string | null
          id?: string
          resolution_notes?: string | null
          status?: Database["public"]["Enums"]["fall_status"]
          wearable_device_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fall_events_device_session_id_fkey"
            columns: ["device_session_id"]
            isOneToOne: false
            referencedRelation: "device_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "fall_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fall_events_wearable_device_id_fkey"
            columns: ["wearable_device_id"]
            isOneToOne: false
            referencedRelation: "wearable_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      family_messages: {
        Row: {
          content_en: string | null
          content_nl: string | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          elder_id: string
          id: string
          message_type: string
          photo_ttl_seconds: number | null
          read_at: string | null
          read_by_elder: boolean
          sender_id: string
          sender_role: Database["public"]["Enums"]["user_role"]
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          content_en?: string | null
          content_nl?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          elder_id: string
          id?: string
          message_type: string
          photo_ttl_seconds?: number | null
          read_at?: string | null
          read_by_elder?: boolean
          sender_id: string
          sender_role: Database["public"]["Enums"]["user_role"]
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          content_en?: string | null
          content_nl?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          elder_id?: string
          id?: string
          message_type?: string
          photo_ttl_seconds?: number | null
          read_at?: string | null
          read_by_elder?: boolean
          sender_id?: string
          sender_role?: Database["public"]["Enums"]["user_role"]
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_messages_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "family_messages_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "family_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_relationships: {
        Row: {
          can_view_alerts: boolean | null
          can_view_financials: boolean | null
          can_view_location_events: boolean | null
          can_view_medications: boolean | null
          can_view_messages: boolean | null
          can_view_stories: boolean | null
          created_at: string | null
          deleted_at: string | null
          elder_consented: boolean | null
          elder_consented_at: string | null
          elder_id: string
          family_member_id: string
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          notify_on_crisis: boolean | null
          notify_on_missed_meds: boolean | null
          notify_on_safe_zone_exit: boolean | null
          notify_on_scam_amber: boolean | null
          notify_on_scam_rood: boolean | null
          notify_on_scam_zwart: boolean | null
          relation_label_nl: string | null
          relation_type: Database["public"]["Enums"]["relationship_type"] | null
          updated_at: string | null
        }
        Insert: {
          can_view_alerts?: boolean | null
          can_view_financials?: boolean | null
          can_view_location_events?: boolean | null
          can_view_medications?: boolean | null
          can_view_messages?: boolean | null
          can_view_stories?: boolean | null
          created_at?: string | null
          deleted_at?: string | null
          elder_consented?: boolean | null
          elder_consented_at?: string | null
          elder_id: string
          family_member_id: string
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          notify_on_crisis?: boolean | null
          notify_on_missed_meds?: boolean | null
          notify_on_safe_zone_exit?: boolean | null
          notify_on_scam_amber?: boolean | null
          notify_on_scam_rood?: boolean | null
          notify_on_scam_zwart?: boolean | null
          relation_label_nl?: string | null
          relation_type?:
            | Database["public"]["Enums"]["relationship_type"]
            | null
          updated_at?: string | null
        }
        Update: {
          can_view_alerts?: boolean | null
          can_view_financials?: boolean | null
          can_view_location_events?: boolean | null
          can_view_medications?: boolean | null
          can_view_messages?: boolean | null
          can_view_stories?: boolean | null
          created_at?: string | null
          deleted_at?: string | null
          elder_consented?: boolean | null
          elder_consented_at?: string | null
          elder_id?: string
          family_member_id?: string
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          notify_on_crisis?: boolean | null
          notify_on_missed_meds?: boolean | null
          notify_on_safe_zone_exit?: boolean | null
          notify_on_scam_amber?: boolean | null
          notify_on_scam_rood?: boolean | null
          notify_on_scam_zwart?: boolean | null
          relation_label_nl?: string | null
          relation_type?:
            | Database["public"]["Enums"]["relationship_type"]
            | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_relationships_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "family_relationships_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_relationships_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "family_relationships_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string | null
          description: string | null
          elder_ids: string[] | null
          enabled: boolean | null
          flag_key: string
          id: string
          rollout_pct: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          elder_ids?: string[] | null
          enabled?: boolean | null
          flag_key: string
          id?: string
          rollout_pct?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          elder_ids?: string[] | null
          enabled?: boolean | null
          flag_key?: string
          id?: string
          rollout_pct?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      fhir_import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          elder_id: string
          error_message: string | null
          id: string
          provider: string
          resource_count: number
          resource_type: string
          started_at: string | null
          status: Database["public"]["Enums"]["integration_job_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          error_message?: string | null
          id?: string
          provider?: string
          resource_count?: number
          resource_type: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["integration_job_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          error_message?: string | null
          id?: string
          provider?: string
          resource_count?: number
          resource_type?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["integration_job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "fhir_import_jobs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "fhir_import_jobs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fhir_medication_staging: {
        Row: {
          created_at: string
          created_medication_id: string | null
          elder_id: string
          extracted_dosage_nl: string
          extracted_name_nl: string
          fhir_job_id: string | null
          id: string
          proposed_schedule_times: string[]
          raw_resource: Json
          resource_id_hash: string
          reviewed_at: string | null
          reviewed_by_id: string | null
          status: Database["public"]["Enums"]["fhir_staging_status"]
        }
        Insert: {
          created_at?: string
          created_medication_id?: string | null
          elder_id: string
          extracted_dosage_nl: string
          extracted_name_nl: string
          fhir_job_id?: string | null
          id?: string
          proposed_schedule_times?: string[]
          raw_resource: Json
          resource_id_hash: string
          reviewed_at?: string | null
          reviewed_by_id?: string | null
          status?: Database["public"]["Enums"]["fhir_staging_status"]
        }
        Update: {
          created_at?: string
          created_medication_id?: string | null
          elder_id?: string
          extracted_dosage_nl?: string
          extracted_name_nl?: string
          fhir_job_id?: string | null
          id?: string
          proposed_schedule_times?: string[]
          raw_resource?: Json
          resource_id_hash?: string
          reviewed_at?: string | null
          reviewed_by_id?: string | null
          status?: Database["public"]["Enums"]["fhir_staging_status"]
        }
        Relationships: [
          {
            foreignKeyName: "fhir_medication_staging_created_medication_id_fkey"
            columns: ["created_medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fhir_medication_staging_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "fhir_medication_staging_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fhir_medication_staging_fhir_job_id_fkey"
            columns: ["fhir_job_id"]
            isOneToOne: false
            referencedRelation: "fhir_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fhir_medication_staging_reviewed_by_id_fkey"
            columns: ["reviewed_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "fhir_medication_staging_reviewed_by_id_fkey"
            columns: ["reviewed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          account_id_masked: string
          alert_threshold_cents: number
          bank_name: string
          consent_expires_at: string | null
          consent_status: Database["public"]["Enums"]["financial_consent_status"]
          created_at: string
          deleted_at: string | null
          elder_id: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          account_id_masked: string
          alert_threshold_cents?: number
          bank_name: string
          consent_expires_at?: string | null
          consent_status?: Database["public"]["Enums"]["financial_consent_status"]
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          account_id_masked?: string
          alert_threshold_cents?: number
          bank_name?: string
          consent_expires_at?: string | null
          consent_status?: Database["public"]["Enums"]["financial_consent_status"]
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "financial_accounts_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          account_id_masked: string
          amount_cents: number
          anomaly_score: number | null
          bank_name: string | null
          counterparty_iban_masked: string | null
          counterparty_name: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          elder_id: string
          elder_reviewed: boolean | null
          financial_account_id: string | null
          flagged: boolean
          id: string
          intercept_status: string | null
          intercepted: boolean | null
          linked_scam_event_id: string | null
          raw_reference_hash: string | null
          source_provider: string | null
          transaction_date: string
          updated_at: string
        }
        Insert: {
          account_id_masked: string
          amount_cents: number
          anomaly_score?: number | null
          bank_name?: string | null
          counterparty_iban_masked?: string | null
          counterparty_name?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          elder_id: string
          elder_reviewed?: boolean | null
          financial_account_id?: string | null
          flagged?: boolean
          id?: string
          intercept_status?: string | null
          intercepted?: boolean | null
          linked_scam_event_id?: string | null
          raw_reference_hash?: string | null
          source_provider?: string | null
          transaction_date: string
          updated_at?: string
        }
        Update: {
          account_id_masked?: string
          amount_cents?: number
          anomaly_score?: number | null
          bank_name?: string | null
          counterparty_iban_masked?: string | null
          counterparty_name?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          elder_id?: string
          elder_reviewed?: boolean | null
          financial_account_id?: string | null
          flagged?: boolean
          id?: string
          intercept_status?: string | null
          intercepted?: boolean | null
          linked_scam_event_id?: string | null
          raw_reference_hash?: string | null
          source_provider?: string | null
          transaction_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "financial_transactions_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_linked_scam_event_id_fkey"
            columns: ["linked_scam_event_id"]
            isOneToOne: false
            referencedRelation: "scam_events"
            referencedColumns: ["id"]
          },
        ]
      }
      gdpr_pii_fields: {
        Row: {
          column_name: string
          enabled: boolean
          identity_column: string
          redact_strategy: string
          table_name: string
        }
        Insert: {
          column_name: string
          enabled?: boolean
          identity_column: string
          redact_strategy: string
          table_name: string
        }
        Update: {
          column_name?: string
          enabled?: boolean
          identity_column?: string
          redact_strategy?: string
          table_name?: string
        }
        Relationships: []
      }
      grandchild_profiles: {
        Row: {
          age_band: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          elder_consented: boolean
          elder_id: string
          family_member_id: string
          guardian_consented: boolean
          id: string
          updated_at: string
        }
        Insert: {
          age_band?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          elder_consented?: boolean
          elder_id: string
          family_member_id: string
          guardian_consented?: boolean
          id?: string
          updated_at?: string
        }
        Update: {
          age_band?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          elder_consented?: boolean
          elder_id?: string
          family_member_id?: string
          guardian_consented?: boolean
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grandchild_profiles_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "grandchild_profiles_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grandchild_profiles_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "grandchild_profiles_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      health_record_imports: {
        Row: {
          elder_id: string
          fhir_job_id: string | null
          fhir_resource_id_hash: string
          fhir_resource_type: string
          id: string
          imported_at: string
          mapped_record_id: string | null
          mapped_table: string | null
          source_provider: string
        }
        Insert: {
          elder_id: string
          fhir_job_id?: string | null
          fhir_resource_id_hash: string
          fhir_resource_type: string
          id?: string
          imported_at?: string
          mapped_record_id?: string | null
          mapped_table?: string | null
          source_provider?: string
        }
        Update: {
          elder_id?: string
          fhir_job_id?: string | null
          fhir_resource_id_hash?: string
          fhir_resource_type?: string
          id?: string
          imported_at?: string
          mapped_record_id?: string | null
          mapped_table?: string | null
          source_provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_record_imports_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "health_record_imports_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_record_imports_fhir_job_id_fkey"
            columns: ["fhir_job_id"]
            isOneToOne: false
            referencedRelation: "fhir_import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      hydration_logs: {
        Row: {
          amount_ml: number | null
          created_at: string
          elder_id: string
          id: string
          logged_at: string
          notes_en: string | null
          notes_nl: string | null
          source: string
        }
        Insert: {
          amount_ml?: number | null
          created_at?: string
          elder_id: string
          id?: string
          logged_at?: string
          notes_en?: string | null
          notes_nl?: string | null
          source?: string
        }
        Update: {
          amount_ml?: number | null
          created_at?: string
          elder_id?: string
          id?: string
          logged_at?: string
          notes_en?: string | null
          notes_nl?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "hydration_logs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "hydration_logs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          elder_id: string | null
          error_message: string | null
          expires_at: string
          function_name: string
          id: string
          key_hash: string
          locked_until: string
          profile_id: string | null
          request_hash: string
          response_body: Json | null
          status: string
          status_code: number | null
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          elder_id?: string | null
          error_message?: string | null
          expires_at?: string
          function_name: string
          id?: string
          key_hash: string
          locked_until?: string
          profile_id?: string | null
          request_hash: string
          response_body?: Json | null
          status?: string
          status_code?: number | null
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          elder_id?: string | null
          error_message?: string | null
          expires_at?: string
          function_name?: string
          id?: string
          key_hash?: string
          locked_until?: string
          profile_id?: string | null
          request_hash?: string
          response_body?: Json | null
          status?: string
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "idempotency_keys_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idempotency_keys_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "idempotency_keys_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string
          description_nl: string
          elder_id: string
          external_authority_nl: string | null
          external_report_made: boolean
          id: string
          incident_type: string
          meldcode_step_reached: number | null
          reported_by_id: string
          resolution_notes_nl: string | null
          resolved: boolean
          resolved_at: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_nl: string
          elder_id: string
          external_authority_nl?: string | null
          external_report_made?: boolean
          id?: string
          incident_type: string
          meldcode_step_reached?: number | null
          reported_by_id: string
          resolution_notes_nl?: string | null
          resolved?: boolean
          resolved_at?: string | null
          severity: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_nl?: string
          elder_id?: string
          external_authority_nl?: string | null
          external_report_made?: boolean
          id?: string
          incident_type?: string
          meldcode_step_reached?: number | null
          reported_by_id?: string
          resolution_notes_nl?: string | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "incidents_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_reported_by_id_fkey"
            columns: ["reported_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "incidents_reported_by_id_fkey"
            columns: ["reported_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          created_at: string
          display_name: string
          environment: Database["public"]["Enums"]["integration_environment"]
          id: string
          integration_key: string
          last_error: string | null
          last_health_check_at: string | null
          legal_gate: string | null
          required_for_phase: string
          secret_names: string[]
          status: Database["public"]["Enums"]["integration_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          environment?: Database["public"]["Enums"]["integration_environment"]
          id?: string
          integration_key: string
          last_error?: string | null
          last_health_check_at?: string | null
          legal_gate?: string | null
          required_for_phase: string
          secret_names?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          environment?: Database["public"]["Enums"]["integration_environment"]
          id?: string
          integration_key?: string
          last_error?: string | null
          last_health_check_at?: string | null
          legal_gate?: string | null
          required_for_phase?: string
          secret_names?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
        }
        Relationships: []
      }
      interest_tags: {
        Row: {
          category_nl: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          label_en: string
          label_nl: string
          sort_order: number | null
          tag_key: string
        }
        Insert: {
          category_nl?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label_en: string
          label_nl: string
          sort_order?: number | null
          tag_key: string
        }
        Update: {
          category_nl?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label_en?: string
          label_nl?: string
          sort_order?: number | null
          tag_key?: string
        }
        Relationships: []
      }
      legacy_accounts: {
        Row: {
          account_identifier_hint: string | null
          action_on_death: Database["public"]["Enums"]["legacy_action"]
          created_at: string
          deleted_at: string | null
          elder_id: string
          encrypted_secret_path: string | null
          id: string
          intended_recipient_id: string | null
          last_reviewed_at: string | null
          notes_en: string | null
          notes_nl: string | null
          service_name: string
          service_url: string | null
          updated_at: string
        }
        Insert: {
          account_identifier_hint?: string | null
          action_on_death?: Database["public"]["Enums"]["legacy_action"]
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          encrypted_secret_path?: string | null
          id?: string
          intended_recipient_id?: string | null
          last_reviewed_at?: string | null
          notes_en?: string | null
          notes_nl?: string | null
          service_name: string
          service_url?: string | null
          updated_at?: string
        }
        Update: {
          account_identifier_hint?: string | null
          action_on_death?: Database["public"]["Enums"]["legacy_action"]
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          encrypted_secret_path?: string | null
          id?: string
          intended_recipient_id?: string | null
          last_reviewed_at?: string | null
          notes_en?: string | null
          notes_nl?: string | null
          service_name?: string
          service_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_accounts_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "legacy_accounts_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_accounts_intended_recipient_id_fkey"
            columns: ["intended_recipient_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "legacy_accounts_intended_recipient_id_fkey"
            columns: ["intended_recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      life_stories: {
        Row: {
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          elder_id: string
          embedding: string | null
          id: string
          keepsake_book_include: boolean
          location_nl: string | null
          prompt_id: string | null
          recording_path: string | null
          status: Database["public"]["Enums"]["story_status"]
          title_en: string | null
          title_nl: string | null
          transcript_en: string | null
          transcript_nl: string | null
          updated_at: string
          year_approximate: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          elder_id: string
          embedding?: string | null
          id?: string
          keepsake_book_include?: boolean
          location_nl?: string | null
          prompt_id?: string | null
          recording_path?: string | null
          status?: Database["public"]["Enums"]["story_status"]
          title_en?: string | null
          title_nl?: string | null
          transcript_en?: string | null
          transcript_nl?: string | null
          updated_at?: string
          year_approximate?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          elder_id?: string
          embedding?: string | null
          id?: string
          keepsake_book_include?: boolean
          location_nl?: string | null
          prompt_id?: string | null
          recording_path?: string | null
          status?: Database["public"]["Enums"]["story_status"]
          title_en?: string | null
          title_nl?: string | null
          transcript_en?: string | null
          transcript_nl?: string | null
          updated_at?: string
          year_approximate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "life_stories_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "life_stories_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "life_stories_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "life_story_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      life_story_prompts: {
        Row: {
          active: boolean
          category_nl: string
          created_at: string
          id: string
          prompt_en: string
          prompt_nl: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_nl: string
          created_at?: string
          id?: string
          prompt_en: string
          prompt_nl: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category_nl?: string
          created_at?: string
          id?: string
          prompt_en?: string
          prompt_nl?: string
          sort_order?: number
        }
        Relationships: []
      }
      location_events: {
        Row: {
          accuracy_metres: number | null
          auto_delete_at: string | null
          check_in_prompted: boolean
          created_at: string
          deleted_at: string | null
          elder_id: string
          event_type: string
          family_notified: boolean
          id: string
          location_fuzzed: unknown
          location_precise: unknown
          updated_at: string | null
        }
        Insert: {
          accuracy_metres?: number | null
          auto_delete_at?: string | null
          check_in_prompted?: boolean
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          event_type: string
          family_notified?: boolean
          id?: string
          location_fuzzed: unknown
          location_precise?: unknown
          updated_at?: string | null
        }
        Update: {
          accuracy_metres?: number | null
          auto_delete_at?: string | null
          check_in_prompted?: boolean
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          event_type?: string
          family_notified?: boolean
          id?: string
          location_fuzzed?: unknown
          location_precise?: unknown
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "location_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      location_events_partitioned: {
        Row: {
          accuracy_metres: number | null
          auto_delete_at: string | null
          check_in_prompted: boolean
          created_at: string
          deleted_at: string | null
          elder_id: string
          event_type: string
          family_notified: boolean
          id: string
          location_fuzzed: unknown
          location_precise: unknown
          updated_at: string | null
        }
        Insert: {
          accuracy_metres?: number | null
          auto_delete_at?: string | null
          check_in_prompted?: boolean
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          event_type: string
          family_notified?: boolean
          id?: string
          location_fuzzed: unknown
          location_precise?: unknown
          updated_at?: string | null
        }
        Update: {
          accuracy_metres?: number | null
          auto_delete_at?: string | null
          check_in_prompted?: boolean
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          event_type?: string
          family_notified?: boolean
          id?: string
          location_fuzzed?: unknown
          location_precise?: unknown
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_events_partitioned_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "location_events_partitioned_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      log_drain_configs: {
        Row: {
          created_at: string
          drain_key: string
          enabled: boolean
          endpoint_url: string | null
          id: string
          pii_scrubbing_enabled: boolean
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          drain_key: string
          enabled?: boolean
          endpoint_url?: string | null
          id?: string
          pii_scrubbing_enabled?: boolean
          provider: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          drain_key?: string
          enabled?: boolean
          endpoint_url?: string | null
          id?: string
          pii_scrubbing_enabled?: boolean
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      medication_catalog_entries: {
        Row: {
          active_substance_nl: string | null
          created_at: string
          external_code: string
          form_nl: string | null
          id: string
          interaction_notes_nl: string | null
          name_nl: string
          provider: Database["public"]["Enums"]["medication_catalog_provider"]
          strength_text: string | null
          updated_from_provider_at: string | null
        }
        Insert: {
          active_substance_nl?: string | null
          created_at?: string
          external_code: string
          form_nl?: string | null
          id?: string
          interaction_notes_nl?: string | null
          name_nl: string
          provider: Database["public"]["Enums"]["medication_catalog_provider"]
          strength_text?: string | null
          updated_from_provider_at?: string | null
        }
        Update: {
          active_substance_nl?: string | null
          created_at?: string
          external_code?: string
          form_nl?: string | null
          id?: string
          interaction_notes_nl?: string | null
          name_nl?: string
          provider?: Database["public"]["Enums"]["medication_catalog_provider"]
          strength_text?: string | null
          updated_from_provider_at?: string | null
        }
        Relationships: []
      }
      medication_catalog_sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          legal_basis_confirmed: boolean
          provider: Database["public"]["Enums"]["medication_catalog_provider"]
          records_received: number
          records_updated: number
          requires_agb_code: boolean
          started_at: string | null
          status: Database["public"]["Enums"]["integration_job_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          legal_basis_confirmed?: boolean
          provider: Database["public"]["Enums"]["medication_catalog_provider"]
          records_received?: number
          records_updated?: number
          requires_agb_code?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["integration_job_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          legal_basis_confirmed?: boolean
          provider?: Database["public"]["Enums"]["medication_catalog_provider"]
          records_received?: number
          records_updated?: number
          requires_agb_code?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["integration_job_status"]
        }
        Relationships: []
      }
      medication_interaction_alerts: {
        Row: {
          created_at: string
          dismissed_at: string | null
          dismissed_by_id: string | null
          dismissed_snapshot_id: string | null
          elder_id: string
          id: string
          medication_ids: string[]
          severity: Database["public"]["Enums"]["interaction_severity"]
          source: string
          summary_en: string | null
          summary_nl: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by_id?: string | null
          dismissed_snapshot_id?: string | null
          elder_id: string
          id?: string
          medication_ids?: string[]
          severity: Database["public"]["Enums"]["interaction_severity"]
          source: string
          summary_en?: string | null
          summary_nl: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by_id?: string | null
          dismissed_snapshot_id?: string | null
          elder_id?: string
          id?: string
          medication_ids?: string[]
          severity?: Database["public"]["Enums"]["interaction_severity"]
          source?: string
          summary_en?: string | null
          summary_nl?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_interaction_alerts_dismissed_snapshot_id_fkey"
            columns: ["dismissed_snapshot_id"]
            isOneToOne: false
            referencedRelation: "profiles_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_interaction_alerts_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "medication_interaction_alerts_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_ocr_jobs: {
        Row: {
          confidence_score: number | null
          created_at: string
          created_medication_id: string | null
          deleted_at: string | null
          elder_id: string
          extracted_dose_en: string | null
          extracted_dose_nl: string | null
          extracted_name_en: string | null
          extracted_name_nl: string | null
          extracted_schedule: Json | null
          id: string
          rejection_reason: string | null
          review_required: boolean
          status: Database["public"]["Enums"]["processing_job_status"]
          storage_path: string
          updated_at: string
          uploaded_by_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          created_medication_id?: string | null
          deleted_at?: string | null
          elder_id: string
          extracted_dose_en?: string | null
          extracted_dose_nl?: string | null
          extracted_name_en?: string | null
          extracted_name_nl?: string | null
          extracted_schedule?: Json | null
          id?: string
          rejection_reason?: string | null
          review_required?: boolean
          status?: Database["public"]["Enums"]["processing_job_status"]
          storage_path: string
          updated_at?: string
          uploaded_by_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          created_medication_id?: string | null
          deleted_at?: string | null
          elder_id?: string
          extracted_dose_en?: string | null
          extracted_dose_nl?: string | null
          extracted_name_en?: string | null
          extracted_name_nl?: string | null
          extracted_schedule?: Json | null
          id?: string
          rejection_reason?: string | null
          review_required?: boolean
          status?: Database["public"]["Enums"]["processing_job_status"]
          storage_path?: string
          updated_at?: string
          uploaded_by_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_ocr_jobs_created_medication_id_fkey"
            columns: ["created_medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_ocr_jobs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "medication_ocr_jobs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_ocr_jobs_uploaded_by_id_fkey"
            columns: ["uploaded_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "medication_ocr_jobs_uploaded_by_id_fkey"
            columns: ["uploaded_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_ocr_reviews: {
        Row: {
          approved_payload: Json | null
          created_at: string
          elder_id: string
          id: string
          notes: string | null
          ocr_job_id: string
          proposed_payload: Json
          reviewer_id: string | null
          reviewer_snapshot_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_payload?: Json | null
          created_at?: string
          elder_id: string
          id?: string
          notes?: string | null
          ocr_job_id: string
          proposed_payload: Json
          reviewer_id?: string | null
          reviewer_snapshot_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_payload?: Json | null
          created_at?: string
          elder_id?: string
          id?: string
          notes?: string | null
          ocr_job_id?: string
          proposed_payload?: Json
          reviewer_id?: string | null
          reviewer_snapshot_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_ocr_reviews_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "medication_ocr_reviews_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_ocr_reviews_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "medication_ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_ocr_reviews_reviewer_snapshot_id_fkey"
            columns: ["reviewer_snapshot_id"]
            isOneToOne: false
            referencedRelation: "profiles_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_refill_events: {
        Row: {
          completed_at: string | null
          created_at: string
          current_stock: number | null
          deleted_at: string | null
          elder_id: string
          family_notified_at: string | null
          id: string
          medication_id: string
          pharmacy_nl: string | null
          requested_by_id: string | null
          status: Database["public"]["Enums"]["refill_status"]
          threshold: number | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_stock?: number | null
          deleted_at?: string | null
          elder_id: string
          family_notified_at?: string | null
          id?: string
          medication_id: string
          pharmacy_nl?: string | null
          requested_by_id?: string | null
          status?: Database["public"]["Enums"]["refill_status"]
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_stock?: number | null
          deleted_at?: string | null
          elder_id?: string
          family_notified_at?: string | null
          id?: string
          medication_id?: string
          pharmacy_nl?: string | null
          requested_by_id?: string | null
          status?: Database["public"]["Enums"]["refill_status"]
          threshold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_refill_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "medication_refill_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_refill_events_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_refill_events_requested_by_id_fkey"
            columns: ["requested_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "medication_refill_events_requested_by_id_fkey"
            columns: ["requested_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_reminders: {
        Row: {
          confirmed_at: string | null
          created_at: string
          elder_id: string
          escalated_at: string | null
          family_notified_at: string | null
          first_reminded_at: string | null
          id: string
          idempotency_key: string | null
          medication_id: string
          scheduled_time: string
          snooze_count: number
          status: Database["public"]["Enums"]["reminder_status"]
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          elder_id: string
          escalated_at?: string | null
          family_notified_at?: string | null
          first_reminded_at?: string | null
          id?: string
          idempotency_key?: string | null
          medication_id: string
          scheduled_time: string
          snooze_count?: number
          status?: Database["public"]["Enums"]["reminder_status"]
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          elder_id?: string
          escalated_at?: string | null
          family_notified_at?: string | null
          first_reminded_at?: string | null
          id?: string
          idempotency_key?: string | null
          medication_id?: string
          scheduled_time?: string
          snooze_count?: number
          status?: Database["public"]["Enums"]["reminder_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_reminders_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "medication_reminders_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_reminders_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          brand_name_nl: string | null
          created_at: string | null
          current_stock: number | null
          deleted_at: string | null
          dose_description_en: string | null
          dose_description_nl: string
          elder_id: string
          end_date: string | null
          frequency: Database["public"]["Enums"]["medication_frequency"]
          id: string
          instructions_en: string | null
          instructions_nl: string | null
          is_active: boolean | null
          name_en: string | null
          name_nl: string
          ocr_source_path: string | null
          pharmacy_email: string | null
          pharmacy_name: string | null
          prescribed_by_nl: string | null
          refill_pharmacy_nl: string | null
          refill_threshold: number | null
          schedule_times: string[]
          start_date: string | null
          updated_at: string | null
          with_food: boolean | null
        }
        Insert: {
          brand_name_nl?: string | null
          created_at?: string | null
          current_stock?: number | null
          deleted_at?: string | null
          dose_description_en?: string | null
          dose_description_nl: string
          elder_id: string
          end_date?: string | null
          frequency: Database["public"]["Enums"]["medication_frequency"]
          id?: string
          instructions_en?: string | null
          instructions_nl?: string | null
          is_active?: boolean | null
          name_en?: string | null
          name_nl: string
          ocr_source_path?: string | null
          pharmacy_email?: string | null
          pharmacy_name?: string | null
          prescribed_by_nl?: string | null
          refill_pharmacy_nl?: string | null
          refill_threshold?: number | null
          schedule_times: string[]
          start_date?: string | null
          updated_at?: string | null
          with_food?: boolean | null
        }
        Update: {
          brand_name_nl?: string | null
          created_at?: string | null
          current_stock?: number | null
          deleted_at?: string | null
          dose_description_en?: string | null
          dose_description_nl?: string
          elder_id?: string
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["medication_frequency"]
          id?: string
          instructions_en?: string | null
          instructions_nl?: string | null
          is_active?: boolean | null
          name_en?: string | null
          name_nl?: string
          ocr_source_path?: string | null
          pharmacy_email?: string | null
          pharmacy_name?: string | null
          prescribed_by_nl?: string | null
          refill_pharmacy_nl?: string | null
          refill_threshold?: number | null
          schedule_times?: string[]
          start_date?: string | null
          updated_at?: string | null
          with_food?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "medications_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "medications_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_lane_photos: {
        Row: {
          anniversary_date: string | null
          caption_en: string | null
          caption_nl: string | null
          created_at: string
          date_taken: string | null
          deleted_at: string | null
          elder_id: string
          id: string
          is_memorial: boolean
          location_nl: string | null
          storage_path: string
          surface_on_anniversary: boolean
          uploaded_by_id: string
          year_approximate: number | null
        }
        Insert: {
          anniversary_date?: string | null
          caption_en?: string | null
          caption_nl?: string | null
          created_at?: string
          date_taken?: string | null
          deleted_at?: string | null
          elder_id: string
          id?: string
          is_memorial?: boolean
          location_nl?: string | null
          storage_path: string
          surface_on_anniversary?: boolean
          uploaded_by_id: string
          year_approximate?: number | null
        }
        Update: {
          anniversary_date?: string | null
          caption_en?: string | null
          caption_nl?: string | null
          created_at?: string
          date_taken?: string | null
          deleted_at?: string | null
          elder_id?: string
          id?: string
          is_memorial?: boolean
          location_nl?: string | null
          storage_path?: string
          surface_on_anniversary?: boolean
          uploaded_by_id?: string
          year_approximate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "memory_lane_photos_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "memory_lane_photos_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_lane_photos_uploaded_by_id_fkey"
            columns: ["uploaded_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "memory_lane_photos_uploaded_by_id_fkey"
            columns: ["uploaded_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      neighbourhood_connections: {
        Row: {
          created_at: string | null
          ended_by: string | null
          ended_reason_internal: string | null
          id: string
          initiator_accepted_at: string | null
          initiator_elder_id: string
          is_walk_buddy_match: boolean | null
          recipient_accepted_at: string | null
          recipient_elder_id: string
          shared_tag_ids: string[] | null
          status: Database["public"]["Enums"]["connection_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          ended_by?: string | null
          ended_reason_internal?: string | null
          id?: string
          initiator_accepted_at?: string | null
          initiator_elder_id: string
          is_walk_buddy_match?: boolean | null
          recipient_accepted_at?: string | null
          recipient_elder_id: string
          shared_tag_ids?: string[] | null
          status?: Database["public"]["Enums"]["connection_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          ended_by?: string | null
          ended_reason_internal?: string | null
          id?: string
          initiator_accepted_at?: string | null
          initiator_elder_id?: string
          is_walk_buddy_match?: boolean | null
          recipient_accepted_at?: string | null
          recipient_elder_id?: string
          shared_tag_ids?: string[] | null
          status?: Database["public"]["Enums"]["connection_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "neighbourhood_connections_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "neighbourhood_connections_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neighbourhood_connections_initiator_elder_id_fkey"
            columns: ["initiator_elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "neighbourhood_connections_initiator_elder_id_fkey"
            columns: ["initiator_elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neighbourhood_connections_recipient_elder_id_fkey"
            columns: ["recipient_elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "neighbourhood_connections_recipient_elder_id_fkey"
            columns: ["recipient_elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      neighbourhood_events: {
        Row: {
          created_at: string | null
          description_en: string | null
          description_nl: string | null
          distance_label_en: string | null
          distance_label_nl: string | null
          event_date: string
          event_time: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          is_free: boolean | null
          location_label_en: string | null
          location_label_nl: string
          postcode_pc4: string
          relevant_tag_ids: string[] | null
          source: string | null
          source_url: string | null
          title_en: string | null
          title_nl: string
        }
        Insert: {
          created_at?: string | null
          description_en?: string | null
          description_nl?: string | null
          distance_label_en?: string | null
          distance_label_nl?: string | null
          event_date: string
          event_time?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          location_label_en?: string | null
          location_label_nl: string
          postcode_pc4: string
          relevant_tag_ids?: string[] | null
          source?: string | null
          source_url?: string | null
          title_en?: string | null
          title_nl: string
        }
        Update: {
          created_at?: string | null
          description_en?: string | null
          description_nl?: string | null
          distance_label_en?: string | null
          distance_label_nl?: string | null
          event_date?: string
          event_time?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          location_label_en?: string | null
          location_label_nl?: string
          postcode_pc4?: string
          relevant_tag_ids?: string[] | null
          source?: string | null
          source_url?: string | null
          title_en?: string | null
          title_nl?: string
        }
        Relationships: []
      }
      neighbourhood_profiles: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          elder_id: string
          family_can_see_connections: boolean | null
          id: string
          is_active: boolean | null
          neighbourhood_label: string | null
          opted_in_at: string | null
          opted_out_at: string | null
          postcode_pc4: string
          radius_km: number | null
          updated_at: string | null
          walk_buddy_seeking: boolean | null
          walk_preferred_time: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          elder_id: string
          family_can_see_connections?: boolean | null
          id?: string
          is_active?: boolean | null
          neighbourhood_label?: string | null
          opted_in_at?: string | null
          opted_out_at?: string | null
          postcode_pc4: string
          radius_km?: number | null
          updated_at?: string | null
          walk_buddy_seeking?: boolean | null
          walk_preferred_time?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          elder_id?: string
          family_can_see_connections?: boolean | null
          id?: string
          is_active?: boolean | null
          neighbourhood_label?: string | null
          opted_in_at?: string | null
          opted_out_at?: string | null
          postcode_pc4?: string
          radius_km?: number | null
          updated_at?: string | null
          walk_buddy_seeking?: boolean | null
          walk_preferred_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "neighbourhood_profiles_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: true
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "neighbourhood_profiles_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_digest_enabled: boolean
          enabled: boolean
          id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          profile_id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          whatsapp_enabled: boolean
          whatsapp_phone: string | null
        }
        Insert: {
          created_at?: string
          email_digest_enabled?: boolean
          enabled?: boolean
          id?: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          profile_id: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          whatsapp_enabled?: boolean
          whatsapp_phone?: string | null
        }
        Update: {
          created_at?: string
          email_digest_enabled?: boolean
          enabled?: boolean
          id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          profile_id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          whatsapp_enabled?: boolean
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body: string
          created_at: string | null
          id: string
          locale: string
          template_key: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          locale: string
          template_key: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          locale?: string
          template_key?: string
          title?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body_en: string | null
          body_nl: string
          created_at: string
          data: Json | null
          elder_id: string | null
          id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          read: boolean
          read_at: string | null
          recipient_id: string
          send_error: string | null
          sent_at: string | null
          title_en: string | null
          title_nl: string
        }
        Insert: {
          body_en?: string | null
          body_nl: string
          created_at?: string
          data?: Json | null
          elder_id?: string | null
          id?: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          read?: boolean
          read_at?: string | null
          recipient_id: string
          send_error?: string | null
          sent_at?: string | null
          title_en?: string | null
          title_nl: string
        }
        Update: {
          body_en?: string | null
          body_nl?: string
          created_at?: string
          data?: Json | null
          elder_id?: string | null
          id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          read?: boolean
          read_at?: string | null
          recipient_id?: string
          send_error?: string | null
          sent_at?: string | null
          title_en?: string | null
          title_nl?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "notifications_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_logs: {
        Row: {
          appetite_score: number | null
          created_at: string
          deleted_at: string | null
          description_en: string | null
          description_nl: string | null
          elder_id: string
          family_notified_at: string | null
          id: string
          logged_at: string
          meal_label: string | null
        }
        Insert: {
          appetite_score?: number | null
          created_at?: string
          deleted_at?: string | null
          description_en?: string | null
          description_nl?: string | null
          elder_id: string
          family_notified_at?: string | null
          id?: string
          logged_at?: string
          meal_label?: string | null
        }
        Update: {
          appetite_score?: number | null
          created_at?: string
          deleted_at?: string | null
          description_en?: string | null
          description_nl?: string | null
          elder_id?: string
          family_notified_at?: string | null
          id?: string
          logged_at?: string
          meal_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "nutrition_logs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_event_feeds: {
        Row: {
          created_at: string
          feed_key: string
          id: string
          last_error: string | null
          last_ingested_at: string | null
          partner_name: string
          postcode_scope: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["partner_feed_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          feed_key: string
          id?: string
          last_error?: string | null
          last_ingested_at?: string | null
          partner_name: string
          postcode_scope?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["partner_feed_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          feed_key?: string
          id?: string
          last_error?: string | null
          last_ingested_at?: string | null
          partner_name?: string
          postcode_scope?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["partner_feed_status"]
          updated_at?: string
        }
        Relationships: []
      }
      pending_confirmations: {
        Row: {
          confirmation_type: Database["public"]["Enums"]["confirmation_type"]
          created_at: string
          elder_id: string
          expires_at: string
          id: string
          locale: string
          payload: Json
          resolution: boolean | null
          resolved_at: string | null
        }
        Insert: {
          confirmation_type: Database["public"]["Enums"]["confirmation_type"]
          created_at?: string
          elder_id: string
          expires_at: string
          id?: string
          locale?: string
          payload: Json
          resolution?: boolean | null
          resolved_at?: string | null
        }
        Update: {
          confirmation_type?: Database["public"]["Enums"]["confirmation_type"]
          created_at?: string
          elder_id?: string
          expires_at?: string
          id?: string
          locale?: string
          payload?: Json
          resolution?: boolean | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_confirmations_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "pending_confirmations_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perf_metrics: {
        Row: {
          duration_ms: number
          env: string | null
          fn_name: string
          id: string
          recorded_at: string | null
          status: string
        }
        Insert: {
          duration_ms: number
          env?: string | null
          fn_name: string
          id?: string
          recorded_at?: string | null
          status: string
        }
        Update: {
          duration_ms?: number
          env?: string | null
          fn_name?: string
          id?: string
          recorded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      phone_reputation_cache: {
        Row: {
          cached_at: string
          expires_at: string
          id: string
          phone_hashed: string
          report_count: number | null
          reputation_score: number
          source: string
        }
        Insert: {
          cached_at?: string
          expires_at?: string
          id?: string
          phone_hashed: string
          report_count?: number | null
          reputation_score: number
          source: string
        }
        Update: {
          cached_at?: string
          expires_at?: string
          id?: string
          phone_hashed?: string
          report_count?: number | null
          reputation_score?: number
          source?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          country_code: string
          created_at: string
          deleted_at: string | null
          font_size_multiplier: number
          full_name: string
          high_contrast: boolean
          id: string
          locale: string
          onboarding_complete: boolean
          phone_nl: string | null
          preferred_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: string
          timezone: string
          updated_at: string
          voice_id: string | null
        }
        Insert: {
          country_code?: string
          created_at?: string
          deleted_at?: string | null
          font_size_multiplier?: number
          full_name: string
          high_contrast?: boolean
          id: string
          locale?: string
          onboarding_complete?: boolean
          phone_nl?: string | null
          preferred_name?: string | null
          role: Database["public"]["Enums"]["user_role"]
          status?: string
          timezone?: string
          updated_at?: string
          voice_id?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          deleted_at?: string | null
          font_size_multiplier?: number
          full_name?: string
          high_contrast?: boolean
          id?: string
          locale?: string
          onboarding_complete?: boolean
          phone_nl?: string | null
          preferred_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          timezone?: string
          updated_at?: string
          voice_id?: string | null
        }
        Relationships: []
      }
      profiles_snapshot: {
        Row: {
          created_at: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          id: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      psd2_webhook_ingress_buffer: {
        Row: {
          id: string
          integration_key: string
          raw_payload: string
          received_at: string
        }
        Insert: {
          id?: string
          integration_key: string
          raw_payload: string
          received_at?: string
        }
        Update: {
          id?: string
          integration_key?: string
          raw_payload?: string
          received_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          platform: string
          profile_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          platform: string
          profile_id: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          platform?: string
          profile_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      safeguarding_reports: {
        Row: {
          action_taken_nl: string | null
          concern_nl: string
          created_at: string
          elder_id: string
          external_authority_nl: string | null
          external_reference: string | null
          family_informed: boolean
          id: string
          incident_id: string | null
          meldcode_step: number
          reported_by_id: string
          resolved: boolean
          resolved_at: string | null
          updated_at: string
        }
        Insert: {
          action_taken_nl?: string | null
          concern_nl: string
          created_at?: string
          elder_id: string
          external_authority_nl?: string | null
          external_reference?: string | null
          family_informed?: boolean
          id?: string
          incident_id?: string | null
          meldcode_step: number
          reported_by_id: string
          resolved?: boolean
          resolved_at?: string | null
          updated_at?: string
        }
        Update: {
          action_taken_nl?: string | null
          concern_nl?: string
          created_at?: string
          elder_id?: string
          external_authority_nl?: string | null
          external_reference?: string | null
          family_informed?: boolean
          id?: string
          incident_id?: string | null
          meldcode_step?: number
          reported_by_id?: string
          resolved?: boolean
          resolved_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safeguarding_reports_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "safeguarding_reports_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safeguarding_reports_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safeguarding_reports_reported_by_id_fkey"
            columns: ["reported_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "safeguarding_reports_reported_by_id_fkey"
            columns: ["reported_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_digests: {
        Row: {
          amber_count: number
          created_at: string
          elder_id: string
          family_interactions: number
          id: string
          medications_taken_pct: number | null
          rood_count: number
          scam_events_count: number
          sent_at: string | null
          summary_en: string | null
          summary_nl: string | null
          week_starting: string
          wellness_avg_score: number | null
          zwart_count: number
        }
        Insert: {
          amber_count?: number
          created_at?: string
          elder_id: string
          family_interactions?: number
          id?: string
          medications_taken_pct?: number | null
          rood_count?: number
          scam_events_count?: number
          sent_at?: string | null
          summary_en?: string | null
          summary_nl?: string | null
          week_starting: string
          wellness_avg_score?: number | null
          zwart_count?: number
        }
        Update: {
          amber_count?: number
          created_at?: string
          elder_id?: string
          family_interactions?: number
          id?: string
          medications_taken_pct?: number | null
          rood_count?: number
          scam_events_count?: number
          sent_at?: string | null
          summary_en?: string | null
          summary_nl?: string | null
          week_starting?: string
          wellness_avg_score?: number | null
          zwart_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "safety_digests_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "safety_digests_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scam_coaching_sessions: {
        Row: {
          assistant_summary_en: string | null
          assistant_summary_nl: string
          channel: string
          created_at: string
          elder_id: string
          elder_prompt_hash: string
          family_notified_at: string | null
          id: string
          recommended_actions: Json
        }
        Insert: {
          assistant_summary_en?: string | null
          assistant_summary_nl: string
          channel: string
          created_at?: string
          elder_id: string
          elder_prompt_hash: string
          family_notified_at?: string | null
          id?: string
          recommended_actions?: Json
        }
        Update: {
          assistant_summary_en?: string | null
          assistant_summary_nl?: string
          channel?: string
          created_at?: string
          elder_id?: string
          elder_prompt_hash?: string
          family_notified_at?: string | null
          id?: string
          recommended_actions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scam_coaching_sessions_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "scam_coaching_sessions_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scam_events: {
        Row: {
          alert_level: Database["public"]["Enums"]["alert_level"]
          channel: Database["public"]["Enums"]["scam_channel"]
          contact_id: string | null
          created_at: string
          deleted_at: string | null
          elder_dismissed: boolean
          elder_dismissed_at: string | null
          elder_id: string
          embedding: string | null
          explanation_en: string | null
          explanation_nl: string
          family_notified: boolean
          family_notified_at: string | null
          id: string
          linked_transaction_id: string | null
          raw_content_hash: string
          score_composite: number
          score_longitudinal: number | null
          score_nlp_intent: number | null
          score_pattern: number | null
          score_reputation: number | null
          signal_reference_hashed: string
          threat_types: Database["public"]["Enums"]["scam_threat_type"][] | null
          transaction_intercepted: boolean | null
          updated_at: string
        }
        Insert: {
          alert_level?: Database["public"]["Enums"]["alert_level"]
          channel: Database["public"]["Enums"]["scam_channel"]
          contact_id?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_dismissed?: boolean
          elder_dismissed_at?: string | null
          elder_id: string
          embedding?: string | null
          explanation_en?: string | null
          explanation_nl: string
          family_notified?: boolean
          family_notified_at?: string | null
          id?: string
          linked_transaction_id?: string | null
          raw_content_hash: string
          score_composite?: number
          score_longitudinal?: number | null
          score_nlp_intent?: number | null
          score_pattern?: number | null
          score_reputation?: number | null
          signal_reference_hashed: string
          threat_types?:
            | Database["public"]["Enums"]["scam_threat_type"][]
            | null
          transaction_intercepted?: boolean | null
          updated_at?: string
        }
        Update: {
          alert_level?: Database["public"]["Enums"]["alert_level"]
          channel?: Database["public"]["Enums"]["scam_channel"]
          contact_id?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_dismissed?: boolean
          elder_dismissed_at?: string | null
          elder_id?: string
          embedding?: string | null
          explanation_en?: string | null
          explanation_nl?: string
          family_notified?: boolean
          family_notified_at?: string | null
          id?: string
          linked_transaction_id?: string | null
          raw_content_hash?: string
          score_composite?: number
          score_longitudinal?: number | null
          score_nlp_intent?: number | null
          score_pattern?: number | null
          score_reputation?: number | null
          signal_reference_hashed?: string
          threat_types?:
            | Database["public"]["Enums"]["scam_threat_type"][]
            | null
          transaction_intercepted?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scam_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scam_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "scam_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scam_events_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      screen_schemas: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          locale: string
          schema: Json
          schema_version: string
          screen_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          locale?: string
          schema: Json
          schema_version?: string
          screen_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          locale?: string
          schema?: Json
          schema_version?: string
          screen_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_violations: {
        Row: {
          actor_id: string | null
          attempted_action: string
          attempted_at: string
          attempted_sql: string | null
          error_code: string
          id: number
          table_name: string
          violation_reason: string
        }
        Insert: {
          actor_id?: string | null
          attempted_action: string
          attempted_at?: string
          attempted_sql?: string | null
          error_code: string
          id?: number
          table_name: string
          violation_reason: string
        }
        Update: {
          actor_id?: string | null
          attempted_action?: string
          attempted_at?: string
          attempted_sql?: string | null
          error_code?: string
          id?: number
          table_name?: string
          violation_reason?: string
        }
        Relationships: []
      }
      skill_exchange_matches: {
        Row: {
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          elder_id: string
          family_mediated: boolean
          id: string
          matched_partner_label: string
          scheduled_at: string | null
          skill_offering_id: string
          status: Database["public"]["Enums"]["skill_exchange_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          family_mediated?: boolean
          id?: string
          matched_partner_label: string
          scheduled_at?: string | null
          skill_offering_id: string
          status?: Database["public"]["Enums"]["skill_exchange_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          family_mediated?: boolean
          id?: string
          matched_partner_label?: string
          scheduled_at?: string | null
          skill_offering_id?: string
          status?: Database["public"]["Enums"]["skill_exchange_status"]
        }
        Relationships: [
          {
            foreignKeyName: "skill_exchange_matches_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "skill_exchange_matches_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_exchange_matches_skill_offering_id_fkey"
            columns: ["skill_offering_id"]
            isOneToOne: false
            referencedRelation: "skill_offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_offerings: {
        Row: {
          category: string | null
          created_at: string
          deleted_at: string | null
          description_en: string | null
          description_nl: string | null
          elder_id: string
          family_visible: boolean
          format: string | null
          id: string
          status: Database["public"]["Enums"]["skill_exchange_status"]
          title_en: string | null
          title_nl: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description_en?: string | null
          description_nl?: string | null
          elder_id: string
          family_visible?: boolean
          format?: string | null
          id?: string
          status?: Database["public"]["Enums"]["skill_exchange_status"]
          title_en?: string | null
          title_nl: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description_en?: string | null
          description_nl?: string | null
          elder_id?: string
          family_visible?: boolean
          format?: string | null
          id?: string
          status?: Database["public"]["Enums"]["skill_exchange_status"]
          title_en?: string | null
          title_nl?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_offerings_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "skill_offerings_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      slo_alerts: {
        Row: {
          acknowledged_at: string | null
          alert_key: string
          details: Json
          id: string
          opened_at: string
          resolved_at: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          alert_key: string
          details?: Json
          id?: string
          opened_at?: string
          resolved_at?: string | null
          severity: string
          status?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          alert_key?: string
          details?: Json
          id?: string
          opened_at?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by_role: Database["public"]["Enums"]["user_role"]
          deleted_at: string | null
          due_date: string | null
          due_time: string | null
          elder_id: string
          id: string
          idempotency_key: string | null
          notes_en: string | null
          notes_nl: string | null
          title_en: string | null
          title_nl: string
          updated_at: string
          voice_created: boolean
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by_role?: Database["public"]["Enums"]["user_role"]
          deleted_at?: string | null
          due_date?: string | null
          due_time?: string | null
          elder_id: string
          id?: string
          idempotency_key?: string | null
          notes_en?: string | null
          notes_nl?: string | null
          title_en?: string | null
          title_nl: string
          updated_at?: string
          voice_created?: boolean
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by_role?: Database["public"]["Enums"]["user_role"]
          deleted_at?: string | null
          due_date?: string | null
          due_time?: string | null
          elder_id?: string
          id?: string
          idempotency_key?: string | null
          notes_en?: string | null
          notes_nl?: string | null
          title_en?: string | null
          title_nl?: string
          updated_at?: string
          voice_created?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tasks_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "tasks_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telehealth_sessions: {
        Row: {
          created_at: string
          deleted_at: string | null
          elder_id: string
          ended_at: string | null
          follow_up_task_id: string | null
          id: string
          initiated_by_id: string | null
          medication_brief_read: boolean
          notes_en: string | null
          notes_nl: string | null
          provider_name: string | null
          provider_phone: string | null
          provider_type: string
          started_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          ended_at?: string | null
          follow_up_task_id?: string | null
          id?: string
          initiated_by_id?: string | null
          medication_brief_read?: boolean
          notes_en?: string | null
          notes_nl?: string | null
          provider_name?: string | null
          provider_phone?: string | null
          provider_type: string
          started_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          ended_at?: string | null
          follow_up_task_id?: string | null
          id?: string
          initiated_by_id?: string | null
          medication_brief_read?: boolean
          notes_en?: string | null
          notes_nl?: string | null
          provider_name?: string | null
          provider_phone?: string | null
          provider_type?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telehealth_sessions_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "telehealth_sessions_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telehealth_sessions_follow_up_task_id_fkey"
            columns: ["follow_up_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telehealth_sessions_initiated_by_id_fkey"
            columns: ["initiated_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "telehealth_sessions_initiated_by_id_fkey"
            columns: ["initiated_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_requests: {
        Row: {
          appointment_id: string | null
          booking_reference: string | null
          created_at: string
          deleted_at: string | null
          destination_label: string | null
          elder_id: string
          family_notified_at: string | null
          id: string
          pickup_label: string | null
          pickup_time: string | null
          provider: string | null
          requested_by_id: string | null
          status: Database["public"]["Enums"]["transport_status"]
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          booking_reference?: string | null
          created_at?: string
          deleted_at?: string | null
          destination_label?: string | null
          elder_id: string
          family_notified_at?: string | null
          id?: string
          pickup_label?: string | null
          pickup_time?: string | null
          provider?: string | null
          requested_by_id?: string | null
          status?: Database["public"]["Enums"]["transport_status"]
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          booking_reference?: string | null
          created_at?: string
          deleted_at?: string | null
          destination_label?: string | null
          elder_id?: string
          family_notified_at?: string | null
          id?: string
          pickup_label?: string | null
          pickup_time?: string | null
          provider?: string | null
          requested_by_id?: string | null
          status?: Database["public"]["Enums"]["transport_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "transport_requests_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_requested_by_id_fkey"
            columns: ["requested_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "transport_requests_requested_by_id_fkey"
            columns: ["requested_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_register: {
        Row: {
          bsn_transmitted: boolean
          created_at: string
          data_shared: string
          deleted_at: string | null
          dpa_status: Database["public"]["Enums"]["compliance_record_status"]
          id: string
          notes: string | null
          purpose: string
          review_due_date: string | null
          reviewed_at: string | null
          reviewed_by_id: string | null
          scc_required: boolean
          storage_region: string
          updated_at: string
          vendor_name: string
        }
        Insert: {
          bsn_transmitted?: boolean
          created_at?: string
          data_shared: string
          deleted_at?: string | null
          dpa_status?: Database["public"]["Enums"]["compliance_record_status"]
          id?: string
          notes?: string | null
          purpose: string
          review_due_date?: string | null
          reviewed_at?: string | null
          reviewed_by_id?: string | null
          scc_required?: boolean
          storage_region: string
          updated_at?: string
          vendor_name: string
        }
        Update: {
          bsn_transmitted?: boolean
          created_at?: string
          data_shared?: string
          deleted_at?: string | null
          dpa_status?: Database["public"]["Enums"]["compliance_record_status"]
          id?: string
          notes?: string | null
          purpose?: string
          review_due_date?: string | null
          reviewed_at?: string | null
          reviewed_by_id?: string | null
          scc_required?: boolean
          storage_region?: string
          updated_at?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_register_reviewed_by_id_fkey"
            columns: ["reviewed_by_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "vendor_register_reviewed_by_id_fkey"
            columns: ["reviewed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_call_sessions: {
        Row: {
          created_at: string
          elder_id: string
          ended_at: string | null
          id: string
          initiator_id: string
          provider: string
          provider_room_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["video_call_status"]
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          elder_id: string
          ended_at?: string | null
          id?: string
          initiator_id: string
          provider: string
          provider_room_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["video_call_status"]
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          elder_id?: string
          ended_at?: string | null
          id?: string
          initiator_id?: string
          provider?: string
          provider_room_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["video_call_status"]
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_call_sessions_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "video_call_sessions_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_call_sessions_initiator_id_fkey"
            columns: ["initiator_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "video_call_sessions_initiator_id_fkey"
            columns: ["initiator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_call_sessions_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "carer_visit_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      vital_signs: {
        Row: {
          context_notes_nl: string | null
          created_at: string
          device_name: string | null
          elder_id: string
          family_notified_at: string | null
          id: string
          reading_source: string | null
          recorded_at: string
          threshold_flag: boolean
          unit: string
          value: number
          vital_type: Database["public"]["Enums"]["vital_type"]
        }
        Insert: {
          context_notes_nl?: string | null
          created_at?: string
          device_name?: string | null
          elder_id: string
          family_notified_at?: string | null
          id?: string
          reading_source?: string | null
          recorded_at?: string
          threshold_flag?: boolean
          unit: string
          value: number
          vital_type: Database["public"]["Enums"]["vital_type"]
        }
        Update: {
          context_notes_nl?: string | null
          created_at?: string
          device_name?: string | null
          elder_id?: string
          family_notified_at?: string | null
          id?: string
          reading_source?: string | null
          recorded_at?: string
          threshold_flag?: boolean
          unit?: string
          value?: number
          vital_type?: Database["public"]["Enums"]["vital_type"]
        }
        Relationships: [
          {
            foreignKeyName: "vital_signs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "vital_signs_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_interactions: {
        Row: {
          action_taken: string | null
          audio_path: string | null
          auto_delete_audio_at: string | null
          confidence_score: number | null
          created_at: string
          deleted_at: string | null
          distress_detected: boolean
          distress_phrase: string | null
          duration_ms: number | null
          elder_id: string
          embedding: string | null
          entities: Json | null
          id: string
          intent: string | null
          response_audio_path: string | null
          response_text_en: string | null
          response_text_nl: string | null
          screen_id: string
          transcript_en: string | null
          transcript_nl: string | null
          updated_at: string | null
        }
        Insert: {
          action_taken?: string | null
          audio_path?: string | null
          auto_delete_audio_at?: string | null
          confidence_score?: number | null
          created_at?: string
          deleted_at?: string | null
          distress_detected?: boolean
          distress_phrase?: string | null
          duration_ms?: number | null
          elder_id: string
          embedding?: string | null
          entities?: Json | null
          id?: string
          intent?: string | null
          response_audio_path?: string | null
          response_text_en?: string | null
          response_text_nl?: string | null
          screen_id: string
          transcript_en?: string | null
          transcript_nl?: string | null
          updated_at?: string | null
        }
        Update: {
          action_taken?: string | null
          audio_path?: string | null
          auto_delete_audio_at?: string | null
          confidence_score?: number | null
          created_at?: string
          deleted_at?: string | null
          distress_detected?: boolean
          distress_phrase?: string | null
          duration_ms?: number | null
          elder_id?: string
          embedding?: string | null
          entities?: Json | null
          id?: string
          intent?: string | null
          response_audio_path?: string | null
          response_text_en?: string | null
          response_text_nl?: string | null
          screen_id?: string
          transcript_en?: string | null
          transcript_nl?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_interactions_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "voice_interactions_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_profiles: {
        Row: {
          consent_evidence_path: string | null
          created_at: string
          display_name: string
          id: string
          owner_profile_id: string
          provider: string
          provider_voice_id: string | null
          status: Database["public"]["Enums"]["voice_profile_status"]
          updated_at: string
        }
        Insert: {
          consent_evidence_path?: string | null
          created_at?: string
          display_name: string
          id?: string
          owner_profile_id: string
          provider: string
          provider_voice_id?: string | null
          status?: Database["public"]["Enums"]["voice_profile_status"]
          updated_at?: string
        }
        Update: {
          consent_evidence_path?: string | null
          created_at?: string
          display_name?: string
          id?: string
          owner_profile_id?: string
          provider?: string
          provider_voice_id?: string | null
          status?: Database["public"]["Enums"]["voice_profile_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_profiles_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "voice_profiles_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wandering_events: {
        Row: {
          created_at: string
          deleted_at: string | null
          elder_id: string
          event_type: string
          family_notified: boolean
          id: string
          location_event_id: string | null
          resolved: boolean
          resolved_at: string | null
          wearable_device_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          elder_id: string
          event_type: string
          family_notified?: boolean
          id?: string
          location_event_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          wearable_device_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          elder_id?: string
          event_type?: string
          family_notified?: boolean
          id?: string
          location_event_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          wearable_device_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wandering_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "wandering_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wandering_events_location_event_id_fkey"
            columns: ["location_event_id"]
            isOneToOne: false
            referencedRelation: "family_location_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wandering_events_location_event_id_fkey"
            columns: ["location_event_id"]
            isOneToOne: false
            referencedRelation: "location_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wandering_events_wearable_device_id_fkey"
            columns: ["wearable_device_id"]
            isOneToOne: false
            referencedRelation: "wearable_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      wearable_devices: {
        Row: {
          battery_pct: number | null
          connection_status: Database["public"]["Enums"]["device_connection_status"]
          created_at: string
          deleted_at: string | null
          device_type: Database["public"]["Enums"]["wearable_device_type"]
          elder_id: string
          external_device_id_hash: string | null
          id: string
          label: string
          last_seen_at: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          battery_pct?: number | null
          connection_status?: Database["public"]["Enums"]["device_connection_status"]
          created_at?: string
          deleted_at?: string | null
          device_type: Database["public"]["Enums"]["wearable_device_type"]
          elder_id: string
          external_device_id_hash?: string | null
          id?: string
          label: string
          last_seen_at?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          battery_pct?: number | null
          connection_status?: Database["public"]["Enums"]["device_connection_status"]
          created_at?: string
          deleted_at?: string | null
          device_type?: Database["public"]["Enums"]["wearable_device_type"]
          elder_id?: string
          external_device_id_hash?: string | null
          id?: string
          label?: string
          last_seen_at?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wearable_devices_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "wearable_devices_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_receipts: {
        Row: {
          body_hash: string
          elder_id: string | null
          event_id: string | null
          event_type: string | null
          id: string
          integration_key: string
          processed: boolean
          processed_at: string | null
          processing_error: string | null
          profile_id: string | null
          received_at: string
          signature_valid: boolean
        }
        Insert: {
          body_hash: string
          elder_id?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          integration_key: string
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          profile_id?: string | null
          received_at?: string
          signature_valid: boolean
        }
        Update: {
          body_hash?: string
          elder_id?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          integration_key?: string
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          profile_id?: string | null
          received_at?: string
          signature_valid?: boolean
        }
        Relationships: []
      }
      wellness_checkins: {
        Row: {
          captured_via: string | null
          checked_in_at: string
          checkin_type: string | null
          created_at: string
          elder_id: string
          energy_score: number | null
          id: string
          mood_score: number | null
          notes_en: string | null
          notes_nl: string | null
          pain_score: number | null
          voice_note_path: string | null
        }
        Insert: {
          captured_via?: string | null
          checked_in_at?: string
          checkin_type?: string | null
          created_at?: string
          elder_id: string
          energy_score?: number | null
          id?: string
          mood_score?: number | null
          notes_en?: string | null
          notes_nl?: string | null
          pain_score?: number | null
          voice_note_path?: string | null
        }
        Update: {
          captured_via?: string | null
          checked_in_at?: string
          checkin_type?: string | null
          created_at?: string
          elder_id?: string
          energy_score?: number | null
          id?: string
          mood_score?: number | null
          notes_en?: string | null
          notes_nl?: string | null
          pain_score?: number | null
          voice_note_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wellness_checkins_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "wellness_checkins_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      effective_carer_handover_notes: {
        Row: {
          administered_at: string | null
          administered_medication_id: string | null
          carer_id: string | null
          corrected_at: string | null
          correction_reason: string | null
          elder_id: string | null
          id: string | null
          is_corrected: boolean | null
          notes_nl: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carer_handover_notes_administered_medication_id_fkey"
            columns: ["administered_medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carer_handover_notes_carer_id_fkey"
            columns: ["carer_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "carer_handover_notes_carer_id_fkey"
            columns: ["carer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carer_handover_notes_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "carer_handover_notes_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_status_overview: {
        Row: {
          elder_id: string | null
          last_location_event_at: string | null
          locale: string | null
          medications_open_today: number | null
          preferred_name: string | null
          recent_alert_level: string | null
          unread_family_messages: number | null
        }
        Insert: {
          elder_id?: string | null
          last_location_event_at?: never
          locale?: string | null
          medications_open_today?: never
          preferred_name?: string | null
          recent_alert_level?: never
          unread_family_messages?: never
        }
        Update: {
          elder_id?: string | null
          last_location_event_at?: never
          locale?: string | null
          medications_open_today?: never
          preferred_name?: string | null
          recent_alert_level?: never
          unread_family_messages?: never
        }
        Relationships: []
      }
      family_location_events: {
        Row: {
          accuracy_metres: number | null
          check_in_prompted: boolean | null
          created_at: string | null
          elder_id: string | null
          event_type: string | null
          family_notified: boolean | null
          id: string | null
          location_fuzzed: unknown
        }
        Insert: {
          accuracy_metres?: number | null
          check_in_prompted?: boolean | null
          created_at?: string | null
          elder_id?: string | null
          event_type?: string | null
          family_notified?: boolean | null
          id?: string | null
          location_fuzzed?: unknown
        }
        Update: {
          accuracy_metres?: number | null
          check_in_prompted?: boolean | null
          created_at?: string | null
          elder_id?: string | null
          event_type?: string | null
          family_notified?: boolean | null
          id?: string | null
          location_fuzzed?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "location_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "elder_status_overview"
            referencedColumns: ["elder_id"]
          },
          {
            foreignKeyName: "location_events_elder_id_fkey"
            columns: ["elder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      app_role: { Args: never; Returns: string }
      can_send_notification: {
        Args: {
          p_profile_id: string
          p_type: Database["public"]["Enums"]["notification_type"]
        }
        Returns: boolean
      }
      carer_can: { Args: { p_elder_id: string }; Returns: boolean }
      check_medication_interactions_sql: {
        Args: { p_elder_id: string; p_new_med_name: string }
        Returns: {
          drug_a: string
          drug_b: string
          severity: string
          summary_nl: string
        }[]
      }
      check_stale_processing_transactions: { Args: never; Returns: undefined }
      cleanup_idempotency_keys: { Args: never; Returns: number }
      compute_daily_status_digests_batch: {
        Args: never
        Returns: {
          computed_reasons: string[]
          computed_status: string
          elder_id: string
        }[]
      }
      compute_weekly_safety_digests_batch: {
        Args: never
        Returns: {
          amber_count: number
          elder_id: string
          elder_name: string
          family_count: number
          meds_taken_pct: number
          rood_count: number
          scams_count: number
          zwart_count: number
        }[]
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      evaluate_feature_flag: {
        Args: { p_elder_id: string; p_flag_key: string }
        Returns: boolean
      }
      execute_haven_database_retention_sweeps: {
        Args: never
        Returns: undefined
      }
      execute_postgis_partition_retention: { Args: never; Returns: undefined }
      export_elder_data: { Args: { p_elder_id: string }; Returns: Json }
      family_can: {
        Args: { p_elder_id: string; p_permission: string }
        Returns: boolean
      }
      family_dashboard_summary: { Args: { p_elder_id: string }; Returns: Json }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_active_emergency_falls: {
        Args: never
        Returns: {
          confidence: number
          detected_at: string
          detection_source: string
          device_label: string
          device_platform: string
          elder_id: string
          fall_id: string
          status: string
        }[]
      }
      get_active_medication_reminders: {
        Args: { p_elder_id: string }
        Returns: {
          dose_description_nl: string
          medication_id: string
          medication_name_nl: string
          reminder_id: string
          scheduled_time: string
          status: string
        }[]
      }
      get_elder_screen_data_batch: {
        Args: { p_elder_id: string }
        Returns: Json
      }
      get_emergency_profile: { Args: { p_token: string }; Returns: Json }
      get_recent_emergency_locations: {
        Args: { p_elder_id: string; p_radius_m: number; p_target_loc: unknown }
        Returns: {
          distance_metres: number
          elder_id: string
          event_type: string
          location_id: string
          recorded_at: string
        }[]
      }
      get_stale_device_sessions_batch: {
        Args: never
        Returns: {
          age_hours: number
          elder_id: string
          elder_name: string
          last_seen: string
          session_id: string
        }[]
      }
      get_voice_pipeline_context: {
        Args: { p_elder_id: string }
        Returns: Json
      }
      gettransactionid: { Args: never; Returns: unknown }
      insert_location_event: {
        Args: {
          p_accuracy_metres: number
          p_elder_id: string
          p_event_type: string
          p_fuzzed_latitude: number
          p_fuzzed_longitude: number
          p_latitude: number
          p_longitude: number
          p_store_precise: boolean
        }
        Returns: string
      }
      is_valid_dutch_bsn: { Args: { p_candidate: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_family_messages_read: {
        Args: { p_message_ids: string[] }
        Returns: number
      }
      mark_reminder_taken: {
        Args: { p_elder_id: string; p_reminder_id: string }
        Returns: {
          confirmed_at: string | null
          created_at: string
          elder_id: string
          escalated_at: string | null
          family_notified_at: string | null
          first_reminded_at: string | null
          id: string
          idempotency_key: string | null
          medication_id: string
          scheduled_time: string
          snooze_count: number
          status: Database["public"]["Enums"]["reminder_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "medication_reminders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_companion_memory: {
        Args: {
          p_elder_id: string
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding: string
        }
        Returns: {
          content_en: string
          content_nl: string
          id: string
          importance_score: number
          memory_type: Database["public"]["Enums"]["memory_type"]
          similarity: number
        }[]
      }
      measure_function_slo: {
        Args: { p_fn_name: string; p_p95_budget_ms: number }
        Returns: Json
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      privileged_correct_clinical_record: {
        Args: {
          p_corrected_payload: Json
          p_correction_reason: string
          p_record_id: string
          p_table_name: string
        }
        Returns: undefined
      }
      promote_fhir_medication_staging: {
        Args: { p_staging_id: string }
        Returns: Json
      }
      purge_expired_telemetry_nonces: { Args: never; Returns: undefined }
      purge_stale_emergency_location_objects: {
        Args: never
        Returns: undefined
      }
      ratelimit_check: {
        Args: {
          p_key_hash: string
          p_max_requests: number
          p_window_start: string
        }
        Returns: boolean
      }
      record_app_event: {
        Args: {
          p_elder_id: string
          p_event_name: string
          p_profile_id: string
          p_properties?: Json
          p_surface: string
        }
        Returns: string
      }
      redact_sensitive_text: { Args: { p_text: string }; Returns: string }
      redact_sensitive_text_v2: {
        Args: {
          p_known_bsn: string
          p_known_email: string
          p_known_name: string
          p_known_phone: string
          p_text: string
        }
        Returns: string
      }
      run_pii_backfill_scan: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_purge_profile: { Args: { p_target_id: string }; Returns: undefined }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      alert_level: "none" | "amber" | "rood" | "zwart"
      breach_status:
        | "detected"
        | "triaged"
        | "contained"
        | "reported_to_ap"
        | "users_notified"
        | "closed"
      browser_risk_level: "none" | "amber" | "rood" | "zwart"
      care_plan_status: "draft" | "active" | "paused" | "archived"
      carer_role:
        | "thuiszorgmedewerker"
        | "wijkverpleegkundige"
        | "huisarts"
        | "specialist"
        | "andere"
      compliance_record_status:
        | "draft"
        | "in_review"
        | "approved"
        | "rejected"
        | "expired"
      confirmation_type: "medication_taken" | "fall_response"
      connection_status:
        | "pending_initiator"
        | "pending_recipient"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "ended"
      deletion_request_status:
        | "received"
        | "verifying"
        | "processing"
        | "completed"
        | "rejected"
        | "legal_hold"
      device_connection_status: "active" | "paused" | "lost" | "revoked"
      driving_event_type:
        | "hard_braking"
        | "sharp_turn"
        | "unusual_hour"
        | "long_journey"
        | "wrong_way_suspected"
        | "trip_summary"
      fall_status:
        | "possible"
        | "confirmed"
        | "false_alarm"
        | "no_response"
        | "resolved"
        | "processing"
        | "family_alerted"
      fhir_staging_status: "pending_review" | "approved" | "rejected"
      financial_consent_status: "requested" | "active" | "revoked" | "expired"
      integration_environment: "mock" | "sandbox" | "production"
      integration_job_status:
        | "queued"
        | "running"
        | "completed"
        | "failed"
        | "disabled"
      integration_status:
        | "not_configured"
        | "configured"
        | "healthy"
        | "degraded"
        | "disabled"
      interaction_severity: "info" | "warn" | "critical"
      legacy_action:
        | "delete"
        | "transfer"
        | "memorialize"
        | "archive"
        | "no_action"
      medication_catalog_provider:
        | "g_standaard"
        | "z_index"
        | "manual"
        | "pharmacy"
      medication_frequency:
        | "dagelijks"
        | "eenmaal_daags"
        | "tweemaal_daags"
        | "driemaal_daags"
        | "wekelijks"
        | "maandelijks"
        | "zo_nodig"
        | "andere"
      memory_type:
        | "personal_fact"
        | "preference"
        | "recurring_event"
        | "life_event"
        | "emotional_state"
        | "medical_context"
      notification_type:
        | "medicijn_herinnering"
        | "medicijn_gemist"
        | "scam_amber"
        | "scam_rood"
        | "scam_zwart"
        | "veilige_zone_verlaten"
        | "crisis_gedetecteerd"
        | "familiebericht"
        | "welzijnscheck"
        | "wekelijks_overzicht"
        | "systeem"
        | "buurt_verzoek"
      partner_feed_status: "active" | "paused" | "error" | "retired"
      processing_job_status:
        | "queued"
        | "processing"
        | "completed"
        | "needs_review"
        | "rejected"
      refill_status:
        | "not_needed"
        | "due_soon"
        | "requested"
        | "ordered"
        | "collected"
        | "cancelled"
      relationship_type:
        | "kind"
        | "partner"
        | "kleinkind"
        | "broer_zus"
        | "vriend"
        | "buur"
        | "andere"
      release_check_status: "pending" | "passed" | "failed" | "waived"
      reminder_status:
        | "gepland"
        | "herinnerd"
        | "gesnoozed_1"
        | "gesnoozed_2"
        | "geëscaleerd"
        | "ingenomen"
        | "laat_ingenomen"
        | "gemist"
        | "overgeslagen"
      scam_channel:
        | "phone"
        | "sms"
        | "whatsapp"
        | "email"
        | "web"
        | "in_person"
        | "post"
      scam_threat_type:
        | "bankhelpdeskfraude"
        | "vriend_in_nood"
        | "overheid_impersonatie"
        | "romantische_fraude"
        | "investeringsfraude"
        | "pakketfraude"
        | "phishing"
        | "andere"
      skill_exchange_status:
        | "offered"
        | "requested"
        | "matched"
        | "completed"
        | "cancelled"
      story_status: "opname" | "transcriberen" | "gereed" | "gearchiveerd"
      transport_status:
        | "not_needed"
        | "family_arranging"
        | "requested"
        | "booked"
        | "confirmed"
        | "completed"
        | "cancelled"
      user_role: "elder" | "family" | "carer" | "admin" | "system"
      video_call_status: "created" | "ringing" | "joined" | "ended" | "failed"
      vital_type:
        | "blood_pressure_systolic"
        | "blood_pressure_diastolic"
        | "heart_rate"
        | "blood_oxygen"
        | "blood_glucose"
        | "weight"
        | "temperature"
      voice_profile_status: "pending" | "ready" | "failed" | "revoked"
      wearable_device_type:
        | "gps_watch"
        | "airtag"
        | "tile"
        | "matter_sensor"
        | "phone"
        | "other"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_level: ["none", "amber", "rood", "zwart"],
      breach_status: [
        "detected",
        "triaged",
        "contained",
        "reported_to_ap",
        "users_notified",
        "closed",
      ],
      browser_risk_level: ["none", "amber", "rood", "zwart"],
      care_plan_status: ["draft", "active", "paused", "archived"],
      carer_role: [
        "thuiszorgmedewerker",
        "wijkverpleegkundige",
        "huisarts",
        "specialist",
        "andere",
      ],
      compliance_record_status: [
        "draft",
        "in_review",
        "approved",
        "rejected",
        "expired",
      ],
      confirmation_type: ["medication_taken", "fall_response"],
      connection_status: [
        "pending_initiator",
        "pending_recipient",
        "accepted",
        "declined",
        "withdrawn",
        "ended",
      ],
      deletion_request_status: [
        "received",
        "verifying",
        "processing",
        "completed",
        "rejected",
        "legal_hold",
      ],
      device_connection_status: ["active", "paused", "lost", "revoked"],
      driving_event_type: [
        "hard_braking",
        "sharp_turn",
        "unusual_hour",
        "long_journey",
        "wrong_way_suspected",
        "trip_summary",
      ],
      fall_status: [
        "possible",
        "confirmed",
        "false_alarm",
        "no_response",
        "resolved",
        "processing",
        "family_alerted",
      ],
      fhir_staging_status: ["pending_review", "approved", "rejected"],
      financial_consent_status: ["requested", "active", "revoked", "expired"],
      integration_environment: ["mock", "sandbox", "production"],
      integration_job_status: [
        "queued",
        "running",
        "completed",
        "failed",
        "disabled",
      ],
      integration_status: [
        "not_configured",
        "configured",
        "healthy",
        "degraded",
        "disabled",
      ],
      interaction_severity: ["info", "warn", "critical"],
      legacy_action: [
        "delete",
        "transfer",
        "memorialize",
        "archive",
        "no_action",
      ],
      medication_catalog_provider: [
        "g_standaard",
        "z_index",
        "manual",
        "pharmacy",
      ],
      medication_frequency: [
        "dagelijks",
        "eenmaal_daags",
        "tweemaal_daags",
        "driemaal_daags",
        "wekelijks",
        "maandelijks",
        "zo_nodig",
        "andere",
      ],
      memory_type: [
        "personal_fact",
        "preference",
        "recurring_event",
        "life_event",
        "emotional_state",
        "medical_context",
      ],
      notification_type: [
        "medicijn_herinnering",
        "medicijn_gemist",
        "scam_amber",
        "scam_rood",
        "scam_zwart",
        "veilige_zone_verlaten",
        "crisis_gedetecteerd",
        "familiebericht",
        "welzijnscheck",
        "wekelijks_overzicht",
        "systeem",
        "buurt_verzoek",
      ],
      partner_feed_status: ["active", "paused", "error", "retired"],
      processing_job_status: [
        "queued",
        "processing",
        "completed",
        "needs_review",
        "rejected",
      ],
      refill_status: [
        "not_needed",
        "due_soon",
        "requested",
        "ordered",
        "collected",
        "cancelled",
      ],
      relationship_type: [
        "kind",
        "partner",
        "kleinkind",
        "broer_zus",
        "vriend",
        "buur",
        "andere",
      ],
      release_check_status: ["pending", "passed", "failed", "waived"],
      reminder_status: [
        "gepland",
        "herinnerd",
        "gesnoozed_1",
        "gesnoozed_2",
        "geëscaleerd",
        "ingenomen",
        "laat_ingenomen",
        "gemist",
        "overgeslagen",
      ],
      scam_channel: [
        "phone",
        "sms",
        "whatsapp",
        "email",
        "web",
        "in_person",
        "post",
      ],
      scam_threat_type: [
        "bankhelpdeskfraude",
        "vriend_in_nood",
        "overheid_impersonatie",
        "romantische_fraude",
        "investeringsfraude",
        "pakketfraude",
        "phishing",
        "andere",
      ],
      skill_exchange_status: [
        "offered",
        "requested",
        "matched",
        "completed",
        "cancelled",
      ],
      story_status: ["opname", "transcriberen", "gereed", "gearchiveerd"],
      transport_status: [
        "not_needed",
        "family_arranging",
        "requested",
        "booked",
        "confirmed",
        "completed",
        "cancelled",
      ],
      user_role: ["elder", "family", "carer", "admin", "system"],
      video_call_status: ["created", "ringing", "joined", "ended", "failed"],
      vital_type: [
        "blood_pressure_systolic",
        "blood_pressure_diastolic",
        "heart_rate",
        "blood_oxygen",
        "blood_glucose",
        "weight",
        "temperature",
      ],
      voice_profile_status: ["pending", "ready", "failed", "revoked"],
      wearable_device_type: [
        "gps_watch",
        "airtag",
        "tile",
        "matter_sensor",
        "phone",
        "other",
      ],
    },
  },
} as const
