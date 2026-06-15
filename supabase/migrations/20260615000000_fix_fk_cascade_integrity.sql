-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN PRODUCTION UNIFIED FOREIGN KEY & DATA LIFECYCLE POLICY (NEN 7510 / AVG)
-- ══════════════════════════════════════════════════════════════════════════════
-- As a highly sensitive Dutch medical and elder-care platform governed by GDPR Art. 9,
-- Dutch AVG, and NEN 7510, data integrity failures represent clinical hazards, patient
-- safety incidents, and severe regulatory breaches.
--
-- The following rules constitute the absolute engineering law for all future HAVEN
-- PostgreSQL schema migrations:
--
-- 1. WHEN TO USE ON DELETE CASCADE:
--    - Permitted ONLY for pure ownership structures where child records have zero
--      clinical, audit, or legal meaning outside their exact parent profile.
--    - Examples: profiles -> elder_profiles, profiles -> notification_preferences,
--      medication_ocr_jobs -> medication_ocr_reviews.
--    - BANNED for any medical administration records (MAR), vital signs, incident
--      reports, audit logs, or emergency escalations.
--
-- 2. WHEN TO USE ON DELETE RESTRICT:
--    - MANDATORY for all clinical records, time-series logs, MAR entries, financial
--      transactions, and hardware security anchors.
--    - Examples: medications <- medication_reminders, device_sessions <- fall_events,
--      profiles <- carer_handover_notes.
--    - Justification: Hard-deleting a parent entity (like a medication schedule or
--      visiting nurse profile) must never wipe out or alter the immutable medical history.
--      If historical child logs exist, PostgreSQL must block the parent hard deletion,
--      enforcing application-level soft deletions.
--
-- 3. WHEN TO USE ON DELETE SET NULL:
--    - ABSOLUTELY BANNED for all medical records, health events, and emergency logs.
--    - Justification: Setting a foreign key to NULL severs the cryptographic and clinical
--      audit trail. In a Dutch state health inspection (IGJ) or forensic audit following
--      an elder injury, an orphaned fall record or handover note with an anonymous or
--      NULL caregiver/device breaks non-repudiation and NEN 7510 traceability.
--    - Permitted ONLY for ephemeral, non-clinical cosmetic preferences (e.g., dismissing
--      a UI banner or unlinking an ephemeral WebRTC session).
--
-- 4. HARD DELETES VS SOFT DELETES:
--    - True hard deletes (DELETE FROM ...) are restricted entirely to automated GDPR Art. 17
--      right-to-erasure background crons that execute complete, validated user teardowns,
--      or non-clinical scratch tables (e.g., ephemeral TTS audio cache).
--    - All active operational care surfaces must utilize structured soft deletes
--      (deleted_at TIMESTAMPTZ, is_active BOOLEAN, revoked_at TIMESTAMPTZ) to preserve
--      absolute medical traceability.
-- ══════════════════════════════════════════════════════════════════════════════

-- UP MIGRATION

