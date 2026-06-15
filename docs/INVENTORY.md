# 🗄️ HAVEN Codebase Inventory: Edge Functions & Database Schema Map

This authoritative document catalogs the actual, complete list of all **81 Supabase Edge Functions** and all **104 PostgreSQL Database Tables** currently residing in the HAVEN production engineering package (`Haven-build`).

---

## 1. ⚡ Supabase Edge Functions (`supabase/functions/`)

There are exactly **81 highly modular Deno / TypeScript Edge Functions** implemented across the product pillars (SCHILD, ANKER, KRING, BUURT, KOMPAS, STEM, WACHT, System Ops, and Compliance).

```text
Haven-build/supabase/functions/
├── fn-audit-query/                 # Forensic audit querying helper
├── fn-bank-connect/                # Ingestion for Open Banking authentication (Tink / Plaid)
├── fn-banking-ingress-buffer/      # Real-time Upstash Redis Stream buffering for PSD2 webhooks
├── fn-banking-stream-consumer/     # High-write batch bulk consumer draining banking streams
├── fn-bereavement-support/         # Bereavement and grief companion workflow
├── fn-breach-incident/             # Data breach incident logging (Dutch AP / IGJ compliance)
├── fn-browser-shield/              # Manifest V3 extension risk pattern evaluation
├── fn-buurt-discover/              # Privacy-safe PC4 postal code neighbourhood discovery
├── fn-buurt-events-ingest/         # External Dutch local event feed ingestion
├── fn-buurt-match/                 # Walking buddy matching machine (wandelmaatjes)
├── fn-buurt-optout/                # Automated double opt-in cleanup and match revocation
├── fn-call-reputation/             # Dutch phone reputation and scam call evaluation
├── fn-care-plan/                   # Professional care plan synchronization
├── fn-care-system-sync/            # Nedap / ONS healthcare synchronization microservice
├── fn-care-visit-log/              # Professional community nursing visit logging
├── fn-carer-handover-note/         # Visiting nurse handover capture workflow
├── fn-community-events-ingest/     # Community event aggregator
├── fn-companion-memory/            # pgvector semantic memory retrieval engine
├── fn-compliance-register/         # NEN 7510 / AVG compliance operational ledger
├── fn-consent-pack-decide/         # Cryptographic Consent Pack decision acceptance
├── fn-consent-pack-list/           # Multi-stakeholder onboarding consent pack delivery
├── fn-consent-update/              # Granular RBAC permissions and explicit GDPR Erasure
├── fn-daily-checkin-scheduler/     # Automated morning/midday/evening mood check-in prompter
├── fn-daily-reminder-scheduler/    # Dynamic daily medication rhythm reminder worker
├── fn-daily-status-digest/         # Automated safety and wellness family summary generator
├── fn-data-export/                 # Complete GDPR Article 15 JSON data exporter
├── fn-device-health-monitor/       # Security Trust Signal hardware monitor
├── fn-device-session/              # Authentication and hardware token mapping
├── fn-document-analyse/            # S3 Document vault PII detection and automated OCR summary
├── fn-driving-event/               # Safe driving telematics and GPS speed evaluation
├── fn-emergency-profile/           # NFC / QR Paramedic emergency health brief exposure
├── fn-fall-escalation/             # Promise.allSettled multi-modal emergency fall escalator
├── fn-fall-event/                  # Wearable fall detection ingestion
├── fn-family-message-send/         # "Warm Hello" asynchronous audio/video messaging
├── fn-feature-flags/               # Platform operational capability toggles
├── fn-grandchild-message-send/     # One-button grandchild companion message dispatch
├── fn-health-check/                # Ingress active SLO operational checking
├── fn-health-log/                  # Time-series vitals and physical health ingestion
├── fn-incident-report/             # Formal healthcare calamiteit incident logging
├── fn-legacy-vault/                # Migration pipeline for legacy Haven structures
├── fn-life-story-process/          # Nostalgic audio reflection and keepsakes book worker
├── fn-location-ingest/             # Precise/Fuzzed geospatial safe-zone event ingestion
├── fn-log-drain-config/            # SIEM and external observability log drain configurations
├── fn-medication-catalog-sync/     # G-Standaard / Z-Index Dutch medication dictionary sync
├── fn-medication-escalation/       # Reminder rhythm escalation manager
├── fn-medication-interactions-check/ # Lethal contraindication check (Aspirin + Warfarin)
├── fn-medication-ocr/              # Computer Vision OCR image parsing for physical pill boxes
├── fn-medication-ocr-review/       # DPO/Pharmacist review workflow for extracted pills
├── fn-medication-refill/           # Pharmacy stock depletion automated refill warning
├── fn-medmij-fhir-import/          # MedMij / FHIR standard medical record importer
├── fn-notification-dispatch/       # High-throughput Push worker managing quite-hours
├── fn-notification-preferences/    # Channel notification settings (Push, WhatsApp fallback)
├── fn-observability-alert/         # Sentry/SIEM degradation incident alerter
├── fn-onboarding/                  # Older adult UI UX step prompter
├── fn-pending-confirmation-respond/ # Visual confirmation repeat-back capture
├── fn-photo-checkin/               # Family requested visual check-in receipt
├── fn-push-token-register/         # Hardware Expo push registration
├── fn-quiet-day-detector/          # Behavioral inactivity anomaly prompter
├── fn-release-check/               # Multi-platform PWA / Expo verification gate
├── fn-right-to-erasure/            # Explicit GDPR erasure worker (soft teardown)
├── fn-scam-coaching/               # Calm phishing dialogue assistant (SCHILD)
├── fn-scam-pipeline/               # 4-layer multi-modal phishing evaluation pipeline
├── fn-screen-data/                 # Schema-driven UX state constitution provider
├── fn-shift-summary/               # Wijkverpleging visiting nurse shift overview
├── fn-skill-exchange/              # Community older adult skill and talent matching
├── fn-slo-measure/                 # Ingress NEN 7510 operational availability tracking
├── fn-storage-signed-url/          # Strict folder-bounded storage signed token generator
├── fn-telehealth-transport/        # Telehealth video link and care ride request scheduler
├── fn-transaction-intercept/       # Fail-closed PSD2 HMAC verified transaction monitor
├── fn-video-call-create/           # Initiator WebRTC token session creation
├── fn-video-call-end/              # Ephemeral WebRTC session teardown
├── fn-video-call-join-token/       # Recipient one-tap room connection authentication
├── fn-vital-threshold-check/       # Blood pressure and vitals acute escalation check
├── fn-voice-pipeline/              # Full multi-modal STEM conversational assistant
├── fn-voice-profile-create/        # ElevenLabs cloned Familiar Voice initialization
├── fn-voice-profile-revoke/        # Gated Familiar Voice opt-out and model erasure
├── fn-voice-profile-test/          # Sample Familiar Voice Dutch audio testing
├── fn-wearable-event/              # IoT Smartwatch / Apple Watch health alert ingestion
├── fn-weekly-digest/               # Automated weekly safety digest compiler
├── fn-wellness-checkin/            # Interactive Daily mood check-in processor
└── fn-whatsapp-webhook/            # Critical SMS / WhatsApp fallback delivery receipt
```

