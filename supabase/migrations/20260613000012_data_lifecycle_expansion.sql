-- HAVEN data-lifecycle expansion.
-- Extends GDPR export coverage and keeps the export RPC aligned with the expanded schema surface.

create or replace function public.export_elder_data(p_elder_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_elder_id <> auth.uid() and auth.role() <> 'service_role' then
    raise exception 'Not allowed';
  end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from profiles p where p.id = p_elder_id),
    'elder_profile', (select to_jsonb(ep) from elder_profiles ep where ep.elder_id = p_elder_id),
    'family_relationships', (select coalesce(jsonb_agg(to_jsonb(fr)), '[]'::jsonb) from family_relationships fr where fr.elder_id = p_elder_id),
    'carer_relationships', (select coalesce(jsonb_agg(to_jsonb(crr)), '[]'::jsonb) from carer_relationships crr where crr.elder_id = p_elder_id and crr.deleted_at is null),
    'consents', (select coalesce(jsonb_agg(to_jsonb(cr)), '[]'::jsonb) from consent_records cr where cr.elder_id = p_elder_id),
    'deletion_requests', (select coalesce(jsonb_agg(to_jsonb(dr)), '[]'::jsonb) from deletion_requests dr where dr.elder_id = p_elder_id),
    'contacts', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from contacts c where c.elder_id = p_elder_id and c.deleted_at is null),
    'medications', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from medications m where m.elder_id = p_elder_id and m.deleted_at is null),
    'medication_reminders', (select coalesce(jsonb_agg(to_jsonb(mr)), '[]'::jsonb) from medication_reminders mr where mr.elder_id = p_elder_id),
    'medication_refill_events', (select coalesce(jsonb_agg(to_jsonb(mre)), '[]'::jsonb) from medication_refill_events mre where mre.elder_id = p_elder_id and mre.deleted_at is null),
    'medication_ocr_jobs', (select coalesce(jsonb_agg(to_jsonb(oj)), '[]'::jsonb) from medication_ocr_jobs oj where oj.elder_id = p_elder_id and oj.deleted_at is null),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from tasks t where t.elder_id = p_elder_id and t.deleted_at is null),
    'wellness_checkins', (select coalesce(jsonb_agg(to_jsonb(wc)), '[]'::jsonb) from wellness_checkins wc where wc.elder_id = p_elder_id),
    'hydration_logs', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from hydration_logs h where h.elder_id = p_elder_id),
    'nutrition_logs', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from nutrition_logs n where n.elder_id = p_elder_id and n.deleted_at is null),
    'vital_signs', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from vital_signs v where v.elder_id = p_elder_id),
    'financial_accounts', (select coalesce(jsonb_agg(to_jsonb(fa)), '[]'::jsonb) from financial_accounts fa where fa.elder_id = p_elder_id and fa.deleted_at is null),
    'financial_transactions', (select coalesce(jsonb_agg(to_jsonb(ft)), '[]'::jsonb) from financial_transactions ft where ft.elder_id = p_elder_id and ft.deleted_at is null),
    'family_messages', (select coalesce(jsonb_agg(to_jsonb(fm)), '[]'::jsonb) from family_messages fm where fm.elder_id = p_elder_id and fm.deleted_at is null),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(no)), '[]'::jsonb) from notifications no where no.elder_id = p_elder_id or no.recipient_id = p_elder_id),
    'stories', (select coalesce(jsonb_agg(to_jsonb(ls)), '[]'::jsonb) from life_stories ls where ls.elder_id = p_elder_id and ls.deleted_at is null),
    'memory_lane_photos', (select coalesce(jsonb_agg(to_jsonb(mp)), '[]'::jsonb) from memory_lane_photos mp where mp.elder_id = p_elder_id and mp.deleted_at is null),
    'documents', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from documents d where d.elder_id = p_elder_id and d.deleted_at is null),
    'document_analysis_jobs', (select coalesce(jsonb_agg(to_jsonb(dj)), '[]'::jsonb) from document_analysis_jobs dj where dj.elder_id = p_elder_id and dj.deleted_at is null),
    'scam_events', (select coalesce(jsonb_agg(to_jsonb(se)), '[]'::jsonb) from scam_events se where se.elder_id = p_elder_id and se.deleted_at is null),
    'browser_shield_events', (select coalesce(jsonb_agg(to_jsonb(be)), '[]'::jsonb) from browser_shield_events be where be.elder_id = p_elder_id and be.deleted_at is null),
    'call_reputation_lookups', (select coalesce(jsonb_agg(to_jsonb(crl)), '[]'::jsonb) from call_reputation_lookups crl where crl.elder_id = p_elder_id),
    'location_events', (select coalesce(jsonb_agg(to_jsonb(le)), '[]'::jsonb) from location_events le where le.elder_id = p_elder_id and le.deleted_at is null),
    'cognitive_checkins', (select coalesce(jsonb_agg(to_jsonb(cc)), '[]'::jsonb) from cognitive_checkins cc where cc.elder_id = p_elder_id),
    'voice_interactions', (select coalesce(jsonb_agg(to_jsonb(vi)), '[]'::jsonb) from voice_interactions vi where vi.elder_id = p_elder_id and vi.deleted_at is null),
    'companion_memory', (select coalesce(jsonb_agg(to_jsonb(cm)), '[]'::jsonb) from companion_memory cm where cm.elder_id = p_elder_id and cm.deleted_at is null),
    'neighbourhood_profiles', (select coalesce(jsonb_agg(to_jsonb(np)), '[]'::jsonb) from neighbourhood_profiles np where np.elder_id = p_elder_id and np.deleted_at is null),
    'neighbourhood_connections', (select coalesce(jsonb_agg(to_jsonb(nc)), '[]'::jsonb) from neighbourhood_connections nc where nc.initiator_elder_id = p_elder_id or nc.recipient_elder_id = p_elder_id),
    'elder_interest_tags', (select coalesce(jsonb_agg(to_jsonb(eit)), '[]'::jsonb) from elder_interest_tags eit where eit.elder_id = p_elder_id),
    'event_interests', (select coalesce(jsonb_agg(to_jsonb(ei)), '[]'::jsonb) from event_interests ei where ei.elder_id = p_elder_id),
    'appointments', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from appointments a where a.elder_id = p_elder_id and a.deleted_at is null),
    'transport_requests', (select coalesce(jsonb_agg(to_jsonb(tr)), '[]'::jsonb) from transport_requests tr where tr.elder_id = p_elder_id and tr.deleted_at is null),
    'telehealth_sessions', (select coalesce(jsonb_agg(to_jsonb(ts)), '[]'::jsonb) from telehealth_sessions ts where ts.elder_id = p_elder_id and ts.deleted_at is null),
    'care_plans', (select coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb) from care_plans cp where cp.elder_id = p_elder_id and cp.deleted_at is null),
    'care_plan_items', (select coalesce(jsonb_agg(to_jsonb(cpi)), '[]'::jsonb) from care_plan_items cpi where cpi.elder_id = p_elder_id and cpi.deleted_at is null),
    'carer_visit_logs', (select coalesce(jsonb_agg(to_jsonb(cvl)), '[]'::jsonb) from carer_visit_logs cvl where cvl.elder_id = p_elder_id and cvl.deleted_at is null),
    'incidents', (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from incidents i where i.elder_id = p_elder_id),
    'safeguarding_reports', (select coalesce(jsonb_agg(to_jsonb(sr)), '[]'::jsonb) from safeguarding_reports sr where sr.elder_id = p_elder_id),
    'safety_digests', (select coalesce(jsonb_agg(to_jsonb(sd)), '[]'::jsonb) from safety_digests sd where sd.elder_id = p_elder_id),
    'driving_events', (select coalesce(jsonb_agg(to_jsonb(de)), '[]'::jsonb) from driving_events de where de.elder_id = p_elder_id and de.deleted_at is null),
    'wandering_events', (select coalesce(jsonb_agg(to_jsonb(we)), '[]'::jsonb) from wandering_events we where we.elder_id = p_elder_id and we.deleted_at is null),
    'wearable_devices', (select coalesce(jsonb_agg(to_jsonb(wd)), '[]'::jsonb) from wearable_devices wd where wd.elder_id = p_elder_id and wd.deleted_at is null),
    'skill_offerings', (select coalesce(jsonb_agg(to_jsonb(so)), '[]'::jsonb) from skill_offerings so where so.elder_id = p_elder_id and so.deleted_at is null),
    'skill_exchange_matches', (select coalesce(jsonb_agg(to_jsonb(sm)), '[]'::jsonb) from skill_exchange_matches sm where sm.elder_id = p_elder_id and sm.deleted_at is null),
    'legacy_accounts', (select coalesce(jsonb_agg(to_jsonb(la)), '[]'::jsonb) from legacy_accounts la where la.elder_id = p_elder_id and la.deleted_at is null),
    'bereavement_events', (select coalesce(jsonb_agg(to_jsonb(bev)), '[]'::jsonb) from bereavement_events bev where bev.elder_id = p_elder_id and bev.deleted_at is null),
    'bereavement_resources', (select coalesce(jsonb_agg(to_jsonb(br)), '[]'::jsonb) from bereavement_resources br where br.is_active = true),
    'grandchild_profiles', (select coalesce(jsonb_agg(to_jsonb(gp)), '[]'::jsonb) from grandchild_profiles gp where gp.elder_id = p_elder_id and gp.deleted_at is null),
    'device_sessions', (select coalesce(jsonb_agg(to_jsonb(ds)), '[]'::jsonb) from device_sessions ds where ds.profile_id = p_elder_id),
    'notification_preferences', (select coalesce(jsonb_agg(to_jsonb(npr)), '[]'::jsonb) from notification_preferences npr where npr.profile_id = p_elder_id),
    'push_tokens', (select coalesce(jsonb_agg(to_jsonb(pt)), '[]'::jsonb) from push_tokens pt where pt.profile_id = p_elder_id),
    'fhir_import_jobs', (select coalesce(jsonb_agg(to_jsonb(fj)), '[]'::jsonb) from fhir_import_jobs fj where fj.elder_id = p_elder_id and fj.deleted_at is null),
    'health_record_imports', (select coalesce(jsonb_agg(to_jsonb(hri)), '[]'::jsonb) from health_record_imports hri where hri.elder_id = p_elder_id),
    'external_care_sync_jobs', (select coalesce(jsonb_agg(to_jsonb(ecs)), '[]'::jsonb) from external_care_sync_jobs ecs where ecs.elder_id = p_elder_id and ecs.deleted_at is null),
    'app_events', (select coalesce(jsonb_agg(to_jsonb(ae)), '[]'::jsonb) from app_events ae where ae.elder_id = p_elder_id or ae.profile_id = p_elder_id),
    'emergency_access_tokens', (select coalesce(jsonb_agg(to_jsonb(eat)), '[]'::jsonb) from emergency_access_tokens eat where eat.elder_id = p_elder_id),
    'emergency_profile_access_log', (select coalesce(jsonb_agg(to_jsonb(epl)), '[]'::jsonb) from emergency_profile_access_log epl where epl.elder_id = p_elder_id),
    'audit_log', (select coalesce(jsonb_agg(to_jsonb(al)), '[]'::jsonb) from audit_log al where al.elder_id = p_elder_id),
    'internal_records_excluded', jsonb_build_array('idempotency_keys', 'perf_metrics', 'integration_connections', 'webhook_receipts')
  );
end;
$$;

grant execute on function public.export_elder_data(uuid) to authenticated, service_role;
