-- ─────────────────────────────────────────────────────────────────────────────
-- 20261029000004  Function privileges + erasure audit restoration
--
-- Three defects found while converting the text-matching test suites onto a real
-- schema model. All three were invisible to those suites because they assert on
-- the *old* migration files, which are no longer the version that ships.
--
-- 1. P0 — every SECURITY DEFINER function in `public` was executable by anyone
--    holding the anon key. Postgres grants EXECUTE on new functions to PUBLIC,
--    and Supabase exposes `public` over PostgREST, so
--
--        POST /rest/v1/rpc/soft_purge_profile {"p_target_id": "<uuid>"}
--
--    with the public anon key erased an elder's entire medical record. The same
--    held for get_elder_screen_data_batch (full PII read), insert_location_event
--    (arbitrary location writes), mark_reminder_taken (suppressing missed-dosage
--    alerts) and run_pii_backfill_scan. A SECURITY DEFINER function runs as its
--    owner, so RLS does not apply: the 110/110 RLS gate cannot see this.
--    No browser code calls .rpc() — every call site is an Edge Function using the
--    service-role client — so the client roles need no EXECUTE at all, except for
--    the RLS helpers and the token-gated emergency endpoint.
--
-- 2. P1 — soft_purge_profile (20260620000002) dropped the `GDPR_ERASURE_PURGE`
--    audit row that every earlier version wrote. Right-to-erasure requests
--    therefore left no accountability record (GDPR Art. 5(2) / Art. 30).
--
-- 3. P1 — execute_haven_database_retention_sweeps (same migration) dropped the
--    statement timeout. It deletes 7-year-old audit rows at 03:00 with no bound
--    on how long it may hold locks.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Restore the erasure audit receipt ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.soft_purge_profile(p_target_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_already_erased BOOLEAN;
BEGIN
  SELECT (status = 'erased') INTO v_already_erased
  FROM public.profiles
  WHERE id = p_target_id
  FOR UPDATE;

  IF (v_already_erased IS TRUE) THEN RETURN; END IF;

  UPDATE public.profiles
  SET status = 'erased',
      full_name = '[ERASED - AVG Art. 17 / GDPR Art. 17]',
      preferred_name = NULL,
      phone_nl = NULL,
      deleted_at = coalesce(deleted_at, now())
  WHERE id = p_target_id;

  UPDATE public.carer_handover_notes SET notes_nl = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE public.life_stories SET transcript_nl = '[ERASED]', transcript_en = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE public.companion_memory SET embedding = NULL, content_nl = '[ERASED]', content_en = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE public.financial_transactions SET description = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE public.device_sessions SET revoked_at = now() WHERE profile_id = p_target_id AND revoked_at IS NULL;
  UPDATE public.medication_ocr_reviews SET notes = NULL WHERE elder_id = p_target_id;
  UPDATE public.scam_coaching_sessions SET assistant_summary_nl = '[ERASED]', assistant_summary_en = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE public.voice_interactions SET transcript_nl = NULL, transcript_en = NULL, response_text_nl = '[ERASED]', response_text_en = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE public.vital_signs SET context_notes_nl = NULL WHERE elder_id = p_target_id;
  UPDATE public.documents SET label_nl = '[ERASED]', label_en = '[ERASED]', summary_nl = NULL, summary_en = NULL WHERE elder_id = p_target_id;
  -- Free text that describes the person's day, care and incidents. These four tables were
  -- the only narrative columns in the schema left untouched by the purge: handover notes and
  -- life stories were redacted, while "she seemed confused after breakfast" survived next to
  -- the erased profile. Structured clinical facts (a medication name and dose, a fall's
  -- detection source and confidence) stay: they are the record the care team must keep.
  UPDATE public.carer_visit_logs SET activities_nl = '[ERASED]', observations_nl = '[ERASED]', concerns_nl = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE public.incidents SET description_nl = '[ERASED]', resolution_notes_nl = '[ERASED]', external_authority_nl = NULL WHERE elder_id = p_target_id;
  UPDATE public.fall_events SET resolution_notes = '[ERASED]' WHERE elder_id = p_target_id;
  UPDATE public.medications SET instructions_nl = NULL, instructions_en = NULL WHERE elder_id = p_target_id;

  -- Accountability receipt. Written in the same transaction as the redaction and
  -- written exactly once (the early RETURN above makes the purge idempotent).
  -- audit_log is append-only: UPDATE/DELETE are rewritten to DO INSTEAD NOTHING.
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, record_id, extra)
  VALUES (
    p_target_id,
    'elder',
    'GDPR_ERASURE_PURGE',
    'profiles',
    p_target_id,
    '{"reason": "Right to Erasure fulfillment", "idempotent_closure": true, "compliance": "GDPR Art. 17", "schema_version": "20261029000004"}'::jsonb
  );

  -- Mark the request completed only after the receipt exists. Previously the status was
  -- flipped to 'completed' first, so a failure in the audit insert left a request that
  -- claimed to be fulfilled and no evidence that anything had been erased.
  UPDATE public.deletion_requests SET status = 'completed', completed_at = now() WHERE elder_id = p_target_id;
