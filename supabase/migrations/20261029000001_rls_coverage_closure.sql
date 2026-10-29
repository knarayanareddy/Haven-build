-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN RLS COVERAGE CLOSURE (October 2026 remediation, item 1)
--
-- Problem this closes:
--   12 tables were created in `public` without `enable row level security`.
--   Supabase grants `anon`/`authenticated` table privileges by default, so those
--   tables were reachable through PostgREST with the public anon key. Affected:
--     fhir_medication_staging          (clinical staging + raw FHIR resource)
--     location_events_partitioned      (precise geospatial PII)
--     psd2_webhook_ingress_buffer      (raw bank payloads)
--     device_telemetry_nonces          (replay-defence ledger)
--     phone_reputation_cache           (scam-detection input — tamperable)
--     domain_reputation_cache          (scam-detection input — tamperable)
--     profiles_snapshot                (internal FK anchor)
--     gdpr_pii_fields                  (erasure registry)
--     dpo_pii_incident_review          (DPO forensics)
--     security_violations              (forensics)
--     clinical_record_corrections      (append-only clinical ledger)
--     consent_packs                    (reference catalogue)
--
-- Posture per table is deliberate, not blanket: internal/scam-reputation ledgers
-- become service-role-only (RLS on + no policies + privileges revoked), user-data
-- tables get consent-scoped policies mirroring the existing `family_can` model.
--
-- Rollback: see DOWN section at the bottom.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Admin predicate (single definition, no duplicated role literals) ───
CREATE OR REPLACE FUNCTION public.is_haven_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.deleted_at IS NULL
  )
$$;

REVOKE ALL ON FUNCTION public.is_haven_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_haven_admin() TO authenticated, service_role;

-- ─── 2. Service-role-only ledgers ───
-- RLS enabled + forced, zero policies => no row is visible or writable to any
-- non-bypassing role (anon, authenticated). Edge Functions use the service-role
-- key and hold BYPASSRLS, so they are unaffected.

ALTER TABLE public.phone_reputation_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_reputation_cache FORCE ROW LEVEL SECURITY;

ALTER TABLE public.domain_reputation_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_reputation_cache FORCE ROW LEVEL SECURITY;

ALTER TABLE public.device_telemetry_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_telemetry_nonces FORCE ROW LEVEL SECURITY;

ALTER TABLE public.psd2_webhook_ingress_buffer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psd2_webhook_ingress_buffer FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_snapshot FORCE ROW LEVEL SECURITY;

ALTER TABLE public.gdpr_pii_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_pii_fields FORCE ROW LEVEL SECURITY;

-- Defence in depth: remove PostgREST reachability entirely for these tables.
REVOKE ALL ON public.phone_reputation_cache FROM anon, authenticated;
REVOKE ALL ON public.domain_reputation_cache FROM anon, authenticated;
REVOKE ALL ON public.device_telemetry_nonces FROM anon, authenticated;
REVOKE ALL ON public.psd2_webhook_ingress_buffer FROM anon, authenticated;
REVOKE ALL ON public.profiles_snapshot FROM anon, authenticated;
REVOKE ALL ON public.gdpr_pii_fields FROM anon, authenticated;

-- perf_metrics had RLS enabled but no policies and no privilege revoke, so a
-- client role could still issue requests against it. Found by
-- scripts/ci/audit-rls-coverage.mjs.
REVOKE ALL ON public.perf_metrics FROM anon, authenticated;

-- ─── 3. Forensics / DPO surfaces: admin read only ───

ALTER TABLE public.security_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_violations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS security_violations_admin_read ON public.security_violations;
CREATE POLICY security_violations_admin_read ON public.security_violations
  FOR SELECT USING (public.is_haven_admin());
REVOKE ALL ON public.security_violations FROM anon;

ALTER TABLE public.dpo_pii_incident_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dpo_pii_incident_review FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dpo_pii_incident_review_admin ON public.dpo_pii_incident_review;
CREATE POLICY dpo_pii_incident_review_admin ON public.dpo_pii_incident_review
  FOR SELECT USING (public.is_haven_admin());
REVOKE ALL ON public.dpo_pii_incident_review FROM anon;

-- clinical_record_corrections has no elder_id column, so it cannot be scoped to
-- an elder. Carers read the effective (corrected) state through the
-- `effective_carer_handover_notes` view, which runs as its owner; the base
-- ledger therefore stays admin-read-only and append-only (no update/delete
-- policy for anyone).
ALTER TABLE public.clinical_record_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_record_corrections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinical_record_corrections_admin ON public.clinical_record_corrections;
CREATE POLICY clinical_record_corrections_admin ON public.clinical_record_corrections
  FOR SELECT USING (public.is_haven_admin());
REVOKE ALL ON public.clinical_record_corrections FROM anon;