---

## 2. 🗃️ PostgreSQL Database Tables (`supabase/migrations/`)

The platform schema spans exactly **104 highly structured domain tables** supporting complete relational immutability, Row-Level Security (RLS), and active non-repudiation.

```text
Haven-build/supabase/migrations/
├── 20260611000001_haven_v121_production_schema.sql
├── 20260611000002_storage_rpc_security.sql
├── 20260611000003_full_feature_domain_tables.sql
├── 20260611000004_production_automation_realtime.sql
├── 20260611000005_compliance_care_release_ops.sql
├── 20260611000006_integrations_observability_grandchild.sql
├── 20260611000008_phase3_safety_community_legacy.sql
├── 20260611000009_hardening_idempotency_integration_status.sql
├── 20260613000010_edge_authz_hardening.sql
├── 20260613000012_data_lifecycle_expansion.sql
├── 20260614000000_vnext_wellrounded_patch.sql
├── 20260614000001_round2_hardening.sql
├── 20260614000002_phase1_stakeholder_hardening.sql
├── 20260615000000_fix_fk_cascade_integrity.sql
├── 20260615000001_counter_remediation_red_team_gaps.sql
├── 20260615000002_final_targeted_iteration_red_team_gaps.sql
├── 20260615000003_final_remediation_v2_red_team_gaps.sql
└── 20260615000004_minimal_shippable_fk_gdpr_patch.sql
```

### Complete Inventory of all 104 Tables:

