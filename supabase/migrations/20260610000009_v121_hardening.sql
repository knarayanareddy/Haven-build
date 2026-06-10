-- ============================================================
-- HAVEN v1.2.1 Hardening Migration
-- Fixes: connection_status enum, voice_interactions deleted_at,
--        location_events auto_delete_at semantics,
--        perf_metrics table, cron job corrections
-- ============================================================

-- P0-2: Add missing connection_status enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'connection_status'
  ) THEN
    CREATE TYPE connection_status AS ENUM (
      'pending_initiator',
      'pending_recipient',
      'accepted',
      'declined',
      'withdrawn',
      'ended'
    );
  END IF;
END;
$$;

-- P0-4: Add deleted_at to voice_interactions if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name  = 'voice_interactions'
      AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE voice_interactions
      ADD COLUMN deleted_at timestamptz;

    COMMENT ON COLUMN voice_interactions.deleted_at IS
      'v1.2.1: added for 30-day transcript retention cron compliance (AVG).';
  END IF;
END;
$$;

-- P0-6: Unschedule old 48h location cron if it exists, replace with 24h
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('null-precise-location');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'null-precise-location',
      '0 * * * *',
      $$
        UPDATE location_events
        SET   location_precise = NULL,
              auto_delete_at   = NULL,
              updated_at       = now()
        WHERE location_precise IS NOT NULL
          AND auto_delete_at   IS NOT NULL
          AND auto_delete_at   < now();
      $$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not active or configured.';
END $$;

-- P1-4: Performance metrics table for SLO measurement
CREATE TABLE IF NOT EXISTS perf_metrics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fn_name      text NOT NULL,
  duration_ms  integer NOT NULL,
  status       text NOT NULL
                 CHECK (status IN ('success', 'error', 'fallback')),
  env          text DEFAULT 'production',
  recorded_at  timestamptz DEFAULT now()
);

-- perf_metrics RLS
ALTER TABLE perf_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE perf_metrics FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_perf_metrics_fn_time
  ON perf_metrics(fn_name, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_perf_metrics_errors
  ON perf_metrics(fn_name, recorded_at DESC)
  WHERE status = 'error';

-- perf_metrics retention: 90 days
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-perf-metrics');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-perf-metrics',
      '0 5 * * 0',
      $$
        DELETE FROM perf_metrics
        WHERE recorded_at < now() - interval '90 days';
      $$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not active or configured.';
END $$;

-- Error spike alert trigger
CREATE OR REPLACE FUNCTION notify_error_spike()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_error_count integer;
BEGIN
  IF NEW.status = 'error' THEN
    SELECT count(*) INTO v_error_count
    FROM perf_metrics
    WHERE status    = 'error'
      AND fn_name   = NEW.fn_name
      AND env       = NEW.env
      AND recorded_at > now() - interval '5 minutes';

    IF v_error_count >= 5 THEN
      PERFORM pg_notify(
        'haven_alert',
        json_build_object(
          'type',     'error_spike',
          'fn',       NEW.fn_name,
          'count',    v_error_count,
          'env',      NEW.env,
          'ts',       now()
        )::text
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_error_spike_alert ON perf_metrics;
CREATE TRIGGER trg_error_spike_alert
  AFTER INSERT ON perf_metrics
  FOR EACH ROW EXECUTE FUNCTION notify_error_spike();

-- Verify migration
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'connection_status'
  ), 'connection_status enum missing';

  ASSERT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'voice_interactions' AND column_name = 'deleted_at'
  ), 'voice_interactions.deleted_at missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'perf_metrics'
  ), 'perf_metrics table missing';

  RAISE NOTICE 'v1.2.1 migration assertions passed ✅';
END;
$$;
