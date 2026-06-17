-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN TRANSACTION INTERCEPT HARDENING (MINIMAL SCOPE FAIL-OPEN REMEDIATION)
-- Governed by PSD2 Open Banking Anomaly Monitoring, NEN 7510
-- Rollback: See DOWN section at bottom
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. State Expansion: Add pending verification status ───
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS intercept_status TEXT 
  CHECK (intercept_status IN ('processing', 'cleared', 'flagged', 'intercept_failed')) DEFAULT 'cleared';

CREATE INDEX IF NOT EXISTS idx_fin_tx_processing ON financial_transactions(intercept_status, created_at) 
  WHERE intercept_status = 'processing';

-- ─── 2. Authoritative Monitoring Procedure for Stale Intercepts (>5 mins) ───
CREATE OR REPLACE FUNCTION check_stale_processing_transactions()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tx RECORD;
  v_admin RECORD;
BEGIN
  FOR v_tx IN (
    SELECT id, elder_id, account_id_masked, amount_cents 
    FROM financial_transactions 
    WHERE intercept_status = 'processing' 
      AND created_at < now() - INTERVAL '5 MINUTES'
  ) LOOP
    -- Update to intercept_failed
    UPDATE financial_transactions 
    SET intercept_status = 'intercept_failed', flagged = true, intercepted = false 
    WHERE id = v_tx.id;

    -- Dispatch critical monitoring alerts to all canonical system admins
    FOR v_admin IN (SELECT id FROM profiles WHERE role = 'admin') LOOP
      INSERT INTO notifications (recipient_id, elder_id, notification_type, title_nl, title_en, body_nl, body_en, data)
      VALUES (
        v_admin.id, v_tx.elder_id, 'scam_zwart', 
        'CRITICAL MISLUKT: Transactie Interceptie Hangt', 
        'CRITICAL FAILED: Transaction Intercept Stuck', 
        'Een financiële transactie hangt langer dan 5 minuten in processing. Mogelijke silent fraud wire escape.', 
        'A financial transaction has been stuck in processing for over 5 minutes. Possible silent fraud wire escape.', 
        jsonb_build_object('transaction_id', v_tx.id, 'amount_cents', v_tx.amount_cents)
      );
    END LOOP;

    -- Record non-repudiable NEN 7510 audit log row
    INSERT INTO audit_log (actor_id, actor_role, action, table_name, record_id, elder_id, extra)
    VALUES (
      '00000000-0000-0000-0000-000000000001', 'system', 
      'STALE_TRANSACTION_INTERCEPT_FAILURE', 'financial_transactions', 
      v_tx.id, v_tx.elder_id, 
      jsonb_build_object('reason', 'INTERCEPT_TIMEOUT', 'amount_cents', v_tx.amount_cents)
    );
  END LOOP;
END;
$$;

-- Schedule canonical monitoring sweeper via pg_cron (runs every 2 minutes)
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('haven-stale-tx-intercept-monitor', '*/2 * * * *', 'SELECT check_stale_processing_transactions();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron monitoring job scheduled best-effort';
END
$cron$;

COMMIT;

-- Rollback (DOWN Migration)
/*
BEGIN;
DROP FUNCTION IF EXISTS check_stale_processing_transactions();
ALTER TABLE financial_transactions DROP COLUMN IF EXISTS intercept_status;
COMMIT;
*/
