-- HAVEN phase-2/phase-3 feature completion: call reputation, wearable wandering,
-- driving safety, community/skill exchange, legacy vault, bereavement resources,
-- medication catalog sync and log-drain configuration.

create type wearable_device_type as enum ('gps_watch','airtag','tile','matter_sensor','phone','other');
create type device_connection_status as enum ('active','paused','lost','revoked');
create type driving_event_type as enum ('hard_braking','sharp_turn','unusual_hour','long_journey','wrong_way_suspected','trip_summary');
create type skill_exchange_status as enum ('offered','requested','matched','completed','cancelled');
create type legacy_action as enum ('delete','transfer','memorialize','archive','no_action');
create type medication_catalog_provider as enum ('g_standaard','z_index','manual','pharmacy');

create table call_reputation_lookups (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid references profiles(id) on delete cascade,
  phone_hash text not null,
  provider text not null,
  reputation_score smallint not null check (reputation_score between 0 and 100),
  report_count integer not null default 0,
  categories text[] not null default '{}',
  explanation_nl text,
  explanation_en text,
  cache_hit boolean not null default false,
  created_at timestamptz not null default now()
);

create table wearable_devices (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  device_type wearable_device_type not null,
  label text not null,
  vendor text,
  external_device_id_hash text,
  connection_status device_connection_status not null default 'active',
  last_seen_at timestamptz,
  battery_pct smallint check (battery_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table wandering_events (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  wearable_device_id uuid references wearable_devices(id),
  event_type text not null check (event_type in ('safe_zone_exit','safe_zone_return','no_response','device_lost','night_exit')),
  location_event_id uuid references location_events(id),
  family_notified boolean not null default false,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table driving_events (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  event_type driving_event_type not null,
  trip_started_at timestamptz,
  trip_ended_at timestamptz,
  trip_duration_minutes integer,
  anomaly_score smallint not null default 0 check (anomaly_score between 0 and 100),
  anomaly_description_nl text,
  anomaly_description_en text,
  elder_reviewed boolean not null default false,
  elder_reviewed_at timestamptz,
  elder_shared_with_family boolean not null default false,
  family_notified_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table community_event_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text unique not null,
  source_name text not null,
  source_type text not null check (source_type in ('gemeente','bibliotheek','ouderenfonds','anbo','kbo_pcob','manual')),
  base_url text,
  status partner_feed_status not null default 'active',
  last_ingested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table skill_offerings (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  title_nl text not null,
  title_en text,
  description_nl text,
  description_en text,
  category text,
  format text check (format in ('phone','video','in_person','family_mediated')) default 'family_mediated',
  status skill_exchange_status not null default 'offered',
  family_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table skill_exchange_matches (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  skill_offering_id uuid not null references skill_offerings(id) on delete cascade,
  matched_partner_label text not null,
  status skill_exchange_status not null default 'matched',
  family_mediated boolean not null default true,
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table legacy_accounts (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  service_name text not null,
  service_url text,
  account_identifier_hint text,
  encrypted_secret_path text,
  intended_recipient_id uuid references profiles(id),
  action_on_death legacy_action not null default 'no_action',
  notes_nl text,
  notes_en text,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table bereavement_events (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references profiles(id) on delete cascade,
  logged_by_id uuid not null references profiles(id),
  deceased_name text not null,
  relationship_to_elder text,
  date_of_death date,
  tone_adjustment_active boolean not null default true,
  tone_adjustment_until date,
  resources_offered boolean not null default false,
  family_notified_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table bereavement_resources (
  id uuid primary key default gen_random_uuid(),
  resource_key text unique not null,
  title_nl text not null,
  title_en text,
  provider text not null,
  url text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table medication_catalog_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  provider medication_catalog_provider not null,
  status integration_job_status not null default 'queued',
  records_received integer not null default 0,
  records_updated integer not null default 0,
  requires_agb_code boolean not null default true,
  legal_basis_confirmed boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table medication_catalog_entries (
  id uuid primary key default gen_random_uuid(),
  provider medication_catalog_provider not null,
  external_code text not null,
  name_nl text not null,
  active_substance_nl text,
  form_nl text,
  strength_text text,
  interaction_notes_nl text,
  updated_from_provider_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, external_code)
);

create table log_drain_configs (
  id uuid primary key default gen_random_uuid(),
  drain_key text unique not null,
  provider text not null check (provider in ('logflare','axiom','sentry','slack','webhook')),
  endpoint_url text,
  enabled boolean not null default false,
  pii_scrubbing_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_call_rep_elder_created on call_reputation_lookups(elder_id, created_at desc);
create index idx_wearables_elder on wearable_devices(elder_id) where deleted_at is null;
create index idx_wandering_elder_created on wandering_events(elder_id, created_at desc) where deleted_at is null;
create index idx_driving_elder_created on driving_events(elder_id, created_at desc) where deleted_at is null;
create index idx_skill_offerings_elder on skill_offerings(elder_id) where deleted_at is null;
create index idx_legacy_elder on legacy_accounts(elder_id) where deleted_at is null;
create index idx_bereavement_elder on bereavement_events(elder_id) where deleted_at is null;
create index idx_catalog_entries_code on medication_catalog_entries(provider, external_code);

create trigger wearable_devices_updated_at before update on wearable_devices for each row execute function public.set_updated_at();
create trigger community_event_sources_updated_at before update on community_event_sources for each row execute function public.set_updated_at();
create trigger skill_offerings_updated_at before update on skill_offerings for each row execute function public.set_updated_at();
create trigger legacy_accounts_updated_at before update on legacy_accounts for each row execute function public.set_updated_at();
create trigger log_drain_configs_updated_at before update on log_drain_configs for each row execute function public.set_updated_at();

alter table call_reputation_lookups enable row level security; alter table call_reputation_lookups force row level security;
alter table wearable_devices enable row level security; alter table wearable_devices force row level security;
alter table wandering_events enable row level security; alter table wandering_events force row level security;
alter table driving_events enable row level security; alter table driving_events force row level security;
alter table community_event_sources enable row level security; alter table community_event_sources force row level security;
alter table skill_offerings enable row level security; alter table skill_offerings force row level security;
alter table skill_exchange_matches enable row level security; alter table skill_exchange_matches force row level security;
alter table legacy_accounts enable row level security; alter table legacy_accounts force row level security;
alter table bereavement_events enable row level security; alter table bereavement_events force row level security;
alter table bereavement_resources enable row level security; alter table bereavement_resources force row level security;
alter table medication_catalog_sync_jobs enable row level security; alter table medication_catalog_sync_jobs force row level security;
alter table medication_catalog_entries enable row level security; alter table medication_catalog_entries force row level security;
alter table log_drain_configs enable row level security; alter table log_drain_configs force row level security;

create policy call_rep_elder on call_reputation_lookups for select using (elder_id = auth.uid());
create policy call_rep_family on call_reputation_lookups for select using (auth.family_can(elder_id,'alerts'));
create policy wearables_elder on wearable_devices for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy wearables_family on wearable_devices for select using (auth.family_can(elder_id,'location') and deleted_at is null);
create policy wandering_elder on wandering_events for select using (elder_id = auth.uid() and deleted_at is null);
create policy wandering_family on wandering_events for select using (auth.family_can(elder_id,'location') and deleted_at is null);
create policy driving_elder on driving_events for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy driving_family on driving_events for select using (auth.family_can(elder_id,'alerts') and elder_shared_with_family = true and deleted_at is null);
create policy community_sources_admin on community_event_sources for all using ((select role from profiles where id = auth.uid()) = 'admin') with check ((select role from profiles where id = auth.uid()) = 'admin');
create policy skill_elder on skill_offerings for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy skill_family on skill_offerings for select using (auth.family_can(elder_id,'stories') and deleted_at is null);
create policy skill_matches_elder on skill_exchange_matches for select using (elder_id = auth.uid() and deleted_at is null);
create policy skill_matches_family on skill_exchange_matches for select using (auth.family_can(elder_id,'stories') and deleted_at is null);
create policy legacy_elder_only on legacy_accounts for all using (elder_id = auth.uid() and deleted_at is null) with check (elder_id = auth.uid());
create policy bereavement_elder on bereavement_events for select using (elder_id = auth.uid() and deleted_at is null);
create policy bereavement_family on bereavement_events for select using (auth.family_can(elder_id,'alerts') and deleted_at is null);
create policy bereavement_resources_read on bereavement_resources for select using (is_active = true);
create policy catalog_entries_read on medication_catalog_entries for select using (true);
create policy catalog_jobs_admin on medication_catalog_sync_jobs for all using ((select role from profiles where id = auth.uid()) = 'admin') with check ((select role from profiles where id = auth.uid()) = 'admin');
create policy log_drain_admin on log_drain_configs for all using ((select role from profiles where id = auth.uid()) = 'admin') with check ((select role from profiles where id = auth.uid()) = 'admin');

insert into community_event_sources(source_key, source_name, source_type, base_url) values
('oba', 'Openbare Bibliotheek Amsterdam', 'bibliotheek', 'https://www.oba.nl/activiteiten'),
('ouderenfonds', 'Nationaal Ouderenfonds', 'ouderenfonds', 'https://www.ouderenfonds.nl/activiteiten'),
('anbo-pcob', 'ANBO-PCOB', 'anbo', 'https://www.anbo-pcob.nl')
on conflict (source_key) do nothing;

insert into bereavement_resources(resource_key, title_nl, title_en, provider, url, phone) values
('slachtofferhulp-rouw', 'Steun bij verlies en rouw', 'Support with loss and grief', 'Slachtofferhulp Nederland', 'https://www.slachtofferhulp.nl', null),
('huisarts-rouw', 'Bespreek rouw met uw huisarts', 'Discuss grief with your GP', 'Huisarts', null, null)
on conflict (resource_key) do nothing;

insert into log_drain_configs(drain_key, provider, enabled, pii_scrubbing_enabled) values
('edge-logflare', 'logflare', false, true),
('sentry-eu', 'sentry', false, true),
('slo-slack', 'slack', false, true)
on conflict (drain_key) do nothing;
