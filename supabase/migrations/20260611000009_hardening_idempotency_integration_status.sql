-- HAVEN hardening layer: idempotency, integration status, signed webhook receipts.

create type integration_environment as enum ('mock','sandbox','production');
create type integration_status as enum ('not_configured','configured','healthy','degraded','disabled');

create table idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text unique not null,
  function_name text not null,
  profile_id uuid references profiles(id) on delete set null,
  elder_id uuid references profiles(id) on delete set null,
  request_hash text not null,
  response_body jsonb,
  status_code integer,
  locked_until timestamptz not null default now() + interval '2 minutes',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours'
);

create table integration_connections (
  id uuid primary key default gen_random_uuid(),
  integration_key text unique not null,
  display_name text not null,
  environment integration_environment not null default 'mock',
  status integration_status not null default 'not_configured',
  required_for_phase text not null,
  secret_names text[] not null default '{}',
  last_health_check_at timestamptz,
  last_error text,
  legal_gate text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  integration_key text not null,
  signature_valid boolean not null,
  event_id text,
  event_type text,
  body_hash text not null,
  processed boolean not null default false,
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index idx_idempotency_expires on idempotency_keys(expires_at);
create index idx_webhook_receipts_integration on webhook_receipts(integration_key, received_at desc);

create trigger integration_connections_updated_at before update on integration_connections for each row execute function public.set_updated_at();

alter table idempotency_keys enable row level security; alter table idempotency_keys force row level security;
alter table integration_connections enable row level security; alter table integration_connections force row level security;
alter table webhook_receipts enable row level security; alter table webhook_receipts force row level security;

create policy idempotency_service_only on idempotency_keys for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy integration_admin on integration_connections for all using ((select role from profiles where id = auth.uid()) = 'admin') with check ((select role from profiles where id = auth.uid()) = 'admin');
create policy webhook_admin on webhook_receipts for select using ((select role from profiles where id = auth.uid()) = 'admin');

create or replace function public.cleanup_idempotency_keys()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from idempotency_keys where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.cleanup_idempotency_keys() to service_role;

insert into integration_connections (integration_key, display_name, environment, status, required_for_phase, secret_names, legal_gate) values
('openai', 'OpenAI Whisper and embeddings', 'sandbox', 'configured', 'MVP', array['OPENAI_API_KEY'], 'DPA/SCC'),
('elevenlabs', 'ElevenLabs TTS', 'sandbox', 'configured', 'MVP', array['ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ID_NL','ELEVENLABS_VOICE_ID_EN'], 'DPA/SCC'),
('expo_push', 'Expo Push Notifications', 'sandbox', 'configured', 'MVP', array['EXPO_ACCESS_TOKEN'], 'DPA review'),
('sentry', 'Sentry EU error tracking', 'sandbox', 'configured', 'MVP', array['SENTRY_DSN'], 'DPA'),
('psd2', 'PSD2 transaction provider', 'mock', 'not_configured', 'Phase 2', array['PSD2_WEBHOOK_SECRET'], 'PSD2 vendor contract'),
('medmij', 'MedMij/FHIR import', 'mock', 'not_configured', 'Phase 2', array['MEDMIJ_CLIENT_ID','MEDMIJ_CLIENT_SECRET'], 'MedMij accreditation'),
('g_standaard', 'G-Standaard/Z-Index catalog', 'mock', 'disabled', 'Phase 3', array['GSTANDAARD_CLIENT_ID'], 'AGB-code and formal agreement')
on conflict (integration_key) do update set secret_names = excluded.secret_names, legal_gate = excluded.legal_gate;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup-idempotency-keys', '30 2 * * *',
      $job$ select public.cleanup_idempotency_keys(); $job$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Idempotency cleanup job will be installed after pg_cron is enabled.';
END
$cron$;
