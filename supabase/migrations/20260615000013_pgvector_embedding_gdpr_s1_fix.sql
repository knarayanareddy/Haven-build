-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN PRODUCTION pgvector EMBEDDING PURGE (FINDING S1 COMPLETE CLOSURE)
-- Governed by GDPR Art. 17, Vector PII Reconstruction Rejection
-- Rollback: See DOWN section at bottom
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Gated Canonical soft_purge_profile Stored Procedure
-- Upgraded to atomically wipe 1536-dimensional OpenAI mathematical embeddings
-- within the exact same transaction as plain-text PII sanitization sweeps.
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

  -- 3) Unstructured clinical free-text MUST be WIPED (become NULL or '[ERASED]')
  UPDATE carer_handover_notes SET notes_nl = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE life_stories SET transcript_nl = '[ERASED]' WHERE elder_id = p_target_id;
  
  -- ─── S1 FIX: Nullify mathematical pgvector embeddings in companion_memory ───
  -- Executed entirely inside existing soft_purge_profile transaction boundary
  UPDATE companion_memory 
  SET embedding = NULL, content_nl = '[ERASED]', content_en = '[ERASED]' 
  WHERE elder_id = p_target_id;

  UPDATE financial_transactions SET description = '[ERASED]' WHERE elder_id = p_target_id;

  -- Soft-revoke linked physical hardware device sessions
  UPDATE device_sessions SET revoked_at = now() WHERE profile_id = p_target_id;
END;
$$;

COMMIT;

-- Rollback (DOWN Migration)
/*
BEGIN;
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
  UPDATE companion_memory SET content_nl = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE financial_transactions SET description = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE device_sessions SET revoked_at = now() WHERE profile_id = p_target_id;
END;
$$;
COMMIT;
*/
