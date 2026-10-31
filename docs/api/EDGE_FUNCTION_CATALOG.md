# HAVEN Edge Function Catalog

This catalog tracks the current **81** production Edge Functions and the design-doc feature they implement.

| Function | Feature area | Auth | Primary side effects |
|---|---|---|---|
| `fn-audit-query` | Audit access | JWT | Reads `audit_log` |
| `fn-bank-connect` | PSD2/Tink bank connection | JWT + Tink callback | Creates/revokes bank connection, encrypts refresh token |
| `fn-banking-ingress-buffer` | PSD2 ingestion | vendor/internal | Buffers banking events |
| `fn-banking-stream-consumer` | PSD2 ingestion | internal | Consumes buffered banking events |
| `fn-bereavement-support` | KOMPAS support | JWT | Writes support/check-in records |
| `fn-browser-shield` | SCHILD Browser Shield | JWT | Writes `browser_shield_events`, updates domain cache |
| `fn-breach-incident` | Incident response | service/admin | Writes `data_breach_incidents` |
| `fn-buurt-discover` | BUURT discovery | JWT | Anonymous PC4 discovery only |
| `fn-buurt-events-ingest` | BUURT events | service | Writes `neighbourhood_events` |
| `fn-buurt-match` | BUURT double opt-in | JWT | Writes `neighbourhood_connections` |
| `fn-buurt-optout` | BUURT opt-out | JWT | Ends connections and deletes tags/profile |
| `fn-call-reputation` | SCHILD call reputation | JWT | Scores caller reputation |
| `fn-care-plan` | WACHT care plan | JWT | Writes `care_plans`, `care_plan_items` |
| `fn-care-system-sync` | WACHT external integrations | service | Writes `external_care_sync_jobs` |
| `fn-care-visit-log` | WACHT visit logs | JWT | Writes `carer_visit_logs` |
| `fn-carer-handover-note` | WACHT handover | JWT | Writes `carer_handover_notes`, recipients, MAR-light data |
| `fn-companion-memory` | STEM memory | service | Writes `companion_memory` |
| `fn-compliance-register` | Compliance ops | admin/service | Writes `vendor_register`, `dpia_assessments` |
| `fn-community-events-ingest` | BUURT events | service/internal | Ingests community event rows |
| `fn-consent-pack-decide` | Consent packs | JWT | Writes staged consent-pack decisions |
| `fn-consent-pack-list` | Consent packs | JWT | Lists pending/current consent packs |
| `fn-consent-update` | Consent | JWT | Writes `consent_records`, relationship consent |
| `fn-daily-checkin-scheduler` | ANKER daily rhythm | internal | Schedules/checks daily check-ins |
| `fn-daily-reminder-scheduler` | ANKER scheduling | service | Writes `medication_reminders` |
| `fn-daily-status-digest` | Family dashboard status | internal | Computes green/amber/red daily status digests |
| `fn-data-export` | Data portability | JWT/service | Reads via `export_elder_data` |
| `fn-device-health-monitor` | Trust signal | internal | Writes `device_health_events`, revokes stale/unhealthy sessions |
| `fn-device-session` | Session security | JWT | Writes `device_sessions` |
| `fn-document-analyse` | Document vault | JWT | Writes `documents`, `document_analysis_jobs` |
| `fn-driving-event` | KOMPAS driving safety | JWT | Writes driving safety events |
| `fn-emergency-profile` | Emergency profile | public/service | Creates/reads emergency token access |
| `fn-family-message-send` | KRING messages | JWT | Writes `family_messages` |
| `fn-feature-flags` | Feature flags | JWT | Reads flag evaluation RPC |
| `fn-fall-escalation` | Fall safety | internal | Claims/escalates unresolved fall events |
| `fn-fall-event` | Fall safety | JWT/vendor | Writes possible fall events and pending confirmations |
| `fn-grandchild-message-send` | Grandchild bridge | JWT | Writes `grandchild_profiles`, `family_messages` |
| `fn-health-check` | Ops health | service | Reads basic operational health |
| `fn-health-log` | Hydration/nutrition/vitals | JWT | Writes health logs |
| `fn-incident-report` | WACHT incident | JWT | Writes `incidents` |
| `fn-legacy-vault` | Legacy account vault | JWT | Manages legacy-account metadata |
| `fn-life-story-process` | Life stories | JWT | Writes `life_stories`, `companion_memory` |
| `fn-location-ingest` | KOMPAS safe zone | JWT | Writes `location_events` via RPC |
| `fn-log-drain-config` | Observability | admin/internal | Configures log drain metadata |
| `fn-medication-catalog-sync` | G-Standaard/Z-Index | service/internal | Syncs medication catalog rows |
| `fn-medication-escalation` | ANKER escalation | service | Updates reminders and notifies family |
| `fn-medication-interactions-check` | ANKER medication safety | JWT | Checks medication interactions |
| `fn-medication-ocr` | ANKER OCR | JWT | Writes OCR job, medication, reminders |
| `fn-medication-ocr-review` | ANKER OCR review | JWT | Promotes/rejects staged OCR medication rows |
| `fn-medication-refill` | ANKER refill | service | Writes `medication_refill_events` |
| `fn-medmij-fhir-import` | MedMij/FHIR | service | Writes FHIR import records and mapped rows |
| `fn-notification-dispatch` | Notifications | service | Writes `notifications`, sends Expo push |
| `fn-notification-preferences` | Notification prefs | JWT | Writes `notification_preferences` |
| `fn-observability-alert` | SLO alerting | service | Writes `slo_alerts` |
| `fn-onboarding` | Onboarding | service | Creates elder profile and relationship |
| `fn-pending-confirmation-respond` | Pending confirmations | JWT | Resolves fall/medication repeat-back confirmations |
| `fn-photo-checkin` | KRING/media check-in | JWT | Writes photo check-in metadata |
| `fn-push-token-register` | Push setup | JWT | Writes `push_tokens` |
| `fn-quiet-day-detector` | Family reassurance | internal | Detects quiet-day status and notifications |
| `fn-release-check` | Release ops | service/admin | Writes/reads `app_release_checks` |
| `fn-right-to-erasure` | Right to erasure | service | Soft deletes/nulls data |
| `fn-scam-coaching` | SCHILD coaching | JWT | Produces safe scripts and recovery checklist |
| `fn-scam-pipeline` | SCHILD scoring | JWT | Writes `scam_events`, notifies family |
| `fn-screen-data` | Schema-driven UI | JWT | Reads screen data bundle |
| `fn-shift-summary` | WACHT shift summary | JWT | Aggregates carer visit, handover, incident and medication summary |
| `fn-skill-exchange` | BUURT skill exchange | JWT | Manages skill-exchange requests |
| `fn-slo-measure` | Observability | internal | Writes SLO/performance measurements |
| `fn-storage-signed-url` | Storage | JWT | Creates signed upload/read URLs |
| `fn-telehealth-transport` | Telehealth/transport | JWT | Writes appointments, transport, sessions |
| `fn-transaction-intercept` | PSD2 intercept | service | Writes `financial_transactions` |
| `fn-video-call-create` | Live video calling | JWT | Creates video call sessions |
| `fn-video-call-end` | Live video calling | JWT | Ends video call sessions |
| `fn-video-call-join-token` | Live video calling | JWT | Issues a signed, expiring join token bound to this session and this caller; stores only its hash |
| `fn-video-call-redeem` | Live video calling | JWT | Verifies a join token (signature, expiry, stored digest, single use, subject) and returns provider media credentials |
| `fn-vital-threshold-check` | Vital thresholds | service | Notifies family |
| `fn-voice-pipeline` | STEM voice | JWT | Writes `voice_interactions`, actions, TTS |
| `fn-voice-profile-create` | Familiar Voice | JWT | Creates voice profile records/provider jobs |
| `fn-voice-profile-revoke` | Familiar Voice | JWT | Revokes voice profile and severs elder preference |
| `fn-voice-profile-test` | Familiar Voice | JWT | Tests familiar voice generation |
| `fn-wearable-event` | Wearable/KOMPAS | JWT/vendor | Writes wearable safety events |
| `fn-weekly-digest` | Weekly digest | service | Writes `safety_digests`, notifies family |
| `fn-wellness-checkin` | ANKER daily rhythm | JWT | Writes wellness check-ins |
| `fn-whatsapp-webhook` | WhatsApp fallback | vendor/internal | Verifies inbound webhook and sends fallback messages |

## Security rules

- Service-role functions are deployed with JWT verification disabled only where the design requires scheduler/webhook/admin execution.
- Client-facing functions use JWT verification and RLS/relationship consent.
- No function accepts or stores BSN.
- Raw browser pages and raw scam content are not stored; hashes and explanations are stored.
