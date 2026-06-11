-- HAVEN production compliance, care-plan and release-operations layer.
-- This migration operationalises the human/process areas from the design suite
-- without pretending that legal sign-off can be automated.

create type compliance_record_status as enum ('draft','in_review','approved','rejected','expired');
create type breach_status as enum ('detected','triaged','contained','reported_to_ap','users_notified','closed');
create type care_plan_status as enum ('draft','active','paused','archived');
create type refill_status as enum ('not_needed','due_soon','requested','ordered','collected','cancelled');
create type release_check_status as enum ('pending','passed','failed','waived');

create table vendor_register (
  id uuid primary key default gen_random_uuid(),
  vendor_name text not null unique,
  purpose text not null,
  data_shared text not null,
  storage_region text not null,
  dpa_status compliance_record_status not null default 'draft',
  scc_required boolean not null default false,
  bsn_transmitted boolean not null default false check (bsn_transmitted = false),
  review_due_date date,
  reviewed_by_id uuid references profiles(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table dpia_assessments (
  id uuid primary key default gen_random_uuid(),
  assessment_key text unique not null,
  title text not null,
  scope text not null,
  status compliance_record_status not null default 'draft',
  residual_risk text not null default 'unassessed',
  dpo_profile_id uuid references profiles(id),
  signed_at timestamptz,
  next_review_date date,
  document_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table data_breach_incidents (
  id uuid primary key default gen_random_uuid(),
  detected_by_id uuid references profiles(id),
  status breach_status not null default 'detected',
  severity text not null check (severity in ('p0','p1','p2','p3')),
  summary text not null,
  affected_data_categories text[] not null default '{}',
  affected_subject_count integer,
  containment_action text,
  ap_notification_required boolean,
  ap_notified_at timestamptz,
  users_notification_required boolean,
  users_notified_at timestamptz,
  dpo_profile_id uuid references profiles(id),
  postmortem_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table care_plans (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  created_by_id uuid not null references profiles(id),
  status care_plan_status not null default 'draft',
  title_nl text not null,
  title_en text,
  goals_nl text[],
  goals_en text[],
  review_due_date date,
  approved_by_elder boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table care_plan_items (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references care_plans(id) on delete cascade,
  elder_id uuid not null references profiles(id) on delete cascade,
  category text not null check (category in ('medication','mobility','hydration','nutrition','social','safety','other')),
  instruction_nl text not null,
  instruction_en text,
  frequency text,
  assigned_role user_role,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table safeguarding_reports (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  incident_id uuid references incidents(id),
  reported_by_id uuid not null references profiles(id),
  meldcode_step smallint not null check (meldcode_step between 1 and 5),
  concern_nl text not null,
  action_taken_nl text,
  external_authority_nl text,
  external_reference text,
  family_informed boolean not null default false,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table medication_refill_events (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  medication_id uuid not null references medications(id) on delete cascade,
  status refill_status not null default 'due_soon',
  current_stock integer,
  threshold integer,
  pharmacy_nl text,
  requested_by_id uuid references profiles(id),
  family_notified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table app_release_checks (
  id uuid primary key default gen_random_uuid(),
  release_version text not null,
  check_key text not null,
  check_name text not null,
  status release_check_status not null default 'pending',
  evidence_path text,
  reviewed_by_id uuid references profiles(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(release_version, check_key)
);

create table device_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  device_label text,
  platform text not null check (platform in ('ios','android','web')),
  device_id_hash text not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(profile_id, device_id_hash)
);

create trigger vendor_register_updated_at before update on vendor_register for each row execute function public.set_updated_at();
create trigger dpia_assessments_updated_at before update on dpia_assessments for each row execute function public.set_updated_at();
create trigger data_breach_incidents_updated_at before update on data_breach_incidents for each row execute function public.set_updated_at();
create trigger care_plans_updated_at before update on care_plans for each row execute function public.set_updated_at();
create trigger care_plan_items_updated_at before update on care_plan_items for each row execute function public.set_updated_at();
create trigger safeguarding_reports_updated_at before update on safeguarding_reports for each row execute function public.set_updated_at();
create trigger medication_refill_events_updated_at before update on medication_refill_events for each row execute function public.set_updated_at();
create trigger app_release_checks_updated_at before update on app_release_checks for each row execute function public.set_updated_at();

alter table vendor_register enable row level security; alter table vendor_register force row level security;
alter table dpia_assessments enable row level security; alter table dpia_assessments force row level security;
alter table data_breach_incidents enable row level security; alter table data_breach_incidents force row level security;
alter table care_plans enable row level security; alter table care_plans force row level security;
alter table care_plan_items enable row level security; alter table care_plan_items force row level security;
alter table safeguarding_reports enable row level security; alter table safeguarding_reports force row level security;
alter table medication_refill_events enable row level security; alter table medication_refill_events force row level security;
alter table app_release_checks enable row level security; alter table app_release_checks force row level security;
alter table device_sessions enable row level security; alter table device_sessions force row level security;

create policy vendor_register_admin_read on vendor_register for select using ((select role from profiles where id = auth.uid()) = 'admin');
create policy vendor_register_admin_write on vendor_register for all using ((select role from profiles where id = auth.uid()) = 'admin') with check ((select role from profiles where id = auth.uid()) = 'admin');
create policy dpia_admin_read on dpia_assessments for select using ((select role from profiles where id = auth.uid()) = 'admin');
create policy dpia_admin_write on dpia_assessments for all using ((select role from profiles where id = auth.uid()) = 'admin') with check ((select role from profiles where id = auth.uid()) = 'admin');
create policy breach_admin_read on data_breach_incidents for select using ((select role from profiles where id = auth.uid()) = 'admin');
create policy breach_admin_write on data_breach_incidents for all using ((select role from profiles where id = auth.uid()) = 'admin') with check ((select role from profiles where id = auth.uid()) = 'admin');

create policy care_plans_elder on care_plans for select using (elder_id = auth.uid() and deleted_at is null);
create policy care_plans_carer on care_plans for all using (auth.carer_can(elder_id) and deleted_at is null) with check (auth.carer_can(elder_id));
create policy care_plans_family on care_plans for select using (auth.family_can(elder_id,'medications') and deleted_at is null);
create policy care_plan_items_elder on care_plan_items for select using (elder_id = auth.uid() and deleted_at is null);
create policy care_plan_items_carer on care_plan_items for all using (auth.carer_can(elder_id) and deleted_at is null) with check (auth.carer_can(elder_id));
create policy care_plan_items_family on care_plan_items for select using (auth.family_can(elder_id,'medications') and deleted_at is null);

create policy safeguarding_carer on safeguarding_reports for all using (auth.carer_can(elder_id)) with check (auth.carer_can(elder_id));
create policy safeguarding_elder on safeguarding_reports for select using (elder_id = auth.uid());

create policy refill_elder on medication_refill_events for select using (elder_id = auth.uid() and deleted_at is null);
create policy refill_family on medication_refill_events for select using (auth.family_can(elder_id,'medications') and deleted_at is null);

create policy release_checks_admin on app_release_checks for all using ((select role from profiles where id = auth.uid()) = 'admin') with check ((select role from profiles where id = auth.uid()) = 'admin');
create policy device_sessions_self on device_sessions for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

insert into vendor_register (vendor_name, purpose, data_shared, storage_region, dpa_status, scc_required, review_due_date) values
('Supabase', 'Backend, database, storage and Edge Functions', 'Application data under RLS', 'EU', 'in_review', false, current_date + interval '1 year'),
('OpenAI', 'Speech-to-text, embeddings and LLM processing', 'Voice transcripts and text snippets where required', 'US with SCC', 'in_review', true, current_date + interval '1 year'),
('ElevenLabs', 'Dutch and English text-to-speech', 'Response text for speech synthesis', 'US with SCC', 'in_review', true, current_date + interval '1 year'),
('Expo', 'Push notifications and build pipeline', 'Push tokens and application binary metadata', 'US/EU', 'in_review', true, current_date + interval '1 year'),
('Vercel', 'Family dashboard hosting', 'Web request logs and dashboard assets', 'EU/US', 'in_review', true, current_date + interval '1 year')
on conflict (vendor_name) do nothing;

insert into dpia_assessments (assessment_key, title, scope, status, residual_risk, next_review_date) values
('mvp-core', 'HAVEN MVP core processing', 'Voice, medication, family, scam and safe-zone support', 'draft', 'requires DPO review', current_date + interval '6 months'),
('buurt', 'BUURT neighbourhood connector', 'PC4, interest tags, anonymous matching and double opt-in', 'draft', 'requires DPO review', current_date + interval '6 months')
on conflict (assessment_key) do nothing;

insert into app_release_checks (release_version, check_key, check_name, status) values
('1.0.0', 'rls-review', 'RLS forced and reviewed', 'pending'),
('1.0.0', 'dpia-signed', 'DPIA signed by DPO', 'pending'),
('1.0.0', 'vendor-dpa', 'Vendor DPA register complete', 'pending'),
('1.0.0', 'pentest', 'External penetration test complete', 'pending'),
('1.0.0', 'elder-usability', 'Older-adult usability sessions complete', 'pending')
on conflict (release_version, check_key) do nothing;