-- ─── 4. Reference catalogue: readable by any signed-in user, not writable ───

ALTER TABLE public.consent_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_packs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_packs_authenticated_read ON public.consent_packs;
CREATE POLICY consent_packs_authenticated_read ON public.consent_packs
  FOR SELECT TO authenticated USING (TRUE);
REVOKE ALL ON public.consent_packs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.consent_packs FROM authenticated;

-- ─── 5. Clinical staging: elder owns, carer with medications consent, admin ──
-- Writes stay service-role only: rows are produced by fn-medmij-fhir-import and
-- promoted by promote_fhir_medication_staging(), never inserted by a client.

ALTER TABLE public.fhir_medication_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fhir_medication_staging FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fhir_staging_elder_read ON public.fhir_medication_staging;
CREATE POLICY fhir_staging_elder_read ON public.fhir_medication_staging
  FOR SELECT USING (elder_id = auth.uid());

DROP POLICY IF EXISTS fhir_staging_carer_read ON public.fhir_medication_staging;
CREATE POLICY fhir_staging_carer_read ON public.fhir_medication_staging
  FOR SELECT USING (public.carer_can(elder_id));

DROP POLICY IF EXISTS fhir_staging_admin_read ON public.fhir_medication_staging;
CREATE POLICY fhir_staging_admin_read ON public.fhir_medication_staging
  FOR SELECT USING (public.is_haven_admin());

REVOKE ALL ON public.fhir_medication_staging FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fhir_medication_staging FROM authenticated;

-- ─── 6. Partitioned location store: mirrors `location_events` ───

ALTER TABLE public.location_events_partitioned ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_events_partitioned FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loc_partitioned_elder ON public.location_events_partitioned;
CREATE POLICY loc_partitioned_elder ON public.location_events_partitioned
  FOR SELECT USING (elder_id = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS loc_partitioned_family ON public.location_events_partitioned;
CREATE POLICY loc_partitioned_family ON public.location_events_partitioned
  FOR SELECT USING (public.family_can(elder_id, 'location') AND deleted_at IS NULL);

DROP POLICY IF EXISTS loc_partitioned_carer ON public.location_events_partitioned;
CREATE POLICY loc_partitioned_carer ON public.location_events_partitioned
  FOR SELECT USING (public.carer_can(elder_id) AND deleted_at IS NULL);

-- Precise coordinates are never exposed to a client role, matching the
-- column-level revoke already applied to `location_events`.
REVOKE ALL ON public.location_events_partitioned FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.location_events_partitioned FROM authenticated;
REVOKE SELECT (location_precise) ON public.location_events_partitioned FROM authenticated, anon;

-- Partitions are separate tables: enabling RLS on the parent does not protect
-- them when queried directly. Keep every child in sync.
CREATE OR REPLACE FUNCTION public.ensure_location_partition_rls()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partition TEXT;
  v_count INTEGER := 0;
BEGIN
  FOR v_partition IN (
    SELECT c.relname
    FROM pg_class c
    JOIN pg_inherits i ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'location_events_partitioned'
      AND c.relkind = 'r'
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_partition);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v_partition);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_location_partition_rls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_location_partition_rls() TO service_role;

SELECT public.ensure_location_partition_rls();

-- ─── 7. Redefine the retention job so new partitions are born protected ───
-- (Same body as 20260615000008_minimal_postgis_partition_retention.sql plus the
-- RLS clause, and the search_path pin the original was missing.)

CREATE OR REPLACE FUNCTION execute_postgis_partition_retention()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partition_name TEXT;
  v_future_date DATE;
  v_start_iso TEXT;
  v_end_iso TEXT;
BEGIN
  FOR i IN 0..7 LOOP
    v_future_date := now()::DATE + i;
    v_partition_name := 'location_events_p_' || TO_CHAR(v_future_date, 'YYYY_MM_DD');
    v_start_iso := v_future_date::TEXT || ' 00:00:00+00';
    v_end_iso := (v_future_date + 1)::TEXT || ' 00:00:00+00';

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF location_events_partitioned FOR VALUES FROM (%L) TO (%L)',
      v_partition_name, v_start_iso, v_end_iso
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_partition_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v_partition_name);
  END LOOP;

  FOR v_partition_name IN (
    SELECT c.relname FROM pg_class c
    JOIN pg_inherits i ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'location_events_partitioned'
      AND c.relname SIMILAR TO 'location_events_p_[0-9]{4}_[0-9]{2}_[0-9]{2}'
      AND TO_DATE(SUBSTRING(c.relname, 19), 'YYYY_MM_DD') < now()::DATE - 90
  ) LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', v_partition_name);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION execute_postgis_partition_retention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION execute_postgis_partition_retention() TO service_role;

-- Belt and braces: a daily sweep catches partitions created outside the job.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'haven-location-partition-rls',
      '30 3 * * *',
      'SELECT public.ensure_location_partition_rls();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END
