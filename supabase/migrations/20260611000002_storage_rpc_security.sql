-- HAVEN v1.2.1 production storage, RPC and column-security hardening.
-- Complements 20260611000001_haven_v121_production_schema.sql.

-- Storage buckets are private; all object access is via RLS and signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('voice-notes', 'voice-notes', false, 15728640, array['audio/m4a','audio/mp4','audio/mpeg','audio/wav']),
  ('life-story-audio', 'life-story-audio', false, 52428800, array['audio/m4a','audio/mp4','audio/mpeg','audio/wav']),
  ('life-story-photos', 'life-story-photos', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic']),
  ('profile-photos', 'profile-photos', false, 2097152, array['image/jpeg','image/png','image/webp']),
  ('document-vault', 'document-vault', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp']),
  ('ocr-inbox', 'ocr-inbox', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('tts-cache', 'tts-cache', false, 2097152, array['audio/mpeg','audio/mp3','audio/wav'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "voice_notes_elder_all"
on storage.objects for all
using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "voice_notes_family_read"
on storage.objects for select
using (bucket_id = 'voice-notes' and auth.family_can(((storage.foldername(name))[1])::uuid, 'messages'));

create policy "story_audio_elder_all"
on storage.objects for all
using (bucket_id = 'life-story-audio' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'life-story-audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "story_audio_family_read"
on storage.objects for select
using (bucket_id = 'life-story-audio' and auth.family_can(((storage.foldername(name))[1])::uuid, 'stories'));

create policy "story_photos_elder_all"
on storage.objects for all
using (bucket_id = 'life-story-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'life-story-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "story_photos_family_read"
on storage.objects for select
using (bucket_id = 'life-story-photos' and auth.family_can(((storage.foldername(name))[1])::uuid, 'stories'));

create policy "document_vault_elder_only"
on storage.objects for all
using (bucket_id = 'document-vault' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'document-vault' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "ocr_inbox_elder_write"
on storage.objects for insert
with check (bucket_id = 'ocr-inbox' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "profile_photos_own"
on storage.objects for all
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Column hardening: family should never receive precise coordinates from PostgREST.
revoke select (location_precise) on location_events from authenticated, anon;
grant select (id, elder_id, event_type, location_fuzzed, accuracy_metres, family_notified, check_in_prompted, created_at, updated_at, auto_delete_at, deleted_at) on location_events to authenticated;

create or replace view family_location_events as
select
  id,
  elder_id,
  event_type,
  location_fuzzed,
  accuracy_metres,
  family_notified,
  check_in_prompted,
  created_at
from location_events
where deleted_at is null;

alter view family_location_events set (security_invoker = true);
grant select on family_location_events to authenticated;

-- RPC: insert location safely via PostGIS, applying 24h TTL only for precise safe-zone exit events.
create or replace function public.insert_location_event(
  p_elder_id uuid,
  p_event_type text,
  p_longitude double precision,
  p_latitude double precision,
  p_fuzzed_longitude double precision,
  p_fuzzed_latitude double precision,
  p_accuracy_metres integer,
  p_store_precise boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into location_events (
    elder_id,
    event_type,
    location_fuzzed,
    location_precise,
    accuracy_metres,
    auto_delete_at
  ) values (
    p_elder_id,
    p_event_type,
    ST_SetSRID(ST_MakePoint(p_fuzzed_longitude, p_fuzzed_latitude), 4326),
    case when p_store_precise then ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326) else null end,
    p_accuracy_metres,
    case when p_store_precise then now() + interval '24 hours' else null end
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.insert_location_event(uuid,text,double precision,double precision,double precision,double precision,integer,boolean) from public;
grant execute on function public.insert_location_event(uuid,text,double precision,double precision,double precision,double precision,integer,boolean) to service_role;

-- RPC: companion memory semantic retrieval. Service role can pass embeddings from the Edge Function.
create or replace function public.match_companion_memory(
  p_elder_id uuid,
  p_query_embedding vector(1536),
  p_match_threshold float default 0.75,
  p_match_count int default 8
) returns table (
  id uuid,
  memory_type memory_type,
  content_nl text,
  content_en text,
  importance_score int,
  similarity float
)
language plpgsql
stable
as $$
begin
  return query
  select
    cm.id,
    cm.memory_type,
    cm.content_nl,
    cm.content_en,
    cm.importance_score,
    1 - (cm.embedding <=> p_query_embedding) as similarity
  from companion_memory cm
  where cm.elder_id = p_elder_id
    and cm.deleted_at is null
    and cm.embedding is not null
    and (cm.expires_at is null or cm.expires_at > now())
    and 1 - (cm.embedding <=> p_query_embedding) > p_match_threshold
  order by similarity desc, cm.importance_score desc
  limit p_match_count;
end;
$$;

-- RPC: consolidated family dashboard summary using consent-scoped rows.
create or replace function public.family_dashboard_summary(p_elder_id uuid)
returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  result jsonb;
begin
  if not (
    auth.family_can(p_elder_id, 'alerts')
    or auth.family_can(p_elder_id, 'medications')
    or auth.family_can(p_elder_id, 'messages')
  ) then
    raise exception 'No active consent for dashboard summary';
  end if;

  select jsonb_build_object(
    'elder_id', p_elder_id,
    'medications_today', (
      select count(*) from medication_reminders mr
      where mr.elder_id = p_elder_id
        and mr.scheduled_time::date = current_date
    ),
    'medications_taken_today', (
      select count(*) from medication_reminders mr
      where mr.elder_id = p_elder_id
        and mr.scheduled_time::date = current_date
        and mr.status in ('ingenomen','laat_ingenomen')
    ),
    'unread_messages', (
      select count(*) from family_messages fm
      where fm.elder_id = p_elder_id
        and fm.read_by_elder = false
        and fm.deleted_at is null
    ),
    'recent_rood_or_zwart_alerts', (
      select count(*) from scam_events se
      where se.elder_id = p_elder_id
        and se.alert_level in ('rood','zwart')
        and se.created_at > now() - interval '7 days'
        and se.deleted_at is null
    ),
    'last_location_event_at', (
      select max(le.created_at) from location_events le
      where le.elder_id = p_elder_id
        and le.deleted_at is null
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.family_dashboard_summary(uuid) to authenticated;

-- Storage retention jobs.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('clean-ocr-inbox', '0 * * * *',
      $job$
        delete from storage.objects
        where bucket_id = 'ocr-inbox'
          and created_at < now() - interval '24 hours';
      $job$);
    PERFORM cron.schedule('clean-tts-cache', '30 * * * *',
      $job$
        delete from storage.objects
        where bucket_id = 'tts-cache'
          and created_at < now() - interval '48 hours';
      $job$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Storage retention jobs will be installed after pg_cron is enabled.';
END
$cron$;
