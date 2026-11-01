-- Read receipts update only the two receipt columns and only received messages owned by
-- the authenticated elder. A general UPDATE RLS policy would allow editing message content.
create or replace function public.mark_family_messages_read(p_message_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(array_length(p_message_ids, 1), 0) > 5 then
    raise exception 'Too many messages' using errcode = '22023';
  end if;
  update public.family_messages
  set read_by_elder = true, read_at = now()
  where id = any(p_message_ids) and elder_id = auth.uid() and sender_id <> auth.uid()
    and read_by_elder = false and deleted_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.mark_family_messages_read(uuid[]) from public, anon;
grant execute on function public.mark_family_messages_read(uuid[]) to authenticated;
