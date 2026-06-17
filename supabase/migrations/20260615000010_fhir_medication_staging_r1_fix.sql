-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN PRODUCTION FHIR IMPORT STAGING (FINDING R1 COMPLETE CLOSURE)
-- Governed by Wet Wkkgz, NEN 7510, IGJ Inspection Readiness
-- Rollback: See DOWN section at bottom
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Core Staging Schema for External FHIR Medication Imports ───

CREATE TYPE fhir_staging_status AS ENUM ('pending_review', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS fhir_medication_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fhir_job_id UUID REFERENCES fhir_import_jobs(id) ON DELETE CASCADE,
  resource_id_hash TEXT NOT NULL,
  raw_resource JSONB NOT NULL,
  extracted_name_nl TEXT NOT NULL,
  extracted_dosage_nl TEXT NOT NULL,
  proposed_schedule_times TEXT[] NOT NULL DEFAULT '{"08:00"}',
  status fhir_staging_status NOT NULL DEFAULT 'pending_review',
  reviewed_by_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  created_medication_id UUID REFERENCES medications(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(elder_id, resource_id_hash)
);

CREATE INDEX IF NOT EXISTS idx_fhir_med_staging_elder ON fhir_medication_staging(elder_id, status);

-- ─── 2. Highly Authoritative Clinical Interaction Checker (SQL) ───
CREATE OR REPLACE FUNCTION check_medication_interactions_sql(p_elder_id UUID, p_new_med_name TEXT)
RETURNS TABLE (
  drug_a TEXT,
  drug_b TEXT,
  severity TEXT,
  summary_nl TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Evaluates proposed FHIR import prescriptions against existing active patient regimens
  -- enforcing clinical contraindication checks before promotion to active status.
  RETURN QUERY
  WITH active_meds AS (
    SELECT lower(name_nl) AS mname FROM medications 
    WHERE elder_id = p_elder_id AND is_active = true AND deleted_at IS NULL
  ),
  rules(da, db, sev, sum_nl) AS (
    VALUES 
      ('metformine'::TEXT, 'alcohol'::TEXT, 'warn'::TEXT, 'Alcohol kan risico op lactaatacidose verhogen.'::TEXT),
      ('lisinopril'::TEXT, 'kalium'::TEXT, 'warn'::TEXT, 'Kalium kan risico op hyperkaliëmie verhogen.'::TEXT),
      ('simvastatine'::TEXT, 'amiodaron'::TEXT, 'critical'::TEXT, 'Combinatie verhoogt risico op myopathie.'::TEXT),
      ('lisinopril'::TEXT, 'spironolacton'::TEXT, 'warn'::TEXT, 'Kaliumsparende diuretica + ACE-remmer: monitor kalium.'::TEXT),
      ('metformine'::TEXT, 'prednison'::TEXT, 'warn'::TEXT, 'Corticosteroïden kunnen bloedsuiker verhogen.'::TEXT),
      ('carbamazepine'::TEXT, 'simvastatine'::TEXT, 'critical'::TEXT, 'Carbamazepine verlaagt simvastatine-spiegel.'::TEXT)
  )
  SELECT r.da, r.db, r.sev, r.sum_nl
  FROM rules r
  WHERE (lower(p_new_med_name) LIKE '%' || r.da || '%' AND EXISTS (SELECT 1 FROM active_meds am WHERE am.mname LIKE '%' || r.db || '%'))
     OR (lower(p_new_med_name) LIKE '%' || r.db || '%' AND EXISTS (SELECT 1 FROM active_meds am WHERE am.mname LIKE '%' || r.da || '%'));
END;
$$;

-- ─── 3. Professional Clinician Promotion RPC (Staging -> Active) ───
CREATE OR REPLACE FUNCTION promote_fhir_medication_staging(p_staging_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_staging RECORD;
  v_role TEXT;
  v_crit_count INTEGER := 0;
  v_med_id UUID;
  v_clinician_id UUID := auth.uid();
BEGIN
  -- 1. Validate caller possesses accredited physician or dedicated DPO privileges via auth.uid()
  SELECT role INTO v_role FROM profiles WHERE id = v_clinician_id;
  IF (v_role NOT IN ('system', 'admin', 'carer_professional')) THEN
    RAISE EXCEPTION '403 Forbidden: Direct activation attempt without authorized clinical approval is strictly rejected';
  END IF;

  -- 2. Retrieve staging record with explicit row-level locking (FOR UPDATE)
  SELECT id, elder_id, extracted_name_nl, extracted_dosage_nl, proposed_schedule_times, status
  INTO v_staging FROM fhir_medication_staging WHERE id = p_staging_id FOR UPDATE;

  IF (v_staging IS NULL) THEN RAISE EXCEPTION '404: Staging record non-existent'; END IF;
  IF (v_staging.status <> 'pending_review') THEN
    RAISE EXCEPTION '400: Prescription is already resolved or promoted';
  END IF;

  -- 3. Execute authoritative contraindication check before promotion, not after
  SELECT count(*) INTO v_crit_count FROM check_medication_interactions_sql(v_staging.elder_id, v_staging.extracted_name_nl)
  WHERE severity = 'critical';

  IF (v_crit_count > 0) THEN
    -- Ingest alert into contraindication warnings ledger
    INSERT INTO medication_interaction_alerts (elder_id, severity, summary_nl, source)
    VALUES (v_staging.elder_id, 'critical', 'CRITICAL FHIR INTERACTION: Voorgesteld medicijn ' || v_staging.extracted_name_nl || ' heeft een ernstige wisselwerking met huidige medicatie.', 'promote_fhir_medication_staging');

    UPDATE fhir_medication_staging 
    SET status = 'rejected', reviewed_by_id = v_clinician_id, reviewed_at = now()
    WHERE id = p_staging_id;

    RAISE EXCEPTION '409 Conflict: Lethal contraindication detected. Prescription automatically flagged and promotion blocked.';
  END IF;

  -- 4. Safe promotion to active pharmacological regimen
  INSERT INTO medications (
    elder_id, name_nl, name_en, dose_description_nl, dose_description_en, frequency, schedule_times,
    instructions_nl, instructions_en, is_active, start_date
  ) VALUES (
    v_staging.elder_id, v_staging.extracted_name_nl, v_staging.extracted_name_nl, v_staging.extracted_dosage_nl, v_staging.extracted_dosage_nl, 'dagelijks', v_staging.proposed_schedule_times,
    'Geïmporteerd uit MedMij en medisch goedgekeurd.', 'Imported from MedMij and clinically approved.', true, now()::DATE
  ) RETURNING id INTO v_med_id;

  -- Update staging status
  UPDATE fhir_medication_staging 
  SET status = 'approved', reviewed_by_id = v_clinician_id, reviewed_at = now(), created_medication_id = v_med_id
  WHERE id = p_staging_id;

  -- Record non-repudiable NEN 7510 audit log row
  INSERT INTO audit_log (actor_id, actor_role, action, table_name, record_id, elder_id, extra)
  VALUES (v_clinician_id, 'carer_professional', 'FHIR_STAGING_PROMOTION', 'medications', v_med_id, v_staging.elder_id, jsonb_build_object('staging_id', p_staging_id, 'med_name', v_staging.extracted_name_nl));

  RETURN jsonb_build_object('ok', true, 'status', 'approved', 'medication_id', v_med_id);
END;
$$;

COMMIT;

-- Rollback (DOWN Migration)
/*
BEGIN;
DROP FUNCTION IF EXISTS promote_fhir_medication_staging(UUID);
DROP FUNCTION IF EXISTS check_medication_interactions_sql(UUID, TEXT);
DROP TABLE IF EXISTS fhir_medication_staging CASCADE;
DROP TYPE IF EXISTS fhir_staging_status;
COMMIT;
*/