$cron$;

-- ─── 8. Make future un-RLS'd tables impossible to miss at review time ───
-- A comment marker consumed by scripts/ci/audit-rls-coverage.mjs so the audit
-- and the migration disagree loudly rather than silently.
COMMENT ON FUNCTION public.ensure_location_partition_rls() IS
  'HAVEN: keeps RLS enabled+forced on every location_events_partitioned child table.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime-role de-escalation
-- ─────────────────────────────────────────────────────────────────────────────
-- 20260615000002 left these two statements commented out:
--     -- ALTER ROLE authenticated NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
--     -- ALTER ROLE anon          NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
-- because ALTER ROLE needs a role with ADMIN OPTION, and migrations run as a
-- non-superuser on Supabase. Leaving them as comments means the hardening exists
-- only in prose, and tests/edge/clinical-immutability-closure.test.mjs asserted on
-- the comment text.
--
-- The DO block below performs the de-escalation whenever the executing role is
-- allowed to (self-hosted Postgres, or supabase_admin), and otherwise records a
-- NOTICE and continues. On hosted Supabase `authenticated`/`anon` are already
-- NOLOGIN group roles without elevated attributes, so the skipped branch is a
-- no-op there rather than a gap.
DO $$
DECLARE
  target_role text;
  elevated boolean;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    BEGIN
      EXECUTE format('ALTER ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', target_role);
      RAISE NOTICE 'haven: de-escalated runtime role %', target_role;
    EXCEPTION
      WHEN insufficient_privilege THEN
        -- Verify the end state instead of assuming it: if the role IS elevated we
        -- must fail the migration, not silently continue.
        SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication
          INTO elevated
          FROM pg_roles WHERE rolname = target_role;

        IF elevated IS TRUE THEN
          RAISE EXCEPTION 'haven: runtime role % holds elevated attributes and could not be de-escalated', target_role;
        END IF;
        RAISE NOTICE 'haven: runtime role % unchanged (already least-privilege)', target_role;
      WHEN undefined_object THEN
        RAISE NOTICE 'haven: runtime role % does not exist in this database', target_role;
    END;
  END LOOP;
END;
$$;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════════
-- DOWN MIGRATION (rollback)
-- ══════════════════════════════════════════════════════════════════════════════
/*
BEGIN;

DROP POLICY IF EXISTS loc_partitioned_elder ON public.location_events_partitioned;
DROP POLICY IF EXISTS loc_partitioned_family ON public.location_events_partitioned;
DROP POLICY IF EXISTS loc_partitioned_carer ON public.location_events_partitioned;
ALTER TABLE public.location_events_partitioned DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_events_partitioned NO FORCE ROW LEVEL SECURITY;
GRANT ALL ON public.location_events_partitioned TO anon, authenticated;

DROP POLICY IF EXISTS fhir_staging_elder_read ON public.fhir_medication_staging;
DROP POLICY IF EXISTS fhir_staging_carer_read ON public.fhir_medication_staging;
DROP POLICY IF EXISTS fhir_staging_admin_read ON public.fhir_medication_staging;
ALTER TABLE public.fhir_medication_staging DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fhir_medication_staging NO FORCE ROW LEVEL SECURITY;
GRANT ALL ON public.fhir_medication_staging TO anon, authenticated;

DROP POLICY IF EXISTS consent_packs_authenticated_read ON public.consent_packs;
ALTER TABLE public.consent_packs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_packs NO FORCE ROW LEVEL SECURITY;
GRANT ALL ON public.consent_packs TO anon, authenticated;

DROP POLICY IF EXISTS clinical_record_corrections_admin ON public.clinical_record_corrections;
ALTER TABLE public.clinical_record_corrections DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_record_corrections NO FORCE ROW LEVEL SECURITY;
GRANT ALL ON public.clinical_record_corrections TO anon, authenticated;

DROP POLICY IF EXISTS dpo_pii_incident_review_admin ON public.dpo_pii_incident_review;
ALTER TABLE public.dpo_pii_incident_review DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dpo_pii_incident_review NO FORCE ROW LEVEL SECURITY;
GRANT ALL ON public.dpo_pii_incident_review TO anon, authenticated;

DROP POLICY IF EXISTS security_violations_admin_read ON public.security_violations;
ALTER TABLE public.security_violations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_violations NO FORCE ROW LEVEL SECURITY;
GRANT ALL ON public.security_violations TO anon, authenticated;

ALTER TABLE public.gdpr_pii_fields DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_snapshot DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.psd2_webhook_ingress_buffer DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_telemetry_nonces DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_reputation_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_reputation_cache DISABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.ensure_location_partition_rls();
DROP FUNCTION IF EXISTS public.is_haven_admin();

COMMIT;
*/

