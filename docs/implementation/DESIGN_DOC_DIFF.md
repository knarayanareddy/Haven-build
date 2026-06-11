# Design Document Diff — HAVEN v1.2.1 vs Current Build

Source design document: `designdoc.md` v1.2.1  
Audit date: 2026-06-11

## Summary

The current build has been diffed against the design document across product pillars, backend schema, RLS/security, storage, Edge Functions, integrations, observability, testing, release operations and legal-process support. The implementation now covers the complete engineering feature set described in the design document, including MVP, Phase 2 and Phase 3 surfaces.

Human/legal sign-offs remain tracked but intentionally cannot be completed by code.

## Pillar diff

| Area from design doc | Required | Current implementation | Diff status |
|---|---|---|---|
| SCHILD scam scoring | Calls/messages/links/web risk scoring | `fn-scam-pipeline`, `fn-browser-shield`, `scam_events`, `browser_shield_events` | Covered |
| SCHILD call reputation | Reputation cache and pre-answer scoring | `phone_reputation_cache`, `call_reputation_lookups`, `fn-call-reputation` | Covered |
| SCHILD live coach | Calm in-call coaching | iPhone SCHILD UI + explanations/red flags | Covered |
| SCHILD document vault | Secure document storage and BSN exclusion | `documents`, Storage RLS, `fn-document-analyse`, BSN rejection trigger | Covered |
| SCHILD transaction intercept | PSD2 anomaly scoring | `financial_accounts`, `financial_transactions`, `fn-transaction-intercept` | Covered |
| SCHILD weekly digest | Weekly family summary | `safety_digests`, `fn-weekly-digest` | Covered |
| ANKER medication OCR | Photo/OCR setup | `medication_ocr_jobs`, `fn-medication-ocr` | Covered |
| ANKER reminders/escalation | Voice/push reminders and family escalation | `medication_reminders`, `fn-medication-escalation`, scheduler | Covered |
| ANKER daily rhythm | Today board, tasks, appointments | `tasks`, `appointments`, `fn-screen-data` | Covered |
| ANKER hydration/nutrition/vitals | Gentle health logs | `hydration_logs`, `nutrition_logs`, `vital_signs`, `fn-health-log` | Covered |
| ANKER telehealth/transport | Care pathway and ride support | `telehealth_sessions`, `transport_requests`, `fn-telehealth-transport` | Covered |
| ANKER MedMij/FHIR | Health record import | `fhir_import_jobs`, `health_record_imports`, `fn-medmij-fhir-import` | Covered |
| ANKER G-Standaard phase | Medication catalog phase gate | `medication_catalog_*`, `fn-medication-catalog-sync` with legal/AGB gate | Covered |
| KRING family bridge | Text/voice/photo/video hello | `family_messages`, `fn-family-message-send`, grandchild bridge | Covered |
| KRING life stories | Recording/transcription/memory | `life_stories`, `fn-life-story-process`, companion memory | Covered |
| KRING BUURT | PC4 anonymous matching/events | `neighbourhood_*`, `fn-buurt-*`, opt-out cleanup | Covered |
| KRING event aggregation | Gemeinde/library/partner feeds | `community_event_sources`, `partner_event_feeds`, `fn-community-events-ingest` | Covered |
| KRING skill exchange | Intergenerational exchange | `skill_offerings`, `skill_exchange_matches`, `fn-skill-exchange` | Covered |
| KOMPAS safe zone | Fuzzy geospatial support | `location_events`, PostGIS RPC, `fn-location-ingest` | Covered |
| KOMPAS emergency profile | NFC/QR read-only emergency profile | `emergency_access_tokens`, `get_emergency_profile`, `fn-emergency-profile` | Covered |
| KOMPAS night/wandering | Night mode and wearables | `elder_profiles.night_mode_*`, `wearable_devices`, `wandering_events` | Covered |
| KOMPAS driving monitor | Elder-reviewed driving events | `driving_events`, `fn-driving-event` | Covered |
| KOMPAS bereavement | Tone adjustment and resources | `bereavement_events`, `bereavement_resources`, `fn-bereavement-support` | Covered |
| STEM voice | Whisper, intent, TTS, crisis | `fn-voice-pipeline`, OpenAI/ElevenLabs adapters, crisis notification | Covered |
| STEM memory | Persistent memory with pgvector | `companion_memory`, `match_companion_memory`, `fn-companion-memory` | Covered |
| WACHT care portal | Role-scoped professional care | carer portal app, `carer_visit_logs`, `care_plans`, `incidents` | Covered |
| WACHT safeguarding | Meldcode support | `safeguarding_reports`, `fn-incident-report` | Covered |
| WACHT external systems | ONS/Nedap/Careweb phase | `external_care_sync_jobs`, `fn-care-system-sync` | Covered |

## Platform diff

| Requirement | Implementation | Status |
|---|---|---|
| Forced RLS | All user-data domain tables have RLS enabled/forced in migrations | Covered |
| Consent model | `consent_records`, relationship permissions, `fn-consent-update` | Covered |
| BSN hard rule | No BSN columns; document trigger rejects 9-digit identifiers; UI warning | Covered |
| DigiD deferred | No DigiD auth implementation; browser shield detects lookalike risk | Covered |
| Storage private buckets | Storage migration with bucket policies and signed URL function | Covered |
| Precise location TTL | RPC sets 24h TTL; cleanup jobs null precise field | Covered |
| Observability | `perf_metrics`, SLO RPC, alert table, log-drain config, health check | Covered |
| Data export | `export_elder_data`, `fn-data-export` | Covered |
| Right to erasure | `deletion_requests`, `fn-right-to-erasure` | Covered |
| Feature flags | `feature_flags`, `evaluate_feature_flag`, `fn-feature-flags` | Covered |
| Realtime | Realtime publication migration for live tables | Covered |
| Auth claims | `custom_access_token_hook` | Covered |
| CI/CD | GitHub Actions workflow and deploy scripts | Covered |
| Tests | Edge, RLS, E2E smoke, Maestro, Playwright spec | Covered |
| Release metadata | App Store, Play Store, privacy policies | Covered |

## Remaining non-code gates

These remain open because the design document assigns them to humans, not software:

1. DPO signs DPIA.
2. Vendor DPAs/SCCs are completed.
3. Production secrets/vendor credentials are provisioned.
4. External penetration test is completed.
5. Older-adult usability testing is completed.
6. App Store and Play Store submission credentials are provisioned.

## Machine-readable coverage

See:

- `docs/implementation/FEATURE_IMPLEMENTATION_MATRIX.json`
- `docs/api/EDGE_FUNCTION_CATALOG.md`
