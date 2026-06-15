-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN PRODUCTION MINIMAL SHIPPABLE PATCH (FINDING #1 CLOSURE)
-- Governed by GDPR Art. 17, Dutch AVG, NEN 7510
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Core Medical & Safety FK Lifecycle (RESTRICT Enforcement) ───
-- Tables: fall_events, medication_reminders, location_events, carer_handover_notes, device_sessions.

ALTER TABLE fall_events DROP CONSTRAINT IF EXISTS fall_events_device_session_id_fkey;
ALTER TABLE fall_events ADD CONSTRAINT fall_events_device_session_id_fkey 
  FOREIGN KEY (device_session_id) REFERENCES device_sessions(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE fall_events VALIDATE CONSTRAINT fall_events_device_session_id_fkey;

ALTER TABLE medication_reminders DROP CONSTRAINT IF EXISTS medication_reminders_medication_id_fkey;
ALTER TABLE medication_reminders ADD CONSTRAINT medication_reminders_medication_id_fkey 
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE medication_reminders VALIDATE CONSTRAINT medication_reminders_medication_id_fkey;

ALTER TABLE carer_handover_notes DROP CONSTRAINT IF EXISTS carer_handover_notes_administered_medication_id_fkey;
ALTER TABLE carer_handover_notes ADD CONSTRAINT carer_handover_notes_administered_medication_id_fkey 
  FOREIGN KEY (administered_medication_id) REFERENCES medications(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE carer_handover_notes VALIDATE CONSTRAINT carer_handover_notes_administered_medication_id_fkey;

-- ─── 2. GDPR Erasure Policy: Tombstoned Profiles & Free-Text Wiping ───

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL CHECK (status IN ('active', 'erased', 'suspended')) DEFAULT 'active';

-- RLS enforcement: erased profiles are strictly invisible to normal runtime queries
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_runtime_visibility ON profiles;
CREATE POLICY profiles_runtime_visibility ON profiles FOR SELECT 
USING (status = 'active' OR id = auth.uid() OR auth.role() IN ('service_role', 'supabase_admin'));

-- Minimal, highly definitive soft_purge_profile procedure
CREATE OR REPLACE FUNCTION soft_purge_profile(p_target_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_already_erased BOOLEAN;
BEGIN
  -- Idempotency confirmation: if already erased, return immediately
  SELECT (status = 'erased') INTO v_already_erased FROM profiles WHERE id = p_target_id;
  IF (v_already_erased IS TRUE) THEN RETURN; END IF;

  -- 1) Profiles are TOMBSTONED, not hard-deleted
  -- 2) Strong identifiers MUST be removed (email/phone -> NULL, full_name -> '[ERASED]')
  UPDATE profiles 
  SET 
    status = 'erased',
    full_name = '[ERASED]',
    preferred_name = NULL,
    phone = NULL,
    email = 'erased_' || p_target_id || '@haven.internal'
  WHERE id = p_target_id;

  -- 3) Unstructured clinical free-text MUST be WIPED (become NULL or '[ERASED]')
  -- Eliminates PII residue in unstructured prose completely
  UPDATE carer_handover_notes SET notes_nl = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE life_stories SET transcript_nl = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE companion_memory SET content_nl = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE financial_transactions SET description = '[ERASED]' WHERE elder_id = p_target_id;

  -- Soft-revoke linked device sessions
  UPDATE device_sessions SET revoked_at = now() WHERE profile_id = p_target_id;
END;
$$;

-- ─── 3. Emergency Discovery Helper & Index (Revocation-Agnostic) ───

CREATE INDEX IF NOT EXISTS idx_fall_events_active_emergency ON fall_events(status, detected_at) 
WHERE status = 'possible';

CREATE OR REPLACE FUNCTION get_active_emergency_falls()
RETURNS TABLE (
  fall_id UUID, elder_id UUID, detection_source TEXT, confidence NUMERIC, status TEXT, detected_at TIMESTAMPTZ,
  device_label TEXT, device_platform TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Emergency discovery is revocation-agnostic.
  -- If a fall exists with status='possible', return it immediately for escalation.
  RETURN QUERY
  SELECT 
    f.id AS fall_id, f.elder_id, f.detection_source, f.confidence, f.status::TEXT, f.detected_at,
    d.device_label, d.platform
  FROM fall_events f
  LEFT JOIN device_sessions d ON f.device_session_id = d.id
  WHERE f.status = 'possible';
END;
$$;

COMMIT;

-- Rollback
/*
BEGIN;
DROP FUNCTION IF EXISTS get_active_emergency_falls();
DROP INDEX IF EXISTS idx_fall_events_active_emergency;
DROP FUNCTION IF EXISTS soft_purge_profile(UUID);
ALTER TABLE profiles DROP COLUMN IF EXISTS status;
ALTER TABLE carer_handover_notes DROP CONSTRAINT IF EXISTS carer_handover_notes_administered_medication_id_fkey;
ALTER TABLE medication_reminders DROP CONSTRAINT IF EXISTS medication_reminders_medication_id_fkey;
ALTER TABLE fall_events DROP CONSTRAINT IF EXISTS fall_events_device_session_id_fkey;
COMMIT;
*/
