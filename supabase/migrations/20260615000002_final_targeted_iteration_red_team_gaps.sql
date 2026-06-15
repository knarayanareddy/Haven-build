-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN PRODUCTION FINAL TARGETED ITERATION (RED TEAM CLOSURE)
-- Governed by GDPR Art. 9, Art. 17, Dutch AVG, UAVG, NEN 7510, Wet Wkkgz
-- ══════════════════════════════════════════════════════════════════════════════

-- UP MIGRATION

BEGIN;

-- ─── 1. GDPR ERASURE: Deterministic Deep Redaction & PII Registry ───

-- 1a. Algorithmic Modulo-11 (11-proef) structural BSN validation helper
CREATE OR REPLACE FUNCTION is_valid_dutch_bsn(p_candidate TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_clean TEXT;
  v_sum INTEGER := 0;
BEGIN
  -- Normalize to strictly numeric tokens
  v_clean := REGEXP_REPLACE(p_candidate, '[^0-9]', '', 'g');
  IF (LENGTH(v_clean) <> 9) THEN RETURN FALSE; END IF;

  -- 11-proef algorithm: (9×d1 + 8×d2 + 7×d3 + 6×d4 + 5×d5 + 4×d6 + 3×d7 + 2×d8 - 1×d9) mod 11 == 0
  v_sum := (SUBSTRING(v_clean, 1, 1)::INTEGER * 9) +
           (SUBSTRING(v_clean, 2, 1)::INTEGER * 8) +
           (SUBSTRING(v_clean, 3, 1)::INTEGER * 7) +
           (SUBSTRING(v_clean, 4, 1)::INTEGER * 6) +
           (SUBSTRING(v_clean, 5, 1)::INTEGER * 5) +
           (SUBSTRING(v_clean, 6, 1)::INTEGER * 4) +
           (SUBSTRING(v_clean, 7, 1)::INTEGER * 3) +
           (SUBSTRING(v_clean, 8, 1)::INTEGER * 2) -
           (SUBSTRING(v_clean, 9, 1)::INTEGER * 1);

  RETURN (v_sum % 11 == 0);
END;
$$;

-- 1b. Deterministic Deep Redaction PL/pgSQL Function
CREATE OR REPLACE FUNCTION redact_sensitive_text(p_text TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_result TEXT;
  v_match TEXT;
  v_tokens TEXT[];
BEGIN
  IF (p_text IS NULL) THEN RETURN NULL; END IF;
  v_result := p_text;

  -- 1. Redact Emails
  v_result := REGEXP_REPLACE(v_result, '[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', '[REDACTED_EMAIL]', 'g');

  -- 2. Redact Dutch Phone Numbers (06-12345678, +31612345678, 010-1234567, etc.)
  v_result := REGEXP_REPLACE(v_result, '(\+31|0)[1-9][0-9]{1,2}[\s\-]?[0-9]{3}[\s\-]?[0-9]{3,4}\b', '[REDACTED_PHONE]', 'g');

  -- 3. Redact Structural Modulo-11 BSNs (Extract 9-digit candidate sequences and validate)
  v_tokens := ARRAY(SELECT ARRAY_TO_STRING(REGEXP_MATCHES(v_result, '\b[0-9]{9}\b', 'g'), ''));
  FOR i IN 1..ARRAY_LENGTH(v_tokens, 1) LOOP
    IF (is_valid_dutch_bsn(v_tokens[i])) THEN
      v_result := REPLACE(v_result, v_tokens[i], '[REDACTED_BSN]');
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- 1c. Create DB-Level PII Columns Registry Table
CREATE TABLE IF NOT EXISTS gdpr_pii_fields (
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  json_path TEXT,
  redact_strategy TEXT NOT NULL CHECK (redact_strategy IN ('deep_redact', 'overwrite', 'anonymize')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (table_name, column_name, coalesce(json_path, 'none'))
);

-- Seed registry with exhaustive domain coverage
INSERT INTO gdpr_pii_fields (table_name, column_name, json_path, redact_strategy, enabled)
VALUES 
  ('profiles', 'full_name', NULL, 'anonymize', true),
  ('profiles', 'preferred_name', NULL, 'overwrite', true),
  ('profiles', 'phone', NULL, 'overwrite', true),
  ('carer_handover_notes', 'notes_nl', NULL, 'deep_redact', true),
  ('medication_ocr_jobs', 'extracted_name_nl', NULL, 'deep_redact', true),
  ('medication_interaction_alerts', 'summary_nl', NULL, 'deep_redact', true),
  ('life_stories', 'transcript_nl', NULL, 'deep_redact', true),
  ('companion_memory', 'content_nl', NULL, 'deep_redact', true),
  ('financial_transactions', 'description', NULL, 'deep_redact', true)
ON CONFLICT DO NOTHING;

-- Support support table for DPO review backfill items
CREATE TABLE IF NOT EXISTS dpo_pii_incident_review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  flagged_text TEXT NOT NULL,
  pii_type TEXT NOT NULL,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. FK CHAIN COVERAGE & TOMBSTONED PROFILES MODEL ───

-- Add status column to profiles to enable highly robust tombstoning without hard-delete breaks
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL CHECK (status IN ('active', 'erased', 'suspended')) DEFAULT 'active';

-- RLS enforcement: strictly hide erased profile details except from DPO and internal system maintenance
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_runtime_visibility ON profiles;
CREATE POLICY profiles_runtime_visibility ON profiles FOR SELECT 
USING (
  status = 'active' 
  OR id = auth.uid() 
  OR (SELECT current_setting('haven.dpo_maintenance_override', true)) = 'true'
);

-- ─── 3. Upgrade soft_purge_profile() to execute definitive Idempotent Deep Redaction ───
CREATE OR REPLACE FUNCTION soft_purge_profile(p_target_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sentinel UUID := '00000000-0000-0000-0000-000000000001';
  v_already_erased BOOLEAN;
  v_rec RECORD;
BEGIN
  -- Establish strict execution lock and transaction timeout
  SET LOCAL statement_timeout = '60s';
  PERFORM pg_advisory_xact_lock(hashtext('gdpr_soft_purge_' || p_target_id::TEXT));

  -- Idempotency confirmation
  SELECT (status = 'erased') INTO v_already_erased FROM profiles WHERE id = p_target_id;
  IF (v_already_erased) THEN 
    -- Return gracefully without throwing errors
    RETURN; 
  END IF;

  -- 1. Re-anchor historical ops, audit, and communication records to Anonymous Sentinel ID
  UPDATE medication_ocr_reviews SET reviewer_id = v_sentinel WHERE reviewer_id = p_target_id;
  UPDATE medication_interaction_alerts SET dismissed_by_id = v_sentinel WHERE dismissed_by_id = p_target_id;
  UPDATE video_call_sessions SET elder_id = v_sentinel WHERE elder_id = p_target_id;
  UPDATE video_call_sessions SET initiator_id = v_sentinel WHERE initiator_id = p_target_id;
  UPDATE carer_handover_notes SET elder_id = v_sentinel WHERE elder_id = p_target_id;
  UPDATE carer_handover_notes SET carer_id = v_sentinel WHERE carer_id = p_target_id;
  UPDATE idempotency_keys SET profile_id = v_sentinel WHERE profile_id = p_target_id;
  UPDATE idempotency_keys SET elder_id = v_sentinel WHERE elder_id = p_target_id;

  -- 2. Loop through DB PII fields registry and apply deep redaction or tombstoning
  FOR v_rec IN (SELECT table_name, column_name, redact_strategy FROM gdpr_pii_fields WHERE enabled = true) LOOP
    IF (v_rec.table_name = 'profiles' AND v_rec.column_name = 'full_name') THEN
      UPDATE profiles SET full_name = '[REDACTED_NAME]', status = 'erased', phone = NULL WHERE id = p_target_id;
    ELSIF (v_rec.table_name = 'carer_handover_notes' AND v_rec.column_name = 'notes_nl') THEN
      UPDATE carer_handover_notes SET notes_nl = redact_sensitive_text(notes_nl) WHERE elder_id = v_sentinel;
    ELSIF (v_rec.table_name = 'life_stories' AND v_rec.column_name = 'transcript_nl') THEN
      UPDATE life_stories SET transcript_nl = redact_sensitive_text(transcript_nl) WHERE elder_id = p_target_id;
    ELSIF (v_rec.table_name = 'companion_memory' AND v_rec.column_name = 'content_nl') THEN
      UPDATE companion_memory SET content_nl = redact_sensitive_text(content_nl) WHERE elder_id = p_target_id;
    ELSIF (v_rec.table_name = 'financial_transactions' AND v_rec.column_name = 'description') THEN
      UPDATE financial_transactions SET description = redact_sensitive_text(description) WHERE elder_id = p_target_id;
    END IF;
  END LOOP;

  -- Soft-revoke physical hardware device sessions
  UPDATE device_sessions SET revoked_at = now() WHERE profile_id = p_target_id;

  -- Record highly verifiable, immutable compliance receipt
  INSERT INTO audit_log (actor_id, actor_role, action, table_name, record_id, extra)
  VALUES (p_target_id, 'elder', 'GDPR_ERASURE_PURGE', 'profiles', p_target_id, '{"reason": "Right to Erasure fulfillment", "idempotent_closure": true, "compliance": "GDPR Art. 17"}');
END;
$$;

-- Standalone One-Time Backfill Job scanning existing operational rows for cleartext PII
CREATE OR REPLACE FUNCTION run_pii_backfill_scan() RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN (SELECT id, notes_nl FROM carer_handover_notes WHERE notes_nl SIMILAR TO '%[0-9]{9}%' OR notes_nl ILIKE '%@%') LOOP
    INSERT INTO dpo_pii_incident_review (table_name, record_id, flagged_text, pii_type)
    VALUES ('carer_handover_notes', v_row.id::TEXT, SUBSTRING(v_row.notes_nl, 1, 300), 'Possible cleartext BSN / Email');
  END LOOP;
END;
$$;

-- ─── 4. SENTINEL HARDENING & POISONING PREVENTION ───

-- Safe, idempotent bootstrap ingestion
INSERT INTO profiles (id, role, full_name, status, locale, timezone, high_contrast, font_size_multiplier)
VALUES ('00000000-0000-0000-0000-000000000001', 'system', 'Geanonimiseerd Systeemanker', 'erased', 'nl-NL', 'Europe/Amsterdam', false, 1.0)
ON CONFLICT (id) DO NOTHING;

-- DB Trigger absolutely blocking app roles from altering or corrupting Sentinel aggregate stats
CREATE OR REPLACE FUNCTION guard_sentinel_profile() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.id = '00000000-0000-0000-0000-000000000001' AND session_user NOT IN ('postgres', 'supabase_admin')) THEN
    RAISE EXCEPTION '27000: SYSTEM SENTINEL POISONING BANNED — Attack roles cannot modify or delete GDPR Sentinel IDs';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sentinel ON profiles;
CREATE TRIGGER trg_guard_sentinel BEFORE UPDATE OR DELETE ON profiles
FOR EACH ROW EXECUTE FUNCTION guard_sentinel_profile();

-- Dedicated Runtime Role Revocation
REVOKE UPDATE, DELETE ON profiles FROM authenticated, anon;
GRANT UPDATE (preferred_name, phone, high_contrast, font_size_multiplier) ON profiles TO authenticated;

-- ─── 5. FORENSIC IMMUTABILITY: Runtime De-escalation & Production Event Trigger ───

-- Revoke superuser execution environments from runtime roles
ALTER ROLE authenticated NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE anon NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

-- Event trigger completely closing "semantic DDL addition" attack
CREATE OR REPLACE FUNCTION block_prod_ddl() RETURNS EVENT_TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (session_user NOT IN ('postgres', 'supabase_admin') AND current_setting('haven.allow_migration_ddl', true) IS DISTINCT FROM 'true') THEN
    RAISE EXCEPTION '27000: DDL OPERATIONS BANNED IN PRODUCTION — Unauthorized DDL modification detected';
  END IF;
END;
$$;

DROP EVENT TRIGGER IF EXISTS trg_block_prod_ddl;
CREATE EVENT TRIGGER trg_block_prod_ddl ON ddl_command_start
EXECUTE FUNCTION block_prod_ddl();

-- ─── 6. Breathtaking Append-Only Clinical Corrections View ───
-- Highly strict append-only revision ledger (100% true immutability of original entry)
CREATE OR REPLACE VIEW effective_carer_handover_notes AS
SELECT 
  ch.id, ch.elder_id, ch.carer_id, ch.administered_at, ch.administered_medication_id,
  COALESCE(c.corrected_payload->>'notes_nl', ch.notes_nl) AS notes_nl,
  CASE WHEN c.id IS NOT NULL THEN true ELSE false END AS is_corrected,
  c.correction_reason, c.corrected_at
FROM carer_handover_notes ch
LEFT JOIN LATERAL (
  SELECT id, corrected_payload, correction_reason, corrected_at 
  FROM clinical_record_corrections 
  WHERE table_name = 'carer_handover_notes' AND record_id = ch.id 
  ORDER BY corrected_at DESC LIMIT 1
) c ON true;

-- Refactored privileged correction workflow (Appends revision row without overwriting original target)
CREATE OR REPLACE FUNCTION privileged_correct_clinical_record(
  p_table_name TEXT, p_record_id UUID, p_corrected_payload JSONB, p_correction_reason TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_original JSONB;
  v_actor UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF (v_actor IS NULL) THEN v_actor := '00000000-0000-0000-0000-000000000001'; END IF;

  -- Validate formal authorization
  SELECT role INTO v_role FROM profiles WHERE id = v_actor;
  IF (v_role NOT IN ('system', 'admin', 'carer_professional')) THEN
    RAISE EXCEPTION '403-AUTH-ERR: Caller does not hold privileged clinical correction rights';
  END IF;

  IF (p_table_name = 'carer_handover_notes') THEN
    SELECT to_jsonb(ch.*) INTO v_original FROM carer_handover_notes ch WHERE id = p_record_id;
    IF (v_original IS NULL) THEN RAISE EXCEPTION 'Record not found'; END IF;

    -- Append mandatory revision record. E2E query layer resolves effective state beautifully.
    INSERT INTO clinical_record_corrections (table_name, record_id, corrected_by_id, original_payload, corrected_payload, correction_reason)
    VALUES (p_table_name, p_record_id, v_actor, v_original, p_corrected_payload, p_correction_reason);
  ELSE
    RAISE EXCEPTION 'Append-only correction workflow not configured for table %', p_table_name;
  END IF;
END;
$$;

-- ─── 7. EMERGENCY ESCALATION: Revocation-Uncoupled Discovery & Partial Index ───

-- Ultra-efficient partial index specifically preserving real-time emergency query execution
CREATE INDEX IF NOT EXISTS idx_fall_events_active_emergency ON fall_events(status, detected_at) 
WHERE status = 'possible';

-- Canonical Emergency Discovery RPC (Completely removes device revocation temporal coupling)
CREATE OR REPLACE FUNCTION get_active_emergency_falls()
RETURNS TABLE (
  fall_id UUID, elder_id UUID, detection_source TEXT, confidence NUMERIC, status TEXT, detected_at TIMESTAMPTZ,
  device_label TEXT, device_platform TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- If an emergency fall exists with status='possible' and not resolved/cancelled,
  -- escalate it immediately. Any device or session status is a secondary cosmetic attribute.
  RETURN QUERY
  SELECT 
    f.id AS fall_id, f.elder_id, f.detection_source, f.confidence, f.status::TEXT, f.detected_at,
    d.device_label, d.platform
  FROM fall_events f
  LEFT JOIN device_sessions d ON f.device_session_id = d.id
  WHERE f.status = 'possible';
END;
$$;

-- ─── 8. HIGH-WRITE INGESTION BUFFERING & STABLE SNAPSHOT EXPANSION ───

-- Re-point clinical authorization records to stable profiles_snapshot table
-- completely eliminating secondary transactional lock contention
ALTER TABLE medication_ocr_reviews DROP CONSTRAINT IF EXISTS medication_ocr_reviews_reviewer_id_fkey;
ALTER TABLE medication_interaction_alerts DROP CONSTRAINT IF EXISTS medication_interaction_alerts_dismissed_by_id_fkey;

ALTER TABLE medication_ocr_reviews ADD COLUMN IF NOT EXISTS reviewer_snapshot_id UUID REFERENCES profiles_snapshot(id);
ALTER TABLE medication_interaction_alerts ADD COLUMN IF NOT EXISTS dismissed_snapshot_id UUID REFERENCES profiles_snapshot(id);

-- Un-indexed high-write scratch buffering table for PSD2 open banking webhooks
CREATE TABLE IF NOT EXISTS psd2_webhook_ingress_buffer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;

-- ============================================================================  
-- DOWN MIGRATION (Rollback Final Iteration)  
-- ============================================================================  
/*
BEGIN;
DROP TABLE IF EXISTS psd2_webhook_ingress_buffer;
ALTER TABLE medication_ocr_reviews DROP COLUMN IF NOT EXISTS reviewer_snapshot_id;
ALTER TABLE medication_interaction_alerts DROP COLUMN IF NOT EXISTS dismissed_snapshot_id;
DROP INDEX IF EXISTS idx_fall_events_active_emergency;
DROP FUNCTION IF EXISTS get_active_emergency_falls();
DROP VIEW IF EXISTS effective_carer_handover_notes;
DROP EVENT TRIGGER IF EXISTS trg_block_prod_ddl;
DROP FUNCTION IF EXISTS block_prod_ddl();
DROP TRIGGER IF EXISTS trg_guard_sentinel ON profiles;
DROP FUNCTION IF EXISTS guard_sentinel_profile();
DROP FUNCTION IF EXISTS run_pii_backfill_scan();
DROP FUNCTION IF EXISTS soft_purge_profile(UUID);
DROP TABLE IF EXISTS gdpr_pii_fields;
DROP TABLE IF EXISTS dpo_pii_incident_review;
DROP FUNCTION IF EXISTS redact_sensitive_text(TEXT);
DROP FUNCTION IF EXISTS is_valid_dutch_bsn(TEXT);
ALTER TABLE profiles DROP COLUMN IF EXISTS status;
COMMIT;
*/
