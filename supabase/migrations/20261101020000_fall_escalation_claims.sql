-- Lease timestamps permit recovery after a worker dies while retaining the existing
-- fall-status domain. A conditional update in the worker is the claim operation.
alter table public.fall_events add column if not exists escalation_claimed_at timestamptz;

create or replace function public.get_active_emergency_falls()
returns table (
  fall_id uuid, elder_id uuid, detection_source text, confidence numeric,
  status text, detected_at timestamptz, device_label text, device_platform text
) language plpgsql security definer set search_path = public as $$
begin
  return query
  select f.id, f.elder_id, f.detection_source, f.confidence, f.status::text,
         f.detected_at, d.device_label, d.platform
  from public.fall_events f
  left join public.device_sessions d on f.device_session_id = d.id
  where f.family_notified_at is null
    and (f.status in ('possible', 'no_response')
      or (f.status = 'processing' and f.escalation_claimed_at < now() - interval '5 minutes'))
    and (d.revoked_at is null or f.created_at <= d.revoked_at);
end;
$$;
