-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN BANKING CONSUMER & POA GUARDIAN DATABASE HARDENING (FIXES C2 & C3)
-- Governed by GDPR Art. 15 / Art. 17 POA Verification, PSD2 Idempotency
-- Rollback: See DOWN section at bottom
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. FIX C3: Add unique constraint on webhook_receipts to prevent duplicate inserts on redelivery ───
ALTER TABLE webhook_receipts DROP CONSTRAINT IF EXISTS webhook_receipts_integration_hash_key;
ALTER TABLE webhook_receipts ADD CONSTRAINT webhook_receipts_integration_hash_key UNIQUE(integration_key, body_hash);

-- ─── 2. FIX C2: Schema expansion for consent_records supporting POA Guardians ───
ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS delegate_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_consent_poa_guardian ON consent_records(delegate_id, elder_id, consent_type, is_active)
  WHERE is_active = true;

COMMIT;

-- Rollback (DOWN Migration)
/*
BEGIN;
DROP INDEX IF EXISTS idx_consent_poa_guardian;
ALTER TABLE consent_records DROP COLUMN IF EXISTS delegate_id;
ALTER TABLE consent_records DROP COLUMN IF EXISTS is_active;
ALTER TABLE webhook_receipts DROP CONSTRAINT IF EXISTS webhook_receipts_integration_hash_key;
COMMIT;
*/