-- ─── 1. Fix fall_events -> device_sessions ───
-- Justification: Physical hardware links (Apple Watch, Android phone) that recorded
-- a fall must be immutable. If a device session is revoked or retired, it must be
-- soft-deleted (revoked_at). It must never orphan historical fall logs by setting to NULL.
ALTER TABLE fall_events DROP CONSTRAINT IF EXISTS fall_events_device_session_id_fkey;
ALTER TABLE fall_events ADD CONSTRAINT fall_events_device_session_id_fkey 
  FOREIGN KEY (device_session_id) REFERENCES device_sessions(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE fall_events VALIDATE CONSTRAINT fall_events_device_session_id_fkey;

-- ─── 2. Fix medication_reminders -> medications ───
-- Justification: Medication Administration Records (MAR-light) must represent an
-- uncompromised, un-cascaded legal audit log. Hard-deleting a medication schedule
-- must be blocked if historical administration cues exist.
ALTER TABLE medication_reminders DROP CONSTRAINT IF EXISTS medication_reminders_medication_id_fkey;
ALTER TABLE medication_reminders ADD CONSTRAINT medication_reminders_medication_id_fkey 
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE medication_reminders VALIDATE CONSTRAINT medication_reminders_medication_id_fkey;

-- ─── 3. Fix device_health_events -> device_sessions ───
-- Justification: Trust signal and security telemetry events must retain their physical
-- hardware anchor for forensic non-repudiation.
ALTER TABLE device_health_events DROP CONSTRAINT IF EXISTS device_health_events_device_session_id_fkey;
ALTER TABLE device_health_events ADD CONSTRAINT device_health_events_device_session_id_fkey 
  FOREIGN KEY (device_session_id) REFERENCES device_sessions(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE device_health_events VALIDATE CONSTRAINT device_health_events_device_session_id_fkey;

-- ─── 4. Fix carer_handover_notes -> medications ───
-- Justification: A nurse's handover note stating a specific medication was administered
-- must never lose its precise pharmacological identifier.
ALTER TABLE carer_handover_notes DROP CONSTRAINT IF EXISTS carer_handover_notes_administered_medication_id_fkey;
ALTER TABLE carer_handover_notes ADD CONSTRAINT carer_handover_notes_administered_medication_id_fkey 
  FOREIGN KEY (administered_medication_id) REFERENCES medications(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE carer_handover_notes VALIDATE CONSTRAINT carer_handover_notes_administered_medication_id_fkey;

-- ─── 5. Fix medication_ocr_reviews -> profiles (reviewer_id) ───
-- Justification: Non-repudiable medical authorization. A professional who approved or
-- verified an OCR medication ingestion must remain auditable forever per NEN 7510.
ALTER TABLE medication_ocr_reviews DROP CONSTRAINT IF EXISTS medication_ocr_reviews_reviewer_id_fkey;
ALTER TABLE medication_ocr_reviews ADD CONSTRAINT medication_ocr_reviews_reviewer_id_fkey 
  FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE medication_ocr_reviews VALIDATE CONSTRAINT medication_ocr_reviews_reviewer_id_fkey;

-- ─── 6. Fix medication_interaction_alerts -> profiles (dismissed_by_id) ───
-- Justification: Medical override accountability. A physician dismissing a lethal drug
-- interaction alert must remain anchored to the audit record.
ALTER TABLE medication_interaction_alerts DROP CONSTRAINT IF EXISTS medication_interaction_alerts_dismissed_by_id_fkey;
ALTER TABLE medication_interaction_alerts ADD CONSTRAINT medication_interaction_alerts_dismissed_by_id_fkey 
  FOREIGN KEY (dismissed_by_id) REFERENCES profiles(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE medication_interaction_alerts VALIDATE CONSTRAINT medication_interaction_alerts_dismissed_by_id_fkey;

-- ─── 7. Fix video_call_sessions -> carer_visit_logs (visit_id) ───
-- Justification: Telehealth WebRTC records tied to formal wijkverpleging visits
-- must not be unlinked.
ALTER TABLE video_call_sessions DROP CONSTRAINT IF EXISTS video_call_sessions_visit_id_fkey;
ALTER TABLE video_call_sessions ADD CONSTRAINT video_call_sessions_visit_id_fkey 
  FOREIGN KEY (visit_id) REFERENCES carer_visit_logs(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE video_call_sessions VALIDATE CONSTRAINT video_call_sessions_visit_id_fkey;

-- ─── 8. Fix elder_voice_preferences -> voice_profiles ───
-- Justification: Familiar Voice AI settings must not be orphaned if a voice model is modified.
ALTER TABLE elder_voice_preferences DROP CONSTRAINT IF EXISTS elder_voice_preferences_voice_profile_id_fkey;
ALTER TABLE elder_voice_preferences ADD CONSTRAINT elder_voice_preferences_voice_profile_id_fkey 
  FOREIGN KEY (voice_profile_id) REFERENCES voice_profiles(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE elder_voice_preferences VALIDATE CONSTRAINT elder_voice_preferences_voice_profile_id_fkey;

-- ─── 9. Fix webhook_receipts -> profiles (elder_id, profile_id) ───
-- Justification: Webhook and API transaction audit receipts must maintain exact actor proof.
ALTER TABLE webhook_receipts DROP CONSTRAINT IF EXISTS webhook_receipts_profile_id_fkey;
ALTER TABLE webhook_receipts ADD CONSTRAINT webhook_receipts_profile_id_fkey 
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE webhook_receipts VALIDATE CONSTRAINT webhook_receipts_profile_id_fkey;

ALTER TABLE webhook_receipts DROP CONSTRAINT IF EXISTS webhook_receipts_elder_id_fkey;
ALTER TABLE webhook_receipts ADD CONSTRAINT webhook_receipts_elder_id_fkey 
  FOREIGN KEY (elder_id) REFERENCES profiles(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE webhook_receipts VALIDATE CONSTRAINT webhook_receipts_elder_id_fkey;


-- -- DOWN MIGRATION (Rollback to broken canonical state)
/*
ALTER TABLE webhook_receipts DROP CONSTRAINT IF EXISTS webhook_receipts_elder_id_fkey;
ALTER TABLE webhook_receipts ADD CONSTRAINT webhook_receipts_elder_id_fkey 
  FOREIGN KEY (elder_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE webhook_receipts DROP CONSTRAINT IF EXISTS webhook_receipts_profile_id_fkey;
ALTER TABLE webhook_receipts ADD CONSTRAINT webhook_receipts_profile_id_fkey 
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE elder_voice_preferences DROP CONSTRAINT IF EXISTS elder_voice_preferences_voice_profile_id_fkey;
ALTER TABLE elder_voice_preferences ADD CONSTRAINT elder_voice_preferences_voice_profile_id_fkey 
  FOREIGN KEY (voice_profile_id) REFERENCES voice_profiles(id) ON DELETE SET NULL;

ALTER TABLE video_call_sessions DROP CONSTRAINT IF EXISTS video_call_sessions_visit_id_fkey;
ALTER TABLE video_call_sessions ADD CONSTRAINT video_call_sessions_visit_id_fkey 
  FOREIGN KEY (visit_id) REFERENCES carer_visit_logs(id) ON DELETE SET NULL;

ALTER TABLE medication_interaction_alerts DROP CONSTRAINT IF EXISTS medication_interaction_alerts_dismissed_by_id_fkey;
ALTER TABLE medication_interaction_alerts ADD CONSTRAINT medication_interaction_alerts_dismissed_by_id_fkey 
  FOREIGN KEY (dismissed_by_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE medication_ocr_reviews DROP CONSTRAINT IF EXISTS medication_ocr_reviews_reviewer_id_fkey;
ALTER TABLE medication_ocr_reviews ADD CONSTRAINT medication_ocr_reviews_reviewer_id_fkey 
  FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE carer_handover_notes DROP CONSTRAINT IF EXISTS carer_handover_notes_administered_medication_id_fkey;
ALTER TABLE carer_handover_notes ADD CONSTRAINT carer_handover_notes_administered_medication_id_fkey 
  FOREIGN KEY (administered_medication_id) REFERENCES medications(id) ON DELETE SET NULL;

ALTER TABLE device_health_events DROP CONSTRAINT IF EXISTS device_health_events_device_session_id_fkey;
ALTER TABLE device_health_events ADD CONSTRAINT device_health_events_device_session_id_fkey 
  FOREIGN KEY (device_session_id) REFERENCES device_sessions(id) ON DELETE SET NULL;

ALTER TABLE medication_reminders DROP CONSTRAINT IF EXISTS medication_reminders_medication_id_fkey;
ALTER TABLE medication_reminders ADD CONSTRAINT medication_reminders_medication_id_fkey 
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE;

ALTER TABLE fall_events DROP CONSTRAINT IF EXISTS fall_events_device_session_id_fkey;
ALTER TABLE fall_events ADD CONSTRAINT fall_events_device_session_id_fkey 
  FOREIGN KEY (device_session_id) REFERENCES device_sessions(id) ON DELETE SET NULL;
*/
