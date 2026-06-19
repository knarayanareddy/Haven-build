-- HAVEN production integrations, browser shield, grandchild bridge and observability layer.

create type integration_job_status as enum ('queued','running','completed','failed','disabled');
create type browser_risk_level as enum ('none','amber','rood','zwart');
create type partner_feed_status as enum ('active','paused','error','retired');

create table domain_reputation_cache (
  id uuid primary key default gen_random_uuid(),
  domain_hash text unique not null,
  domain_display text,
  domain_age_days integer,
  is_gov_lookalike boolean not null default false,
  is_known_scam boolean not null default false,
  reputation_score smallint not null default 0 check (reputation_score between 0 and 100),
  source text not null,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create table browser_shield_events (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  url_hash text not null,
  domain_hash text not null,
  page_title text,
  risk_level browser_risk_level not null default 'none',
  risk_score smallint not null default 0 check (risk_score between 0 and 100),
  detected_patterns text[] not null default '{}',
  explanation_nl text not null,
  explanation_en text,
  linked_scam_event_id uuid references scam_events(id),
  family_notified boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table fhir_import_jobs (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  provider text not null default 'medmij',
  status integration_job_status not null default 'queued',
  resource_type text not null,
  resource_count integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table health_record_imports (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  fhir_job_id uuid references fhir_import_jobs(id) on delete cascade,
  fhir_resource_type text not null,
  fhir_resource_id_hash text not null,
  mapped_table text,
  mapped_record_id uuid,
  source_provider text not null default 'medmij',
  imported_at timestamptz not null default now(),
  unique(elder_id, fhir_resource_type, fhir_resource_id_hash)
);

create table external_care_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  organisation_nl text not null,
  system_name text not null check (system_name in ('ONS','Nedap','Careweb','manual')),
  status integration_job_status not null default 'queued',
  records_pushed integer not null default 0,
  records_pulled integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table grandchild_profiles (
  id uuid primary key default gen_random_uuid(),
  family_member_id uuid not null references profiles(id) on delete cascade,
  elder_id uuid not null references profiles(id) on delete cascade,
  display_name text not null,
  age_band text check (age_band in ('under_6','6_9','10_12','13_plus','unknown')) default 'unknown',
  guardian_consented boolean not null default false,
  elder_consented boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table partner_event_feeds (
  id uuid primary key default gen_random_uuid(),
  feed_key text unique not null,
  partner_name text not null,
  source_url text,
  status partner_feed_status not null default 'active',
  postcode_scope text,
  last_ingested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  elder_id uuid references profiles(id) on delete set null,
  surface text not null check (surface in ('elder_app','family_dashboard','carer_portal','admin_console','edge_function')),
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table slo_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null,
  severity text not null check (severity in ('p0','p1','p2','p3')),
  title text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  opened_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

create index idx_browser_events_elder_created on browser_shield_events(elder_id, created_at desc) where deleted_at is null;
create index idx_fhir_jobs_elder_status on fhir_import_jobs(elder_id, status) where deleted_at is null;
create index idx_health_imports_elder on health_record_imports(elder_id, imported_at desc);
create index idx_care_sync_elder on external_care_sync_jobs(elder_id, created_at desc) where deleted_at is null;
create index idx_grandchild_elder on grandchild_profiles(elder_id) where deleted_at is null;
create index idx_app_events_elder_time on app_events(elder_id, occurred_at desc);
create index idx_slo_alerts_open on slo_alerts(severity, opened_at desc) where status <> 'resolved';

create trigger grandchild_profiles_updated_at before update on grandchild_profiles for each row execute function public.set_updated_at();
create trigger partner_event_feeds_updated_at before update on partner_event_feeds for each row execute function public.set_updated_at();

alter table browser_shield_events enable row level security; alter table browser_shield_events force row level security;
alter table fhir_import_jobs enable row level security; alter table fhir_import_jobs force row level security;
alter table health_record_imports enable row level security; alter table health_record_imports force row level security;
alter table external_care_sync_jobs enable row level security; alter table external_care_sync_jobs force row level security;
alter table grandchild_profiles enable row level security; alter table grandchild_profiles force row level security;
alter table partner_event_feeds enable row level security; alter table partner_event_feeds force row level security;
alter table app_events enable row level security; alter table app_events force row level security;
alter table slo_alerts enable row level security; alter table slo_alerts force row level security;

create policy browser_events_elder on browser_shield_events for select using (elder_id = auth.uid() and deleted_at is null);
create policy browser_events_family on browser_shield_events for select using (public.family_can(elder_id,'alerts') and deleted_at is null);

create policy fhir_jobs_elder on fhir_import_jobs for select using (elder_id = auth.uid() and deleted_at is null);
create policy fhir_jobs_family on fhir_import_jobs for select using (public.family_can(elder_id,'medications') and deleted_at is null);
create policy health_imports_elder on health_record_imports for select using (elder_id = auth.uid());
create policy health_imports_family on health_record_imports for select using (public.family_can(elder_id,'medications'));

create policy care_sync_carer on external_care_sync_jobs for select using (public.carer_can(elder_id) and deleted_at is null);
create policy care_sync_elder on external_care_sync_jobs for select using (elder_id = auth.uid() and deleted_at is null);

create policy grandchild_family on grandchild_profiles for all using (family_member_id = auth.uid() and deleted_at is null) with check (family_member_id = auth.uid());
create policy grandchild_elder on grandchild_profiles for select using (elder_id = auth.uid() and deleted_at is null);

create policy partner_feeds_admin on partner_event_feeds for all using ((select role from profiles where id = auth.uid()) = 'admin') with check ((select role from profiles where id = auth.uid()) = 'admin');
create policy app_events_self on app_events for select using (profile_id = auth.uid() or elder_id = auth.uid());
create policy app_events_insert_authenticated on app_events for insert with check (auth.role() = 'authenticated');
create policy slo_alerts_admin on slo_alerts for all using ((select role from profiles where id = auth.uid()) = 'admin') with check ((select role from profiles where id = auth.uid()) = 'admin');

create or replace function public.record_app_event(
  p_profile_id uuid,
  p_elder_id uuid,
  p_surface text,
  p_event_name text,
  p_properties jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into app_events(profile_id, elder_id, surface, event_name, properties)
  values (p_profile_id, p_elder_id, p_surface, p_event_name, coalesce(p_properties, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.record_app_event(uuid, uuid, text, text, jsonb) to authenticated, service_role;

create or replace function public.measure_function_slo(p_fn_name text, p_p95_budget_ms integer)
returns jsonb
language plpgsql
stable
as $$
declare
  v_p95 numeric;
  v_count integer;
begin
  select percentile_cont(0.95) within group (order by duration_ms), count(*)
  into v_p95, v_count
  from perf_metrics
  where fn_name = p_fn_name
    and recorded_at > now() - interval '1 hour';
  return jsonb_build_object('fn_name', p_fn_name, 'p95_ms', v_p95, 'sample_count', v_count, 'within_budget', coalesce(v_p95,0) <= p_p95_budget_ms);
end;
$$;
grant execute on function public.measure_function_slo(text, integer) to authenticated, service_role;

insert into partner_event_feeds(feed_key, partner_name, source_url, postcode_scope) values
('bibliotheek-amsterdam', 'Bibliotheek Amsterdam', 'https://www.oba.nl/activiteiten', 'Amsterdam'),
('ouderenfonds', 'Nationaal Ouderenfonds', 'https://www.ouderenfonds.nl/activiteiten', 'NL')
on conflict (feed_key) do nothing;
