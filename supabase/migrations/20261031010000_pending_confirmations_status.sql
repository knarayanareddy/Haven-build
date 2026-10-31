-- pending_confirmations: the column its own endpoint reads and writes.
--
-- `fn-pending-confirmation-respond` is the endpoint behind the two cards the elder sees when a
-- fall is detected ("Gaat het goed met u?") and when a medication reminder needs a yes/no. It
-- does three things with a `status` column:
--
--   • `if (pending.status === 'resolved')` — the replay guard;
--   • `update({ status: 'expired' })` when the token has aged out;
--   • `update({ status: 'resolved', ... })` once the side effect succeeded.
--
-- The table never had that column. `select *` therefore returned no `status`, so the replay
-- guard never matched; and both updates failed with "column status does not exist". Because the
-- resolution update is the last statement, the endpoint threw *after* writing the medication
-- record: the elder was shown an error, the row stayed unresolved, and the escalation sweep
-- kept treating the confirmation as open. In the fall case that means a family member can be
-- called about a fall the older adult has already said was fine.
--
-- Adding the column fixes the endpoint as written. It is also the honest model: a confirmation
-- has three states, and `resolved_at` alone cannot express "this expired unanswered".

alter table pending_confirmations
  add column if not exists status text not null default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pending_confirmations_status_check'
  ) then
    alter table pending_confirmations
      add constraint pending_confirmations_status_check
      check (status in ('pending', 'resolved', 'expired'));
  end if;
end $$;

-- Rows written before this migration carry the default; infer the truth from `resolved_at`,
-- which the endpoint has always set.
update pending_confirmations
   set status = 'resolved'
 where resolved_at is not null
   and status = 'pending';

create index if not exists idx_pending_confirmations_open
  on pending_confirmations(elder_id, expires_at)
  where status = 'pending';

comment on column pending_confirmations.status is
  'pending | resolved | expired. Read and written by fn-pending-confirmation-respond; resolved_at alone cannot express an unanswered prompt.';
