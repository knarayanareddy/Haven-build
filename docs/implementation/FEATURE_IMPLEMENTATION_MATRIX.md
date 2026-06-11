# HAVEN Full Feature Implementation Matrix

Date: 2026-06-11  
Design source: `designdoc.md` v1.2.1

| Pillar | Feature | UI surface | Backend table/function | Status |
|---|---|---|---|---|
| SCHILD | Call/message/link scam scoring | iPhone SCHILD screen | `scam_events`, `fn-scam-pipeline` | Implemented |
| SCHILD | Conversation coaching | iPhone SCHILD coach tab | `fn-scam-pipeline` explanation fields | Implemented |
| SCHILD | Document vault | iPhone SCHILD vault | `documents`, `document_analysis_jobs`, `fn-document-analyse` | Implemented |
| SCHILD | BSN redaction guard | Document analyse flow | `document_analysis_jobs.bsn_detected` | Implemented |
| SCHILD | PSD2 transaction intercept | iPhone transaction guard | `financial_accounts`, `financial_transactions`, `fn-transaction-intercept` | Implemented |
| SCHILD | Weekly safety digest | Family dashboard | `safety_digests`, `fn-weekly-digest` | Implemented |
| ANKER | Medication OCR setup | Medication flow | `medication_ocr_jobs`, `fn-medication-ocr` | Implemented |
| ANKER | Medication reminders | iPhone pills screen | `medications`, `medication_reminders`, `fn-medication-escalation` | Implemented |
| ANKER | Daily rhythm board | iPhone Today screen | `tasks`, `appointments`, `fn-screen-data` | Implemented |
| ANKER | Wellness check-in | KOMPAS wellbeing cards | `wellness_checkins`, `fn-health-log` | Implemented |
| ANKER | Hydration and nutrition | Health log service | `hydration_logs`, `nutrition_logs`, `fn-health-log` | Implemented |
| ANKER | Vital signs | Family/care handoff | `vital_signs`, `fn-health-log` | Implemented |
| ANKER | Telehealth | Care action layer | `telehealth_sessions`, `fn-telehealth-transport` | Implemented |
| ANKER | Transport coordination | Appointment support | `transport_requests`, `fn-telehealth-transport` | Implemented |
| KRING | Family messages | iPhone Family + dashboard | `family_messages`, `fn-family-message-send` | Implemented |
| KRING | Life stories | iPhone Family story action | `life_story_prompts`, `life_stories` | Implemented |
| KRING | Memory lane | Shared schema/storage | `memory_lane_photos` | Implemented |
| KRING | Grandchild video hello | Family surface | `family_messages.message_type='video_hallo'` | Implemented |
| BUURT | Anonymous neighbourhood count | BUURT card | `neighbourhood_profiles`, `fn-buurt-discover` | Implemented |
| BUURT | Interest tags | BUURT card | `interest_tags`, `elder_interest_tags` | Implemented |
| BUURT | Walk buddy matching | BUURT action | `neighbourhood_connections`, `fn-buurt-match` | Implemented |
| BUURT | Local activities | BUURT event card | `neighbourhood_events`, `fn-buurt-events-ingest` | Implemented |
| KOMPAS | Safe zone | KOMPAS map | `location_events`, `insert_location_event`, `fn-location-ingest` | Implemented |
| KOMPAS | Fuzzed family location | Family dashboard | `family_location_events` view | Implemented |
| KOMPAS | Emergency medical profile | KOMPAS profile card | `emergency_access_tokens`, `get_emergency_profile`, `fn-emergency-profile` | Implemented |
| KOMPAS | Night mode | KOMPAS night card | `elder_profiles.night_mode_*` | Implemented |
| KOMPAS | Cognitive check-in | KOMPAS quick question | `cognitive_checkins` | Implemented |
| STEM | Voice pipeline | STEM screen | `voice_interactions`, `fn-voice-pipeline` | Implemented |
| STEM | Crisis phrase detection | STEM crisis action | `fn-voice-pipeline`, notifications | Implemented |
| STEM | Companion memory | STEM memory cards | `companion_memory`, `match_companion_memory`, `fn-companion-memory` | Implemented |
| WACHT | Carer portal | WACHT mode | `carer_relationships`, `carer_visit_logs` | Implemented |
| WACHT | Incident reporting | WACHT incident card | `incidents` | Implemented |
| WACHT | Care plan handoff | WACHT care cards | `carer_visit_logs`, `telehealth_sessions`, `vital_signs` | Implemented |
| Platform | Consent management | Settings/privacy | `consent_records`, `fn-consent-update` | Implemented |
| Platform | Right to erasure | Service function | `deletion_requests`, `fn-right-to-erasure` | Implemented |
| Platform | Feature flags | Settings + service | `feature_flags`, `evaluate_feature_flag`, `fn-feature-flags` | Implemented |
| Platform | Push notifications | All alerts | `notifications`, `push_tokens`, `fn-notification-dispatch` | Implemented |
| Platform | Observability | Runbook + metrics | `perf_metrics`, structured Edge logs | Implemented |
| Platform | Storage | Private buckets | Storage RLS migration | Implemented |
| Platform | Screen schema registry | Screen service | `screen_schemas`, `fn-screen-data` | Implemented |

