-- ══════════════════════════════════════════════════════════════════════════════
-- HAVEN COMPLETE GDPR ART. 15 DATA RIGHT OF ACCESS EXPORT OVERHAUL
-- Governed by GDPR Art. 15, Art. 20 (Data Portability), NEN 7510
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.export_elder_data(p_elder_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 1. Active Identity Relationship Guard: Erased entities return 404
  IF (SELECT status FROM profiles WHERE id = p_elder_id) = 'erased' THEN
    RAISE EXCEPTION '404: Targeted older adult entity non-existent or data erased';
  END IF;

  -- 2. Validate caller authorization
  IF p_elder_id <> auth.uid() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION '403 Forbidden: Un-consented export requests are strictly rejected';
  END IF;

  -- 3. Total Exhaustive Data Right of Access Sub-Query Manifest
  RETURN jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM profiles p WHERE p.id = p_elder_id),
    'elder_profile', (SELECT to_jsonb(ep) FROM elder_profiles ep WHERE ep.elder_id = p_elder_id),
    'family_relationships', (SELECT COALESCE(jsonb_agg(to_jsonb(fr)), '[]'::jsonb) FROM family_relationships fr WHERE fr.elder_id = p_elder_id),
    'carer_relationships', (SELECT COALESCE(jsonb_agg(to_jsonb(crr)), '[]'::jsonb) FROM carer_relationships crr WHERE crr.elder_id = p_elder_id AND crr.deleted_at IS NULL),
    'consents', (SELECT COALESCE(jsonb_agg(to_jsonb(cr)), '[]'::jsonb) FROM consent_records cr WHERE cr.elder_id = p_elder_id),
    'deletion_requests', (SELECT COALESCE(jsonb_agg(to_jsonb(dr)), '[]'::jsonb) FROM deletion_requests dr WHERE dr.elder_id = p_elder_id),
    'contacts', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM contacts c WHERE c.elder_id = p_elder_id AND c.deleted_at IS NULL),
    'medications', (SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb) FROM medications m WHERE m.elder_id = p_elder_id AND m.deleted_at IS NULL),
    'medication_reminders', (SELECT COALESCE(jsonb_agg(to_jsonb(mr)), '[]'::jsonb) FROM medication_reminders mr WHERE mr.elder_id = p_elder_id),
    'medication_refill_events', (SELECT COALESCE(jsonb_agg(to_jsonb(mre)), '[]'::jsonb) FROM medication_refill_events mre WHERE mre.elder_id = p_elder_id AND mre.deleted_at IS NULL),
    'medication_ocr_jobs', (SELECT COALESCE(jsonb_agg(to_jsonb(oj)), '[]'::jsonb) FROM medication_ocr_jobs oj WHERE oj.elder_id = p_elder_id AND oj.deleted_at IS NULL),
    'medication_ocr_reviews', (SELECT COALESCE(jsonb_agg(to_jsonb(mor)), '[]'::jsonb) FROM medication_ocr_reviews mor WHERE mor.elder_id = p_elder_id),
    'medication_interaction_alerts', (SELECT COALESCE(jsonb_agg(to_jsonb(mia)), '[]'::jsonb) FROM medication_interaction_alerts mia WHERE mia.elder_id = p_elder_id),
    'tasks', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM tasks t WHERE t.elder_id = p_elder_id AND t.deleted_at IS NULL),
    'wellness_checkins', (SELECT COALESCE(jsonb_agg(to_jsonb(wc)), '[]'::jsonb) FROM wellness_checkins wc WHERE wc.elder_id = p_elder_id),
    'hydration_logs', (SELECT COALESCE(jsonb_agg(to_jsonb(h)), '[]'::jsonb) FROM hydration_logs h WHERE h.elder_id = p_elder_id),
    'nutrition_logs', (SELECT COALESCE(jsonb_agg(to_jsonb(n)), '[]'::jsonb) FROM nutrition_logs n WHERE n.elder_id = p_elder_id AND n.deleted_at IS NULL),
    'vital_signs', (SELECT COALESCE(jsonb_agg(to_jsonb(v)), '[]'::jsonb) FROM vital_signs v WHERE v.elder_id = p_elder_id),
    'financial_accounts', (SELECT COALESCE(jsonb_agg(to_jsonb(fa)), '[]'::jsonb) FROM financial_accounts fa WHERE fa.elder_id = p_elder_id AND fa.deleted_at IS NULL),
    'financial_transactions', (SELECT COALESCE(jsonb_agg(to_jsonb(ft)), '[]'::jsonb) FROM financial_transactions ft WHERE ft.elder_id = p_elder_id AND ft.deleted_at IS NULL),
    'family_messages', (SELECT COALESCE(jsonb_agg(to_jsonb(fm)), '[]'::jsonb) FROM family_messages fm WHERE fm.elder_id = p_elder_id AND fm.deleted_at IS NULL),
    'notifications', (SELECT COALESCE(jsonb_agg(to_jsonb(no)), '[]'::jsonb) FROM notifications no WHERE no.elder_id = p_elder_id OR no.recipient_id = p_elder_id),
    'life_stories', (SELECT COALESCE(jsonb_agg(to_jsonb(ls)), '[]'::jsonb) FROM life_stories ls WHERE ls.elder_id = p_elder_id AND ls.deleted_at IS NULL),
    'memory_lane_photos', (SELECT COALESCE(jsonb_agg(to_jsonb(mp)), '[]'::jsonb) FROM memory_lane_photos mp WHERE mp.elder_id = p_elder_id AND mp.deleted_at IS NULL),
    'documents', (SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM documents d WHERE d.elder_id = p_elder_id AND d.deleted_at IS NULL),
    'document_analysis_jobs', (SELECT COALESCE(jsonb_agg(to_jsonb(dj)), '[]'::jsonb) FROM document_analysis_jobs dj WHERE dj.elder_id = p_elder_id AND dj.deleted_at IS NULL),
    'scam_events', (SELECT COALESCE(jsonb_agg(to_jsonb(se)), '[]'::jsonb) FROM scam_events se WHERE se.elder_id = p_elder_id AND se.deleted_at IS NULL),
    'scam_coaching_sessions', (SELECT COALESCE(jsonb_agg(to_jsonb(scs)), '[]'::jsonb) FROM scam_coaching_sessions scs WHERE scs.elder_id = p_elder_id),
    'browser_shield_events', (SELECT COALESCE(jsonb_agg(to_jsonb(be)), '[]'::jsonb) FROM browser_shield_events be WHERE be.elder_id = p_elder_id AND be.deleted_at IS NULL),
    'call_reputation_lookups', (SELECT COALESCE(jsonb_agg(to_jsonb(crl)), '[]'::jsonb) FROM call_reputation_lookups crl WHERE crl.elder_id = p_elder_id),
    'location_events', (SELECT COALESCE(jsonb_agg(to_jsonb(le)), '[]'::jsonb) FROM location_events le WHERE le.elder_id = p_elder_id AND le.deleted_at IS NULL),
    'driving_events', (SELECT COALESCE(jsonb_agg(to_jsonb(de)), '[]'::jsonb) FROM driving_events de WHERE de.elder_id = p_elder_id AND de.deleted_at IS NULL),
    'wandering_events', (SELECT COALESCE(jsonb_agg(to_jsonb(we)), '[]'::jsonb) FROM wandering_events we WHERE we.elder_id = p_elder_id AND we.deleted_at IS NULL),
    'fall_events', (SELECT COALESCE(jsonb_agg(to_jsonb(fe)), '[]'::jsonb) FROM fall_events fe WHERE fe.elder_id = p_elder_id),
    'cognitive_checkins', (SELECT COALESCE(jsonb_agg(to_jsonb(cc)), '[]'::jsonb) FROM cognitive_checkins cc WHERE cc.elder_id = p_elder_id),
    'voice_interactions', (SELECT COALESCE(jsonb_agg(to_jsonb(vi)), '[]'::jsonb) FROM voice_interactions vi WHERE vi.elder_id = p_elder_id AND vi.deleted_at IS NULL),
    
    -- companion_memory embeddings exclusion: Vectors excluded per GDPR Art. 20 (not directly portable domain format)
    'companion_memory', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', cm.id, 'elder_id', cm.elder_id, 'memory_type', cm.memory_type,
        'content_nl', cm.content_nl, 'content_en', cm.content_en,
        'recorded_at', cm.recorded_at, 'created_at', cm.created_at,
        'updated_at', cm.updated_at, 'deleted_at', cm.deleted_at,
        'vector_embedding_omitted', 'Vectors excluded per GDPR Art. 20 (not directly portable domain format)'
      )), '[]'::jsonb)
      FROM companion_memory cm
      WHERE cm.elder_id = p_elder_id AND cm.deleted_at IS NULL
    ),
    
    'neighbourhood_profiles', (SELECT COALESCE(jsonb_agg(to_jsonb(np)), '[]'::jsonb) FROM neighbourhood_profiles np WHERE np.elder_id = p_elder_id AND np.deleted_at IS NULL),
    'neighbourhood_connections', (SELECT COALESCE(jsonb_agg(to_jsonb(nc)), '[]'::jsonb) FROM neighbourhood_connections nc WHERE nc.initiator_elder_id = p_elder_id OR nc.recipient_elder_id = p_elder_id),
    'elder_interest_tags', (SELECT COALESCE(jsonb_agg(to_jsonb(eit)), '[]'::jsonb) FROM elder_interest_tags eit WHERE eit.elder_id = p_elder_id),
    'event_interests', (SELECT COALESCE(jsonb_agg(to_jsonb(ei)), '[]'::jsonb) FROM event_interests ei WHERE ei.elder_id = p_elder_id),
    'appointments', (SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM appointments a WHERE a.elder_id = p_elder_id AND a.deleted_at IS NULL),
    'transport_requests', (SELECT COALESCE(jsonb_agg(to_jsonb(tr)), '[]'::jsonb) FROM transport_requests tr WHERE tr.elder_id = p_elder_id AND tr.deleted_at IS NULL),
    'telehealth_sessions', (SELECT COALESCE(jsonb_agg(to_jsonb(ts)), '[]'::jsonb) FROM telehealth_sessions ts WHERE ts.elder_id = p_elder_id AND ts.deleted_at IS NULL),
    'video_call_sessions', (SELECT COALESCE(jsonb_agg(to_jsonb(vcs)), '[]'::jsonb) FROM video_call_sessions vcs WHERE vcs.elder_id = p_elder_id),
    'care_plans', (SELECT COALESCE(jsonb_agg(to_jsonb(cp)), '[]'::jsonb) FROM care_plans cp WHERE cp.elder_id = p_elder_id AND cp.deleted_at IS NULL),
    'care_plan_items', (SELECT COALESCE(jsonb_agg(to_jsonb(cpi)), '[]'::jsonb) FROM care_plan_items cpi WHERE cpi.elder_id = p_elder_id AND cpi.deleted_at IS NULL),
    'carer_visit_logs', (SELECT COALESCE(jsonb_agg(to_jsonb(cvl)), '[]'::jsonb) FROM carer_visit_logs cvl WHERE cvl.elder_id = p_elder_id AND cvl.deleted_at IS NULL),
    'carer_handover_notes', (SELECT COALESCE(jsonb_agg(to_jsonb(chn)), '[]'::jsonb) FROM carer_handover_notes chn WHERE chn.elder_id = p_elder_id),
    'incidents', (SELECT COALESCE(jsonb_agg(to_jsonb(i)), '[]'::jsonb) FROM incidents i WHERE i.elder_id = p_elder_id),
    'safeguarding_reports', (SELECT COALESCE(jsonb_agg(to_jsonb(sr)), '[]'::jsonb) FROM safeguarding_reports sr WHERE sr.elder_id = p_elder_id),
    'safety_digests', (SELECT COALESCE(jsonb_agg(to_jsonb(sd)), '[]'::jsonb) FROM safety_digests sd WHERE sd.elder_id = p_elder_id),
    'wearable_devices', (SELECT COALESCE(jsonb_agg(to_jsonb(wd)), '[]'::jsonb) FROM wearable_devices wd WHERE wd.elder_id = p_elder_id AND wd.deleted_at IS NULL),
    'skill_offerings', (SELECT COALESCE(jsonb_agg(to_jsonb(so)), '[]'::jsonb) FROM skill_offerings so WHERE so.elder_id = p_elder_id AND so.deleted_at IS NULL),
    'skill_exchange_matches', (SELECT COALESCE(jsonb_agg(to_jsonb(sm)), '[]'::jsonb) FROM skill_exchange_matches sm WHERE sm.elder_id = p_elder_id AND sm.deleted_at IS NULL),
    'legacy_accounts', (SELECT COALESCE(jsonb_agg(to_jsonb(la)), '[]'::jsonb) FROM legacy_accounts la WHERE la.elder_id = p_elder_id AND la.deleted_at IS NULL),
    'bereavement_events', (SELECT COALESCE(jsonb_agg(to_jsonb(bev)), '[]'::jsonb) FROM bereavement_events bev WHERE bev.elder_id = p_elder_id AND bev.deleted_at IS NULL),
    'grandchild_profiles', (SELECT COALESCE(jsonb_agg(to_jsonb(gp)), '[]'::jsonb) FROM grandchild_profiles gp WHERE gp.elder_id = p_elder_id AND gp.deleted_at IS NULL),
    'device_sessions', (SELECT COALESCE(jsonb_agg(to_jsonb(ds)), '[]'::jsonb) FROM device_sessions ds WHERE ds.profile_id = p_elder_id),
    'notification_preferences', (SELECT COALESCE(jsonb_agg(to_jsonb(npr)), '[]'::jsonb) FROM notification_preferences npr WHERE npr.profile_id = p_elder_id),
    'push_tokens', (SELECT COALESCE(jsonb_agg(to_jsonb(pt)), '[]'::jsonb) FROM push_tokens pt WHERE pt.profile_id = p_elder_id),
    'fhir_import_jobs', (SELECT COALESCE(jsonb_agg(to_jsonb(fj)), '[]'::jsonb) FROM fhir_import_jobs fj WHERE fj.elder_id = p_elder_id AND fj.deleted_at IS NULL),
    'health_record_imports', (SELECT COALESCE(jsonb_agg(to_jsonb(hri)), '[]'::jsonb) FROM health_record_imports hri WHERE hri.elder_id = p_elder_id),
    'external_care_sync_jobs', (SELECT COALESCE(jsonb_agg(to_jsonb(ecs)), '[]'::jsonb) FROM external_care_sync_jobs ecs WHERE ecs.elder_id = p_elder_id AND ecs.deleted_at IS NULL),
    'app_events', (SELECT COALESCE(jsonb_agg(to_jsonb(ae)), '[]'::jsonb) FROM app_events ae WHERE ae.elder_id = p_elder_id OR ae.profile_id = p_elder_id),
    'emergency_access_tokens', (SELECT COALESCE(jsonb_agg(to_jsonb(eat)), '[]'::jsonb) FROM emergency_access_tokens eat WHERE eat.elder_id = p_elder_id),
    'emergency_profile_access_log', (SELECT COALESCE(jsonb_agg(to_jsonb(epl)), '[]'::jsonb) FROM emergency_profile_access_log epl WHERE epl.elder_id = p_elder_id),
    'audit_log', (SELECT COALESCE(jsonb_agg(to_jsonb(al)), '[]'::jsonb) FROM audit_log al WHERE al.elder_id = p_elder_id),
    'pending_confirmations', (SELECT COALESCE(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) FROM pending_confirmations pc WHERE pc.elder_id = p_elder_id),
    'consent_pack_status', (SELECT COALESCE(jsonb_agg(to_jsonb(cps)), '[]'::jsonb) FROM consent_pack_status cps WHERE cps.elder_id = p_elder_id),
    'elder_baselines', (SELECT COALESCE(jsonb_agg(to_jsonb(eb)), '[]'::jsonb) FROM elder_baselines eb WHERE eb.elder_id = p_elder_id),
    'daily_checkin_schedule', (SELECT COALESCE(jsonb_agg(to_jsonb(dcs)), '[]'::jsonb) FROM daily_checkin_schedule dcs WHERE dcs.elder_id = p_elder_id),
    'voice_profiles', (SELECT COALESCE(jsonb_agg(to_jsonb(vp)), '[]'::jsonb) FROM voice_profiles vp WHERE vp.elder_id = p_elder_id),
    'elder_voice_preferences', (SELECT COALESCE(jsonb_agg(to_jsonb(evp)), '[]'::jsonb) FROM elder_voice_preferences evp WHERE evp.elder_id = p_elder_id),
    'internal_records_excluded', jsonb_build_array('idempotency_keys', 'perf_metrics', 'integration_connections', 'webhook_receipts')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_elder_data(UUID) TO authenticated, service_role;

COMMIT;

-- Rollback
/*
BEGIN;
CREATE OR REPLACE FUNCTION public.export_elder_data(p_elder_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN jsonb_build_object('profile', (SELECT to_jsonb(p) FROM profiles p WHERE p.id = p_elder_id));
END;
$$;
COMMIT;
*/
