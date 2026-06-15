-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN PRODUCTION FINAL TARGETED ITERATION (V2 CORRECTED PATCH)
-- Governed by GDPR Art. 9, Art. 17, Dutch AVG, UAVG, NEN 7510, Wet Wkkgz
-- ══════════════════════════════════════════════════════════════════════════════

-- UP MIGRATION

BEGIN;

-- ─── 0. Dedicated Schema Roles Register ───
CREATE ROLE haven_schema_migration_role WITH NOLOGIN;
CREATE ROLE haven_dpo_maintenance_role WITH NOLOGIN;

-- ─── 1. GDPR ERASURE: Deterministic Deep Redaction & Exact Known Identifiers ───

-- 1a. Algorithmic Modulo-11 (11-proef) structural BSN validation helper
CREATE OR REPLACE FUNCTION is_valid_dutch_bsn(p_candidate TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_clean TEXT;
  v_sum INTEGER := 0;
BEGIN
  v_clean := REGEXP_REPLACE(p_candidate, '[^0-9]', '', 'g');
  IF (LENGTH(v_clean) <> 9) THEN RETURN FALSE; END IF;

  v_sum := (SUBSTRING(v_clean, 1, 1)::INTEGER * 9) +
           (SUBSTRING(v_clean, 2, 1)::INTEGER * 8) +
           (SUBSTRING(v_clean, 3, 1)::INTEGER * 7) +
           (SUBSTRING(v_clean, 4, 1)::INTEGER * 6) +
           (SUBSTRING(v_clean, 5, 1)::INTEGER * 5) +
           (SUBSTRING(v_clean, 6, 1)::INTEGER * 4) +
           (SUBSTRING(v_clean, 7, 1)::INTEGER * 3) +
           (SUBSTRING(v_clean, 8, 1)::INTEGER * 2) -
           (SUBSTRING(v_clean, 9, 1)::INTEGER * 1);

  RETURN (v_sum % 11 = 0);
END;
$$;

-- 1b. Deterministic Deep Redaction PL/pgSQL Function (v2)
-- Redacts known names, emails, phones, and deeply parses Modulo-11 BSNs
CREATE OR REPLACE FUNCTION redact_sensitive_text_v2(
  p_text TEXT,
  p_known_name TEXT,
  p_known_email TEXT,
  p_known_phone TEXT,
  p_known_bsn TEXT
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_result TEXT;
  v_match RECORD;
  v_clean_phone TEXT;
BEGIN
  IF (p_text IS NULL) THEN RETURN NULL; END IF;
  v_result := p_text;

  -- 1. Redact Exact Known Identifiers (Case-insensitive)
  IF (p_known_name IS NOT NULL AND LENGTH(TRIM(p_known_name)) > 1) THEN
    v_result := REGEXP_REPLACE(v_result, '\y' || REGEXP_REPLACE(p_known_name, '([.*+?^=!:${}()|\[\]\/\\])', '\\\1', 'g') || '\y', '[REDACTED_KNOWN_NAME]', 'gi');
  END IF;

  IF (p_known_email IS NOT NULL AND LENGTH(TRIM(p_known_email)) > 4) THEN
    v_result := REPLACE(v_result, p_known_email, '[REDACTED_KNOWN_EMAIL]');
  END IF;

  IF (p_known_phone IS NOT NULL AND LENGTH(TRIM(p_known_phone)) > 5) THEN
    v_result := REPLACE(v_result, p_known_phone, '[REDACTED_KNOWN_PHONE]');
    -- Normalize phone without hyphens or spaces and redact
    v_clean_phone := REGEXP_REPLACE(p_known_phone, '[^0-9\+]', '', 'g');
    IF (LENGTH(v_clean_phone) > 5) THEN
      v_result := REPLACE(v_result, v_clean_phone, '[REDACTED_KNOWN_PHONE]');
    END IF;
  END IF;

  IF (p_known_bsn IS NOT NULL AND LENGTH(TRIM(p_known_bsn)) >= 9) THEN
    v_result := REPLACE(v_result, p_known_bsn, '[REDACTED_KNOWN_BSN]');
  END IF;

  -- 2. Deep Deterministic Redaction of General Emails
  v_result := REGEXP_REPLACE(v_result, '[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', '[REDACTED_EMAIL]', 'g');

  -- 3. Deep Deterministic Redaction of Dutch Phone Numbers (06-12345678, +31612345678, 010-1234567, etc.)
  v_result := REGEXP_REPLACE(v_result, '(\+31|0)[1-9][0-9]{1,2}[\s\-]?[0-9]{3}[\s\-]?[0-9]{3,4}\y', '[REDACTED_PHONE]', 'g');

  -- 4. Set-Returning Discovery and Redaction of Structural Modulo-11 BSNs (with separators)
  -- Uses \y (word boundary) and matches sequences with optional hyphens/dots/spaces
  FOR v_match IN (
    SELECT m[1] AS bsn_cand FROM regexp_matches(v_result, '\y([0-9][\s\.\-]*){8}[0-9]\y', 'g') AS m
  ) LOOP
    IF (is_valid_dutch_bsn(v_match.bsn_cand)) THEN
      v_result := REPLACE(v_result, v_match.bsn_cand, '[REDACTED_BSN]');
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- 1c. DB PII Columns Registry Table (v2)
CREATE TABLE IF NOT EXISTS gdpr_pii_fields (
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  identity_column TEXT NOT NULL,
  redact_strategy TEXT NOT NULL CHECK (redact_strategy IN ('deep_redact', 'overwrite', 'anonymize')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (table_name, column_name)
);

INSERT INTO gdpr_pii_fields (table_name, column_name, identity_column, redact_strategy, enabled)
VALUES 
  ('profiles', 'full_name', 'id', 'anonymize', true),
  ('profiles', 'preferred_name', 'id', 'overwrite', true),
  ('profiles', 'phone', 'id', 'overwrite', true),
  ('carer_handover_notes', 'notes_nl', 'elder_id', 'deep_redact', true),
  ('medication_ocr_jobs', 'extracted_name_nl', 'elder_id', 'deep_redact', true),
  ('medication_interaction_alerts', 'summary_nl', 'elder_id', 'deep_redact', true),
  ('life_stories', 'transcript_nl', 'elder_id', 'deep_redact', true),
  ('companion_memory', 'content_nl', 'elder_id', 'deep_redact', true),
  ('financial_transactions', 'description', 'elder_id', 'deep_redact', true)
ON CONFLICT DO NOTHING;

-- ─── 2. RLS TOMBSTONED PROFILES MODEL (Verifiable Privilege Model) ───

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL CHECK (status IN ('active', 'erased', 'suspended')) DEFAULT 'active';

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_runtime_visibility ON profiles;
CREATE POLICY profiles_runtime_visibility ON profiles FOR SELECT 
USING (
  status = 'active' 
  OR id = auth.uid() 
  OR coalesce((auth.jwt()->>'custom_claims')::jsonb->>'dpo_role', 'none') = 'true'
  OR pg_has_role(session_user, 'haven_dpo_maintenance_role', 'MEMBER')
  OR session_user IN ('postgres', 'supabase_admin')
);

-- ─── 3. Upgrade soft_purge_profile() to execute Definitive Dynamic Deep Redaction ───
CREATE OR REPLACE FUNCTION soft_purge_profile(p_target_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sentinel UUID := '00000000-0000-0000-0000-000000000001';
  v_profile RECORD;
  v_rec RECORD;
  v_bsn TEXT := NULL;
BEGIN
  -- Strict execution lock and query timeout
  SET LOCAL statement_timeout = '60s';
  PERFORM pg_advisory_xact_lock(hashtext('gdpr_soft_purge_' || p_target_id::TEXT));

  -- 1. Retrieve profile details to verify idempotency and extract known identifiers
  SELECT id, full_name, preferred_name, phone, email, status INTO v_profile 
  FROM profiles WHERE id = p_target_id;

  IF (v_profile IS NULL OR v_profile.status = 'erased') THEN RETURN; END IF;

  -- Attempt to extract known BSN from emergency profiles or medical metadata if known
  BEGIN
    SELECT bsn_masked INTO v_bsn FROM emergency_profiles WHERE elder_id = p_target_id LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN v_bsn := NULL;
  END;

  -- 2. Dynamically loop PII registry and execute deep deterministic redaction across all operational rows
  FOR v_rec IN (SELECT table_name, column_name, identity_column, redact_strategy FROM gdpr_pii_fields WHERE enabled = true) LOOP
    IF (v_rec.table_name = 'profiles') THEN
      UPDATE profiles 
      SET full_name = '[REDACTED_NAME]', preferred_name = NULL, phone = NULL, status = 'erased' 
      WHERE id = p_target_id;
    ELSIF (v_rec.redact_strategy = 'deep_redact') THEN
      EXECUTE format(
        'UPDATE %I SET %I = redact_sensitive_text_v2(%I, $1, $2, $3, $4) WHERE %I = $5',
        v_rec.table_name, v_rec.column_name, v_rec.column_name, v_rec.identity_column
      ) USING v_profile.full_name, v_profile.email, v_profile.phone, v_bsn, p_target_id;
    END IF;
  END LOOP;

  -- 3. Re-anchor ops, audit, and communication records to Anonymous Sentinel ID
  UPDATE medication_ocr_reviews SET reviewer_id = v_sentinel WHERE reviewer_id = p_target_id;
  UPDATE medication_interaction_alerts SET dismissed_by_id = v_sentinel WHERE dismissed_by_id = p_target_id;
  UPDATE video_call_sessions SET elder_id = v_sentinel WHERE elder_id = p_target_id;
  UPDATE video_call_sessions SET initiator_id = v_sentinel WHERE initiator_id = p_target_id;
  UPDATE carer_handover_notes SET elder_id = v_sentinel WHERE elder_id = p_target_id;
  UPDATE carer_handover_notes SET carer_id = v_sentinel WHERE carer_id = p_target_id;
  UPDATE idempotency_keys SET profile_id = v_sentinel WHERE profile_id = p_target_id;
  UPDATE idempotency_keys SET elder_id = v_sentinel WHERE elder_id = p_target_id;

  -- Soft-revoke physical hardware device sessions
  UPDATE device_sessions SET revoked_at = now() WHERE profile_id = p_target_id;

  -- Insert immutable audit receipt
  INSERT INTO audit_log (actor_id, actor_role, action, table_name, record_id, extra)
  VALUES (p_target_id, 'elder', 'GDPR_ERASURE_PURGE', 'profiles', p_target_id, '{"reason": "Right to Erasure fulfillment", "idempotent_closure": true, "compliance": "GDPR Art. 17"}');
END;
$$;

-- ─── 4. SENTINEL HARDENING & POISONING PREVENTION ───

INSERT INTO profiles (id, role, full_name, status, locale, timezone, high_contrast, font_size_multiplier)
VALUES ('00000000-0000-0000-0000-000000000001', 'system', 'Geanonimiseerd Systeemanker', 'erased', 'nl-NL', 'Europe/Amsterdam', false, 1.0)
ON CONFLICT (id) DO NOTHING;

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

-- ─── 5. FORENSIC IMMUTABILITY: Runtime De-escalation & Production Event Trigger ───

-- Event trigger completely closing "semantic DDL addition" attack
CREATE OR REPLACE FUNCTION block_prod_ddl() RETURNS EVENT_TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (session_user NOT IN ('postgres', 'supabase_admin', 'haven_schema_migration_role')) THEN
    RAISE EXCEPTION '27000: DDL OPERATIONS BANNED IN PRODUCTION — Application runtime roles have absolutely zero DDL privileges';
  END IF;
END;
$$;

DROP EVENT TRIGGER IF EXISTS trg_block_prod_ddl;
CREATE EVENT TRIGGER trg_block_prod_ddl ON ddl_command_start
EXECUTE FUNCTION block_prod_ddl();

-- ─── 6. Append-Only Clinical Corrections Model ───

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

CREATE OR REPLACE FUNCTION privileged_correct_clinical_record(
  p_table_name TEXT, p_record_id UUID, p_corrected_payload JSONB, p_correction_reason TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_original JSONB;
  v_actor UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF (v_actor IS NULL) THEN v_actor := '00000000-0000-0000-0000-000000000001'; END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_actor;
  IF (v_role NOT IN ('system', 'admin', 'carer_professional')) THEN
    RAISE EXCEPTION '403-AUTH-ERR: Caller does not hold privileged clinical correction rights';
  END IF;

  IF (p_table_name = 'carer_handover_notes') THEN
    SELECT to_jsonb(ch.*) INTO v_original FROM carer_handover_notes ch WHERE id = p_record_id;
    IF (v_original IS NULL) THEN RAISE EXCEPTION 'Record not found'; END IF;

    INSERT INTO clinical_record_corrections (table_name, record_id, corrected_by_id, original_payload, corrected_payload, correction_reason)
    VALUES (p_table_name, p_record_id, v_actor, v_original, p_corrected_payload, p_correction_reason);
  ELSE
    RAISE EXCEPTION 'Append-only correction workflow not configured for table %', p_table_name;
  END IF;
END;
$$;

-- ─── 7. EMERGENCY ESCALATION: Revocation-Uncoupled Discovery & Partial Index ───

CREATE INDEX IF NOT EXISTS idx_fall_events_active_emergency ON fall_events(status, detected_at) 
WHERE status = 'possible';

CREATE OR REPLACE FUNCTION get_active_emergency_falls()
RETURNS TABLE (
  fall_id UUID, elder_id UUID, detection_source TEXT, confidence NUMERIC, status TEXT, detected_at TIMESTAMPTZ,
  device_label TEXT, device_platform TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.id AS fall_id, f.elder_id, f.detection_source, f.confidence, f.status::TEXT, f.detected_at,
    d.device_label, d.platform
  FROM fall_events f
  LEFT JOIN device_sessions d ON f.device_session_id = d.id
  WHERE f.status = 'possible';
END;
$$;

-- ─── 8. HIGH-WRITE INGESTION BUFFERING: Unlogged Scratch Table & Stable Snapshot ───

ALTER TABLE medication_ocr_reviews DROP CONSTRAINT IF EXISTS medication_ocr_reviews_reviewer_id_fkey;
ALTER TABLE medication_interaction_alerts DROP CONSTRAINT IF EXISTS medication_interaction_alerts_dismissed_by_id_fkey;

ALTER TABLE medication_ocr_reviews ADD COLUMN IF NOT EXISTS reviewer_snapshot_id UUID REFERENCES profiles_snapshot(id);
ALTER TABLE medication_interaction_alerts ADD COLUMN IF NOT EXISTS dismissed_snapshot_id UUID REFERENCES profiles_snapshot(id);

-- Unlogged scratch table for high-write PSD2 banking webhook buffering (0% WAL disk saturation)
CREATE UNLOGGED TABLE IF NOT EXISTS psd2_webhook_ingress_buffer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;

-- Rollback v2 Patch
/*
BEGIN;
DROP TABLE IF EXISTS psd2_webhook_ingress_buffer;
DROP VIEW IF EXISTS effective_carer_handover_notes;
DROP EVENT TRIGGER IF EXISTS trg_block_prod_ddl;
DROP FUNCTION IF EXISTS block_prod_ddl();
DROP TRIGGER IF EXISTS trg_guard_sentinel ON profiles;
DROP FUNCTION IF EXISTS guard_sentinel_profile();
DROP FUNCTION IF EXISTS soft_purge_profile(UUID);
DROP TABLE IF EXISTS gdpr_pii_fields;
DROP FUNCTION IF EXISTS redact_sensitive_text_v2(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS is_valid_dutch_bsn(TEXT);
ALTER TABLE profiles DROP COLUMN IF EXISTS status;
COMMIT;
*/
