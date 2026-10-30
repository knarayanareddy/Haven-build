-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN CRON HEALTH VIEW (October 2026)
--
-- Problem this closes:
--   `fn-health-check` claims to verify "Critical pg_cron Jobs Last Run Time" for
--   the retention sweeper, but it queried `public.perf_metrics` — a table written
--   by `recordMetric()` on every Edge Function request, not by any cron job. Two
--   consequences:
--     1. It reported request traffic, so it could never detect a stalled sweeper.
--     2. `maybeSingle()` returns `{ data: null }` rather than throwing when the
--        query fails or the table is empty, and the function substituted
--        `new Date(Date.now() - 3600000)` — a fabricated timestamp — together
--        with `{ ok: true, status: "healthy" }`. A completely broken retention
--        sweeper therefore reported healthy, which matters because this sweeper
--        is what enforces the GDPR retention windows (see migration
--        20260615000012_database_retention_gdpr_r5_fix.sql).
--
--   PostgREST only exposes the `public` schema, so an Edge Function cannot read
--   `cron.job_run_details` directly. This migration exposes a narrow, definer-
--   owned read-only view instead of widening the exposed schema list.
--
-- Security:
--   The view is owned by the migration role (typically `postgres`), so it reads
--   `cron.*` with the owner's privileges. It is revoked from anon and
--   authenticated; only service_role (used by the Edge Function runtime) may
--   select from it. No write path, no schedule mutation.
--
-- Rollback: see DOWN section at the bottom.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $cron_view$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Latest run per job. `cron.job_run_details` keeps history forever, so the
    -- view is bounded to the most recent 7 days to keep it cheap to read.
    CREATE OR REPLACE VIEW public.cron_job_health AS
    SELECT DISTINCT ON (j.jobname)
      j.jobname,
      j.schedule,
      j.active,
      d.status,
      d.start_time,
      d.end_time,
      d.return_message
    FROM cron.job j
    LEFT JOIN cron.job_run_details d ON d.jobid = j.jobid
    WHERE d.start_time IS NULL OR d.start_time > now() - INTERVAL '7 DAYS'
    ORDER BY j.jobname, d.start_time DESC NULLS LAST;

    COMMENT ON VIEW public.cron_job_health IS
      'Latest run of each pg_cron job. Read-only, definer-owned, service_role only. Consumed by fn-health-check.';

    REVOKE ALL ON public.cron_job_health FROM anon, authenticated;
    GRANT SELECT ON public.cron_job_health TO service_role;
  ELSE
    RAISE NOTICE 'pg_cron not installed; public.cron_job_health not created';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Best effort: pg_cron may be installed in a schema this role cannot read.
  -- fn-health-check treats a missing view as `not_applicable`, not as healthy.
  RAISE NOTICE 'cron_job_health view not created: % (%)', SQLERRM, SQLSTATE;
END
$cron_view$;

COMMIT;

-- ─── Rollback (DOWN) ──────────────────────────────────────────────────────────
/*
BEGIN;
DROP VIEW IF EXISTS public.cron_job_health;
COMMIT;
*/