1. `app_events` — Observability ledger for tracking mobile PWA and native app usage actions.
2. `app_release_checks` — Quality Gate checks verifying mobile screen schema constitutions.
3. `appointments` — Multi-modal calendar synchronization tables for medical visits.
4. `audit_log` — Canonical SIEM and NEN 7510 non-repudiable system action audit ledger.
5. `bereavement_events` — Timestamped client bereavement markers (grief escalation workflows).
6. `bereavement_resources` — Content repository for professional Dutch elder bereavement coaching.
7. `browser_shield_events` — Compact local DOM risk pattern evaluation submission receipts.
8. `call_reputation_lookups` — Caching table for Dutch scam caller PC4/06 phone analytics.
9. `care_plan_items` — Relational items detailing formal wijkverpleging care plan protocols.
10. `care_plans` — Professional visiting nursing care strategies.
11. `carer_handover_notes` — Formal shift handover updates (mobility, appetite, concerns).
12. `carer_handover_recipients` — Multi-stakeholder destination mappings for handover logs.
13. `carer_relationships` — Role relationships isolating professional nurses from family nodes.
14. `carer_visit_logs` — Detailed timestamped records of physical wijkverpleging shifts.
15. `clinical_record_corrections` — Append-only NEN 7510 audit ledger storing pre-image entry typo revisions.
16. `cognitive_checkins` — Timestamped responses tracking cognitive orientation baselines.
17. `community_event_sources` — PC4 local Dutch neighbourhood event sources.
18. `companion_memory` — pgvector relational embeddings holding life story memories.
19. `consent_pack_status` — State entries tracking explicit cryptographic Consent Pack onboarding.
20. `consent_packs` — Cryptographically bounded cryptographic feature consent agreements.
21. `consent_records` — Overarching AVG granular user consent timestamp receipts.
22. `contacts` — Protected address book networks accessible strictly by authenticated older adults.
23. `data_breach_incidents` — Formal Dutch Autoriteit Persoonsgegevens incident report register.
24. `deletion_requests` — Async GDPR right-to-erasure capture table.
25. `device_health_events` — Hardware telemetry verifying app trust signals and token health.
26. `device_sessions` — Relational security anchors bound to physical Android and iOS devices.
27. `document_analysis_jobs` — Processing jobs parsing S3 medical document PII.
28. `documents` — End-to-end encrypted or privacy-bounded S3 Document Vault storage references.
29. `domain_reputation_cache` — Automated caching for phishing URL verification patterns.
30. `dpia_assessments` — DPO Data Protection Impact Assessment compliance register.
31. `dpo_pii_incident_review` — Backfill logging table for potentially un-sanitized unstructured PII.
32. `driving_events` — GPS speed telemetry monitoring late-life driving disorientation.
33. `elder_baselines` — Longitudinal functional behavior markers tracking inactivity anomalies.
34. `elder_interest_tags` — Double-obfuscated PC4 community matching parameters.
35. `elder_profiles` — High-contrast UI baselines and font sizing parameters for older adults.
36. `elder_voice_preferences` — ElevenLabs voice companion Dutch speed and volume preferences.
37. `emergency_access_tokens` — Paramedic temporary exposure credentials (NFC / QR triggers).
38. `emergency_profile_access_log` — Timestamped non-repudiable audit ledger of paramedic accesses.
39. `event_interests` — Neighborhood matching preferences (*wandelmaatjes*).
40. `external_care_sync_jobs` — Operational tracking jobs for ONS / Nedap partner flushes.
41. `fall_events` — Highly critical medical events tracking mechanical wearable fall alerts.
42. `family_messages` — Asynchronous photo/audio/video "Warm Hello" envelopes.
43. `family_relationships` — RBAC permission matrices identifying Consented family delegates.
44. `feature_flags` — High-performance operational system configuration toggles.
45. `fhir_import_jobs` — Asynchronous workers ingesting formal MedMij FHIR clinical models.
46. `financial_accounts` — Masked account baselines linked to Open Banking connections.
47. `financial_transactions` — Fail-closed PSD2 open banking transaction tracking ledgers.
48. `gdpr_pii_fields` — Authoritative declarative PII columns registry for Automated Redaction.
49. `grandchild_profiles` — Simplified UI UX companion setup profiles.
50. `health_record_imports` — Audited raw ingestion ledger for third-party care flushes.
51. `hydration_logs` — Nutrition and liquid volume logging sheets.
52. `idempotency_keys` — Distributed operational key records enforcing strict mutation concurrency.
53. `incidents` — Statutory *Calamiteit* clinical hazard registers.
54. `integration_connections` — External partner vendor authentication registers (PSD2, Sentry, ElevenLabs).
55. `interest_tags` — Community double opt-in category labels.
56. `legacy_accounts` — Structural migration maps for non-canonical Haven baselines.
57. `life_stories` — Timestamped nostalgic voice reflections and Keepsake Book references.
58. `life_story_prompts` — Structured conversational prompters tailored for Dutch older adults.
59. `location_events` — PostGIS geospatial precise coordinates (strictly nulled after 24 hours).
60. `log_drain_configs` — Splunk and Datadog cloud SIEM log forwarding targets.
61. `medication_catalog_entries` — Z-Index / G-Standaard localized Dutch drug dictionary items.
62. `medication_catalog_sync_jobs` — Scheduled jobs replenishing exact G-Standaard references.
63. `medication_interaction_alerts` — Life-threatening contraindication warning ledgers.
64. `medication_ocr_jobs` — Computer Vision asynchronous tasks identifying physical pill pictures.
65. `medication_ocr_reviews` — Verified multi-stakeholder DPO reviews for OCR scans.
66. `medication_refill_events` — Stock Refill stock replenishment alerts.
67. `medication_reminders` — Medical Administration Records (MAR-light) tracking reminder intakes.
68. `medications` — Full active patient pharmacological regimens.
69. `memory_lane_photos` — Embedded photo envelopes indexed for conversational retrieval.
70. `neighbourhood_connections` — Walk buddy connections gated behind Double Opt-in logic.
71. `neighbourhood_events` — Real-time community activity listings.
72. `neighbourhood_profiles` — PC4 spatial matching nodes.
73. `notification_preferences` — System delivery routing configurations (Push vs WhatsApp fallback).
74. `notifications` — Outbound haptic and visual user alert buffers.
75. `nutrition_logs` — Diet and caloric intake log sheets.
76. `partner_event_feeds` — Inbound external healthcare API communication ledgers.
77. `pending_confirmations` — Gated repeat-back audio intake confirmations.
78. `perf_metrics` — Ingress system latency and NEN 7510 execution duration ledgers.
79. `phone_reputation_cache` — In-memory lookup indices for Dutch phone reputation analytics.
80. `profiles` — Canonical user identity tables (Tombstoned with `status := 'erased'`).
81. `profiles_snapshot` — Completely stable snapshot IDs repointing high-write open banking webhooks.
82. `psd2_webhook_ingress_buffer` — Highly scalable unlogged scratch table for high-write banking webhooks.
83. `push_tokens` — Hardware push routing identifiers (Deactivated specifically on `410` errors).
84. `safeguarding_reports` — Formal regulatory clinical safeguarding records (*Meldcode*).
85. `safety_digests` — Weekly structured family safety reports.
86. `scam_coaching_sessions` — High-contrast interactive calm coaching dialogue threads.
87. `scam_events` — Identified real-time localized Dutch phishing risk occurrences.
88. `screen_schemas` — Verified UI layout JSON constitutions.
89. `security_violations` — Authoritative custom kernel log capturing automated immutability tampering.
90. `skill_exchange_matches` — Local talent and skill-sharing matches.
91. `skill_offerings` — User-submitted community skill offerings.
92. `slo_alerts` — Time-series availability alerts confirming continuous NEN 7510 uptime.
93. `tasks` — Asynchronous daily tasks and health prompts.
94. `telehealth_sessions` — Ephemeral encrypted WebRTC video conference configurations.
95. `transport_requests` — Older adult medical taxi and transport booking sheets.
96. `vendor_register` — Internal compliance vendor register tracking active DPAs and SCCs.
97. `video_call_sessions` — Real-time live video room call structures.
98. `vital_signs` — Heart rate, blood oxygen, and vital health telemetry entries.
99. `voice_interactions` — Full STEM multi-modal Whisper audio and conversational transcripts.
100. `voice_profiles` — ELEVENLABS cloned Family voice IDs ("Familiar Voice").
101. `wandering_events` — Safe Zone breaches and orientation alerts.
102. `wearable_devices` — Physical hardware anchors bound to Google Watches and Apple Watches.
103. `webhook_receipts` — Authoritative open banking HMAC signature verified receipts ledger.
104. `wellness_checkins` — Asynchronous morning/evening mood check-in entries.
```