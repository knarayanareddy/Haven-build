-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN RATE-LIMIT BACKEND + TELEMETRY CONSTRAINT FIX (October 2026, item 5)
--
-- Problem this closes:
--   1. `ratelimit_check()` (migration 20260614000001) stored the caller hash in
--      perf_metrics.status, but perf_metrics.status has
--      CHECK (status IN ('success','error','fallback')). Every DB-backed check
--      therefore raised a constraint violation, `supabaseRateLimit()` returned
--      'error', and ratelimit.ts permanently set useSupabaseRL = false — the
--      "multi-isolate" limiter silently degraded to per-isolate memory and
--      stayed there for the life of the deployment.
--   2. It was SECURITY DEFINER without a pinned search_path and had no explicit
--      revoke/grant, so it was callable by anon/authenticated.
--   3. perf_metrics rejected the 'slo_breach' status that recordMetric() writes,
--      so SLO breach telemetry never persisted either.
--
-- This migration introduces a dedicated counter table + RPC with an atomic
-- upsert, a pinned search_path, and service_role-only execution.
--
-- Rollback: see DOWN section at the bottom.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. perf_metrics: allow the statuses the application actually writes ───
ALTER TABLE public.perf_metrics DROP CONSTRAINT IF EXISTS perf_metrics_status_check;
ALTER TABLE public.perf_metrics
  ADD CONSTRAINT perf_metrics_status_check
  CHECK (status IN ('success', 'error', 'fallback', 'slo_breach'));

-- ─── 2. Dedicated rate-limit counter table ───
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  bucket_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_expiry
  ON public.rate_limit_counters (expires_at);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters FORCE ROW LEVEL SECURITY;
-- No policies: service_role only. Registered in scripts/ci/audit-rls-coverage.mjs.
REVOKE ALL ON public.rate_limit_counters FROM anon, authenticated;

-- ─── 3. Atomic consume RPC ───
-- Returns one row: (allowed, remaining, retry_after_seconds).
-- A single INSERT … ON CONFLICT DO UPDATE keeps this atomic across isolates
-- without an explicit transaction or advisory lock.

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket_key TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_hits INTEGER;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_bucket_key IS NULL OR length(p_bucket_key) = 0 THEN
    RAISE EXCEPTION 'p_bucket_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_max_requests IS NULL OR p_max_requests <= 0 THEN
    RAISE EXCEPTION 'p_max_requests must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'p_window_seconds must be positive' USING ERRCODE = '22023';
  END IF;

  -- Fixed window aligned to the epoch so all isolates agree on the boundary.
  v_window_start := to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limit_counters (bucket_key, window_start, hits, expires_at)
  VALUES (p_bucket_key, v_window_start, 1, v_window_start + make_interval(secs => p_window_seconds * 2))
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET hits = public.rate_limit_counters.hits + 1
  RETURNING public.rate_limit_counters.hits INTO v_hits;

  -- Opportunistic housekeeping: only the isolate that opens a window pays for it.
  IF v_hits = 1 THEN
    DELETE FROM public.rate_limit_counters WHERE expires_at < v_now - INTERVAL '1 hour';
  END IF;

  RETURN QUERY SELECT
    v_hits <= p_max_requests,
    GREATEST(p_max_requests - v_hits, 0),
    CASE
      WHEN v_hits <= p_max_requests THEN 0
      ELSE GREATEST(CEIL(EXTRACT(epoch FROM (v_window_start + make_interval(secs => p_window_seconds)) - v_now))::INTEGER, 1)
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- ─── 4. Retire the broken predecessor ───
DROP FUNCTION IF EXISTS public.ratelimit_check(TEXT, TIMESTAMPTZ, INTEGER);

-- The index added for the old implementation is harmless but now unused; the
-- function's replacement keeps its own index. Leave idx_perf_ratelimit in place
-- so a rollback does not lose it.

-- ─── 5. Retention for counters (in addition to opportunistic cleanup) ───
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'haven-rate-limit-counter-purge',
      '7 * * * *',
      'DELETE FROM public.rate_limit_counters WHERE expires_at < now() - INTERVAL ''1 hour'';'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END
$cron$;

COMMENT ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) IS
  'HAVEN: atomic fixed-window rate limit counter. service_role only. Called by supabase/functions/_shared/ratelimit.ts.';

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════════
-- DOWN MIGRATION (rollback)
-- ══════════════════════════════════════════════════════════════════════════════
/*
BEGIN;

CREATE OR REPLACE FUNCTION ratelimit_check(
  p_key_hash text,
  p_window_start timestamptz,
  p_max_requests int
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM perf_metrics
  WHERE fn_name = 'ratelimit'
    AND recorded_at >= p_window_start
    AND status = p_key_hash;

  IF v_count >= p_max_requests THEN
    RETURN false;
  END IF;

  INSERT INTO perf_metrics (fn_name, duration_ms, status, env, recorded_at)
  VALUES ('ratelimit', 0, p_key_hash, 'system', now());

  RETURN true;
END $$;

DROP FUNCTION IF EXISTS public.consume_rate_limit(TEXT, INTEGER, INTEGER);
DROP TABLE IF EXISTS public.rate_limit_counters;

ALTER TABLE public.perf_metrics DROP CONSTRAINT IF EXISTS perf_metrics_status_check;
ALTER TABLE public.perf_metrics
  ADD CONSTRAINT perf_metrics_status_check
  CHECK (status IN ('success', 'error', 'fallback'));

COMMIT;
*/