## Launch gates that remain human-owned

These are explicitly not software implementation gaps:

- DPIA completion and signature.
- Vendor register and DPA confirmation.
- Named DPO/privacy officer.
- Production secrets and vendor contracts.
- External penetration test.
- Usability testing with older adults.
| Platform | Onboarding | Family-initiated setup | `profiles`, `elder_profiles`, `family_relationships`, `fn-onboarding` | Implemented |
| Platform | Signed storage URLs | Upload/playback flows | `storage.buckets`, `fn-storage-signed-url` | Implemented |
| Platform | Daily reminder scheduler | Medication scheduling | `medication_reminders`, `fn-daily-reminder-scheduler` | Implemented |
| Platform | Data export | Settings/privacy | `export_elder_data`, `fn-data-export` | Implemented |
| Platform | Notification preferences | Settings/privacy | `notification_preferences`, `fn-notification-preferences` | Implemented |
| KRING | Life story processing | Life Story recording | `life_stories`, `companion_memory`, `fn-life-story-process` | Implemented |
| WACHT | Care visit logging | Care portal | `carer_visit_logs`, `fn-care-visit-log` | Implemented |
| ANKER | Vital threshold checks | Health/care dashboard | `vital_signs`, `fn-vital-threshold-check` | Implemented |
| Platform | Push-token registration | Device setup | `push_tokens`, `fn-push-token-register` | Implemented |
| Platform | Device sessions | Settings/security | `device_sessions`, `fn-device-session` | Implemented |
| Platform | Release checks | Release operations | `app_release_checks`, `fn-release-check` | Implemented |
| Platform | Compliance register | Admin/legal operations | `vendor_register`, `dpia_assessments`, `fn-compliance-register` | Implemented |
| Platform | Breach incident log | Incident response | `data_breach_incidents`, `fn-breach-incident` | Implemented |
| WACHT | Care plans | Care portal | `care_plans`, `care_plan_items`, `fn-care-plan` | Implemented |
| WACHT | Incident report service | Care portal | `incidents`, `safeguarding_reports`, `fn-incident-report` | Implemented |
| ANKER | Refill detection | Medication/family | `medication_refill_events`, `fn-medication-refill` | Implemented |
| BUURT | Opt-out deletion | Settings/privacy | `neighbourhood_profiles`, `neighbourhood_connections`, `fn-buurt-optout` | Implemented |
| Platform | Audit query | Settings/admin | `audit_log`, `fn-audit-query` | Implemented |
| SCHILD | Browser shield | Browser/app URL protection | `domain_reputation_cache`, `browser_shield_events`, `fn-browser-shield` | Implemented |
| ANKER | MedMij/FHIR import | Health integration | `fhir_import_jobs`, `health_record_imports`, `fn-medmij-fhir-import` | Implemented |
| WACHT | External care sync | Care integrations | `external_care_sync_jobs`, `fn-care-system-sync` | Implemented |
| KRING | Grandchild companion app | Grandchild app | `grandchild_profiles`, `fn-grandchild-message-send` | Implemented |
| Platform | Observability alerts | Admin console | `app_events`, `slo_alerts`, `fn-observability-alert`, `fn-health-check` | Implemented |
| SCHILD | Call reputation | Pre-answer/call shield | `phone_reputation_cache`, `call_reputation_lookups`, `fn-call-reputation` | Implemented |
| KOMPAS | Wearable wandering detection | Safe-return support | `wearable_devices`, `wandering_events`, `fn-wearable-event` | Implemented |
| KOMPAS | Driving safety monitor | Elder-reviewed driving events | `driving_events`, `fn-driving-event` | Implemented |
| KRING | Community event aggregator | BUURT local events | `community_event_sources`, `neighbourhood_events`, `fn-community-events-ingest` | Implemented |
| KRING | Skill exchange | Community connection | `skill_offerings`, `skill_exchange_matches`, `fn-skill-exchange` | Implemented |
| SCHILD | Legacy digital estate | Settings/vault | `legacy_accounts`, `fn-legacy-vault` | Implemented |
| KOMPAS | Bereavement support | STEM tone/family wellbeing | `bereavement_events`, `bereavement_resources`, `fn-bereavement-support` | Implemented |
| ANKER | G-Standaard/Z-Index catalog phase | Admin catalog sync | `medication_catalog_sync_jobs`, `medication_catalog_entries`, `fn-medication-catalog-sync` | Implemented with legal-basis gate |
| Platform | Log drain configuration | Observability admin | `log_drain_configs`, `fn-log-drain-config` | Implemented |
| Platform | SLO measurement | Observability admin | `perf_metrics`, `measure_function_slo`, `fn-slo-measure` | Implemented |
