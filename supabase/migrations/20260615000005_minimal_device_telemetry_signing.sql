-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN PRODUCTION MINIMAL PATCH (FINDING #4 COMPLETE CLOSURE)
-- Governed by NEN 7510, GDPR Art. 32
-- Rollback: See DOWN section at bottom
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Support table for security logging
CREATE TABLE IF NOT EXISTS security_violations (
  id BIGSERIAL PRIMARY KEY,
  error_code TEXT NOT NULL,
  actor_id UUID,
  table_name TEXT NOT NULL,
  attempted_action TEXT NOT NULL,
  attempted_sql TEXT NOT NULL,
  violation_reason TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Minimal secret provisioning column on device_sessions
ALTER TABLE device_sessions ADD COLUMN IF NOT EXISTS device_secret TEXT;

-- 3. Short-lived store for Replay Protection nonces
CREATE TABLE IF NOT EXISTS device_telemetry_nonces (
  nonce TEXT PRIMARY KEY,
  device_session_id UUID NOT NULL REFERENCES device_sessions(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_nonces_exp ON device_telemetry_nonces(expires_at);

-- Automated TTL nonce cleanup helper
CREATE OR REPLACE FUNCTION purge_expired_telemetry_nonces() RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM device_telemetry_nonces WHERE expires_at < now();
END;
$$;

COMMIT;

-- Rollback (DOWN Migration)
/*
BEGIN;
DROP FUNCTION IF EXISTS purge_expired_telemetry_nonces();
DROP TABLE IF EXISTS device_telemetry_nonces;
ALTER TABLE device_sessions DROP COLUMN IF EXISTS device_secret;
COMMIT;
*/
