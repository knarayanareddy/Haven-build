-- HAVEN v1.2.1 production schema for Supabase (EU / NL)
-- Generated from designdoc.md SSOT on 2026-06-11.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "postgis";
create extension if not exists "pg_cron";
create extension if not exists "pg_trgm";

create type user_role as enum ('elder','family','carer','admin');
create type alert_level as enum ('none','amber','rood','zwart');
create type scam_channel as enum ('phone','sms','whatsapp','email','web','in_person','post');
create type scam_threat_type as enum ('bankhelpdeskfraude','vriend_in_nood','overheid_impersonatie','romantische_fraude','investeringsfraude','pakketfraude','phishing','andere');
create type medication_frequency as enum ('dagelijks','eenmaal_daags','tweemaal_daags','driemaal_daags','wekelijks','maandelijks','zo_nodig','andere');
create type reminder_status as enum ('gepland','herinnerd','gesnoozed_1','gesnoozed_2','geëscaleerd','ingenomen','laat_ingenomen','gemist','overgeslagen');
create type relationship_type as enum ('kind','partner','kleinkind','broer_zus','vriend','buur','andere');
create type carer_role as enum ('thuiszorgmedewerker','wijkverpleegkundige','huisarts','specialist','andere');
create type notification_type as enum ('medicijn_herinnering','medicijn_gemist','scam_amber','scam_rood','scam_zwart','veilige_zone_verlaten','crisis_gedetecteerd','familiebericht','welzijnscheck','wekelijks_overzicht','systeem','buurt_verzoek');
create type story_status as enum ('opname','transcriberen','gereed','gearchiveerd');
create type memory_type as enum ('personal_fact','preference','recurring_event','life_event','emotional_state','medical_context');
create type connection_status as enum ('pending_initiator','pending_recipient','accepted','declined','withdrawn','ended');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  preferred_name text,
  phone_nl text,
  locale text not null default 'en-GB' check (locale in ('en-GB','nl-NL')),
  timezone text not null default 'Europe/Amsterdam',
  country_code char(2) not null default 'NL',
  high_contrast boolean not null default false,
  font_size_multiplier numeric(3,2) not null default 1.00 check (font_size_multiplier between 1 and 2),
  voice_id text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table elder_profiles (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid unique not null references profiles(id) on delete cascade,
  safe_zone_centre geography(point,4326),
  safe_zone_radius_m integer default 500,
  safe_zone_label_nl text,
  night_mode_start time default '22:00',
  night_mode_end time default '08:00',
  night_mode_active boolean default false,
  cognitive_support boolean default false,
  bereavement_active boolean default false,
  bereavement_since date,
  emergency_contacts jsonb default '[]'::jsonb,
  medical_summary_nl text,
  huisarts_name text,
  huisarts_phone text,
  allergies_nl text[],
  conditions_nl text[],
  font_scale numeric(3,2) default 1.0,
  high_contrast boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table family_relationships (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  family_member_id uuid not null references profiles(id) on delete cascade,
  relation_label_nl text,
  relation_type relationship_type default 'kind',
  is_primary boolean default false,
  elder_consented boolean default false,
  elder_consented_at timestamptz,
  is_active boolean default true,
  can_view_medications boolean default false,
  can_view_messages boolean default false,
  can_view_location_events boolean default false,
  can_view_alerts boolean default false,
  can_view_stories boolean default false,
  can_view_financials boolean default false,
  notify_on_scam_amber boolean default true,
  notify_on_scam_rood boolean default true,
  notify_on_scam_zwart boolean default true,
  notify_on_missed_meds boolean default true,
  notify_on_safe_zone_exit boolean default true,
  notify_on_crisis boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  unique (elder_id,family_member_id)
);

create table carer_relationships (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  carer_member_id uuid not null references profiles(id) on delete cascade,
  organisation_nl text,
  role_label_nl text,
  carer_role carer_role default 'thuiszorgmedewerker',
  elder_consented boolean default false,
  elder_consented_at timestamptz,
  is_active boolean default true,
  can_view_medications boolean default false,
  can_view_visit_logs boolean default true,
  can_create_visit_logs boolean default true,
  can_file_incidents boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  unique (elder_id,carer_member_id)
);

create table consent_records (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  consent_type text not null,
  granted boolean not null,
  consent_version text not null default '1.2.1',
  channel text not null default 'elder_app',
  ip_address_hashed text,
  device_id text,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);

create table feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_key text unique not null,
  description text,
  enabled boolean default false,
  rollout_pct integer default 0 check (rollout_pct between 0 and 100),
  elder_ids uuid[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  display_name text not null,
  phone_hashed text,
  email_hashed text,
  relationship_label text,
  is_trusted boolean not null default false,
  interaction_count int not null default 0,
  last_interaction_at timestamptz,
  grooming_risk_score smallint default 0 check (grooming_risk_score between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table phone_reputation_cache (
  id uuid primary key default gen_random_uuid(),
  phone_hashed text not null unique,
  reputation_score smallint not null check (reputation_score between 0 and 100),
  source text not null,
  report_count int default 0,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create table scam_events (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  contact_id uuid references contacts(id),
  channel scam_channel not null,
  signal_reference_hashed text not null,
  raw_content_hash text not null,
  threat_types scam_threat_type[],
  alert_level alert_level not null default 'none',
  score_composite smallint not null default 0 check (score_composite between 0 and 100),
  score_reputation smallint check (score_reputation between 0 and 100),
  score_pattern smallint check (score_pattern between 0 and 100),
  score_nlp_intent smallint check (score_nlp_intent between 0 and 100),
  score_longitudinal smallint check (score_longitudinal between 0 and 100),
  explanation_nl text not null,
  explanation_en text,
  embedding vector(1536),
  elder_dismissed boolean not null default false,
  elder_dismissed_at timestamptz,
  family_notified boolean not null default false,
  family_notified_at timestamptz,
  transaction_intercepted boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  label_nl text not null,
  label_en text,
  document_type text not null,
  storage_path text not null,
  summary_nl text,
  summary_en text,
  is_sensitive_legal boolean not null default false,
  in_emergency_profile boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table financial_transactions (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  account_id_masked text not null,
  bank_name text,
  amount_cents bigint not null,
  currency char(3) not null default 'EUR',
  counterparty_name text,
  counterparty_iban_masked text,
  description text,
  transaction_date date not null,
  anomaly_score smallint default 0,
  flagged boolean not null default false,
  linked_scam_event_id uuid references scam_events(id),
  intercepted boolean default false,
  elder_reviewed boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table scam_events add column linked_transaction_id uuid references financial_transactions(id);

create table safety_digests (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  week_starting date not null,
  scam_events_count int not null default 0,
  amber_count int not null default 0,
  rood_count int not null default 0,
  zwart_count int not null default 0,
  medications_taken_pct numeric(5,2),
  wellness_avg_score numeric(5,2),
  family_interactions int not null default 0,
  summary_nl text,
  summary_en text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(elder_id, week_starting)
);

create table medications (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  name_nl text not null,
  name_en text,
  brand_name_nl text,
  dose_description_nl text not null,
  dose_description_en text,
  frequency medication_frequency not null,
  schedule_times time[] not null,
  instructions_nl text,
  instructions_en text,
  with_food boolean default false,
  current_stock integer,
  refill_threshold integer,
  refill_pharmacy_nl text,
  ocr_source_path text,
  prescribed_by_nl text,
  is_active boolean default true,
  start_date date,
  end_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table medication_reminders (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references medications(id) on delete cascade,
  elder_id uuid not null references profiles(id) on delete cascade,
  scheduled_time timestamptz not null,
  status reminder_status not null default 'gepland',
  snooze_count smallint not null default 0,
  first_reminded_at timestamptz,
  confirmed_at timestamptz,
  escalated_at timestamptz,
  family_notified_at timestamptz,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  created_by_role user_role not null default 'elder',
  title_nl text not null,
  title_en text,
  notes_nl text,
  notes_en text,
  due_date date,
  due_time time,
  completed boolean not null default false,
  completed_at timestamptz,
  voice_created boolean not null default false,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table wellness_checkins (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  mood_score smallint check (mood_score between 1 and 5),
  energy_score smallint check (energy_score between 1 and 5),
  pain_score smallint check (pain_score between 1 and 5),
  notes_nl text,
  notes_en text,
  voice_note_path text,
  checked_in_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table family_messages (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  sender_role user_role not null,
  message_type text not null check (message_type in ('tekst','voice_note','foto','video_hallo','tekening')),
  content_nl text,
  content_en text,
  storage_path text,
  duration_seconds int,
  read_by_elder boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table life_story_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt_nl text not null,
  prompt_en text not null,
  category_nl text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table life_stories (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  prompt_id uuid references life_story_prompts(id),
  title_nl text,
  title_en text,
  recording_path text,
  transcript_nl text,
  transcript_en text,
  duration_seconds int,
  status story_status not null default 'opname',
  embedding vector(1536),
  keepsake_book_include boolean not null default false,
  year_approximate int,
  location_nl text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table memory_lane_photos (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  uploaded_by_id uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  caption_nl text,
  caption_en text,
  year_approximate int,
  date_taken date,
  location_nl text,
  is_memorial boolean not null default false,
  surface_on_anniversary boolean not null default false,
  anniversary_date date,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table interest_tags (
  id uuid primary key default gen_random_uuid(),
  tag_key text unique not null,
  label_nl text not null,
  label_en text not null,
  category_nl text,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table neighbourhood_profiles (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid unique not null references profiles(id) on delete cascade,
  postcode_pc4 char(4) not null check (length(postcode_pc4)=4),
  neighbourhood_label text,
  radius_km integer default 2 check (radius_km between 1 and 5),
  is_active boolean default false,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  walk_buddy_seeking boolean default false,
  walk_preferred_time text,
  family_can_see_connections boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table elder_interest_tags (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  tag_id uuid not null references interest_tags(id) on delete cascade,
  created_at timestamptz default now(),
  unique(elder_id, tag_id)
);

create table neighbourhood_connections (
  id uuid primary key default gen_random_uuid(),
  initiator_elder_id uuid not null references profiles(id) on delete cascade,
  recipient_elder_id uuid not null references profiles(id) on delete cascade,
  status connection_status default 'pending_initiator',
  shared_tag_ids uuid[],
  initiator_accepted_at timestamptz,
  recipient_accepted_at timestamptz,
  is_walk_buddy_match boolean default false,
  ended_by uuid references profiles(id),
  ended_reason_internal text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint no_self_connection check (initiator_elder_id <> recipient_elder_id),
  unique(initiator_elder_id, recipient_elder_id)
);

create table neighbourhood_events (
  id uuid primary key default gen_random_uuid(),
  postcode_pc4 char(4) not null,
  location_label_nl text not null,
  location_label_en text,
  distance_label_nl text,
  distance_label_en text,
  title_nl text not null,
  title_en text,
  description_nl text,
  description_en text,
  event_date date not null,
  event_time time,
  is_free boolean default true,
  relevant_tag_ids uuid[],
  source text default 'manual',
  source_url text,
  is_active boolean default true,
  created_at timestamptz default now(),
  expires_at timestamptz
);

create table event_interests (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  event_id uuid not null references neighbourhood_events(id) on delete cascade,
  interested_at timestamptz default now(),
  unique(elder_id, event_id)
);

create table location_events (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  event_type text not null check (event_type in ('veilige_zone_verlaten','veilige_zone_teruggekeerd','check_in','nacht_beweging')),
  location_fuzzed geometry(point,4326) not null,
  location_precise geometry(point,4326),
  accuracy_metres int,
  family_notified boolean not null default false,
  check_in_prompted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  auto_delete_at timestamptz,
  deleted_at timestamptz
);

create table cognitive_checkins (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  question_nl text not null,
  question_en text,
  answer_nl text,
  expected_answer_nl text,
  correct boolean,
  confidence_score numeric(4,3),
  rolling_score_7d numeric(4,3),
  significant_change boolean not null default false,
  checked_in_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table voice_interactions (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  screen_id text not null,
  transcript_nl text,
  transcript_en text,
  intent text,
  entities jsonb,
  confidence_score numeric(4,3),
  response_text_nl text,
  response_text_en text,
  response_audio_path text,
  distress_detected boolean not null default false,
  distress_phrase text,
  action_taken text,
  duration_ms int,
  embedding vector(1536),
  audio_path text,
  created_at timestamptz not null default now(),
  auto_delete_audio_at timestamptz default now() + interval '30 days',
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table companion_memory (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  memory_type memory_type not null,
  content_nl text not null,
  content_en text,
  importance_score integer default 5 check (importance_score between 1 and 10),
  embedding vector(1536),
  source text check (source in ('voice_interaction','life_story','manual','anker_sync')),
  source_id uuid,
  last_referenced timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table carer_visit_logs (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  carer_id uuid not null references profiles(id) on delete cascade,
  visit_date date not null,
  check_in_time timestamptz,
  check_out_time timestamptz,
  activities_nl text[],
  observations_nl text,
  mood_observed smallint check (mood_observed between 1 and 5),
  concerns_nl text,
  follow_up_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  reported_by_id uuid not null references profiles(id) on delete cascade,
  incident_type text not null,
  description_nl text not null,
  severity text not null check (severity in ('laag','gemiddeld','hoog','kritiek')),
  meldcode_step_reached smallint check (meldcode_step_reached between 1 and 5),
  external_report_made boolean not null default false,
  external_authority_nl text,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolution_notes_nl text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  elder_id uuid references profiles(id) on delete cascade,
  notification_type notification_type not null,
  title_nl text not null,
  title_en text,
  body_nl text not null,
  body_en text,
  data jsonb,
  read boolean not null default false,
  read_at timestamptz,
  sent_at timestamptz,
  send_error text,
  created_at timestamptz not null default now()
);

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios','android','web')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  actor_id uuid,
  actor_role user_role,
  action text not null,
  table_name text not null,
  record_id uuid,
  elder_id uuid,
  ip_address_hash text,
  user_agent text,
  extra jsonb,
  created_at timestamptz not null default now()
);

create table perf_metrics (
  id uuid primary key default gen_random_uuid(),
  fn_name text not null,
  duration_ms integer not null,
  status text not null check (status in ('success','error','fallback')),
  env text default 'production',
  recorded_at timestamptz default now()
);

-- indexes
create index idx_profiles_role on profiles(role);
create index idx_family_relationships_elder on family_relationships(elder_id);
create index idx_family_relationships_family on family_relationships(family_member_id);
create index idx_carer_relationships_elder on carer_relationships(elder_id);
create index idx_contacts_elder on contacts(elder_id);
create index idx_scam_events_elder_created on scam_events(elder_id, created_at desc);
create index idx_scam_events_alert_level on scam_events(alert_level);
create index idx_scam_events_embedding on scam_events using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
create index idx_documents_elder on documents(elder_id) where deleted_at is null;
create index idx_medications_elder_active on medications(elder_id) where deleted_at is null and is_active = true;
create index idx_med_reminders_elder_scheduled on medication_reminders(elder_id, scheduled_time desc);
create index idx_med_reminders_status on medication_reminders(status) where status not in ('ingenomen','overgeslagen');
create index idx_tasks_elder_due on tasks(elder_id, due_date, due_time) where deleted_at is null;
create index idx_family_messages_elder_created on family_messages(elder_id, created_at desc) where deleted_at is null;
create index idx_life_stories_elder on life_stories(elder_id) where deleted_at is null;
create index idx_life_stories_embedding on life_stories using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
create index idx_nbhd_profile_pc4 on neighbourhood_profiles(postcode_pc4) where is_active = true and deleted_at is null;
create index idx_elder_tags_elder on elder_interest_tags(elder_id);
create index idx_nbhd_conn_participants on neighbourhood_connections(initiator_elder_id, recipient_elder_id);
create index idx_nbhd_events_pc4_date on neighbourhood_events(postcode_pc4, event_date) where is_active = true;
create index idx_location_events_elder_created on location_events(elder_id, created_at desc);
create index idx_location_events_fuzzed on location_events using gist(location_fuzzed);
create index idx_voice_interactions_elder_created on voice_interactions(elder_id, created_at desc);
create index idx_voice_interactions_embedding on voice_interactions using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
create index idx_companion_memory_elder on companion_memory(elder_id) where deleted_at is null;
create index idx_companion_memory_embedding on companion_memory using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
create index idx_notifications_recipient_read on notifications(recipient_id, read, created_at desc);
create index idx_push_tokens_profile on push_tokens(profile_id) where is_active = true;

-- updated_at triggers
create trigger profiles_updated_at before update on profiles for each row execute function public.set_updated_at();
create trigger elder_profiles_updated_at before update on elder_profiles for each row execute function public.set_updated_at();
create trigger family_relationships_updated_at before update on family_relationships for each row execute function public.set_updated_at();
create trigger carer_relationships_updated_at before update on carer_relationships for each row execute function public.set_updated_at();
create trigger contacts_updated_at before update on contacts for each row execute function public.set_updated_at();
create trigger scam_events_updated_at before update on scam_events for each row execute function public.set_updated_at();
create trigger documents_updated_at before update on documents for each row execute function public.set_updated_at();
create trigger medications_updated_at before update on medications for each row execute function public.set_updated_at();
create trigger medication_reminders_updated_at before update on medication_reminders for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on tasks for each row execute function public.set_updated_at();
create trigger family_messages_updated_at before update on family_messages for each row execute function public.set_updated_at();
create trigger life_stories_updated_at before update on life_stories for each row execute function public.set_updated_at();
create trigger neighbourhood_profiles_updated_at before update on neighbourhood_profiles for each row execute function public.set_updated_at();
create trigger neighbourhood_connections_updated_at before update on neighbourhood_connections for each row execute function public.set_updated_at();
create trigger voice_interactions_updated_at before update on voice_interactions for each row execute function public.set_updated_at();
create trigger companion_memory_updated_at before update on companion_memory for each row execute function public.set_updated_at();
create trigger carer_visit_logs_updated_at before update on carer_visit_logs for each row execute function public.set_updated_at();
create trigger incidents_updated_at before update on incidents for each row execute function public.set_updated_at();
create trigger push_tokens_updated_at before update on push_tokens for each row execute function public.set_updated_at();

-- helper functions for RLS
create or replace function auth.app_role()
returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'app_role', current_setting('request.jwt.claims', true)::jsonb->>'role', 'anonymous')
$$;

create or replace function auth.family_can(p_elder_id uuid, p_permission text)
returns boolean language sql stable as $$
  select exists (
    select 1 from family_relationships fr
    where fr.family_member_id = auth.uid()
      and fr.elder_id = p_elder_id
      and fr.elder_consented = true
      and fr.is_active = true
      and fr.deleted_at is null
      and case p_permission
        when 'medications' then fr.can_view_medications
        when 'messages' then fr.can_view_messages
        when 'location' then fr.can_view_location_events
        when 'alerts' then fr.can_view_alerts
        when 'stories' then fr.can_view_stories
        when 'financials' then fr.can_view_financials
        else false end = true
  )
$$;

create or replace function auth.carer_can(p_elder_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from carer_relationships cr
    where cr.carer_member_id = auth.uid()
      and cr.elder_id = p_elder_id
      and cr.elder_consented = true
      and cr.is_active = true
      and cr.deleted_at is null
  )
$$;

-- enable and force RLS
alter table profiles enable row level security; alter table profiles force row level security;
alter table elder_profiles enable row level security; alter table elder_profiles force row level security;
alter table family_relationships enable row level security; alter table family_relationships force row level security;
alter table carer_relationships enable row level security; alter table carer_relationships force row level security;
alter table consent_records enable row level security; alter table consent_records force row level security;
alter table feature_flags enable row level security; alter table feature_flags force row level security;
alter table contacts enable row level security; alter table contacts force row level security;
alter table scam_events enable row level security; alter table scam_events force row level security;
alter table documents enable row level security; alter table documents force row level security;
alter table financial_transactions enable row level security; alter table financial_transactions force row level security;
alter table safety_digests enable row level security; alter table safety_digests force row level security;
alter table medications enable row level security; alter table medications force row level security;
alter table medication_reminders enable row level security; alter table medication_reminders force row level security;
alter table tasks enable row level security; alter table tasks force row level security;
alter table wellness_checkins enable row level security; alter table wellness_checkins force row level security;
alter table family_messages enable row level security; alter table family_messages force row level security;
alter table life_story_prompts enable row level security; alter table life_story_prompts force row level security;
alter table life_stories enable row level security; alter table life_stories force row level security;
alter table memory_lane_photos enable row level security; alter table memory_lane_photos force row level security;
alter table interest_tags enable row level security; alter table interest_tags force row level security;
alter table neighbourhood_profiles enable row level security; alter table neighbourhood_profiles force row level security;
alter table elder_interest_tags enable row level security; alter table elder_interest_tags force row level security;
alter table neighbourhood_connections enable row level security; alter table neighbourhood_connections force row level security;
alter table neighbourhood_events enable row level security; alter table neighbourhood_events force row level security;
alter table event_interests enable row level security; alter table event_interests force row level security;
alter table location_events enable row level security; alter table location_events force row level security;
alter table cognitive_checkins enable row level security; alter table cognitive_checkins force row level security;
alter table voice_interactions enable row level security; alter table voice_interactions force row level security;
alter table companion_memory enable row level security; alter table companion_memory force row level security;
alter table carer_visit_logs enable row level security; alter table carer_visit_logs force row level security;
alter table incidents enable row level security; alter table incidents force row level security;
alter table notifications enable row level security; alter table notifications force row level security;
alter table push_tokens enable row level security; alter table push_tokens force row level security;
alter table audit_log enable row level security; alter table audit_log force row level security;
alter table perf_metrics enable row level security; alter table perf_metrics force row level security;

-- RLS policies
create policy profiles_select_own on profiles for select using (id = auth.uid());
create policy profiles_update_own on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert_own on profiles for insert with check (id = auth.uid());

create policy elder_profiles_self on elder_profiles for all using (elder_id = auth.uid()) with check (elder_id = auth.uid());
create policy elder_profiles_family on elder_profiles for select using (auth.family_can(elder_id,'alerts'));
create policy elder_profiles_carer on elder_profiles for select using (auth.carer_can(elder_id));

create policy family_relationships_elder on family_relationships for all using (elder_id = auth.uid()) with check (elder_id = auth.uid());
create policy family_relationships_family_select on family_relationships for select using (family_member_id = auth.uid());
create policy family_relationships_family_insert on family_relationships for insert with check (family_member_id = auth.uid() and elder_consented = false);

create policy carer_relationships_elder on carer_relationships for select using (elder_id = auth.uid());
create policy carer_relationships_carer on carer_relationships for select using (carer_member_id = auth.uid());

create policy consent_records_elder on consent_records for all using (elder_id = auth.uid()) with check (elder_id = auth.uid());
create policy feature_flags_authenticated_read on feature_flags for select using (auth.role() = 'authenticated');

create policy contacts_elder on contacts for all using (elder_id = auth.uid()) with check (elder_id = auth.uid());
create policy contacts_family on contacts for select using (auth.family_can(elder_id,'messages'));

create policy scam_events_elder on scam_events for select using (elder_id = auth.uid() and deleted_at is null);
create policy scam_events_family on scam_events for select using (auth.family_can(elder_id,'alerts') and deleted_at is null);

create policy documents_elder on documents for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());

create policy financial_elder on financial_transactions for select using (elder_id = auth.uid() and deleted_at is null);
create policy financial_family on financial_transactions for select using (auth.family_can(elder_id,'financials') and deleted_at is null);

create policy safety_digests_elder on safety_digests for select using (elder_id = auth.uid());
create policy safety_digests_family on safety_digests for select using (auth.family_can(elder_id,'alerts'));

create policy medications_elder on medications for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy medications_family on medications for select using (auth.family_can(elder_id,'medications') and deleted_at is null);
create policy medication_reminders_elder on medication_reminders for all using (elder_id = auth.uid()) with check (elder_id = auth.uid());
create policy medication_reminders_family on medication_reminders for select using (auth.family_can(elder_id,'medications'));

create policy tasks_elder on tasks for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy tasks_family on tasks for select using (auth.family_can(elder_id,'messages') and deleted_at is null);
create policy wellness_elder on wellness_checkins for all using (elder_id = auth.uid()) with check (elder_id = auth.uid());
create policy wellness_family on wellness_checkins for select using (auth.family_can(elder_id,'alerts'));

create policy family_messages_elder on family_messages for select using (elder_id = auth.uid() and deleted_at is null);
create policy family_messages_sender on family_messages for select using (sender_id = auth.uid() and deleted_at is null);
create policy family_messages_insert_elder on family_messages for insert with check (elder_id = auth.uid() and sender_id = auth.uid());
create policy family_messages_insert_family on family_messages for insert with check (sender_id = auth.uid() and auth.family_can(elder_id,'messages'));
create policy family_messages_family on family_messages for select using (auth.family_can(elder_id,'messages') and deleted_at is null);

create policy prompts_read_all on life_story_prompts for select using (active = true);
create policy stories_elder on life_stories for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy stories_family on life_stories for select using (auth.family_can(elder_id,'stories') and deleted_at is null);
create policy photos_elder on memory_lane_photos for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy photos_family on memory_lane_photos for select using (auth.family_can(elder_id,'stories') and deleted_at is null);

create policy interest_tags_read on interest_tags for select using (is_active = true);
create policy nbhd_profile_self on neighbourhood_profiles for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy nbhd_profile_family on neighbourhood_profiles for select using (auth.family_can(elder_id,'stories') and family_can_see_connections = true and deleted_at is null);
create policy elder_tags_self on elder_interest_tags for all using (elder_id = auth.uid()) with check (elder_id = auth.uid());
create policy nbhd_conn_participant on neighbourhood_connections for select using (initiator_elder_id = auth.uid() or recipient_elder_id = auth.uid());
create policy nbhd_events_read on neighbourhood_events for select using (is_active = true);
create policy event_interests_self on event_interests for all using (elder_id = auth.uid()) with check (elder_id = auth.uid());

create policy location_elder on location_events for select using (elder_id = auth.uid() and deleted_at is null);
create policy location_family on location_events for select using (auth.family_can(elder_id,'location') and deleted_at is null);
create policy cognitive_elder on cognitive_checkins for select using (elder_id = auth.uid());
create policy cognitive_family on cognitive_checkins for select using (auth.family_can(elder_id,'alerts'));

create policy voice_elder on voice_interactions for select using (elder_id = auth.uid() and deleted_at is null);
create policy memory_elder_only on companion_memory for select using (elder_id = auth.uid() and deleted_at is null);

create policy visits_elder on carer_visit_logs for select using (elder_id = auth.uid() and deleted_at is null);
create policy visits_carer on carer_visit_logs for all using (auth.carer_can(elder_id) and deleted_at is null) with check (auth.carer_can(elder_id));
create policy incidents_elder on incidents for select using (elder_id = auth.uid());
create policy incidents_carer on incidents for all using (auth.carer_can(elder_id)) with check (auth.carer_can(elder_id));

create policy notifications_self on notifications for select using (recipient_id = auth.uid());
create policy notifications_update_self on notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy push_tokens_self on push_tokens for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- retention functions and scheduled jobs (pg_cron extension enabled in hosted Supabase)
create or replace function public.set_memory_expiry()
returns trigger language plpgsql as $$
begin
  if new.expires_at is null then
    new.expires_at := case new.memory_type
      when 'personal_fact' then null
      when 'preference' then now() + interval '1 year'
      when 'recurring_event' then now() + interval '6 months'
      when 'life_event' then null
      when 'emotional_state' then now() + interval '90 days'
      when 'medical_context' then now() + interval '1 year'
      else now() + interval '6 months'
    end;
  end if;
  return new;
end $$;
create trigger companion_memory_expiry before insert on companion_memory for each row execute function public.set_memory_expiry();

insert into interest_tags (tag_key,label_nl,label_en,category_nl,sort_order) values
('tuinieren','🌿 Tuinieren','🌿 Gardening','Buiten',1),
('wandelen','🚶 Wandelen','🚶 Walking','Beweging',2),
('lezen','📖 Lezen','📖 Reading','Cultuur',3),
('muziek','🎵 Muziek','🎵 Music','Cultuur',4),
('schaken','♟️ Schaken','♟️ Chess','Spel',5),
('kaarten','🃏 Kaartspelen','🃏 Cards','Spel',6),
('koken','🍳 Koken','🍳 Cooking','Thuis',7),
('handwerken','🧶 Handwerken','🧶 Needlework','Thuis',8),
('vogels','🐦 Vogels kijken','🐦 Bird watching','Buiten',9),
('geschiedenis','📜 Geschiedenis','📜 History','Cultuur',10)
on conflict (tag_key) do nothing;

insert into feature_flags (flag_key,description,enabled,rollout_pct) values
('schild_call_reputation','Caller reputation indicator and scam scoring',true,100),
('anker_medication_ocr','Medication setup from camera OCR',true,100),
('kring_life_story_recording','Life story audio recording and transcription',true,100),
('kompas_safe_zone_alerts','Safe-zone exit notifications with fuzzy location',true,100),
('stem_companion','Dutch and English voice companion',true,100),
('companion_memory','Persistent companion memory',true,100),
('psd2_transaction_intercept','PSD2 read-only transaction anomaly detection',true,100),
('wacht_professional_portal','Professional carer portal',true,100),
('buurt_neighbourhood_connector','Anonymous neighbourhood connector',true,100),
('buurt_walk_buddy','Walk buddy double opt-in matching',true,100),
('buurt_events','Local neighbourhood activity suggestions',true,100)
on conflict (flag_key) do update set enabled = excluded.enabled, rollout_pct = excluded.rollout_pct;


-- canonical retention and cleanup jobs
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('null-precise-location', '0 * * * *',
      $job$
        update location_events
        set location_precise = null,
            auto_delete_at = null,
            updated_at = now()
        where location_precise is not null
          and auto_delete_at is not null
          and auto_delete_at < now();
      $job$);
    PERFORM cron.schedule('expire-voice-interactions', '0 3 * * *',
      $job$
        update voice_interactions
        set transcript_nl = null,
            transcript_en = null,
            response_text_nl = null,
            response_text_en = null,
            updated_at = now()
        where created_at < now() - interval '30 days'
          and deleted_at is null;
        update voice_interactions
        set deleted_at = now(), updated_at = now()
        where created_at < now() - interval '30 days'
          and deleted_at is null;
      $job$);
    PERFORM cron.schedule('expire-scam-events', '0 4 1 * *',
      $job$
        update scam_events
        set deleted_at = now()
        where created_at < now() - interval '24 months'
          and deleted_at is null;
      $job$);
    PERFORM cron.schedule('expire-location-events', '0 4 2 * *',
      $job$
        update location_events
        set deleted_at = now(), updated_at = now()
        where created_at < now() - interval '90 days'
          and deleted_at is null;
      $job$);
    PERFORM cron.schedule('purge-perf-metrics', '0 5 * * 0',
      $job$
        delete from perf_metrics
        where recorded_at < now() - interval '90 days';
      $job$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron jobs will be installed after pg_cron is enabled for this database.';
END
$cron$;
