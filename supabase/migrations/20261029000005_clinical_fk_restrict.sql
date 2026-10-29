-- ─────────────────────────────────────────────────────────────────────────────
-- 20261029000005  Clinical records must survive a hard delete of their parent
--
-- `20260615000000_fix_fk_cascade_integrity.sql` wrote the policy down:
--
--   "BANNED for any medical administration records (MAR), vital signs, incident
--    reports, audit logs, or emergency escalations."
--   "MANDATORY for all clinical records, time-series logs, MAR entries …"
--
-- It then converted seven constraints to RESTRICT. What it never did is check the
-- rest: every clinical table still carries `elder_id … REFERENCES profiles(id)
-- ON DELETE CASCADE` from the base schema, so a hard `DELETE FROM profiles` — or
-- `auth.admin.deleteUser()`, which cascades through `profiles_id_fkey` — silently
-- destroys the elder's MAR, vital signs, fall history, incidents, handover notes and
-- voice transcripts. The WGBO retention obligation is 20 years; none of that data
-- may disappear because someone removed a login.
--
-- The application never hard-deletes a profile: `soft_purge_profile()` tombstones it
-- and `fn-right-to-erasure` deletes rows *below* it. Switching the parent side to
-- RESTRICT therefore changes no working path, and turns the documented policy into
-- something the database enforces.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fall_events DROP CONSTRAINT IF EXISTS fall_events_elder_id_fkey;
ALTER TABLE public.fall_events ADD CONSTRAINT fall_events_elder_id_fkey
  FOREIGN KEY (elder_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.medication_reminders DROP CONSTRAINT IF EXISTS medication_reminders_elder_id_fkey;
ALTER TABLE public.medication_reminders ADD CONSTRAINT medication_reminders_elder_id_fkey
  FOREIGN KEY (elder_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.vital_signs DROP CONSTRAINT IF EXISTS vital_signs_elder_id_fkey;
ALTER TABLE public.vital_signs ADD CONSTRAINT vital_signs_elder_id_fkey
  FOREIGN KEY (elder_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_elder_id_fkey;
ALTER TABLE public.incidents ADD CONSTRAINT incidents_elder_id_fkey
  FOREIGN KEY (elder_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_reported_by_id_fkey;
ALTER TABLE public.incidents ADD CONSTRAINT incidents_reported_by_id_fkey
  FOREIGN KEY (reported_by_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.carer_handover_notes DROP CONSTRAINT IF EXISTS carer_handover_notes_elder_id_fkey;
ALTER TABLE public.carer_handover_notes ADD CONSTRAINT carer_handover_notes_elder_id_fkey
  FOREIGN KEY (elder_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.carer_handover_notes DROP CONSTRAINT IF EXISTS carer_handover_notes_carer_id_fkey;
ALTER TABLE public.carer_handover_notes ADD CONSTRAINT carer_handover_notes_carer_id_fkey
  FOREIGN KEY (carer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.voice_interactions DROP CONSTRAINT IF EXISTS voice_interactions_elder_id_fkey;
ALTER TABLE public.voice_interactions ADD CONSTRAINT voice_interactions_elder_id_fkey
  FOREIGN KEY (elder_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
