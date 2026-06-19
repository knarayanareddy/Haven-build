-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN PII COMPLETENESS PURGE EXTENSION (MINIMAL SCOPE)
-- Governed by GDPR Art. 17, Dutch AVG, WGBO 20-Year Retention Preservation
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Registry Expansion: Add newly covered columns to gdpr_pii_fields ───
INSERT INTO gdpr_pii_fields (table_name, column_name, identity_column, redact_strategy, enabled)
VALUES 
  ('medication_ocr_reviews', 'notes', 'elder_id', 'anonymize', true),
  ('scam_coaching_sessions', 'assistant_summary_nl', 'elder_id', 'overwrite', true),
  ('scam_coaching_sessions', 'assistant_summary_en', 'elder_id', 'overwrite', true),
  ('voice_interactions', 'transcript_nl', 'elder_id', 'anonymize', true),
  ('voice_interactions', 'transcript_en', 'elder_id', 'anonymize', true),
  ('vital_signs', 'context_notes_nl', 'elder_id', 'anonymize', true),
  ('documents', 'label_nl', 'elder_id', 'overwrite', true),
  ('documents', 'label_en', 'elder_id', 'overwrite', true),
  ('documents', 'summary_nl', 'elder_id', 'anonymize', true),
  ('documents', 'summary_en', 'elder_id', 'anonymize', true)
ON CONFLICT DO NOTHING;

-- ─── 2. Stored Procedure Overhaul: soft_purge_profile PII Completeness ───
CREATE OR REPLACE FUNCTION soft_purge_profile(p_target_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_already_erased BOOLEAN;
BEGIN
  -- Idempotency confirmation: if already erased, second invocation is a safe no-op
  SELECT (status = 'erased') INTO v_already_erased FROM profiles WHERE id = p_target_id;
  IF (v_already_erased IS TRUE) THEN RETURN; END IF;

  -- 1) Profiles are TOMBSTONED, not hard-deleted
  -- 2) Strong identifiers MUST be removed
  UPDATE profiles 
  SET 
    status = 'erased',
    full_name = '[ERASED]',
    preferred_name = NULL,
    phone_nl = NULL,
    email = 'erased_' || p_target_id || '@haven.internal'
  WHERE id = p_target_id;

  -- 3) Base unstructured clinical free-text MUST be WIPED
  UPDATE carer_handover_notes SET notes_nl = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE life_stories SET transcript_nl = '[ERASED]' WHERE elder_id = p_target_id;
  
  -- Mathematical pgvector embeddings nullification
  UPDATE companion_memory 
  SET embedding = NULL, content_nl = '[ERASED]', content_en = '[ERASED]' 
  WHERE elder_id = p_target_id;

  UPDATE financial_transactions SET description = '[ERASED]' WHERE elder_id = p_target_id;

  -- Soft-revoke linked physical hardware device sessions
  UPDATE device_sessions SET revoked_at = now() WHERE profile_id = p_target_id;

  -- ─── 4. Round 4 PII Completeness Extensions ───
  
  -- medication_ocr_reviews: nullify any free-text fields
  UPDATE medication_ocr_reviews SET notes = NULL WHERE elder_id = p_target_id;
  
  -- scam_coaching_sessions: wipe session transcript/content fields
  UPDATE scam_coaching_sessions SET assistant_summary_nl = '[ERASED]', assistant_summary_en = '[ERASED]' WHERE elder_id = p_target_id;
  
  -- voice_interactions: wipe transcript field
  UPDATE voice_interactions SET transcript_nl = NULL, transcript_en = NULL, response_text_nl = '[ERASED]', response_text_en = '[ERASED]' WHERE elder_id = p_target_id;
  
  -- vital_signs: nullify any free-text context notes (preserve numeric values specifically for WGBO 20-year retention)
  UPDATE vital_signs SET context_notes_nl = NULL WHERE elder_id = p_target_id;
  
  -- documents: wipe label/description fields (preserve S3 key storage_path for regulatory audit)
  UPDATE documents SET label_nl = '[ERASED]', label_en = '[ERASED]', summary_nl = NULL, summary_en = NULL WHERE elder_id = p_target_id;
END;
$$;

COMMIT;

-- Rollback (DOWN Migration)
/*
BEGIN;
DELETE FROM gdpr_pii_fields WHERE table_name IN ('medication_ocr_reviews', 'scam_coaching_sessions', 'voice_interactions', 'vital_signs', 'documents');
CREATE OR REPLACE FUNCTION soft_purge_profile(p_target_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_already_erased BOOLEAN;
BEGIN
  SELECT (status = 'erased') INTO v_already_erased FROM profiles WHERE id = p_target_id;
  IF (v_already_erased IS TRUE) THEN RETURN; END IF;

  UPDATE profiles 
  SET status = 'erased', full_name = '[ERASED]', preferred_name = NULL, phone_nl = NULL, email = 'erased_' || p_target_id || '@haven.internal'
  WHERE id = p_target_id;

  UPDATE carer_handover_notes SET notes_nl = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE life_stories SET transcript_nl = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE companion_memory SET embedding = NULL, content_nl = '[ERASED]', content_en = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE financial_transactions SET description = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE device_sessions SET revoked_at = now() WHERE profile_id = p_target_id;
END;
$$;
COMMIT;
*/
