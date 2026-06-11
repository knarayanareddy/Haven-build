
-- Prevent duplicate generated reminder instances.
create unique index if not exists idx_medication_reminders_unique_instance
on medication_reminders(medication_id, elder_id, scheduled_time);

-- HAVEN production automation, realtime, auth hooks and safety triggers.

-- Enforce BUURT max five interest tags per elder.
create or replace function public.enforce_max_interest_tags()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from elder_interest_tags
    where elder_id = new.elder_id
  ) >= 5 then
    raise exception 'Maximum 5 interesse-tags per oudere toegestaan.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_max_interest_tags on elder_interest_tags;
create trigger trg_max_interest_tags
before insert on elder_interest_tags
for each row execute function public.enforce_max_interest_tags();

-- Guard against accidental BSN text in document summaries. HAVEN does not process BSN.
create or replace function public.reject_bsn_text()
returns trigger
language plpgsql
as $$
declare
  v_text text;
begin
  v_text := coalesce(new.summary_nl, '') || ' ' || coalesce(new.summary_en, '') || ' ' || coalesce(new.label_nl, '') || ' ' || coalesce(new.label_en, '');
  if v_text ~ '[0-9]{9}' then
    raise exception 'Document text appears to contain a 9-digit identifier. Redact before storing.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_reject_bsn_text on documents;
create trigger trg_documents_reject_bsn_text
before insert or update on documents
for each row execute function public.reject_bsn_text();

-- Notification preference helper used by Edge Functions.
create or replace function public.can_send_notification(p_profile_id uuid, p_type notification_type)
returns boolean
language sql
stable
as $$
  select coalesce((
    select enabled
    from notification_preferences
    where profile_id = p_profile_id
      and notification_type = p_type
    limit 1
  ), true)
$$;

grant execute on function public.can_send_notification(uuid, notification_type) to authenticated, service_role;

-- Auth hook payload for Supabase custom access-token hook.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_role text;
  v_claims jsonb;
begin
  select role::text into v_role
  from profiles
  where id = (event->>'user_id')::uuid;

  v_claims := event->'claims';
  if v_role is not null then
    v_claims := jsonb_set(v_claims, '{app_role}', to_jsonb(v_role));
  end if;
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Realtime publication setup. Duplicate table additions are ignored.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'scam_events',
    'medication_reminders',
    'family_messages',
    'notifications',
    'location_events',
    'safety_digests',
    'neighbourhood_connections',
    'carer_visit_logs',
    'incidents'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;

-- Elder status materialised-style view for dashboards.
create or replace view elder_status_overview as
select
  p.id as elder_id,
  p.preferred_name,
  p.locale,
  coalesce((
    select count(*)
    from medication_reminders mr
    where mr.elder_id = p.id
      and mr.scheduled_time::date = current_date
      and mr.status not in ('ingenomen','laat_ingenomen','overgeslagen')
  ), 0) as medications_open_today,
  coalesce((
    select max(se.alert_level::text)
    from scam_events se
    where se.elder_id = p.id
      and se.created_at > now() - interval '24 hours'
      and se.deleted_at is null
  ), 'none') as recent_alert_level,
  coalesce((
    select count(*)
    from family_messages fm
    where fm.elder_id = p.id
      and fm.read_by_elder = false
      and fm.deleted_at is null
  ), 0) as unread_family_messages,
  (
    select max(le.created_at)
    from location_events le
    where le.elder_id = p.id
      and le.deleted_at is null
  ) as last_location_event_at
from profiles p
where p.role = 'elder'
  and p.deleted_at is null;

alter view elder_status_overview set (security_invoker = true);
grant select on elder_status_overview to authenticated;

-- Escalation helper for reminders. Used by scheduled Edge Functions and tests.
create or replace function public.mark_reminder_taken(p_reminder_id uuid, p_elder_id uuid)
returns medication_reminders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row medication_reminders%rowtype;
begin
  update medication_reminders
  set status = 'ingenomen', confirmed_at = now(), updated_at = now()
  where id = p_reminder_id
    and elder_id = p_elder_id
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.mark_reminder_taken(uuid, uuid) from public;
grant execute on function public.mark_reminder_taken(uuid, uuid) to authenticated, service_role;

-- Data portability export for an elder. Service role or elder can call this RPC.
create or replace function public.export_elder_data(p_elder_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
begin
  if p_elder_id <> auth.uid() and auth.role() <> 'service_role' then
    raise exception 'Not allowed';
  end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from profiles p where p.id = p_elder_id),
    'elder_profile', (select to_jsonb(ep) from elder_profiles ep where ep.elder_id = p_elder_id),
    'medications', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from medications m where m.elder_id = p_elder_id and m.deleted_at is null),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from tasks t where t.elder_id = p_elder_id and t.deleted_at is null),
    'messages', (select coalesce(jsonb_agg(to_jsonb(fm)), '[]'::jsonb) from family_messages fm where fm.elder_id = p_elder_id and fm.deleted_at is null),
    'stories', (select coalesce(jsonb_agg(to_jsonb(ls)), '[]'::jsonb) from life_stories ls where ls.elder_id = p_elder_id and ls.deleted_at is null),
    'consents', (select coalesce(jsonb_agg(to_jsonb(cr)), '[]'::jsonb) from consent_records cr where cr.elder_id = p_elder_id)
  );
end;
$$;

grant execute on function public.export_elder_data(uuid) to authenticated, service_role;
