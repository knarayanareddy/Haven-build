-- Committed separately from the migration that uses the new values: PostgreSQL does not
-- allow a newly added enum label to be used until its transaction has committed.
alter type public.fall_status add value if not exists 'processing';
alter type public.fall_status add value if not exists 'family_alerted';