END;
$$;

-- ─── 2. Bound the nightly retention sweep ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.execute_haven_database_retention_sweeps()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public SET statement_timeout = '120s' AS $$
  DELETE FROM public.device_health_events WHERE created_at < now() - INTERVAL '90 DAYS';
  DELETE FROM public.vital_signs WHERE recorded_at < now() - INTERVAL '20 YEARS';
  DELETE FROM public.audit_log WHERE created_at < now() - INTERVAL '7 YEARS';
  DELETE FROM public.webhook_receipts WHERE received_at < now() - INTERVAL '90 DAYS';
  DELETE FROM public.notifications WHERE created_at < now() - INTERVAL '30 DAYS';
  DELETE FROM public.app_events WHERE occurred_at < now() - INTERVAL '90 DAYS';
  DELETE FROM public.perf_metrics WHERE recorded_at < now() - INTERVAL '90 DAYS';
  DELETE FROM public.push_tokens WHERE is_active = false AND updated_at < now() - INTERVAL '60 DAYS';

  UPDATE public.voice_interactions
  SET transcript_nl = NULL,
      transcript_en = NULL,
      response_text_nl = '[ERASED]',
      response_text_en = '[ERASED]'
  WHERE created_at < now() - INTERVAL '30 DAYS' AND transcript_nl IS NOT NULL;

  DELETE FROM public.voice_interactions WHERE created_at < now() - INTERVAL '90 DAYS';
  DELETE FROM public.slo_alerts WHERE opened_at < now() - INTERVAL '1 YEAR';
  SELECT NULL::void;
$$;

-- ─── 3. Pin search_path on every SECURITY DEFINER function ───────────────────
-- A SECURITY DEFINER function that resolves unqualified names through the
-- caller's search_path can be hijacked with a shadowing object in pg_temp. These
-- twelve were defined without the clause; ALTER FUNCTION sets it without
-- re-declaring a body. (ratelimit_check() is deliberately absent: 20261029000002
-- drops it in favour of consume_rate_limit(), and ALTER on a dropped function
-- aborts the whole migration — which is exactly what the CI database job caught.)

ALTER FUNCTION public.privileged_correct_clinical_record(TEXT, UUID, JSONB, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_active_medication_reminders(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.run_pii_backfill_scan() SET search_path = public, pg_temp;
ALTER FUNCTION public.purge_expired_telemetry_nonces() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_elder_screen_data_batch(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.compute_weekly_safety_digests_batch() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_voice_pipeline_context(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_recent_emergency_locations(UUID, geometry, NUMERIC) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.purge_stale_emergency_location_objects() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.check_medication_interactions_sql(UUID, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_stale_processing_transactions() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_notification_template_mutation() SET search_path = public, pg_temp;

-- ─── 4. Deny-by-default EXECUTE on the public schema ─────────────────────────
-- Anything not granted below is callable only by service_role (i.e. Edge
-- Functions), which is how every call site in this repository works.

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- Edge Functions use the service-role key.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Everything granted back to a client role is here because it re-derives the
-- caller inside the function. That is the rule; it is not "grant what used to be
-- granted". Two functions that a 2026-06 migration had granted to authenticated are
-- deliberately absent — mark_reminder_taken() and record_app_event() are
-- SECURITY DEFINER and take the elder/profile id straight from the caller without
-- checking it, so a signed-in user could confirm anyone's medication or forge
-- analytics rows. The revoke above closes that; do not restore them.

-- RLS helper functions are evaluated as the *querying* role, so signed-in users
-- need EXECUTE on them directly. They each re-derive the caller from auth.uid().
GRANT EXECUTE ON FUNCTION public.family_can(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.carer_can(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_haven_admin() TO authenticated;

-- The printed emergency QR/URL is opened without a session; the function is
-- gated by a single-use hashed token, not by a role.
GRANT EXECUTE ON FUNCTION public.get_emergency_profile(TEXT) TO anon, authenticated;

-- Right of access, exercised with the person's own session: an elder exports their
-- own data. The function raises 403 unless p_elder_id = auth.uid() (or the caller is
-- service_role), so the grant cannot be used to read anyone else's record.
GRANT EXECUTE ON FUNCTION public.export_elder_data(UUID) TO authenticated;

-- Consent-gated family view. SECURITY INVOKER, and it raises unless family_can()
-- approves one of the shared domains, so RLS still applies underneath.
GRANT EXECUTE ON FUNCTION public.family_dashboard_summary(UUID) TO authenticated;

-- Future functions: no implicit PUBLIC grant. A new RPC must be granted
-- deliberately, in the migration that adds it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
