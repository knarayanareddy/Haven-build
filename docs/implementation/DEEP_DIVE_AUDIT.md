# HAVEN Design Document Implementation Audit

Date: 2026-06-11  
Source: `designdoc.md` v1.2.1

## Build delivered

1. **iPhone app visualization**: `apps/iphone-suite/index.html`
   - Fixed iPhone viewport, no external assets, no network dependency for preview.
   - English default with one-tap Dutch switch.
   - High contrast and large text support.
   - All six pillars are visible and interactive.

2. **Supabase backend**: `supabase/migrations/20260611000001_haven_v121_production_schema.sql`
   - Canonical v1.2.1 tables, enums, indexes and RLS policies.
   - Forced RLS on user-data tables.
   - Canonical field names such as `family_member_id`, `scheduled_time`, `profile_id`, `is_active`, `deleted_at`.
   - BUURT tables and connection lifecycle.
   - Observability table `perf_metrics`.

3. **Edge Functions**: `supabase/functions/fn-*`
   - Voice pipeline
   - Scam pipeline
   - Medication escalation
   - Notification dispatch
   - Location ingest with 24-hour precise-location TTL
   - Weekly digest
   - Companion memory
   - BUURT discover, match and events ingest

4. **Validation**: `npm run validate:suite`
   - Confirms key files exist.
   - Confirms forced RLS and required schema areas are present.
   - Confirms unresolved build tokens are not present in the generated app and production schema.

## Feature coverage map

| Design-doc pillar | Implemented surface | Backend wiring |
|---|---|---|
| SCHILD | Scam simulation, alert levels, vault, transaction guard, live coach | `scam_events`, `documents`, `financial_transactions`, `fn-scam-pipeline` |
| ANKER | Medication cards, take/snooze, daily rhythm, wellness | `medications`, `medication_reminders`, `tasks`, `wellness_checkins`, `fn-medication-escalation` |
| KRING | Family messages, heart send, grandchild hello, life story | `family_messages`, `life_stories`, `memory_lane_photos` |
| BUURT | Anonymous nearby count, interest tags, events, walk buddy request | `neighbourhood_*`, `event_interests`, `fn-buurt-*` |
| KOMPAS | Safe zone map, emergency profile, night mode, document explainer | `location_events`, `cognitive_checkins`, `elder_profiles`, `fn-location-ingest` |
| STEM | Voice companion, crisis detection, persistent memory cards | `voice_interactions`, `companion_memory`, `fn-voice-pipeline`, `fn-companion-memory` |
| WACHT | Family dashboard mode, care portal mode, visit logs, incidents | `carer_relationships`, `carer_visit_logs`, `incidents` |

## Important production note

The engineering surfaces are wired and ready for Supabase deployment. The legal items called out by the SSOT still require human completion before a real production launch:
- DPIA sign-off
- Vendor register and DPA confirmations
- Named DPO / privacy officer

Those are not code gaps and cannot be completed by software alone.

## Continuation pass — full feature implementation

The second production pass added the remaining non-visual domain surfaces required by the design suite:

- Medication OCR processing and medication/reminder creation.
- Document analysis with BSN redaction detection and sensitive-document family notification.
- Family message send service.
- Consent update service.
- Emergency profile token creation and emergency profile retrieval.
- PSD2 transaction intercept/anomaly service.
- Right-to-erasure service.
- Hydration, nutrition and vital-sign logging.
- Appointment, telehealth and transport coordination.
- Feature-flag evaluation service.
- Screen-data service for schema-driven apps.
- Expo app scaffold for elder app.
- Next app scaffold for family dashboard.
- Shared contracts, i18n copy and scam-engine packages.

The machine-readable implementation status is tracked in:

- `docs/implementation/FEATURE_IMPLEMENTATION_MATRIX.json`
- `docs/implementation/FEATURE_IMPLEMENTATION_MATRIX.md`

`npm run validate:suite` now verifies the full function inventory, expanded migrations, app scaffold files and feature matrix.
