-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN PRODUCTION PGTAP / PG_PROVE SCHEMA INTEGRITY TEST SUITE
-- ══════════════════════════════════════════════════════════════════════════════
-- Executed via: pg_prove -U postgres -d haven tests/schema/fk_integrity.pgtap.sql

BEGIN;

SELECT plan(15);

-- ─── 5a-1: Confirm every foreign key has explicit ON DELETE behavior ───
SELECT is(
  (
    SELECT count(*)::integer
    FROM information_schema.referential_constraints rc
    WHERE rc.delete_rule = 'NO ACTION'
      AND rc.constraint_name IN (
        'fall_events_device_session_id_fkey',
        'medication_reminders_medication_id_fkey',
        'device_health_events_device_session_id_fkey',
        'carer_handover_notes_administered_medication_id_fkey',
        'medication_ocr_reviews_reviewer_id_fkey',
        'medication_interaction_alerts_dismissed_by_id_fkey',
        'video_call_sessions_visit_id_fkey',
        'elder_voice_preferences_voice_profile_id_fkey',
        'webhook_receipts_profile_id_fkey',
        'webhook_receipts_elder_id_fkey'
      )
  ),
  0,
  'All critical medical and time-series foreign keys must have explicit RESTRICT or CASCADE lifecycle rules, not implicit NO ACTION defaults'
);

-- ─── 5a-2: Confirm ON DELETE SET NULL is absent from all medical record tables ───
SELECT is(
  (
    SELECT count(*)::integer
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu 
      ON rc.constraint_name = kcu.constraint_name
    WHERE rc.delete_rule = 'SET NULL'
      AND kcu.table_name IN (
        'fall_events',
        'medication_reminders',
        'device_health_events',
        'carer_handover_notes',
        'medication_ocr_reviews',
        'medication_interaction_alerts',
        'video_call_sessions',
        'elder_voice_preferences',
        'webhook_receipts'
      )
  ),
  0,
  'ON DELETE SET NULL is strictly banned on all clinical, medical, and emergency audit tables'
);

-- ─── 5a-3: Confirm specific RESTRICT policies exist ───
SELECT col_has_fk('public', 'fall_events', 'device_session_id', 'fall_events_device_session_id_fkey exists');
SELECT col_has_fk('public', 'medication_reminders', 'medication_id', 'medication_reminders_medication_id_fkey exists');
SELECT col_has_fk('public', 'device_health_events', 'device_session_id', 'device_health_events_device_session_id_fkey exists');
SELECT col_has_fk('public', 'carer_handover_notes', 'administered_medication_id', 'carer_handover_notes_administered_medication_id exists');
SELECT col_has_fk('public', 'medication_ocr_reviews', 'reviewer_id', 'medication_ocr_reviews_reviewer_id exists');

-- ─── 5a-4: Confirm no orphaned records exist in live tables ───
SELECT results_eq(
  'SELECT count(*)::integer FROM fall_events WHERE device_session_id IS NULL AND detection_source IN (''apple_watch'', ''google_watch'')',
  ARRAY[0::integer],
  'No orphaned wearable fall events with NULL device sessions allowed'
);

SELECT results_eq(
  'SELECT count(*)::integer FROM medication_reminders mr LEFT JOIN medications m ON mr.medication_id = m.id WHERE m.id IS NULL',
  ARRAY[0::integer],
  'No orphaned medication reminders without an active parent medication allowed'
);

SELECT results_eq(
  'SELECT count(*)::integer FROM device_health_events WHERE device_session_id IS NULL',
  ARRAY[0::integer],
  'No orphaned device health events without a valid device session allowed'
);

SELECT results_eq(
  'SELECT count(*)::integer FROM carer_handover_notes WHERE administered_medication_id IS NULL AND administered_at IS NOT NULL',
  ARRAY[0::integer],
  'No handover notes claiming medication administration without a valid linked medication entry allowed'
);

SELECT results_eq(
  'SELECT count(*)::integer FROM video_call_sessions WHERE visit_id IS NULL AND session_type = ''carer_telehealth''',
  ARRAY[0::integer],
  'No professional telehealth sessions without an active linked visit log allowed'
);

SELECT results_eq(
  'SELECT count(*)::integer FROM webhook_receipts WHERE profile_id IS NULL AND event_type = ''user_action''',
  ARRAY[0::integer],
  'No webhook audit receipts without a linked responsible profile allowed'
);

SELECT results_eq(
  'SELECT count(*)::integer FROM elder_voice_preferences WHERE voice_profile_id IS NULL',
  ARRAY[0::integer],
  'No elder voice preferences without a valid familiar voice profile allowed'
);

SELECT results_eq(
  'SELECT count(*)::integer FROM medication_ocr_reviews WHERE reviewer_id IS NULL AND status = ''approved''',
  ARRAY[0::integer],
  'No approved OCR reviews with an anonymous or NULL reviewer allowed'
);

SELECT results_eq(
  'SELECT count(*)::integer FROM medication_interaction_alerts WHERE dismissed_by_id IS NULL AND dismissed_at IS NOT NULL',
  ARRAY[0::integer],
  'No dismissed medication interaction alerts without an accountable dismissing professional profile allowed'
);

ROLLBACK;
