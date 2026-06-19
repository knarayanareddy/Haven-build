-- HAVEN vNext Well-Rounded Patch — schema foundation.
-- Applied on top of the 12 existing migrations.
-- Adds: device health, fall events, OCR review, interaction alerts,
--       scam coaching, consent packs, Familiar Voice profiles,
--       video call sessions, carer handover notes, pending confirmations,
--       baselines, expanded feature_flags.

-- ============================================================
-- 1. Extension: device_sessions telemetry columns
-- ============================================================

alter table device_sessions
  add column if not exists app_version text,
  add column if not exists os_version text,
  add column if not exists locale text,
  add column if not exists timezone text,
  add column if not exists battery_pct smallint check (battery_pct between 0 and 100),
  add column if not exists is_low_power_mode boolean,
  add column if not exists network_type text check (network_type in ('wifi','cellular','none','unknown')),
  add column if not exists last_push_token_ok_at timestamptz,
  add column if not exists last_location_permission text check (last_location_permission in ('always','while_in_use','denied','unavailable')),
  add column if not exists last_microphone_permission text check (last_microphone_permission in ('granted','denied','unavailable')),
  add column if not exists last_background_refresh_ok boolean,
  add column if not exists last_error text;

create index if not exists idx_device_sessions_last_seen on device_sessions(last_seen_at desc);

-- ============================================================
-- 2. device_health_events — immutable log for trust-signal explanations
-- ============================================================

create table device_health_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  device_session_id uuid references device_sessions(id) on delete set null,
  severity text not null check (severity in ('info','warn','p1','p0')),
  event_key text not null,
  message_nl text not null,
  message_en text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_device_health_profile_created on device_health_events(profile_id, created_at desc);
create index idx_device_health_severity_created on device_health_events(severity, created_at desc);

alter table device_health_events enable row level security;
alter table device_health_events force row level security;

create policy device_health_self on device_health_events for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy device_health_family_read on device_health_events for select
  using (public.family_can(profile_id, 'alerts'));

-- ============================================================
-- 3. wellness_checkins — extended daily rhythm surface
-- ============================================================
-- Note: existing wellness_checkins already exists in migration 0001.
-- Add additional columns instead of a new table.

alter table wellness_checkins
  add column if not exists checkin_type text check (checkin_type in ('morning','midday','evening','ad_hoc','post_fall','post_scam')) default 'ad_hoc',
  add column if not exists captured_via text check (captured_via in ('voice','tap','family_prompt','carer')) default 'voice',
  add column if not exists voice_note_path text;

create index idx_wellness_checkins_elder_type_time on wellness_checkins(elder_id, checkin_type, checked_in_at desc) where checkin_type is not null;

-- ============================================================
-- 4. elder_baselines — rolling baselines for quiet-day detection
-- ============================================================

