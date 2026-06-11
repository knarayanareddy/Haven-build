-- HAVEN full-feature production domain tables.
-- Adds the remaining production surfaces from the design suite: OCR workflows,
-- telehealth, transport, hydration/nutrition, vital signs, PSD2 consent,
-- emergency profile access, deletion requests, feature evaluation and audit triggers.

create type deletion_request_status as enum ('received','verifying','processing','completed','rejected','legal_hold');
create type processing_job_status as enum ('queued','processing','completed','needs_review','rejected');
create type transport_status as enum ('not_needed','family_arranging','requested','booked','confirmed','completed','cancelled');
create type vital_type as enum ('blood_pressure_systolic','blood_pressure_diastolic','heart_rate','blood_oxygen','blood_glucose','weight','temperature');
create type financial_consent_status as enum ('requested','active','revoked','expired');

create table medication_ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  uploaded_by_id uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  status processing_job_status not null default 'queued',
  extracted_name_nl text,
  extracted_name_en text,
  extracted_dose_nl text,
  extracted_dose_en text,
  extracted_schedule jsonb,
  confidence_score numeric(4,3),
  review_required boolean not null default true,
  rejection_reason text,
  created_medication_id uuid references medications(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table document_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  storage_path text not null,
  status processing_job_status not null default 'queued',
  bsn_detected boolean not null default false,
  redaction_required boolean not null default false,
  summary_nl text,
  summary_en text,
  doctor_questions_nl text[],
  doctor_questions_en text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  title_nl text not null,
  title_en text,
  provider_name text,
  provider_phone text,
  location_label text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_medical boolean not null default false,
  source text default 'manual',
  medmij_reference text,
  created_by_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table transport_requests (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete cascade,
  requested_by_id uuid references profiles(id),
  status transport_status not null default 'requested',
  pickup_label text,
  destination_label text,
  pickup_time timestamptz,
  provider text,
  booking_reference text,
  family_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table telehealth_sessions (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  initiated_by_id uuid references profiles(id),
  provider_type text not null check (provider_type in ('huisarts','huisartsenpost','112','113','thuiszorg','other')),
  provider_name text,
  provider_phone text,
  medication_brief_read boolean not null default false,
  notes_nl text,
  notes_en text,
  follow_up_task_id uuid references tasks(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table hydration_logs (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  amount_ml integer check (amount_ml between 0 and 3000),
  source text not null default 'voice',
  notes_nl text,
  notes_en text,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  meal_label text,
  description_nl text,
  description_en text,
  appetite_score smallint check (appetite_score between 1 and 5),
  family_notified_at timestamptz,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table vital_signs (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  vital_type vital_type not null,
  value numeric(10,3) not null,
  unit text not null,
  reading_source text default 'manual',
  device_name text,
  context_notes_nl text,
  threshold_flag boolean not null default false,
  family_notified_at timestamptz,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table financial_accounts (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  provider text not null,
  bank_name text not null,
  account_id_masked text not null,
  consent_status financial_consent_status not null default 'requested',
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  alert_threshold_cents integer not null default 20000,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table financial_transactions
  add column if not exists financial_account_id uuid references financial_accounts(id),
  add column if not exists source_provider text,
  add column if not exists raw_reference_hash text;

create table emergency_access_tokens (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  token_hash text unique not null,
  label text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table emergency_profile_access_log (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  token_id uuid references emergency_access_tokens(id),
  ip_address_hash text,
  user_agent text,
  accessed_at timestamptz not null default now()
);

create table deletion_requests (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  requested_by_id uuid not null references profiles(id) on delete cascade,
  status deletion_request_status not null default 'received',
  reason text,
  legal_hold_reason text,
  completed_at timestamptz,
  confirmation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  notification_type notification_type not null,
  enabled boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, notification_type)
);

create table screen_schemas (
  id uuid primary key default gen_random_uuid(),
  screen_id text not null,
  locale text not null default 'en-GB' check (locale in ('en-GB','nl-NL')),
  schema jsonb not null,
  schema_version text not null default '1.2.1',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(screen_id, locale)
);

create index idx_med_ocr_elder_status on medication_ocr_jobs(elder_id, status) where deleted_at is null;
create index idx_doc_analysis_elder_status on document_analysis_jobs(elder_id, status) where deleted_at is null;
create index idx_appointments_elder_start on appointments(elder_id, starts_at) where deleted_at is null;
create index idx_transport_elder_status on transport_requests(elder_id, status) where deleted_at is null;
create index idx_telehealth_elder_started on telehealth_sessions(elder_id, started_at desc) where deleted_at is null;
create index idx_hydration_elder_logged on hydration_logs(elder_id, logged_at desc);
create index idx_nutrition_elder_logged on nutrition_logs(elder_id, logged_at desc) where deleted_at is null;
create index idx_vitals_elder_recorded on vital_signs(elder_id, recorded_at desc);
create index idx_fin_accounts_elder on financial_accounts(elder_id) where deleted_at is null and is_active = true;
create index idx_emergency_token_hash on emergency_access_tokens(token_hash) where revoked_at is null;
create index idx_deletion_requests_elder_status on deletion_requests(elder_id, status);
create index idx_screen_schemas_screen_locale on screen_schemas(screen_id, locale) where is_active = true;

create trigger medication_ocr_jobs_updated_at before update on medication_ocr_jobs for each row execute function public.set_updated_at();
create trigger document_analysis_jobs_updated_at before update on document_analysis_jobs for each row execute function public.set_updated_at();
create trigger appointments_updated_at before update on appointments for each row execute function public.set_updated_at();
create trigger transport_requests_updated_at before update on transport_requests for each row execute function public.set_updated_at();
create trigger financial_accounts_updated_at before update on financial_accounts for each row execute function public.set_updated_at();
create trigger deletion_requests_updated_at before update on deletion_requests for each row execute function public.set_updated_at();
create trigger notification_preferences_updated_at before update on notification_preferences for each row execute function public.set_updated_at();
create trigger screen_schemas_updated_at before update on screen_schemas for each row execute function public.set_updated_at();

alter table medication_ocr_jobs enable row level security; alter table medication_ocr_jobs force row level security;
alter table document_analysis_jobs enable row level security; alter table document_analysis_jobs force row level security;
alter table appointments enable row level security; alter table appointments force row level security;
alter table transport_requests enable row level security; alter table transport_requests force row level security;
alter table telehealth_sessions enable row level security; alter table telehealth_sessions force row level security;
alter table hydration_logs enable row level security; alter table hydration_logs force row level security;
alter table nutrition_logs enable row level security; alter table nutrition_logs force row level security;
alter table vital_signs enable row level security; alter table vital_signs force row level security;
alter table financial_accounts enable row level security; alter table financial_accounts force row level security;
alter table emergency_access_tokens enable row level security; alter table emergency_access_tokens force row level security;
alter table emergency_profile_access_log enable row level security; alter table emergency_profile_access_log force row level security;
alter table deletion_requests enable row level security; alter table deletion_requests force row level security;
alter table notification_preferences enable row level security; alter table notification_preferences force row level security;
alter table screen_schemas enable row level security; alter table screen_schemas force row level security;

create policy med_ocr_elder on medication_ocr_jobs for select using (elder_id = auth.uid() and deleted_at is null);
create policy med_ocr_family on medication_ocr_jobs for select using (auth.family_can(elder_id,'medications') and deleted_at is null);
create policy med_ocr_insert_family_or_elder on medication_ocr_jobs for insert with check (uploaded_by_id = auth.uid() and (elder_id = auth.uid() or auth.family_can(elder_id,'medications')));

create policy doc_analysis_elder on document_analysis_jobs for select using (elder_id = auth.uid() and deleted_at is null);
create policy doc_analysis_insert_elder on document_analysis_jobs for insert with check (elder_id = auth.uid());

create policy appointments_elder on appointments for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy appointments_family on appointments for select using (auth.family_can(elder_id,'medications') and deleted_at is null);
create policy appointments_carer on appointments for select using (auth.carer_can(elder_id) and deleted_at is null);

create policy transport_elder on transport_requests for select using (elder_id = auth.uid() and deleted_at is null);
create policy transport_family on transport_requests for all using (auth.family_can(elder_id,'medications') and deleted_at is null) with check (auth.family_can(elder_id,'medications'));

create policy telehealth_elder on telehealth_sessions for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy telehealth_family on telehealth_sessions for select using (auth.family_can(elder_id,'medications') and deleted_at is null);
create policy telehealth_carer on telehealth_sessions for select using (auth.carer_can(elder_id) and deleted_at is null);

create policy hydration_elder on hydration_logs for all using (elder_id = auth.uid()) with check (elder_id = auth.uid());
create policy hydration_family on hydration_logs for select using (auth.family_can(elder_id,'alerts'));

create policy nutrition_elder on nutrition_logs for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy nutrition_family on nutrition_logs for select using (auth.family_can(elder_id,'alerts') and deleted_at is null);

create policy vitals_elder on vital_signs for all using (elder_id = auth.uid()) with check (elder_id = auth.uid());
create policy vitals_family on vital_signs for select using (auth.family_can(elder_id,'medications'));
create policy vitals_carer on vital_signs for select using (auth.carer_can(elder_id));

create policy fin_accounts_elder on financial_accounts for select using (elder_id = auth.uid() and deleted_at is null);
create policy fin_accounts_family on financial_accounts for select using (auth.family_can(elder_id,'financials') and deleted_at is null);

create policy emergency_tokens_elder on emergency_access_tokens for all using (elder_id = auth.uid()) with check (elder_id = auth.uid());
create policy emergency_access_log_elder on emergency_profile_access_log for select using (elder_id = auth.uid());

create policy deletion_requests_elder on deletion_requests for all using (elder_id = auth.uid() or requested_by_id = auth.uid()) with check (elder_id = auth.uid() or requested_by_id = auth.uid());

create policy notification_preferences_self on notification_preferences for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy screen_schemas_read_authenticated on screen_schemas for select using (is_active = true and auth.role() = 'authenticated');

-- Emergency profile read is intentionally narrow and never exposes BSN because HAVEN has no BSN columns.
create or replace function public.get_emergency_profile(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_token emergency_access_tokens%rowtype;
  v_profile jsonb;
begin
  select encode(digest(p_token, 'sha256'), 'hex') into v_hash;
  select * into v_token
  from emergency_access_tokens
  where token_hash = v_hash
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if v_token.id is null then
    raise exception 'Emergency token is not valid';
  end if;

  update emergency_access_tokens set last_used_at = now() where id = v_token.id;
  insert into emergency_profile_access_log (elder_id, token_id) values (v_token.elder_id, v_token.id);

  select jsonb_build_object(
    'elder_id', ep.elder_id,
    'preferred_name', p.preferred_name,
    'medical_summary_nl', ep.medical_summary_nl,
    'huisarts_name', ep.huisarts_name,
    'huisarts_phone', ep.huisarts_phone,
    'allergies_nl', ep.allergies_nl,
    'conditions_nl', ep.conditions_nl,
    'emergency_contacts', ep.emergency_contacts,
    'medications', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name_nl', m.name_nl,
        'dose_description_nl', m.dose_description_nl,
        'schedule_times', m.schedule_times,
        'instructions_nl', m.instructions_nl
      )), '[]'::jsonb)
      from medications m
      where m.elder_id = ep.elder_id
        and m.is_active = true
        and m.deleted_at is null
    )
  ) into v_profile
  from elder_profiles ep
  join profiles p on p.id = ep.elder_id
  where ep.elder_id = v_token.elder_id;

  return v_profile;
end;
$$;
revoke all on function public.get_emergency_profile(text) from public;
grant execute on function public.get_emergency_profile(text) to anon, authenticated;

create or replace function public.evaluate_feature_flag(p_flag_key text, p_elder_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_flag feature_flags%rowtype;
  v_hash integer;
begin
  select * into v_flag from feature_flags where flag_key = p_flag_key;
  if v_flag.id is null or v_flag.enabled = false then
    return false;
  end if;
  if v_flag.elder_ids is not null and p_elder_id = any(v_flag.elder_ids) then
    return true;
  end if;
  if v_flag.rollout_pct >= 100 then
    return true;
  end if;
  if v_flag.rollout_pct <= 0 then
    return false;
  end if;
  v_hash := abs(hashtext(p_elder_id::text));
  return (v_hash % 100) < v_flag.rollout_pct;
end;
$$;
grant execute on function public.evaluate_feature_flag(text, uuid) to authenticated, service_role;

create or replace function public.audit_sensitive_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
  v_elder_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_record_id := old.id;
    v_elder_id := old.elder_id;
  else
    v_record_id := new.id;
    v_elder_id := new.elder_id;
  end if;

  insert into audit_log (actor_id, actor_role, action, table_name, record_id, elder_id, extra)
  values (
    auth.uid(),
    (select role from profiles where id = auth.uid()),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_elder_id,
    jsonb_build_object('changed_at', now())
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_medications after insert or update or delete on medications for each row execute function public.audit_sensitive_change();
create trigger audit_documents after insert or update or delete on documents for each row execute function public.audit_sensitive_change();
create trigger audit_financial_transactions after insert or update or delete on financial_transactions for each row execute function public.audit_sensitive_change();
create trigger audit_location_events after insert or update or delete on location_events for each row execute function public.audit_sensitive_change();
create trigger audit_companion_memory after insert or update or delete on companion_memory for each row execute function public.audit_sensitive_change();
create trigger audit_consent_records after insert or update or delete on consent_records for each row execute function public.audit_sensitive_change();

insert into screen_schemas (screen_id, locale, schema) values
('HOME','en-GB','{"title":"HAVEN","maxPrimaryItems":4,"bottomActions":1,"emergencyButton":true}'::jsonb),
('HOME','nl-NL','{"title":"HAVEN","maxPrimaryItems":4,"bottomActions":1,"emergencyButton":true}'::jsonb),
('MIJN_PILLEN','en-GB','{"title":"My Pills","maxPrimaryItems":3,"bottomActions":2,"emergencyButton":true}'::jsonb),
('MIJN_PILLEN','nl-NL','{"title":"Mijn Pillen","maxPrimaryItems":3,"bottomActions":2,"emergencyButton":true}'::jsonb),
('BUURT','en-GB','{"title":"Neighbourhood","maxPrimaryItems":4,"bottomActions":2,"emergencyButton":true}'::jsonb),
('BUURT','nl-NL','{"title":"Uw Buurt","maxPrimaryItems":4,"bottomActions":2,"emergencyButton":true}'::jsonb)
on conflict (screen_id, locale) do nothing;
