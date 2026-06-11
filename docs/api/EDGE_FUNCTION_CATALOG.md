# HAVEN Edge Function Catalog

This catalog tracks all production Edge Functions and the design-doc feature they implement.

| Function | Feature area | Auth | Primary side effects |
|---|---|---|---|
| `fn-audit-query` | Audit access | JWT | Reads `audit_log` |
| `fn-browser-shield` | SCHILD Browser Shield | JWT | Writes `browser_shield_events`, updates domain cache |
| `fn-breach-incident` | Incident response | service/admin | Writes `data_breach_incidents` |
| `fn-buurt-discover` | BUURT discovery | JWT | Anonymous PC4 discovery only |
| `fn-buurt-events-ingest` | BUURT events | service | Writes `neighbourhood_events` |
| `fn-buurt-match` | BUURT double opt-in | JWT | Writes `neighbourhood_connections` |
| `fn-buurt-optout` | BUURT opt-out | JWT | Ends connections and deletes tags/profile |
| `fn-care-plan` | WACHT care plan | JWT | Writes `care_plans`, `care_plan_items` |
| `fn-care-system-sync` | WACHT external integrations | service | Writes `external_care_sync_jobs` |
| `fn-care-visit-log` | WACHT visit logs | JWT | Writes `carer_visit_logs` |
| `fn-companion-memory` | STEM memory | service | Writes `companion_memory` |
| `fn-compliance-register` | Compliance ops | admin/service | Writes `vendor_register`, `dpia_assessments` |
| `fn-consent-update` | Consent | JWT | Writes `consent_records`, relationship consent |
| `fn-daily-reminder-scheduler` | ANKER scheduling | service | Writes `medication_reminders` |
| `fn-data-export` | Data portability | JWT/service | Reads via `export_elder_data` |
| `fn-device-session` | Session security | JWT | Writes `device_sessions` |
| `fn-document-analyse` | Document vault | JWT | Writes `documents`, `document_analysis_jobs` |
| `fn-emergency-profile` | Emergency profile | public/service | Creates/reads emergency token access |
| `fn-family-message-send` | KRING messages | JWT | Writes `family_messages` |
| `fn-feature-flags` | Feature flags | JWT | Reads flag evaluation RPC |
| `fn-grandchild-message-send` | Grandchild bridge | JWT | Writes `grandchild_profiles`, `family_messages` |
| `fn-health-check` | Ops health | service | Reads basic operational health |
| `fn-health-log` | Hydration/nutrition/vitals | JWT | Writes health logs |
| `fn-incident-report` | WACHT incident | JWT | Writes `incidents` |
| `fn-life-story-process` | Life stories | JWT | Writes `life_stories`, `companion_memory` |
| `fn-location-ingest` | KOMPAS safe zone | JWT | Writes `location_events` via RPC |
| `fn-medication-escalation` | ANKER escalation | service | Updates reminders and notifies family |
| `fn-medication-ocr` | ANKER OCR | JWT | Writes OCR job, medication, reminders |
| `fn-medication-refill` | ANKER refill | service | Writes `medication_refill_events` |
| `fn-medmij-fhir-import` | MedMij/FHIR | service | Writes FHIR import records and mapped rows |
| `fn-notification-dispatch` | Notifications | service | Writes `notifications`, sends Expo push |
| `fn-notification-preferences` | Notification prefs | JWT | Writes `notification_preferences` |
| `fn-observability-alert` | SLO alerting | service | Writes `slo_alerts` |
| `fn-onboarding` | Onboarding | service | Creates elder profile and relationship |
| `fn-push-token-register` | Push setup | JWT | Writes `push_tokens` |
| `fn-release-check` | Release ops | service/admin | Writes/reads `app_release_checks` |
| `fn-right-to-erasure` | Right to erasure | service | Soft deletes/nulls data |
| `fn-scam-pipeline` | SCHILD scoring | JWT | Writes `scam_events`, notifies family |
| `fn-screen-data` | Schema-driven UI | JWT | Reads screen data bundle |
| `fn-storage-signed-url` | Storage | JWT | Creates signed upload/read URLs |
| `fn-telehealth-transport` | Telehealth/transport | JWT | Writes appointments, transport, sessions |
| `fn-transaction-intercept` | PSD2 intercept | service | Writes `financial_transactions` |
| `fn-vital-threshold-check` | Vital thresholds | service | Notifies family |
| `fn-voice-pipeline` | STEM voice | JWT | Writes `voice_interactions`, actions, TTS |
| `fn-weekly-digest` | Weekly digest | service | Writes `safety_digests`, notifies family |

## Security rules

- Service-role functions are deployed with JWT verification disabled only where the design requires scheduler/webhook/admin execution.
- Client-facing functions use JWT verification and RLS/relationship consent.
- No function accepts or stores BSN.
- Raw browser pages and raw scam content are not stored; hashes and explanations are stored.