create table elder_baselines (
  elder_id uuid primary key references profiles(id) on delete cascade,
  avg_daily_voice_interactions numeric(6,2) default 0,
  avg_daily_checkins numeric(6,2) default 0,
  avg_response_latency_seconds numeric(8,2) default 0,
  typical_active_hours jsonb default '{"start":"08:00","end":"21:30"}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table elder_baselines enable row level security;
alter table elder_baselines force row level security;

create policy elder_baselines_self on elder_baselines for all
  using (elder_id = auth.uid()) with check (elder_id = auth.uid());

-- ============================================================
-- 5. fall_events — distinct from wandering_events
-- ============================================================

create type fall_status as enum ('possible','confirmed','false_alarm','no_response','resolved');

create table fall_events (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  device_session_id uuid references device_sessions(id) on delete set null,
  wearable_device_id uuid references wearable_devices(id) on delete set null,
  detection_source text not null check (detection_source in ('phone_heuristic','apple_watch','google_watch','manual','carer')),
  confidence numeric(3,2) check (confidence between 0 and 1),
  status fall_status not null default 'possible',
  detected_at timestamptz not null default now(),
  elder_ack_at timestamptz,
  family_notified_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now()
);

create index idx_fall_events_elder_status_detected on fall_events(elder_id, status, detected_at desc);
create index idx_fall_events_status_pending on fall_events(status, detected_at) where status = 'possible';

alter table fall_events enable row level security;
alter table fall_events force row level security;

create policy fall_events_self on fall_events for all
  using (elder_id = auth.uid()) with check (elder_id = auth.uid());

create policy fall_events_family_read on fall_events for select
  using (public.family_can(elder_id, 'alerts'));

create policy fall_events_carer_write on fall_events for insert with check (
  detection_source = 'carer' and public.carer_can(elder_id)
);

-- ============================================================
-- 6. medication_ocr_reviews — review workflow for OCR
-- ============================================================

create table medication_ocr_reviews (
  id uuid primary key default gen_random_uuid(),
  ocr_job_id uuid not null references medication_ocr_jobs(id) on delete cascade,
  elder_id uuid not null references profiles(id) on delete cascade,
  reviewer_id uuid references profiles(id) on delete set null,
  status text not null check (status in ('pending','approved','rejected','needs_clarification')) default 'pending',
  proposed_payload jsonb not null,
  approved_payload jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ocr_reviews_elder_status on medication_ocr_reviews(elder_id, status, created_at desc);
create index idx_ocr_reviews_reviewer on medication_ocr_reviews(reviewer_id, created_at desc);

alter table medication_ocr_reviews enable row level security;
alter table medication_ocr_reviews force row level security;

create policy ocr_reviews_self on medication_ocr_reviews for all
  using (elder_id = auth.uid()) with check (elder_id = auth.uid());

create policy ocr_reviews_family on medication_ocr_reviews for select
  using (public.family_can(elder_id, 'medications'));

create policy ocr_reviews_carer on medication_ocr_reviews for all
  using (public.carer_can(elder_id))
  with check (public.carer_can(elder_id));

create trigger medication_ocr_reviews_updated_at before update on medication_ocr_reviews for each row execute function public.set_updated_at();

-- ============================================================
-- 7. medication_interaction_alerts — pluggable interaction provider
-- ============================================================

create type interaction_severity as enum ('info','warn','critical');

create table medication_interaction_alerts (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  medication_ids uuid[] not null default '{}',
  severity interaction_severity not null,
  summary_nl text not null,
  summary_en text,
  source text not null,
  dismissed_by_id uuid references profiles(id) on delete set null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_interaction_alerts_elder_created on medication_interaction_alerts(elder_id, created_at desc);

alter table medication_interaction_alerts enable row level security;
alter table medication_interaction_alerts force row level security;

create policy interaction_alerts_self on medication_interaction_alerts for select
  using (elder_id = auth.uid() and (dismissed_at is null or dismissed_by_id = auth.uid()));

create policy interaction_alerts_family on medication_interaction_alerts for select
  using (public.family_can(elder_id, 'medications'));

create policy interaction_alerts_carer on medication_interaction_alerts for select
  using (public.carer_can(elder_id));

create policy interaction_alerts_self_dismiss on medication_interaction_alerts for update
  using (elder_id = auth.uid()) with check (elder_id = auth.uid());

-- ============================================================
-- 8. scam_coaching_sessions — "Is this real?" conversational output
-- ============================================================

create table scam_coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  channel text not null check (channel in ('phone','sms','email','whatsapp','web','in_person','other')),
  elder_prompt_hash text not null,
  assistant_summary_nl text not null,
  assistant_summary_en text,
  recommended_actions jsonb not null default '[]'::jsonb,
  family_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_scam_coaching_elder_created on scam_coaching_sessions(elder_id, created_at desc);

alter table scam_coaching_sessions enable row level security;
alter table scam_coaching_sessions force row level security;

create policy scam_coaching_self on scam_coaching_sessions for all
  using (elder_id = auth.uid()) with check (elder_id = auth.uid());

create policy scam_coaching_family_read on scam_coaching_sessions for select
  using (public.family_can(elder_id, 'alerts'));

-- ============================================================
-- 9. consent_packs + consent_pack_status — staged consent
-- ============================================================

create table consent_packs (
  pack_key text primary key,
  title_nl text not null,
  title_en text not null,
  description_nl text not null,
  description_en text not null,
  recommended_day integer not null default 0 check (recommended_day between 0 and 90),
  created_at timestamptz not null default now()
);

create table consent_pack_status (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  pack_key text not null references consent_packs(pack_key) on delete cascade,
  status text not null check (status in ('not_shown','shown','accepted','declined','deferred')) default 'not_shown',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (elder_id, pack_key)
);

create index idx_consent_pack_status_elder on consent_pack_status(elder_id, pack_key);

alter table consent_pack_status enable row level security;
alter table consent_pack_status force row level security;

create policy consent_pack_status_self on consent_pack_status for all
  using (elder_id = auth.uid()) with check (elder_id = auth.uid());

create policy consent_pack_status_family on consent_pack_status for select
  using (public.family_can(elder_id, 'messages'));

insert into consent_packs (pack_key, title_nl, title_en, description_nl, description_en, recommended_day) values
  ('core_meds',         'Medicijnen en herinneringen',  'Medications and reminders',  'Wij helpen u herinneren wanneer u uw medicijnen inneemt. Familie ziet alleen of u ze hebt ingenomen, niet welke.', 'We help you remember your medications. Family only sees whether they were taken.', 0),
  ('core_voice',        'Spraakmetgezel',                'Voice companion',             'Een vriendelijke digitale stem praat met u over uw dag. Er wordt niets opgenomen zonder uw toestemming.', 'A friendly digital voice chats with you. Nothing is recorded without your consent.', 0),
  ('core_family_msgs',  'Familieberichten',              'Family messages',             'Familie kan u berichten, foto''s en korte video''s sturen. U leest of beluistert ze wanneer u wilt.', 'Family can send you messages, photos and short videos. You read or listen to them when you like.', 0),
  ('safety_location',   'Veilige zone',                  'Safe zone',                   'Wij waarschuwen familie als u buiten een ingestelde zone bent. Precieze locatie wordt nooit getoond, alleen een globale omgeving.', 'We alert family if you leave a set zone. Precise location is never shown, only a global area.', 7),
  ('safety_fall',       'Valdetectie',                   'Fall detection',              'Uw telefoon of horloge detecteert mogelijke valpartijen. Wij vragen u of alles goed gaat en waarschuwen familie alleen als u niet reageert.', 'Your phone or watch detects possible falls. We ask if you are okay and only alert family if you do not respond.', 7),
  ('shield_scam_coaching','Scambescherming-coaching',   'Scam coaching',               'U kunt elke verdachte oproep, sms of link aan HAVEN voorleggen. HAVEN legt in gewone taal uit wat u moet doen.', 'You can submit any suspicious call, message or link to HAVEN. HAVEN explains in plain language what to do.', 14)
on conflict (pack_key) do nothing;

-- ============================================================
-- 10. voice_profiles + elder_voice_preferences — Familiar Voice
-- ============================================================

create type voice_profile_status as enum ('pending','ready','failed','revoked');

create table voice_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references profiles(id) on delete cascade,
  display_name text not null,
  provider text not null check (provider in ('elevenlabs','azure','mock','other')),
  provider_voice_id text,
  status voice_profile_status not null default 'pending',
  consent_evidence_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_voice_profiles_owner on voice_profiles(owner_profile_id);

alter table voice_profiles enable row level security;
alter table voice_profiles force row level security;

create policy voice_profiles_owner_all on voice_profiles for all
  using (owner_profile_id = auth.uid()) with check (owner_profile_id = auth.uid());

create trigger voice_profiles_updated_at before update on voice_profiles for each row execute function public.set_updated_at();

create table elder_voice_preferences (
  elder_id uuid primary key references profiles(id) on delete cascade,
  voice_profile_id uuid references voice_profiles(id) on delete set null,
  use_familiar_voice boolean not null default false,
  disclosure_mode text not null default 'first_of_day' check (disclosure_mode in ('always','first_of_day')),
  updated_at timestamptz not null default now()
);

alter table elder_voice_preferences enable row level security;
alter table elder_voice_preferences force row level security;

create policy elder_voice_preferences_self on elder_voice_preferences for all
  using (elder_id = auth.uid()) with check (elder_id = auth.uid());

create trigger elder_voice_preferences_updated_at before update on elder_voice_preferences for each row execute function public.set_updated_at();

create policy voice_profiles_elder_read on voice_profiles for select
  using (
    status = 'ready'
    and exists (
      select 1 from elder_voice_preferences evp
      where evp.voice_profile_id = voice_profiles.id
        and evp.elder_id = auth.uid()
    )
  );

-- ============================================================
-- 11. video_call_sessions — Live video calling
-- ============================================================

create type video_call_status as enum ('created','ringing','joined','ended','failed');

create table video_call_sessions (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  initiator_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('mock','livekit','twilio','other')),
  provider_room_id text not null,
  status video_call_status not null default 'created',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_video_call_sessions_elder_created on video_call_sessions(elder_id, created_at desc);
create index idx_video_call_sessions_status on video_call_sessions(status, created_at desc) where status in ('created','ringing','joined');

alter table video_call_sessions enable row level security;
alter table video_call_sessions force row level security;

create policy video_call_self on video_call_sessions for all
  using (elder_id = auth.uid() or initiator_id = auth.uid()) with check (elder_id = auth.uid() or initiator_id = auth.uid());

create policy video_call_family_read on video_call_sessions for select
  using (public.family_can(elder_id, 'messages'));

-- ============================================================
-- 12. carer_handover_notes + carer_handover_recipients
-- ============================================================

create table carer_handover_notes (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  carer_id uuid not null references profiles(id) on delete cascade,
  visit_id uuid references carer_visit_logs(id) on delete set null,
  appetite smallint check (appetite between 1 and 5),
  mood smallint check (mood between 1 and 5),
  mobility text,
  concerns_nl text,
  concerns_en text,
  notes_nl text,
  notes_en text,
  photo_path text,
  administered_medication_id uuid references medications(id) on delete set null,
  administered_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_handover_notes_elder_created on carer_handover_notes(elder_id, created_at desc) where deleted_at is null;
create index idx_handover_notes_carer_created on carer_handover_notes(carer_id, created_at desc);

alter table carer_handover_notes enable row level security;
alter table carer_handover_notes force row level security;

create policy handover_notes_carer on carer_handover_notes for all
  using (public.carer_can(elder_id) and deleted_at is null) with check (public.carer_can(elder_id));

create policy handover_notes_elder_read on carer_handover_notes for select
  using (elder_id = auth.uid() and deleted_at is null);

create table carer_handover_recipients (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references carer_handover_notes(id) on delete cascade,
  family_member_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (handover_id, family_member_id)
);

create index idx_handover_recipients_handover on carer_handover_recipients(handover_id);
create index idx_handover_recipients_family on carer_handover_recipients(family_member_id);

alter table carer_handover_recipients enable row level security;
alter table carer_handover_recipients force row level security;

create policy handover_recipients_carer on carer_handover_recipients for all
  using (exists (select 1 from carer_handover_notes h where h.id = handover_id and public.carer_can(h.elder_id)))
  with check (exists (select 1 from carer_handover_notes h where h.id = handover_id and public.carer_can(h.elder_id)));

create policy handover_recipients_family_read on carer_handover_recipients for select
  using (family_member_id = auth.uid());

create policy handover_notes_family_read on carer_handover_notes for select
  using (
    public.family_can(elder_id, 'messages')
    and exists (
      select 1 from carer_handover_recipients r
      where r.handover_id = carer_handover_notes.id
        and r.family_member_id = auth.uid()
    )
  );

-- ============================================================
-- 13. pending_confirmations — short-lived repeat-back state
-- ============================================================

create type confirmation_type as enum ('medication_taken','fall_response');

create table pending_confirmations (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  confirmation_type confirmation_type not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  resolved_at timestamptz,
  resolution boolean,
  created_at timestamptz not null default now()
);

create index idx_pending_confirmations_elder_active on pending_confirmations(elder_id, expires_at) where resolved_at is null;

alter table pending_confirmations enable row level security;
alter table pending_confirmations force row level security;

create policy pending_confirmations_self on pending_confirmations for all
  using (elder_id = auth.uid()) with check (elder_id = auth.uid());

select cron.schedule('purge-pending-confirmations', '0 4 * * *',
  $job$
    delete from pending_confirmations where resolved_at is not null and resolved_at < now() - interval '1 day';
    delete from pending_confirmations where expires_at < now() - interval '7 days';
  $job$);

-- ============================================================
-- 14. Feature flag additions (Phase 1 + Phase 2 flags)
-- ============================================================

insert into feature_flags (flag_key, description, enabled, rollout_pct) values
  ('familiar_voice_enabled',              'Familiar Voice (family clone) for the elder companion', false, 0),
  ('fall_detection_enabled',              'Phone heuristic + manual fall detection flow',           false, 0),
  ('quiet_day_enabled',                  'Quiet-day deviation detector',                            false, 0),
  ('daily_status_digest_enabled',         'Daily family status digest (green/amber/red)',            false, 0),
  ('video_calling_enabled',               'Live video calling via provider abstraction',            false, 0),
  ('med_ocr_review_required',            'OCR-derived medications require review approval',         false, 0),
  ('staged_consent_enabled',             'Stage consent packs over time',                           false, 0),
  ('device_health_monitor_enabled',      'Background device health monitor',                        false, 0),
  ('med_repeatback_confirmation_enabled','Voice pipeline requires explicit repeat-back for med taken', true, 0),
  ('wellness_checkin_daily_rhythm_enabled','Daily rhythm proactive check-ins',                      false, 0)
on conflict (flag_key) do nothing;
