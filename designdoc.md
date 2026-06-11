---
title: HAVEN Engineering Design Suite
version: 1.2.3
status: Approved — Single Source of Truth
locale: Netherlands (nl-NL)
jurisdiction: EU / Dutch law (AVG/UAVG/WGBO)
timezone: Europe/Amsterdam
last_updated: 2026-06-11

changelog:
  1.2.3: Solutions Architect Review Patch (HAVEN-SSOT-002) applied:
         reconciled column names (family_member_id, carer_member_id,
         can_view_medications, can_view_location_events, profile_id);
         aligned Next.js middleware routing page permissions;
         aligned family_relationships and carer_relationships DDL/seed SQL;
         extended docs/canonical-fields.json registry.
  1.0.0: Initial SSOT
  1.1.0: BSN removed; fraud/loneliness stats corrected; WGBO 15→20y;
         AI Act transparency fixed; RLS canonicality resolved
  1.1.1: Schema field names reconciled (canonical reference table added);
         Addendum A rewritten to match Doc 05 field names;
         Companion memory DDL unified (single canonical definition);
         Retention table unified (single canonical table);
         Seed SQL rewritten to match canonical schema;
         MVP scope labels fixed (G-standaard Phase 3; PSD2 Phase 2 consistent);
         Medication adherence stat corrected with sourcing
  1.2.0: Addendum P added — BUURT (De Buurtverbinder)
         Feature assigned to Phase 2 (post-MVP)
         5 new tables + indexes + RLS + 3 Edge Functions + 3 feature flags
         NL statistics corrected from US sources to CBS/RIVM/Buurtteam Amsterdam
         DPIA supplementary assessment required before Phase 2 activation
  1.2.1: P0 fixes — RLS FORCE syntax corrected throughout;
         connection_status enum added; seed SQL aligned to canonical schema
         (medication_reminders + push_tokens); voice_interactions deleted_at
         added; fn-companion-memory enum contract aligned; precise-location
         TTL unified to 24h (ADR + schema + cron); BSN removed from Class 4
         examples; DigiD removed from onboarding + documents; CloudWatch
         references replaced with Supabase-native observability stack
  1.2.2: Solutions Architect review patch; voice transcripts nullability & redaction
         chk_transcript_redaction and chk_memory_redaction constraints;
         audit log retention unified to 7y (pg_cron auto-delete forbidden);
         medication reminders seed columns corrected; PSD2 AISP alert wording;
         Threat Model (§TM), Data Classification Registry (§DC), RLS Test Harness (§RT),
         and Voice Failure-Mode Design (§VF) appended; Addendum A referenced as separate file.

items_requiring_human_dpo_action:
  - Addendum J (DPIA — AVG Art. 35): must be completed + signed before production
  - Addendum K (Vendor Register): DPA column must be filled for every vendor
  - Doc 06: Named DPO must be recorded before production launch
---

## v1.2.3 Patch Summary Card

```
HAVEN Engineering Design Suite
Version: 1.2.3
Status:  Approved — Single Source of Truth
Date:    2026-06-11

v1.2.3 PATCH SUMMARY (Solutions Architect Review - HAVEN-SSOT-002):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HUNK A-1  family_relationships    Replaced family_user_id with family_member_id
          family_member_id        globally in helper functions and policies.
HUNK A-2  can_view_medications    Replaced can_view_meds with can_view_medications
          in policies.
HUNK A-3  can_view_location_events Replaced can_view_location with
          can_view_location_events in policies.
HUNK A-4  carer_member_id         Replaced carer_user_id with carer_member_id
          in helper functions and carer policies.
HUNK A-5  push_tokens profile_id  Replaced push_tokens.user_id with profile_id
          in push_tokens policies.
HUNK A-8  Drift Guard Table       Added canonical column cross-reference table.
HUNK A-9  RLS Policies Replaced   Replaced critical policies in full.
HUNK D-1  Local Reminder Sync     Replaced scheduled_for with scheduled_time
          in TS snippet & LocalReminder interface; added ReminderStatus.
HUNK D-5  family_relationships    Aligned DDL, index, and seeds with canonical
          columns and alert subscriptions.
HUNK D-6  carer_relationships     Aligned carer DDL, index, and seeds with
          carer_member_id.
HUNK D-8  Index Annotations       Marked pending addenda B/C/D/E as FILE PENDING.
HUNK D-9  canonical-fields.json   Extended json schema registry to cover carer
          relationships, push tokens, and corrected columns.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ITEMS STILL REQUIRING HUMAN DPO ACTION (unchanged):
  ⚠️ Addendum J (DPIA) — must be completed + signed before production
  ⚠️ Addendum K (Vendor Register) — DPA column must be filled per vendor
  ⚠️ Doc 06 — Named DPO must be recorded before production launch
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After applying this patch: designdoc.md is production-grade SSOT.
```

## v1.2.2 Patch Summary Card

```
HAVEN Engineering Design Suite
Version: 1.2.2
Status:  Approved — Single Source of Truth
Date:    2026-06-11

v1.2.2 PATCH SUMMARY (Solutions Architect Review):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX-A  Transcripts Nullability  voice_interactions.transcript_nl and
       & Redaction Constraints  companion_memory.content_nl made nullable.
                                Constraints chk_transcript_redaction and
                                chk_memory_redaction added to enforce that
                                redacted fields are NULL. pg_cron retention
                                updated to redact transcripts.
FIX-B  Audit Log Retention      Unified to exactly 7 years in retention table.
       7y / No pg_cron          Exclusion added: auto-deletion via pg_cron is
                                strictly forbidden; manual DPO sign-off only.
FIX-C  Medication Seeds         Corrected DDL schema columns (id, medication_id,
                                elder_id, scheduled_time, status, snooze_count,
                                created_at) in B.2.4 seed data.
FIX-D  PSD2 Alert Wording       Removed references to "transaction blocked" or
                                "intercept" since HAVEN has read-only AISP scope.
                                Updated to alert warnings + bank deep-linking.
                                Renamed fn-transaction-intercept to fn-transaction-alert.
FIX-E  Addendum A RLS SSOT      Moved canonical RLS SQL to a separate file:
                                docs/addenda/addendum-a-rls-canonical.md.
ADD-1  Threat Model             Appended Threat Model (§TM) detailing HAVEN
                                specific threats and mitigations.
ADD-2  Data Classification      Appended Data Classification Registry (§DC)
                                cataloging security classes and Sentry scrubbing.
ADD-3  RLS Test Harness         Appended RLS Test Harness (§RT) defining pgTAP
                                automated test setup and execution.
ADD-4  Voice Failure-Mode       Appended Voice Failure-Mode Design (§VF)
                                detailing cached audio fallback and timeouts.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ITEMS STILL REQUIRING HUMAN DPO ACTION (unchanged):
  ⚠️ Addendum J (DPIA) — must be completed + signed before production
  ⚠️ Addendum K (Vendor Register) — DPA column must be filled per vendor
  ⚠️ Doc 06 — Named DPO must be recorded before production launch
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After applying this patch: designdoc.md is production-grade SSOT.
Engineers can run supabase db reset, apply migrations, and start
building all six pillars without hitting schema/contract mismatches.
```

HAVEN — Engineering Design Document Suite
Version: 1.2.3 Status: Approved — Single Source of Truth Locale: Netherlands (nl-NL) | Jurisdiction: EU / Dutch Law Last Updated: 2026-06-11 Replaces: README.md, HAVEN_BLUEPRINT.md, UIUXRENDER

Document 01 — Product Specification
1. Mission
HAVEN is a voice-first elder-care companion platform built for older adults living in the Netherlands. It exists to protect dignity, reduce isolation, prevent fraud, and support daily independence — without surveillance, without panic, and without complexity.

HAVEN is not a tracking app. It is not a panic button. It is not a replacement for human care. It is a calm, trusted presence in an elder's daily life — and a reassuring, transparent window for the family members and professionals who care for them.

2. The Problem
Dutch older adults — particularly those aged 70 and above — face four compounding challenges:

Challenge	Dutch Context
Financial fraud & scams	In 2024, the Fraudehelpdesk registered **63,469 fraud reports** (meldingen) via callcenter and web form — a **10% increase** versus 2023 — with reported financial damage rising **20% to nearly €53 million**. Notably, **telephone fraud doubled** in 2024 compared to the year before. The majority of cases involved **helpdeskfraude** — fraudsters posing as helpdesk staff — including **bankhelpdeskfraude**, one of the most damaging forms, accounting for 6,057 reports alone. In 2025, this trend accelerated sharply: total meldingen reached **101,734** (a 60% rise over 2024), financial damage climbed to **€68.5 million** (+30%), and the number of financially harmed victims rose **65%** — while reported false emails numbered **522,103**. Elders are the primary target of "bankhelpdeskfraude", phishing, and "vriend-in-nood" (friend-in-need) scams.

> ⚠️ **DATA NOTE:** Fraudehelpdesk publishes two separate figures:
> (1) "Meldingen" — formal fraud reports via callcenter/webformulier
> (2) "Valse e-mails" — suspicious emails submitted to the valse-e-mailcheck
> These must never be combined into a single "reports" headline figure.
> Source: Fraudehelpdesk Jaarverslag 2024 (Feb 2025) + Terugblik 2025 (Feb 2026)
Loneliness & isolation	According to CBS (2024), **approximately 10% of Dutch people aged 15 and older** experience strong loneliness (*sterk eenzaam*); a further **30% report feeling somewhat lonely**, and 61% do not feel lonely. Among people **aged 65 and older specifically**, RIVM monitoring (CBS Sociale Samenhang en Welzijn data) shows the share reporting strong loneliness ranged between **7.5% (2024) and 8.7% (2023)**. Using the broader Gezondheidsmonitor Volwassenen en Ouderen 2024 (GGD/CBS/RIVM), **46% of Dutch adults (18+) report some form of loneliness**, of whom **33% are moderately lonely** and **13% strongly lonely**. The groups most at risk of strong loneliness are **people living alone (14%)** and single parents (18%). Loneliness is most prevalent among **young people and the very oldest**.

HAVEN's KRING pillar addresses a structural and growing loneliness challenge in the Netherlands. While the majority of older adults are not severely lonely in any given year, the cumulative risk rises sharply with age, isolation, bereavement, and reduced mobility — precisely the cohort HAVEN serves. Even moderate loneliness in this group is associated with significantly worse health outcomes and quality of life (CBS/RIVM, 2024).

> ⚠️ **DATA NOTE:** Two different surveys measure loneliness in NL with different methodology and age cut-offs, producing different headline percentages:
> (1) CBS Sociale Samenhang en Welzijn: 15+ population, ~10% sterk eenzaam (2024)
> (2) GGD/CBS/RIVM Gezondheidsmonitor Volwassenen en Ouderen: 18+, ~13% sterk eenzaam (2024)
> Both are valid; cite the source explicitly when using either figure.
> The "1 in 3 severe loneliness 75+" figure is NOT supported by either source and must not be used.
> Sources: CBS cbs.nl/nl-nl/nieuws/2025/39 | vzinfo.nl/eenzaamheid | rivm.nl/mentale-gezondheid
Medication non-adherence	Medication non-adherence is a structural challenge in the Netherlands. RIVM and IGJ monitoring consistently highlight **polypharmacy** — the use of five or more medications simultaneously — as a major risk factor among Dutch older adults.

WHO (2003, "Adherence to Long-Term Therapies") estimated ~50% adherence for chronic therapies in developed countries as a general benchmark. HAVEN does not claim a specific Dutch statistic here; the product justification is grounded in the **cognitive and logistical complexity of multi-drug regimens for older adults** as documented in Dutch pharmacovigilance and primary care literature.

**Source:** WHO "Adherence to Long-Term Therapies" (2003) for the 50% benchmark; RIVM polypharmacy monitoring (rivm.nl/geneesmiddelen) for the Dutch context.
Cognitive safety	Over 290,000 people in the Netherlands live with dementia (Alzheimer Nederland, 2025). Safe navigation and orientation support is an unmet gap in consumer tech.
3. Target Users
3.1 Primary User — The Elder
Age: 68–90
Lives independently or in a lightly assisted setting (thuiszorg)
Dutch mother tongue (nl-NL)
Low to medium digital literacy
May have reduced hearing, vision, or motor dexterity
Uses HAVEN as their primary digital companion
3.2 Secondary User — The Family Member / Mantelzorger
Age: 35–60
Grown child or partner of the elder
Dutch or English-speaking
Uses the family dashboard on mobile and desktop
Legally a "mantelzorger" (informal carer) in the Dutch care context
3.3 Tertiary User — The Professional Carer / Zorgverlener
Home care worker (thuiszorgmedewerker) or district nurse (wijkverpleegkundige)
Works within a licensed zorginstelling
Uses the Guardian portal (role-scoped)
Operates under BIG-register obligations and WGBO
4. The Six Pillars
Pillar 1 — SCHILD (Fraud & Scam Protection)
Dutch elders are specifically targeted by "bankhelpdeskfraude" (fake bank helpdesk calls), "vriend-in-nood" (friend-in-need WhatsApp scams), and fake overheid (government) portals.

Features:

Real-time call reputation analysis
Multi-layer scam scoring pipeline (per-call, per-message, per-link)
Conversation coaching during a flagged live call ("stay on the line, this may be a scam")
Document Vault (SCHILD): Securely store and label important documents — such as insurance policies, medication overviews, wills, and utility contracts.

  Explicit exclusions (displayed in UI):
  - Do not upload documents showing your full BSN. If you wish to store an identity document, redact the BSN number before uploading.
  - HAVEN does not process or read BSN numbers and cannot validate identity documents.
  - DigiD integration: DigiD is explicitly out of scope for MVP. Any future DigiD integration (e.g. for MedMij access) requires a separate legal basis assessment and technical security review before implementation.
[Phase 2 — PSD2 transaction alerts] Anomalous transaction warnings & alerts (via PSD2 Open Banking APIs)
Alert levels: Amber (worth knowing) → Rood (take action) → Zwart (urgent transaction warning & bank deep-link alert)
Social engineering memory: tracks escalating "grooming" patterns across time
Weekly "Veiligheidsoverzicht" (safety digest) for family
Pillar 2 — ANKER (Health, Meds, Daily Rhythm)
Medication setup via photo/OCR of Dutch "bijsluiter" (medication leaflet) and geneesmiddelen labels
Warm voice reminders with escalation after misses
Daily rhythm board ("Vandaag")
Voice task manager
Wellness check-ins
~~G-standaard/Z-index integration~~ *(Phase 3 — not MVP, not Phase 2)*

> **Phase label rule:** G-standaard requires an AGB-code and a formal Vecozo/ZIN 
> agreement. This is out of scope until HAVEN is a registered healthcare application.
MedMij/PGO integration for Dutch personal health record access
Huisarts (GP) appointment reminders
Pillar 3 — KRING (Connection & Community)
Family messaging: text, voice notes, photos, video hellos
Life story archive ("Mijn Verhaal") with Whisper transcription
Memory lane: anniversary and memorial surfacing
Dutch community event aggregation (via gemeentelijke APIs and Ouderenfonds feeds)
Intergenerational skill exchange
Connection to Dutch elder networks (ANBO, KBO-PCOB)

### KRING — sub-feature: BUURT (De Buurtverbinder) [MVP Phase 2]

**Problem:** 51% of Dutch adults aged 75+ feel lonely (RIVM/Buurtteam Amsterdam 2024).
Neighbourhood spaces are the most accessible social space for ageing-in-place elders,
but there is no low-friction, privacy-safe way to discover shared interests nearby.

**What it does:**
- Opt-in neighbourhood profile with Dutch interest tags (no name, no photo required)
- Anonymous proximity display ("3 mensen in uw buurt gebruiken ook HAVEN")
- Interest-matching without identity disclosure
- Hyper-local activity suggestions (library events, park walks, etc.)
- "Wandelmaatje" — mutual opt-in walk-buddy matching
- Anonymous connection requests → double opt-in before any contact

**What it does NOT do:**
- No real-time location sharing
- No direct messaging
- No demographic matching
- No visible profiles until both parties consent

**Phase assignment:** Phase 2 (post-MVP closed beta)
**Feature flag:** buurt_neighbourhood_connector (default: false)
Pillar 4 — KOMPAS (Cognitive Safety & Orientation)
Daily cognitive check-ins (orientation questions)
Safe zone / "Veilige Zone" — PostGIS-backed with fuzzy location privacy
"Wat is dit?" — photo explainer (camera → AI → plain Dutch description)
Rouw- en verliesondersteuning (grief/bereavement mode)
Emergency medical profile (for huisarts and ambulance)
Nachtmodus (night safety mode)
Wandering detection via optional integration with GPS wearables
Pillar 5 — STEM (The Voice Companion)
Persistent-memory Dutch-language companion
Offline fallback for core interactions
Crisis phrase detection ("ik voel me niet goed", "ik ben bang")
Warm, calm Dutch voice persona (ElevenLabs, nl-NL voice)
Pillar 6 — WACHT (Professional Care Portal)
Role-scoped portal for thuiszorg and wijkverpleging
Visit logs and care plan hub
Safeguarding incident reporting (meldcode Huiselijk Geweld)
Integration with Careweb / ONS / Nedap care systems (Phase 2)
5. MVP Definition
The MVP is the smallest safe, loveable product that can be delivered to a closed beta of 50 Dutch elder households within 6 months.

In MVP Scope
Pillar	MVP Features
SCHILD	Call reputation display, scam flag + amber alert to family, document vault
ANKER	Medication reminders (voice + push), daily rhythm board, wellness check-in
KRING	Family voice notes, family photo sharing, life story recording
KOMPAS	Safe zone alerts, emergency medical profile
STEM	nl-NL voice companion (online), crisis phrase detection
WACHT	Read-only family dashboard; carer portal: Phase 2
Explicitly Out of MVP Scope
[Phase 2 — PSD2 transaction alerts] Anomalous transaction alerts / bank deep-linking (PSD2)
MedMij / PGO health record integration
Cognitive driving event detection
Community event aggregation
Skill exchange / neighbourhood connections
Guardian / carer portal (WACHT)
Legacy account / digital estate module
Offline companion voice (Phase 2)
G-standaard medication database integration
6. Phased Roadmap
Phase 0 — Foundation (Months 1–2)
Supabase project setup (EU region)
Auth flows (elder + family + carer roles)
Core DB schema + RLS policies
Elder app skeleton (React Native + Expo)
Screen renderer + schema test suite (CI)
Family dashboard skeleton (Next.js)
Phase 1 — MVP (Months 3–5)
ANKER: medication reminders
SCHILD: call screening + document vault
KRING: family messaging + voice notes
STEM: nl-NL voice companion (online)
KOMPAS: safe zone + emergency profile
Beta launch: 50 households
Phase 2 — Depth (Months 6–9)
SCHILD: anomalous transaction alerts (PSD2)
KOMPAS: cognitive check-ins + "Wat is dit?"
STEM: offline fallback
ANKER: MedMij integration
WACHT: carer portal
Push to App Store (iOS) + Google Play
Phase 3 — Scale (Months 10–14)
Community event feeds
G-standaard medication DB
Nedap/Careweb integration
ANBO / KBO-PCOB partnership portal
Multi-language support (Turkish, Arabic — NL migrant elder communities)
7. Success Metrics
Metric	Target (12 months post-launch)
Daily active elder users	≥ 65% of registered elders
Medication adherence improvement	≥ 20% vs. baseline (self-reported + reminder data)
Scam events flagged per month	Tracked; elder feedback on relevance ≥ 80% accurate
Family dashboard MAU	≥ 80% of registered family members
Voice interaction completion rate	≥ 85% (intent resolved without fallback)
Crisis phrase detection response time	< 30 seconds to family notification
App Store rating	≥ 4.6 stars
CSAT (elder)	≥ 90% "feels safe and easy"
Document 02 — Architecture Decision Records (ADRs)
Each ADR follows the format: Context → Decision → Rationale → Consequences → Alternatives Rejected

ADR-001 — Primary Backend: Supabase (PostgreSQL)
Context: We need a backend that provides auth, database, storage, real-time, and edge compute with minimal operational overhead for a small team.

Decision: Supabase hosted on AWS eu-central-1 (Frankfurt) as the primary backend.

Rationale:

EU region hosting satisfies AVG/GDPR data residency requirements
PostgreSQL is the most mature open-source relational DB; we need ACID transactions for health and financial data
Supabase provides Row-Level Security natively, which is architecturally central to HAVEN's consent model
pgvector and PostGIS are first-class Postgres extensions — no additional vector or geo database needed at MVP scale
Supabase Auth provides JWT-based auth with RLS integration out of the box
Edge Functions (Deno) run in the same region as the DB, minimising latency for sensitive operations
Consequences:

We are partially vendor-locked to Supabase's hosting; mitigation is that the underlying stack is standard PostgreSQL + open-source
At very high scale (>500k active users) we will need to evaluate dedicated Postgres hosting
Alternatives Rejected:

Firebase: No native SQL, no RLS, US-centric data residency by default, no pgvector
AWS Amplify: High operational complexity, harder RLS model, more infrastructure overhead
Custom Node.js + RDS: Too much boilerplate for a small team at this stage
ADR-002 — Elder Mobile App: React Native + Expo
Context: We need a cross-platform mobile app for iOS and Android targeting Dutch elders (predominantly iOS via families gifting iPads, but Android significant in lower-income demographics).

Decision: React Native with Expo (Managed Workflow → Bare when needed).

Rationale:

Single codebase for iOS and Android
Expo's accessibility APIs are mature
EAS Build integrates with CI/CD
Large ecosystem for the integrations we need (HealthKit, Notifications, Camera/OCR)
Schema-driven UI renderer is framework-agnostic in principle but React Native's component model fits the declarative schema pattern well
Consequences:

Some native modules require ejecting to bare workflow (e.g., advanced Bluetooth for wearables in Phase 2)
React Native bridge overhead exists but is acceptable for our use case (not a high-frame-rate game)
Alternatives Rejected:

Flutter: Smaller ecosystem for our specific integrations; team expertise is React-based
Native iOS/Android: 2x development cost; unjustifiable for MVP
PWA: Insufficient access to native APIs (microphone, HealthKit, haptics, background tasks)
ADR-003 — Family Dashboard: Next.js 14 (App Router)
Context: Family members and carers need a web dashboard that works on desktop and mobile browsers.

Decision: Next.js 14 with App Router, hosted on Vercel (EU region).

Rationale:

App Router enables Server Components — sensitive data is never sent to client unnecessarily
Vercel EU region (Frankfurt) for data residency
Supabase Auth works seamlessly with Next.js middleware for SSR auth
Real-time dashboard updates via Supabase Realtime subscriptions on the client
Alternatives Rejected:

SvelteKit: Less team familiarity; smaller ecosystem for our UI component needs
Remix: Good option but App Router now has equivalent capabilities
Standalone React SPA: Loses SSR benefits; SEO not relevant here but SSR auth security model is important
ADR-004 — Voice STT: OpenAI Whisper (API)
Context: Speech-to-text for Dutch elder voices, which may include accents, slower speech, and softer articulation.

Decision: OpenAI Whisper via API (whisper-1 model) with language: nl forced.

Rationale:

Whisper has best-in-class Dutch language support including regional accents
Forcing language: nl improves accuracy and reduces hallucination on Dutch speech
API model removes on-device compute requirement for MVP
OpenAI processes data under a Data Processing Agreement (DPA) — we have confirmed EU DPA availability
Consequences:

Voice audio is sent to OpenAI servers; this is a data residency consideration. Mitigation: DPA in place; audio is not stored by OpenAI after transcription; elder consent is explicit during onboarding
Latency: API round-trip ~300–800ms acceptable for our use case
Phase 2 Consideration: Evaluate on-device Whisper (via whisper.rn or ExpoSpeech) for offline fallback.

Alternatives Rejected:

Azure Cognitive Services Speech: Dutch quality inferior to Whisper in testing
Google Cloud Speech-to-Text: Similar quality but higher cost at scale; less flexible
AssemblyAI: No strong nl-NL support
ADR-005 — Voice TTS: ElevenLabs
Context: Text-to-speech for the STEM voice companion must sound warm, calm, and natural in Dutch — not robotic.

Decision: ElevenLabs API with a custom nl-NL voice persona ("Hanna" — warm, measured, 60s-female-presenting voice).

Rationale:

ElevenLabs produces the most natural-sounding Dutch TTS available as of 2026
Custom voice cloning allows us to design a consistent HAVEN persona
Streaming API supports low-latency first-byte delivery
ElevenLabs GDPR DPA available
Consequences:

Cost scales with character volume; see Document 10 for cost model
Voice persona must be carefully designed to avoid being mistaken for a real person (AVG Article 22 / transparency obligation)
Alternatives Rejected:

Azure TTS (nl-NL): Good but less warm; "uncanny valley" effect in user testing
Google Cloud TTS: Similar issue
On-device TTS: Quality insufficient for our dignity-first positioning
ADR-006 — Vector Storage: pgvector (in Supabase Postgres)
Context: Companion memory, scam event similarity search, and life story retrieval require semantic vector search.

Decision: pgvector extension within Supabase Postgres; HNSW index for ANN search.

Rationale:

Keeps the data plane unified — no separate vector database to manage, secure, or pay for
HNSW index (added in pgvector 0.5+) provides performance adequate for our scale (< 5M vectors at 5-year horizon)
Simplifies RLS: vector search respects the same row-level security as all other queries
Consequences:

At very large scale (10M+ vectors) we will need to evaluate Qdrant or Pinecone. That is a Phase 3+ concern.
Alternatives Rejected:

Pinecone: Separate service, separate security model, no RLS, US-hosted by default
Qdrant: Self-hosted operational complexity; overkill for MVP
ADR-007 — Location: PostGIS with Fuzzy Privacy Model
Context: Safe zone and wandering detection require geospatial data. But storing precise elder location is a significant privacy risk.

Decision: PostGIS extension in Postgres. Location is stored as neighbourhood-level fuzzed geometry (100m radius noise applied before storage) except for active safe-zone exit events (stored precisely, auto-deleted after 24h).

Rationale:

Fuzzy location satisfies our dignity-first principle: HAVEN is not a tracking app
PostGIS integrates natively with Postgres RLS
Neighbourhood-level precision is sufficient for "left the safe zone" detection and community event matching
Consequences:

Precise route history is never stored (intentional)
store precise location only for active "safe-zone exit" handling,
then automatically null it after **24 hours** (enforced by pg_cron).

**TTL canonical value: 24 hours — this is the single source of truth.**
- ADR-007 (this record): 24h ✅
- location_events.auto_delete_at comment: 24h ✅
- pg_cron job 'null-precise-location': 24h ✅
- Canonical retention table: 24h ✅
- Addendum J DPIA risk table: 24h ✅

Rationale for 24h (not 48h):
The shorter window minimises re-identification risk while providing enough
time for the family alert flow to complete (SLO: notification within 15s
of event; family action typically within hours). 24h was chosen over 48h
to align with the "minimal retention" principle under AVG Art. 5(1)(e).
ADR-008 — PSD2 Banking Integration (Phase 2)
Context: Transaction anomaly detection requires read access to elder banking data.

Decision: Use a Dutch PSD2 AISP (Account Information Service Provider) aggregator. Target: Tink (EU-licensed, GDPR-compliant) or Nordigen (now Gocardless). Final vendor selected at Phase 2 start.

Rationale:

PSD2 gives us a legal framework for read-only account access with explicit elder consent
Dutch major banks (ING, Rabobank, ABN AMRO) all expose PSD2-compliant APIs
AISP aggregators handle the bank-by-bank OAuth flows and normalise the data
Consequences:

Elder must explicitly consent via their bank's OAuth flow (strong customer authentication)
We never store full account numbers — only masked identifiers and transaction metadata
ADR-009 — Dutch Healthcare Integration: MedMij / PGO (Phase 2)
Context: Accessing Dutch personal health records requires compliance with the MedMij standard.

Decision: Integrate with a certified Dutch PGO (Persoonlijke Gezondheidsomgeving) provider as a data consumer, using the MedMij afsprakenstelsel (framework agreement).

Rationale:

MedMij is the Dutch national standard for personal health data exchange
Integrating as a MedMij data consumer gives us legally compliant access to medication history, GP correspondence, and lab results
Requires formal MedMij toelating (accreditation) — this is a Phase 2 regulatory milestone
Consequences:

MedMij accreditation takes 3–6 months; must be started at Phase 1 end
FHIR R4 is the underlying data format
ADR-010 — Embedding Model: OpenAI text-embedding-3-small
Context: Companion memory, scam similarity, and story retrieval require embeddings.

Decision: OpenAI text-embedding-3-small (1536 dimensions).

Rationale:

Strong multilingual performance including Dutch
Cost-effective vs. text-embedding-3-large
1536 dimensions work well with pgvector HNSW
Consequences:

All text sent for embedding is subject to OpenAI DPA (same as Whisper)

### ADR-011 — DigiD integration: DEFERRED (Phase 3+)
**Decision:** DigiD integration is explicitly deferred. It does not appear in
any onboarding flow, document vault feature, or MedMij integration spec until
this ADR is resolved.

**Why deferred:**
- DigiD requires BSN as the underlying identifier (HAVEN does not collect BSN — ADR-008)
- DigiD integration requires a formal Logius agreement (aansluitovereenkomst)
- DigiD requires NEN 7510 / ISO 27001 certification which HAVEN does not yet hold
- MedMij PGO integration (Phase 2) can use alternative authentication
  (ZORGID, IRMA/Yivi) without DigiD — these will be evaluated in Phase 2 ADR

**Pre-conditions before this ADR can be re-opened:**
1. Legal basis for BSN processing confirmed by counsel
2. Logius aansluitovereenkomst negotiations initiated
3. NEN 7510 certification scope assessment complete
4. DPO sign-off on expanded DPIA scope

**Status:** Deferred — do not implement, reference, or prototype until reopened.

Document 03 — System Architecture
1. C4 Level 1 — System Context
text

┌─────────────────────────────────────────────────────────────────────┐
│                        HAVEN SYSTEM                                 │
│                                                                     │
│  ┌───────────────┐   ┌─────────────────┐   ┌───────────────────┐   │
│  │  Elder App    │   │ Family Dashboard│   │  Guardian Portal  │   │
│  │ (React Native)│   │   (Next.js 14)  │   │   (Next.js 14)    │   │
│  └──────┬────────┘   └────────┬────────┘   └────────┬──────────┘   │
│         │                     │                     │              │
│         └─────────────────────┼─────────────────────┘              │
│                               │                                     │
│                    ┌──────────▼──────────┐                         │
│                    │   Supabase Backend  │                         │
│                    │  (AWS eu-central-1) │                         │
│                    │  Postgres + pgvector│                         │
│                    │  PostGIS + pg_cron  │                         │
│                    │  Auth + Storage     │                         │
│                    │  Edge Functions     │                         │
│                    │  Realtime           │                         │
│                    └──────────┬──────────┘                         │
│                               │                                     │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
          ┌─────────────────────┼──────────────────────┐
          │                     │                      │
   ┌──────▼──────┐    ┌─────────▼──────┐    ┌─────────▼──────┐
   │  OpenAI     │    │  ElevenLabs    │    │  PSD2 / Tink   │
   │ Whisper STT │    │  TTS (nl-NL)   │    │ Banking (Ph.2) │
   │ Embeddings  │    │                │    │                │
   └─────────────┘    └────────────────┘    └────────────────┘
          │
   ┌──────▼──────┐    ┌─────────────────┐   ┌────────────────┐
   │Call Reputat.│    │ MedMij/PGO(Ph2) │   │  Push (FCM/    │
   │   Service   │    │  FHIR R4        │   │   APNs/Expo)   │
   └─────────────┘    └─────────────────┘   └────────────────┘
2. C4 Level 2 — Container Diagram
text

┌──────────────────────────────────────────────────────────────────────────────┐
│ HAVEN Platform                                                               │
│                                                                              │
│  ┌─────────────────────┐      ┌──────────────────────────────────────────┐  │
│  │    ELDER APP         │      │           SUPABASE BACKEND               │  │
│  │  React Native/Expo  │      │                                          │  │
│  │                     │      │  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  ScreenRenderer     │─────▶│  │  PostgREST   │  │  Supabase Auth   │  │  │
│  │  VoiceEngine        │      │  │  (REST API)  │  │  (JWT + RLS)     │  │  │
│  │  SchemaRegistry     │      │  └──────┬───────┘  └────────┬─────────┘  │  │
│  │  OfflineCache       │      │         │                   │            │  │
│  └──────────┬──────────┘      │  ┌──────▼───────────────────▼─────────┐  │  │
│             │                 │  │         PostgreSQL 15               │  │  │
│  ┌──────────▼──────────┐      │  │   pgvector | PostGIS | pg_cron     │  │  │
│  │   FAMILY DASHBOARD  │─────▶│  │   Row-Level Security on all tables │  │  │
│  │   Next.js 14        │      │  └──────────────┬───────────────────--┘  │  │
│  │   App Router        │      │                 │                        │  │
│  │   Supabase Realtime │      │  ┌──────────────▼──────────────────────┐  │  │
│  └─────────────────────┘      │  │        Edge Functions (Deno)        │  │  │
│                               │  │  fn-voice-pipeline                  │  │  │
│  ┌──────────────────────┐     │  │  fn-scam-pipeline                   │  │  │
│  │  GUARDIAN PORTAL     │────▶│  │  fn-medication-escalation           │  │  │
│  │  Next.js 14          │     │  │  fn-companion-memory                │  │  │
│  │  Role-scoped         │     │  │  fn-notification-dispatch           │  │  │
│  └──────────────────────┘     │  │  fn-transaction-alert (Phase 2)    │  │  │
│                               │  │  fn-weekly-digest                   │  │  │
│                               │  └─────────────────────────────────────┘  │  │
│                               │                                            │  │
│                               │  ┌─────────────────────────────────────┐  │  │
│                               │  │     Supabase Storage                │  │  │
│                               │  │  Voice recordings | Photos | Docs   │  │  │
│                               │  │  (AES-256, EU region)               │  │  │
│                               │  └─────────────────────────────────────┘  │  │
│                               └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
3. Voice Interaction Pipeline (Sequence)
text

Elder speaks
     │
     ▼
[React Native] — record audio (16kHz mono WAV)
     │
     ▼
[fn-voice-pipeline] Edge Function
     │
     ├──▶ OpenAI Whisper API (language: nl)
     │         └──▶ transcript (Dutch text)
     │
     ├──▶ Intent Classifier (pattern match + embedding similarity)
     │         └──▶ intent + entities
     │                   │
     │     ┌─────────────┴──────────────┐
     │     ▼                            ▼
     │  [Medication log]          [Task creation]
     │  [Wellness check-in]       [Story archive]
     │  [Crisis escalation]       [Companion query]
     │  [Navigation command]      [Scam report]
     │
     ├──▶ [Companion LLM] (if no structured intent)
     │         └──▶ response text (Dutch)
     │
     ├──▶ companion_memory upsert (embedding store)
     │
     └──▶ ElevenLabs TTS (nl-NL "Hanna" voice)
               └──▶ audio stream → elder device
4. Scam Detection Pipeline (Sequence)
text

Incoming call / message / link received
     │
     ▼
[fn-scam-pipeline] Edge Function
     │
     ├──▶ Layer 1: Phone/domain reputation lookup (cache-first)
     │         └──▶ reputation_score (0–100)
     │
     ├──▶ Layer 2: Pattern matching (known NL scam scripts)
     │         └──▶ pattern_match_score
     │
     ├──▶ Layer 3: NLP intent analysis (Dutch text)
     │         └──▶ urgency_score, authority_claim_score
     │
     ├──▶ Layer 4: Longitudinal contact risk (pgvector similarity to
     │              known scam event embeddings)
     │         └──▶ similarity_score
     │
     ├──▶ Composite score → alert_level
     │         Amber: 40–69 | Rood: 70–89 | Zwart: 90+
     │
     ├──▶ INSERT scam_events
     │
     ├──▶ [fn-notification-dispatch]
     │         └──▶ elder: calm voice alert ("Dit gesprek lijkt verdacht")
     │         └──▶ family: push notification (if rood/zwart)
     │
     └──▶ [Zwart only] → fn-transaction-alert (Phase 2)
5. Medication Escalation State Machine
text

SCHEDULED
     │
     ▼ (reminder time reached)
REMINDED ──── elder confirms ──────────────────────▶ TAKEN ──▶ done
     │
     │ (no response after 10 min)
     ▼
SNOOZED_1 ──── elder confirms ─────────────────────▶ TAKEN
     │
     │ (no response after 20 min)
     ▼
SNOOZED_2 ──── elder confirms ─────────────────────▶ TAKEN
     │
     │ (no response after 30 min)
     ▼
ESCALATED ──── family push notification sent
     │          "Mama heeft haar medicijnen nog niet genomen"
     │
     │ (elder confirms late) ─────────────────────▶ TAKEN_LATE
     │
     │ (no response after 60 min total)
     ▼
MISSED ──── daily summary updated
            weekly digest updated
6. Onboarding Flow
text

Family member registers via email magic link or OTP.

> ⚠️ **DigiD is explicitly out of scope for all phases until a dedicated ADR
> is written with legal basis + technical security review.**
> DigiD integration requires BSN (which HAVEN does not collect — ADR-008)
> and a formal agreement with Logius. Remove DigiD from all onboarding
> references until Phase 3+ legal review is complete.
     │
     ▼
Creates elder profile (name, DOB, language, timezone: Europe/Amsterdam)
     │
     ▼
Sets up medications (photo OCR or manual)
     │
     ▼
Defines safe zone (map picker → PostGIS point + radius)
     │
     ▼
Completes emergency medical profile (huisarts, allergies, conditions)
     │
     ▼
Sends elder app invite (SMS to elder's phone)
     │
     ▼
Elder opens app → voice-guided welcome ("Hallo, ik ben HAVEN")
     │
     ▼
Elder gives explicit consent (voice + tap confirmation)
     │
     ▼
Relationship activated (family_relationships.elder_consented = true)
     │
     ▼
Home screen rendered
Document 04 — API Contract
1. Authentication Model
HAVEN uses Supabase Auth (JWT) with three roles enforced at the database level via RLS.

1.1 Roles
Role	Description	Auth Method
elder	Primary app user	Magic link SMS (no password)
family	Family member / mantelzorger	Email + password (Phase 2)
carer	Professional zorgverlener	Email + password + organisation invite
admin	HAVEN platform admin	Email + password + TOTP mandatory
1.2 JWT Claims
Every JWT issued by Supabase Auth includes:

JSON

{
  "sub": "<uuid>",
  "role": "authenticated",
  "app_role": "family",
  "elder_id": "<uuid>",
  "org_id": "<uuid | null>",
  "iat": 1718000000,
  "exp": 1718086400
}
app_role is set via a Supabase Auth hook that reads from the profiles table on sign-in. elder_id is set for family and carer roles to the primary elder they are linked to.

1.3 Token Lifecycle
Token	Lifetime	Storage
Access token	1 hour	In-memory only (never localStorage, never AsyncStorage unencrypted)
Refresh token	30 days	iOS Keychain / Android Keystore via expo-secure-store
2. Edge Functions — Complete Inventory
All Edge Functions are deployed to supabase/functions/ and run in Deno on Supabase Edge Runtime (eu-central-1).

2.1 fn-voice-pipeline
Trigger: POST from elder app Auth: Bearer JWT (elder role required) Input:

TypeScript

{
  audio_base64: string;       // 16kHz mono WAV, max 30s
  screen_id: ScreenId;        // current screen context
  elder_id: string;           // UUID
}
Output:

TypeScript

{
  transcript: string;
  intent: IntentType;
  entities: Record<string, string>;
  response_text: string;
  audio_url: string;          // signed Supabase Storage URL, 5-min TTL
  action_taken: ActionType | null;
  distress_detected: boolean;
}
Side effects: INSERTs to voice_interactions; may INSERT to tasks, wellness_checkins, life_stories; may trigger fn-notification-dispatch if distress detected.

2.2 fn-scam-pipeline
Trigger: POST from elder app (call event or message event) or scheduled via pg_cron Auth: Bearer JWT (elder role) or service role (for scheduled jobs) Input:

TypeScript

{
  elder_id: string;
  channel: 'phone' | 'sms' | 'whatsapp' | 'email' | 'web';
  signal_reference: string;   // phone number (hashed) or URL or message snippet hash
  raw_content_hash: string;   // SHA-256 of raw content — content itself not stored
  contact_id?: string;        // UUID if known contact
}
Output:

TypeScript

{
  scam_event_id: string;
  alert_level: 'none' | 'amber' | 'rood' | 'zwart';
  composite_score: number;    // 0–100
  layer_scores: {
    reputation: number;
    pattern: number;
    nlp_intent: number;
    longitudinal: number;
  };
  explanation_nl: string;     // Dutch plain-language explanation for elder
  family_notified: boolean;
}
2.3 fn-medication-escalation
Trigger: pg_cron every 10 minutes Auth: Service role Logic: Queries medication_reminders where status IN ('reminded', 'snoozed_1', 'snoozed_2') and scheduled_time < now() - escalation_threshold. Updates status, dispatches notifications. Output: No HTTP response (scheduled job); side effects only.

2.4 fn-companion-memory
Trigger: Called internally by fn-voice-pipeline Auth: Service role Input:

TypeScript

{
  elder_id: string;
  interaction_id: string;
  memory_type: 'personal_fact' | 'preference' | 'recurring_event' | 'life_event' | 'emotional_state' | 'medical_context';
  content: string;
  source_interaction_id?: string;
  source_story_id?: string;
}
Logic: Generates embedding via OpenAI → upserts to companion_memory (deduplication via cosine similarity threshold 0.97).

2.5 fn-notification-dispatch
Trigger: Called by other Edge Functions Auth: Service role Input:

TypeScript

{
  recipient_id: string;
  recipient_role: 'elder' | 'family' | 'carer';
  notification_type: NotificationType;
  title_nl: string;
  body_nl: string;
  data?: Record<string, string>;
  priority: 'normal' | 'high';
}
Logic: Looks up push_tokens for recipient → dispatches via Expo Push API (which routes to APNs/FCM). INSERTs to notifications table.

2.6 fn-weekly-digest
Trigger: pg_cron every Monday 08:00 Europe/Amsterdam Auth: Service role Logic: Aggregates prior 7 days of scam_events, medication_reminders, wellness_checkins, voice_interactions per elder → INSERTs to safety_digests → dispatches push/email to linked family members.

2.7 fn-transaction-alert (Phase 2)
Trigger: Webhook from PSD2/Tink on new transaction Auth: Tink webhook signature verification (HMAC-SHA256) Input: Tink transaction payload (normalised) Logic: Runs anomaly scoring → if score > threshold, INSERTs financial_transactions with flagged = true, warning_dispatched = true, creates linked scam_event, dispatches fn-notification-dispatch at zwart level (triggering urgent push/SMS warnings with deep-linking to the bank app for transaction cancellation/review).

2.8 fn-location-event
Trigger: POST from elder app (background location update) Auth: Bearer JWT (elder role) Input:

TypeScript

{
  elder_id: string;
  latitude: number;
  longitude: number;
  accuracy_metres: number;
  timestamp: string;          // ISO 8601
}
Logic:

Apply 100m fuzzy noise before storage
Check against elder_profiles.safe_zone_centre + safe_zone_radius_metres
If outside safe zone (safe-zone exit): INSERT location_events with precise geometry (and fuzzed geometry), setting auto_delete_at = now() + 24 hours (canonical TTL).

2.9 fn-buurt-discover
Trigger: POST from elder app
Auth: Bearer JWT (elder role)
Input:
```typescript
interface BuurtDiscoverInput {
  elder_id: string;
}
```
Output:
```typescript
interface BuurtDiscoverOutput {
  nearby_haven_users_count: number;       // e.g. 3 — NEVER identities
  shared_interest_matches: Array<{
    tag_key: string;
    label_nl: string;
    nearby_count: number;                 // e.g. "2 mensen houden ook van tuinieren"
  }>;
  suggested_events: Array<{
    id: string;
    title_nl: string;
    location_label_nl: string;
    distance_label_nl: string;
    event_date: string;
    is_free: boolean;
    interested_count: number;             // how many other HAVEN users marked interest
  }>;
  walk_buddy_available: boolean;          // is there someone seeking a walk buddy nearby?
}
```
Privacy rule: this function MUST query using PC4 matching only. It MUST NOT return `elder_id`, `profile_id`, or any identifier of another elder under any circumstances.

2.10 fn-buurt-match
Trigger: POST from elder app
Auth: Bearer JWT (elder role)
Input:
```typescript
interface BuurtMatchInput {
  action:
    | 'send_request'
    | 'accept_request'
    | 'decline_request'
    | 'withdraw_request'
    | 'end_connection';
  connection_id?: string;         // required for all actions except 'send_request'
  shared_tag_ids?: string[];      // required for 'send_request'
  is_walk_buddy?: boolean;
}
```
Output:
```typescript
interface BuurtMatchOutput {
  success: boolean;
  new_status: ConnectionStatus;
  message_nl: string;             // e.g. "Uw verzoek is verstuurd."
}
```
Privacy rule: when `action = 'send_request'`, the function selects a matching recipient using PC4 + shared tags — **it does NOT expose the recipient's ID to the initiator** until `status = 'accepted'` by both parties.

2.11 fn-buurt-events-ingest
Trigger: POST (scheduled / admin)
Auth: Service role only
Input:
```typescript
interface EventIngestInput {
  events: Array<{
    postcode_pc4: string;
    location_label_nl: string;
    distance_label_nl: string;
    title_nl: string;
    description_nl?: string;
    event_date: string;           // ISO date
    event_time?: string;          // HH:MM
    is_free: boolean;
    relevant_tag_keys: string[];  // maps to tag_ids on insert
    source: string;
    source_url?: string;
  }>;
}
```

3. PostgREST (Auto-generated REST API)
Supabase exposes all tables via PostgREST. Access is governed entirely by RLS policies (defined in Document 05). No table is accessible without a valid JWT and a matching RLS policy.

Key conventions:

All list endpoints use ?limit=50&offset=0 pagination by default
Soft-deleted rows (deleted_at IS NOT NULL) are filtered by RLS policy — callers never see them
Timestamps are always UTC ISO 8601; UI converts to Europe/Amsterdam for display
4. Real-time Subscriptions
The family dashboard and elder app use Supabase Realtime for live updates.

Channel	Table	Filter	Used By
scam-alerts	scam_events	elder_id = :id AND alert_level IN ('rood','zwart')	Family dashboard
medication-status	medication_reminders	elder_id = :id	Family dashboard
family-messages	family_messages	elder_id = :id	Elder app + family dashboard
notifications	notifications	recipient_id = :id	Both apps
location-events	location_events	elder_id = :id AND event_type = 'safe_zone_exit'	Family dashboard
All channels are authenticated — Supabase Realtime validates the JWT before subscribing and RLS applies to the underlying data.

Document 05 — Database Specification

---
## 🔴 CANONICAL FIELD NAME REFERENCE — v1.1.1
This table is the authoritative source for every column name in HAVEN.
If any addendum, Edge Function spec, or seed file conflicts with this table,
this table wins. Update the addendum — never this table without a version bump.
Last reconciled: 2026-06-10

| Table                  | Canonical field name       | NOT (old/wrong name)     |
|------------------------|---------------------------|--------------------------|
| elder_profiles         | elder_id                  | profile_id               |
| family_relationships   | family_member_id          | family_user_id           |
| family_relationships   | can_view_medications      | can_view_meds            |
| family_relationships   | can_view_location_events  | can_view_location        |
| family_relationships   | can_view_safety           | can_view_alerts          |
| family_relationships   | can_view_voice            | (correct — no change)    |
| family_relationships   | can_view_health           | can_view_wellness        |
| family_relationships   | can_view_stories          | can_view_stories ✅      |
| family_relationships   | can_view_financials       | can_view_financials ✅   |
| family_relationships   | is_active                 | active                   |
| carer_relationships    | carer_member_id           | carer_id / carer_user_id |
| carer_relationships    | is_active                 | active                   |
| medications            | name_nl                   | name / medication_name   |
| medications            | dose_description_nl       | dosage                   |
| medications            | frequency                 | frequency ✅             |
| medications            | schedule_times            | schedule_times ✅        |
| medications            | is_active                 | active                   |
| companion_memory       | memory_type (see Patch 3) | type / kind              |
| companion_memory       | content_nl                | content / text           |
| companion_memory       | importance_score          | importance               |
| voice_interactions     | deleted_at                | (previously missing — added v1.2.1) |
| push_tokens            | profile_id                | user_id                  |
| push_tokens            | is_active                 | active                   |
| medication_reminders   | scheduled_time            | scheduled_for            |
| medication_reminders   | status (reminder_status)  | 'pending' (use Dutch enum values) |
| perf_metrics           | (new table — v1.2.1)      | replaces CloudWatch SLO measurement |
---

1. Principles
All tables have UUID primary keys (gen_random_uuid())
All tables have created_at TIMESTAMPTZ DEFAULT NOW() and updated_at TIMESTAMPTZ DEFAULT NOW()
All tables support soft delete via deleted_at TIMESTAMPTZ
RLS enabled on every table with explicit FORCE ROW LEVEL SECURITY
updated_at maintained via moddatetime trigger on all tables
All migrations are versioned SQL files in supabase/migrations/
Migration naming: YYYYMMDDHHMMSS_description.sql
2. Extensions
SQL

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "moddatetime";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy text search on Dutch names
3. Enums
SQL

CREATE TYPE user_role AS ENUM ('elder', 'family', 'carer', 'admin');

CREATE TYPE alert_level AS ENUM ('none', 'amber', 'rood', 'zwart');

CREATE TYPE scam_channel AS ENUM (
  'phone', 'sms', 'whatsapp', 'email', 'web', 'in_person', 'post'
);

CREATE TYPE scam_threat_type AS ENUM (
  'bankhelpdeskfraude',
  'vriend_in_nood',
  'overheid_impersonatie',
  'romantische_fraude',
  'investeringsfraude',
  'pakketfraude',
  'phishing',
  'andere'
);

CREATE TYPE medication_frequency AS ENUM (
  'dagelijks', 'tweemaal_daags', 'driemaal_daags',
  'wekelijks', 'maandelijks', 'zo_nodig', 'andere'
);

CREATE TYPE reminder_status AS ENUM (
  'gepland', 'herinnerd', 'gesnoozed_1', 'gesnoozed_2',
  'geëscaleerd', 'ingenomen', 'laat_ingenomen', 'gemist', 'overgeslagen'
);

CREATE TYPE relationship_type AS ENUM (
  'kind', 'partner', 'kleinzind', 'broer_zus', 'vriend', 'buur', 'andere'
);

CREATE TYPE carer_role AS ENUM (
  'thuiszorgmedewerker', 'wijkverpleegkundige',
  'huisarts', 'specialist', 'andere'
);

CREATE TYPE notification_type AS ENUM (
  'medicijn_herinnering', 'medicijn_gemist', 'scam_amber',
  'scam_rood', 'scam_zwart', 'veilige_zone_verlaten',
  'crisis_gedetecteerd', 'familiebericht', 'welzijnscheck',
  'wekelijks_overzicht', 'systeem'
);



CREATE TYPE story_status AS ENUM ('opname', 'transcriberen', 'gereed', 'gearchiveerd');

CREATE TYPE cognitive_trend AS ENUM ('stabiel', 'verbeterend', 'verslechterend', 'onbekend');

-- ============================================================
-- connection_status enum (BUURT — De Buurtverbinder)
-- Added in v1.2.1 (was missing from original enum list)
-- ============================================================
CREATE TYPE connection_status AS ENUM (
  'pending_initiator',
  -- Initiator has sent a request; no notification sent to recipient yet.
  -- Held briefly while system confirms a valid PC4 match exists.

  'pending_recipient',
  -- Recipient has been notified (push + in-app).
  -- Awaiting their accept/decline response.

  'accepted',
  -- Both parties have accepted. First names are now visible to each other.
  -- A family member with permission can see this connection exists.

  'declined',
  -- Recipient declined. Initiator is informed with neutral language.
  -- Record kept for 12 months (de-duplication: same pair not re-matched for 90 days).

  'withdrawn',
  -- Initiator withdrew before recipient responded.
  -- Record kept for 30 days then hard-deleted.

  'ended'
  -- Either party ended an accepted connection.
  -- Record soft-deleted; counts purged from proximity stats within 48h.
);

COMMENT ON TYPE connection_status IS
  'State machine for BUURT neighbourhood connection lifecycle. '
  'Transitions are managed exclusively by fn-buurt-match (service role). '
  'No client-side writes permitted.';
4. Core Identity Tables
4.1 profiles
SQL

CREATE TABLE profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role                  user_role NOT NULL,
  full_name             TEXT NOT NULL,
  preferred_name        TEXT,                            -- "Oma Lies" / "Cor"
  phone_nl              TEXT,                            -- Dutch format: +31 6 ...
  locale                TEXT NOT NULL DEFAULT 'nl-NL',
  timezone              TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
  country_code          CHAR(2) NOT NULL DEFAULT 'NL',
  high_contrast         BOOLEAN NOT NULL DEFAULT FALSE,
  font_size_multiplier  DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  voice_id              TEXT,                            -- ElevenLabs voice ID
  onboarding_complete   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

-- Trigger: updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
4.2 elder_profiles
SQL

CREATE TABLE elder_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id              uuid UNIQUE NOT NULL
                          REFERENCES profiles(id) ON DELETE CASCADE,
  -- Safe zone (PostGIS)
  safe_zone_centre      geography(POINT, 4326),
  safe_zone_radius_m    integer DEFAULT 500,
  safe_zone_label_nl    text,
  -- Night safety
  night_mode_start      time DEFAULT '22:00',
  night_mode_end        time DEFAULT '08:00',
  night_mode_active     boolean DEFAULT false,
  -- Cognitive support
  cognitive_support     boolean DEFAULT false,
  bereavement_active    boolean DEFAULT false,
  bereavement_since     date,
  -- Emergency
  emergency_contacts    jsonb DEFAULT '[]',
  medical_summary_nl    text,
  -- Accessibility prefs (mirrors profiles but elder-specific overrides)
  font_scale            numeric(3,2) DEFAULT 1.0,
  high_contrast         boolean DEFAULT false,
  -- Timestamps
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  deleted_at            timestamptz
);

-- elder_profiles
ALTER TABLE elder_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE elder_profiles FORCE ROW LEVEL SECURITY;
4.3 family_relationships
SQL

CREATE TABLE family_relationships (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id                  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  family_member_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relation_label_nl         text,                    -- "dochter", "zoon", "partner"
  is_primary                boolean DEFAULT false,
  -- Consent (set by elder, never by family member)
  elder_consented           boolean DEFAULT false,
  elder_consented_at        timestamptz,
  is_active                 boolean DEFAULT true,
  -- Granular view permissions (all false until elder explicitly grants)
  can_view_medications      boolean DEFAULT false,
  can_view_messages         boolean DEFAULT false,
  can_view_location_events  boolean DEFAULT false,
  can_view_stories          boolean DEFAULT false,
  can_view_financials       boolean DEFAULT false,
  can_view_voice            boolean DEFAULT false,   -- ✅ canonical
  can_view_health           boolean DEFAULT false,   -- ✅ canonical
  can_view_safety           boolean DEFAULT false,   -- ✅ canonical
  -- Alert subscriptions
  notify_on_scam              boolean DEFAULT true,  -- ✅ canonical
  notify_on_missed_medication boolean DEFAULT true,  -- ✅ canonical
  notify_on_safe_zone_exit    boolean DEFAULT true,  -- ✅ canonical
  notify_on_weekly_digest     boolean DEFAULT true,  -- ✅ canonical
  -- Timestamps
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now(),
  deleted_at                timestamptz,
  UNIQUE (elder_id, family_member_id)
);

-- family_relationships
ALTER TABLE family_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_relationships FORCE ROW LEVEL SECURITY;
4.4 carer_relationships
SQL

CREATE TABLE carer_relationships (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  carer_member_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organisation_nl   text,
  role_label_nl     text,          -- "wijkverpleegkundige", "verzorgende IG"
  elder_consented   boolean DEFAULT false,
  elder_consented_at timestamptz,
  is_active         boolean DEFAULT true,
  -- Permissions (more restricted than family by default)
  can_view_medications     boolean DEFAULT false,
  can_view_visit_logs      boolean DEFAULT true,
  can_create_visit_logs    boolean DEFAULT true,
  can_file_incidents       boolean DEFAULT false,
  -- Timestamps
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  deleted_at        timestamptz,
  UNIQUE (elder_id, carer_member_id)
);

-- carer_relationships
ALTER TABLE carer_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE carer_relationships FORCE ROW LEVEL SECURITY;
5. SCHILD Tables
5.1 scam_events
SQL

CREATE TABLE scam_events (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id                  UUID NOT NULL REFERENCES profiles(id),
  contact_id                UUID REFERENCES contacts(id),
  channel                   scam_channel NOT NULL,
  signal_reference_hashed   TEXT NOT NULL,               -- SHA-256 hashed phone/URL
  raw_content_hash          TEXT NOT NULL,               -- SHA-256 of raw content
  threat_types              scam_threat_type[],
  alert_level               alert_level NOT NULL DEFAULT 'none',

  -- Pipeline scores (0–100)
  score_composite           SMALLINT NOT NULL DEFAULT 0 CHECK (score_composite BETWEEN 0 AND 100),
  score_reputation          SMALLINT CHECK (score_reputation BETWEEN 0 AND 100),
  score_pattern             SMALLINT CHECK (score_pattern BETWEEN 0 AND 100),
  score_nlp_intent          SMALLINT CHECK (score_nlp_intent BETWEEN 0 AND 100),
  score_longitudinal        SMALLINT CHECK (score_longitudinal BETWEEN 0 AND 100),

  explanation_nl            TEXT NOT NULL,               -- Dutch plain language
  embedding                 VECTOR(1536),                -- for similarity search

  elder_dismissed           BOOLEAN NOT NULL DEFAULT FALSE,
  elder_dismissed_at        TIMESTAMPTZ,
  family_notified           BOOLEAN NOT NULL DEFAULT FALSE,
  family_notified_at        TIMESTAMPTZ,

  -- Transaction linkage (Phase 2)
  linked_transaction_id     UUID REFERENCES financial_transactions(id),
  transaction_flagged       BOOLEAN DEFAULT FALSE,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ
);

-- scam_events
ALTER TABLE scam_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scam_events FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_scam_events_elder_id ON scam_events(elder_id);
CREATE INDEX idx_scam_events_alert_level ON scam_events(alert_level);
CREATE INDEX idx_scam_events_created_at ON scam_events(created_at DESC);
CREATE INDEX idx_scam_events_embedding ON scam_events USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
5.2 contacts
SQL

CREATE TABLE contacts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id                  UUID NOT NULL REFERENCES profiles(id),
  display_name              TEXT NOT NULL,
  phone_hashed              TEXT,
  email_hashed              TEXT,
  relationship_label        TEXT,
  is_trusted                BOOLEAN NOT NULL DEFAULT FALSE,
  interaction_count         INT NOT NULL DEFAULT 0,
  last_interaction_at       TIMESTAMPTZ,
  grooming_risk_score       SMALLINT DEFAULT 0 CHECK (grooming_risk_score BETWEEN 0 AND 100),
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ
);

-- contacts
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
5.3 phone_reputation_cache
SQL

CREATE TABLE phone_reputation_cache (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hashed      TEXT NOT NULL UNIQUE,
  reputation_score  SMALLINT NOT NULL CHECK (reputation_score BETWEEN 0 AND 100),
  source            TEXT NOT NULL,
  report_count      INT DEFAULT 0,
  cached_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
);

-- No RLS needed — this is non-personal reputation data
-- pg_cron cleanup: DELETE FROM phone_reputation_cache WHERE expires_at < NOW();
5.4 documents
SQL

CREATE TABLE documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id              UUID NOT NULL REFERENCES profiles(id),
  label_nl              TEXT NOT NULL,                  
  -- Document Vault — permitted document types (label_nl examples):
  -- ✅ 'Zorgverzekeringspolis'      -- health insurance policy
  -- ✅ 'Medicijnoverzicht'          -- medication summary (printed, no BSN)
  -- ✅ 'Testament'                  -- will / legacy document
  -- ✅ 'Nutsbedrijf contract'       -- utility contract
  -- ✅ 'Hypotheekdocument'          -- mortgage document
  -- ✅ 'Huisartsbericht'            -- GP letter (no BSN — see BSN hard rule)
  -- ✅ 'Vollmacht'                  -- power of attorney
  -- ❌ 'DigiD kaart'                -- NOT PERMITTED (DigiD out of scope)
  -- ❌ 'Paspoort met BSN'           -- NOT PERMITTED (BSN hard rule ADR-008)
  -- ❌ 'BSN kaart'                  -- NOT PERMITTED (BSN hard rule ADR-008)
  --
  -- UI rule: vault upload screen must show this warning:
  -- "Upload geen documenten met uw BSN-nummer.
  --  Maak het BSN onleesbaar voordat u het document uploadt."
  document_type         TEXT NOT NULL,
  storage_path          TEXT NOT NULL,                  -- Supabase Storage path
  summary_nl            TEXT,                           -- AI-generated Dutch summary
  is_sensitive_legal    BOOLEAN NOT NULL DEFAULT FALSE, -- 48h cooling-off for deletions
  in_emergency_profile  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
5.5 financial_transactions (Phase 2)
SQL

CREATE TABLE financial_transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id                UUID NOT NULL REFERENCES profiles(id),
  account_id_masked       TEXT NOT NULL,               -- last 4 digits only
  bank_name               TEXT,                        -- ING, Rabobank, ABN AMRO, etc.
  amount_cents            BIGINT NOT NULL,
  currency                CHAR(3) NOT NULL DEFAULT 'EUR',
  counterparty_name       TEXT,
  counterparty_iban_masked TEXT,
  description             TEXT,
  transaction_date        DATE NOT NULL,
  anomaly_score           SMALLINT DEFAULT 0,
  flagged                 BOOLEAN NOT NULL DEFAULT FALSE,
  linked_scam_event_id    UUID REFERENCES scam_events(id),
  warning_dispatched      BOOLEAN DEFAULT FALSE,
  elder_reviewed          BOOLEAN DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);

-- financial_transactions
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions FORCE ROW LEVEL SECURITY;
5.6 safety_digests
SQL

CREATE TABLE safety_digests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id                UUID NOT NULL REFERENCES profiles(id),
  week_starting           DATE NOT NULL,
  scam_events_count       INT NOT NULL DEFAULT 0,
  amber_count             INT NOT NULL DEFAULT 0,
  rood_count              INT NOT NULL DEFAULT 0,
  zwart_count             INT NOT NULL DEFAULT 0,
  medications_taken_pct   DECIMAL(5,2),
  wellness_avg_score      DECIMAL(5,2),
  family_interactions     INT NOT NULL DEFAULT 0,
  summary_nl              TEXT,
  sent_at                 TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(elder_id, week_starting)
);

-- safety_digests
ALTER TABLE safety_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_digests FORCE ROW LEVEL SECURITY;
6. ANKER Tables
6.1 medications
SQL

CREATE TABLE medications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id              uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Identity
  name_nl               text NOT NULL,              -- "Metformine"
  brand_name_nl         text,                       -- "Glucophage"
  dose_description_nl   text NOT NULL,              -- "500mg per tablet"
  frequency             medication_frequency NOT NULL,
  schedule_times        time[] NOT NULL,            -- e.g. {08:00, 18:00}
  -- Instructions
  instructions_nl       text,                       -- "Met voedsel innemen"
  with_food             boolean DEFAULT false,
  -- Refill
  current_stock         integer,
  refill_threshold      integer,
  refill_pharmacy_nl    text,
  -- Provenance
  ocr_source_path       text,                       -- Storage path of original photo
  prescribed_by_nl      text,                       -- GP/specialist name (free text)
  -- Status
  is_active             boolean DEFAULT true,
  start_date            date,
  end_date              date,
  -- Timestamps
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  deleted_at            timestamptz
);

-- medications
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications FORCE ROW LEVEL SECURITY;
6.2 medication_reminders
SQL

CREATE TABLE medication_reminders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id         UUID NOT NULL REFERENCES medications(id),
  elder_id              UUID NOT NULL REFERENCES profiles(id),
  scheduled_time        TIMESTAMPTZ NOT NULL,
  status                reminder_status NOT NULL DEFAULT 'gepland',
  snooze_count          SMALLINT NOT NULL DEFAULT 0,
  first_reminded_at     TIMESTAMPTZ,
  confirmed_at          TIMESTAMPTZ,
  escalated_at          TIMESTAMPTZ,
  family_notified_at    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- medication_reminders
ALTER TABLE medication_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_reminders FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_med_reminders_elder_scheduled
  ON medication_reminders(elder_id, scheduled_time DESC);
CREATE INDEX idx_med_reminders_status
  ON medication_reminders(status) WHERE status NOT IN ('ingenomen', 'overgeslagen');
6.3 tasks
SQL

CREATE TABLE tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id              UUID NOT NULL REFERENCES profiles(id),
  created_by_role       user_role NOT NULL DEFAULT 'elder',
  title_nl              TEXT NOT NULL,
  notes_nl              TEXT,
  due_date              DATE,
  due_time              TIME,
  completed             BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at          TIMESTAMPTZ,
  voice_created         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
6.4 wellness_checkins
SQL

CREATE TABLE wellness_checkins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id        UUID NOT NULL REFERENCES profiles(id),
  mood_score      SMALLINT CHECK (mood_score BETWEEN 1 AND 5),
  energy_score    SMALLINT CHECK (energy_score BETWEEN 1 AND 5),
  pain_score      SMALLINT CHECK (pain_score BETWEEN 1 AND 5),
  notes_nl        TEXT,
  voice_note_path TEXT,
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- wellness_checkins
ALTER TABLE wellness_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE wellness_checkins FORCE ROW LEVEL SECURITY;
7. KRING Tables
7.1 family_messages
SQL

CREATE TABLE family_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id            UUID NOT NULL REFERENCES profiles(id),
  sender_id           UUID NOT NULL REFERENCES profiles(id),
  sender_role         user_role NOT NULL,
  message_type        TEXT NOT NULL CHECK (message_type IN (
                        'tekst', 'voice_note', 'foto', 'video_hallo', 'tekening'
                      )),
  content_nl          TEXT,
  storage_path        TEXT,
  duration_seconds    INT,
  read_by_elder       BOOLEAN NOT NULL DEFAULT FALSE,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

-- family_messages
ALTER TABLE family_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_messages FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_family_messages_elder_created
  ON family_messages(elder_id, created_at DESC);
7.2 life_stories
SQL

CREATE TABLE life_stories (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id              UUID NOT NULL REFERENCES profiles(id),
  prompt_id             UUID REFERENCES life_story_prompts(id),
  title_nl              TEXT,
  recording_path        TEXT,
  transcript_nl         TEXT,
  duration_seconds      INT,
  status                story_status NOT NULL DEFAULT 'opname',
  embedding             VECTOR(1536),
  keepsake_book_include BOOLEAN NOT NULL DEFAULT FALSE,
  year_approximate      INT,
  location_nl           TEXT,                          -- "Groningen, 1962"
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- life_stories
ALTER TABLE life_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_stories FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_life_stories_embedding ON life_stories
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
7.3 life_story_prompts
SQL

CREATE TABLE life_story_prompts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_nl     TEXT NOT NULL,
  category_nl   TEXT NOT NULL,  -- "Jeugd", "Werk", "Familie", "Liefde", "Herinneringen"
  sort_order    INT NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Seed data (examples):
-- "Vertel me over je eerste dag op het werk"
-- "Wat was je favoriete plek als kind?"
-- "Hoe ontmoette jij je partner?"
7.4 memory_lane_photos
SQL

CREATE TABLE memory_lane_photos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id              UUID NOT NULL REFERENCES profiles(id),
  uploaded_by_id        UUID NOT NULL REFERENCES profiles(id),
  storage_path          TEXT NOT NULL,
  caption_nl            TEXT,
  year_approximate      INT,
  date_taken            DATE,
  location_nl           TEXT,
  is_memorial           BOOLEAN NOT NULL DEFAULT FALSE,
  surface_on_anniversary BOOLEAN NOT NULL DEFAULT FALSE,
  anniversary_date      DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- memory_lane_photos
ALTER TABLE memory_lane_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_lane_photos FORCE ROW LEVEL SECURITY;

7.5 interest_tags
SQL

CREATE TABLE interest_tags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_key       text UNIQUE NOT NULL,   -- e.g. 'tuinieren'
  label_nl      text NOT NULL,          -- e.g. '🌿 Tuinieren'
  category_nl   text,                   -- e.g. 'Buiten', 'Cultuur', 'Beweging'
  is_active     boolean DEFAULT true,
  sort_order    integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- Seed: initial Dutch interest tag catalogue
INSERT INTO interest_tags (tag_key, label_nl, category_nl, sort_order) VALUES
  ('tuinieren',     '🌿 Tuinieren',        'Buiten',    1),
  ('wandelen',      '🚶 Wandelen',          'Beweging',  2),
  ('lezen',         '📖 Lezen',             'Cultuur',   3),
  ('muziek',        '🎵 Muziek',            'Cultuur',   4),
  ('schaken',       '♟️ Schaken',           'Spel',      5),
  ('kaarten',       '🃏 Kaartspelen',       'Spel',      6),
  ('koken',         '🍳 Koken',             'Thuis',     7),
  ('handwerken',    '🧶 Handwerken',        'Thuis',     8),
  ('vogels',        '🐦 Vogels kijken',     'Buiten',    9),
  ('fietsen',       '🚲 Fietsen',           'Beweging',  10),
  ('geschiedenis',  '📜 Geschiedenis',      'Cultuur',   11),
  ('film',          '🎬 Film & TV',         'Cultuur',   12),
  ('religie',       '🙏 Geloof & bezinning','Welzijn',   13),
  ('kleinkinderen', '👶 Kleinkinderen',     'Familie',   14),
  ('vrijwillig',    '🤝 Vrijwilligerswerk', 'Sociaal',   15);

7.6 neighbourhood_profiles
SQL

CREATE TABLE neighbourhood_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id            uuid UNIQUE NOT NULL
                        REFERENCES profiles(id) ON DELETE CASCADE,
  -- Declared neighbourhood (PC4 level — NOT precise location)
  postcode_pc4        char(4) NOT NULL,         -- e.g. '1234' (4-digit NL postcode)
  neighbourhood_label text,                     -- e.g. 'De Pijp, Amsterdam' (display only)
  -- Discovery radius preference
  radius_km           integer DEFAULT 2
                        CHECK (radius_km BETWEEN 1 AND 5),
  -- Opt-in status
  is_active           boolean DEFAULT false,    -- elder must explicitly opt in
  opted_in_at         timestamptz,
  opted_out_at        timestamptz,
  -- Walk buddy preference
  walk_buddy_seeking  boolean DEFAULT false,
  walk_preferred_time text,                     -- 'ochtend' | 'middag' | 'beide'
  -- Family visibility (elder controls)
  family_can_see_connections boolean DEFAULT false,
  -- Timestamps
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  deleted_at          timestamptz,
  -- CONSTRAINT: no precise location stored here
  CONSTRAINT no_precise_location CHECK (length(postcode_pc4) = 4)
);

COMMENT ON COLUMN neighbourhood_profiles.postcode_pc4
  IS 'PC4 (4-digit postcode) only. Never store full postcode (PC6) or GPS coords in this table.';

7.7 elder_interest_tags
SQL

CREATE TABLE elder_interest_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES interest_tags(id),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (elder_id, tag_id)
);

-- Enforce max 5 tags per elder via trigger
CREATE OR REPLACE FUNCTION enforce_max_interest_tags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT count(*) FROM elder_interest_tags
    WHERE elder_id = NEW.elder_id
  ) >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 interesse-tags per oudere toegestaan.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_max_interest_tags
  BEFORE INSERT ON elder_interest_tags
  FOR EACH ROW EXECUTE FUNCTION enforce_max_interest_tags();

7.8 neighbourhood_connections
SQL

CREATE TABLE neighbourhood_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_elder_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_elder_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status                connection_status DEFAULT 'pending_initiator',
  -- Anonymous matching basis (what triggered this suggestion)
  shared_tag_ids        uuid[],                  -- which tags matched
  -- Mutual consent timestamps
  initiator_accepted_at timestamptz,
  recipient_accepted_at timestamptz,
  -- Identity reveal (only after both_accepted_at is populated)
  -- Names/details are NOT stored here; they are fetched from profiles on demand
  -- Walk buddy specific
  is_walk_buddy_match   boolean DEFAULT false,
  -- Ended reason (for internal analysis only, not shown to users)
  ended_by              uuid,                    -- references profiles(id)
  ended_reason_internal text,
  -- Timestamps
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  CONSTRAINT no_self_connection CHECK (initiator_elder_id != recipient_elder_id),
  UNIQUE (initiator_elder_id, recipient_elder_id)
);

7.9 neighbourhood_events
SQL

CREATE TABLE neighbourhood_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Location (PC4 level only)
  postcode_pc4      char(4) NOT NULL,
  location_label_nl text NOT NULL,        -- "Bibliotheek De Pijp"
  distance_label_nl text,                 -- "600m van uw huis"
  -- Event details (Dutch)
  title_nl          text NOT NULL,
  description_nl    text,
  event_date        date NOT NULL,
  event_time        time,
  is_free           boolean DEFAULT true,
  -- Matching
  relevant_tag_ids  uuid[],               -- which interest tags this event suits
  -- Source
  source            text DEFAULT 'manual',-- 'manual' | 'opendata' | 'bibliotheek_api'
  source_url        text,
  -- Status
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  expires_at        timestamptz           -- auto-expires after event_date
);

-- Auto-expire events after they pass
SELECT cron.schedule(
  'expire-neighbourhood-events',
  '0 5 * * *',
  $$
    UPDATE neighbourhood_events
    SET is_active = false
    WHERE event_date < CURRENT_DATE
      AND is_active = true;
  $$
);

7.10 event_interests
SQL

CREATE TABLE event_interests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES neighbourhood_events(id) ON DELETE CASCADE,
  interested_at timestamptz DEFAULT now(),
  UNIQUE (elder_id, event_id)
);

-- Indexes and constraints for BUURT
CREATE INDEX idx_nbhd_profile_pc4 ON neighbourhood_profiles(postcode_pc4)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX idx_nbhd_profile_elder ON neighbourhood_profiles(elder_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_elder_tags_elder ON elder_interest_tags(elder_id);
CREATE INDEX idx_elder_tags_tag ON elder_interest_tags(tag_id);

CREATE INDEX idx_nbhd_conn_initiator ON neighbourhood_connections(initiator_elder_id);
CREATE INDEX idx_nbhd_conn_recipient ON neighbourhood_connections(recipient_elder_id);
CREATE INDEX idx_nbhd_conn_status ON neighbourhood_connections(status)
  WHERE status IN ('pending_recipient', 'accepted');

CREATE INDEX idx_nbhd_events_pc4 ON neighbourhood_events(postcode_pc4)
  WHERE is_active = true;
CREATE INDEX idx_nbhd_events_date ON neighbourhood_events(event_date)
  WHERE is_active = true;

CREATE INDEX idx_event_interests_elder ON event_interests(elder_id);

8. KOMPAS Tables
8.1 location_events
SQL

CREATE TABLE location_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id              UUID NOT NULL REFERENCES profiles(id),
  event_type            TEXT NOT NULL CHECK (event_type IN (
                          'veilige_zone_verlaten', 'veilige_zone_teruggekeerd',
                          'check_in', 'nacht_beweging'
                        )),
  location_fuzzed       GEOMETRY(POINT, 4326) NOT NULL,  -- always stored fuzzed
  location_precise      GEOMETRY(POINT, 4326),           -- only for safe_zone_exit, 24h TTL
  accuracy_metres       INT,
  family_notified       BOOLEAN NOT NULL DEFAULT FALSE,
  check_in_prompted     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_delete_at        TIMESTAMPTZ                      -- set to NOW()+24h for precise events
);

-- location_events
ALTER TABLE location_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_events FORCE ROW LEVEL SECURITY;

-- pg_cron: precise location auto-delete
-- SELECT cron.schedule('location-precise-cleanup', '*/30 * * * *',
--   $$UPDATE location_events SET location_precise = NULL
--     WHERE auto_delete_at < NOW() AND location_precise IS NOT NULL$$);
8.2 cognitive_checkins
SQL

CREATE TABLE cognitive_checkins (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id                UUID NOT NULL REFERENCES profiles(id),
  question_nl             TEXT NOT NULL,
  answer_nl               TEXT,
  expected_answer_nl      TEXT,
  correct                 BOOLEAN,
  confidence_score        DECIMAL(4,3),
  rolling_score_7d        DECIMAL(4,3),
  significant_change      BOOLEAN NOT NULL DEFAULT FALSE,
  checked_in_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- cognitive_checkins
ALTER TABLE cognitive_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_checkins FORCE ROW LEVEL SECURITY;
9. STEM Tables
9.1 voice_interactions
SQL

CREATE TABLE voice_interactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id              UUID NOT NULL REFERENCES profiles(id),
  screen_id             TEXT NOT NULL,
  transcript_nl         TEXT,                          -- nullable: NULLed by retention job after 30 days
  transcript_redacted   BOOLEAN NOT NULL DEFAULT FALSE,
  intent                TEXT,
  entities              JSONB,
  confidence_score      DECIMAL(4,3),
  response_text_nl      TEXT,
  response_audio_path   TEXT,
  distress_detected     BOOLEAN NOT NULL DEFAULT FALSE,
  distress_phrase       TEXT,
  action_taken          TEXT,
  duration_ms           INT,
  embedding             VECTOR(1536),
  audio_path            TEXT,                          -- retained 30 days then deleted
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_delete_audio_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  updated_at            timestamptz DEFAULT now(),
  deleted_at            timestamptz,          -- v1.2.1: added for retention cron compliance
  -- INVARIANT: when transcript_redacted = TRUE, transcript_nl MUST be NULL.
  --            Enforced by check constraint below.
  CONSTRAINT chk_transcript_redaction
    CHECK (
      (transcript_redacted = FALSE)
      OR
      (transcript_nl IS NULL)
    )
);

COMMENT ON COLUMN voice_interactions.deleted_at IS
  'Soft-delete timestamp. Set by pg_cron after 30-day retention window. '
  'Transcript nulled at same time. Audio never stored in this table '
  '(audio lives in tts-cache bucket with 48h TTL).';

-- voice_interactions
ALTER TABLE voice_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_interactions FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_voice_interactions_elder_created
  ON voice_interactions(elder_id, created_at DESC);
CREATE INDEX idx_voice_interactions_embedding ON voice_interactions
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
9.2 companion_memory
SQL

-- ============================================================
-- CANONICAL companion_memory schema  (v1.1.1)
-- memory_type enum values are English keys, displayed in Dutch in UI
-- ============================================================

CREATE TYPE memory_type AS ENUM (
  'personal_fact',      -- Persoonlijk feit: naam kleinkind, huisdier, etc.
  'preference',         -- Voorkeur: muziek, eten, gewoonten
  'recurring_event',    -- Terugkerend moment: wekelijks telefoontje, etc.
  'life_event',         -- Levensgebeurtenis (uit Mijn Verhaal)
  'emotional_state',    -- Emotionele context: rouw, vreugde
  'medical_context'     -- Medicijncontext: naam, bijwerking (alleen lezen uit ANKER)
);

CREATE TABLE companion_memory (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id          uuid NOT NULL
                      REFERENCES profiles(id) ON DELETE CASCADE,
  memory_type       memory_type NOT NULL,
  content_nl        text,                       -- Nullable: NULLed after retention or on redaction
  memory_redacted   boolean NOT NULL DEFAULT false,
  importance_score  integer DEFAULT 5           -- canonical: importance_score
                    CHECK (importance_score BETWEEN 1 AND 10),
  embedding         vector(1536),               -- text-embedding-3-small
  source            text
                    CHECK (source IN (
                      'voice_interaction',
                      'life_story',
                      'manual',
                      'anker_sync'
                    )),
  source_id         uuid,                       -- FK to voice_interactions or life_stories
  last_referenced   timestamptz,
  expires_at        timestamptz,               -- NULL = permanent
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  deleted_at        timestamptz,
  -- INVARIANT: when memory_redacted = TRUE, content_nl MUST be NULL.
  --            Enforced by check constraint below.
  CONSTRAINT chk_memory_redaction
    CHECK (
      (memory_redacted = FALSE)
      OR
      (content_nl IS NULL)
    )
);

-- Retention expiry (pg_cron)
SELECT cron.schedule(
  'expire-companion-memories',
  '0 2 * * *',
  $$
    UPDATE companion_memory
    SET deleted_at = now()
    WHERE expires_at IS NOT NULL
      AND expires_at < now()
      AND deleted_at IS NULL;
  $$
);

-- Default expiry per type (applied on INSERT via trigger)
CREATE OR REPLACE FUNCTION set_memory_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := CASE NEW.memory_type
      WHEN 'personal_fact'    THEN NULL              -- permanent
      WHEN 'preference'       THEN now() + interval '1 year'
      WHEN 'recurring_event'  THEN now() + interval '6 months'
      WHEN 'life_event'       THEN NULL              -- permanent
      WHEN 'emotional_state'  THEN now() + interval '90 days'
      WHEN 'medical_context'  THEN now() + interval '1 year'
      ELSE now() + interval '6 months'
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_memory_expiry
  BEFORE INSERT ON companion_memory
  FOR EACH ROW EXECUTE FUNCTION set_memory_expiry();
10. WACHT Tables
10.1 carer_visit_logs
SQL

CREATE TABLE carer_visit_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id              UUID NOT NULL REFERENCES profiles(id),
  carer_id              UUID NOT NULL REFERENCES profiles(id),
  visit_date            DATE NOT NULL,
  check_in_time         TIMESTAMPTZ,
  check_out_time        TIMESTAMPTZ,
  activities_nl         TEXT[],
  observations_nl       TEXT,
  mood_observed         SMALLINT CHECK (mood_observed BETWEEN 1 AND 5),
  concerns_nl           TEXT,
  follow_up_required    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- carer_visit_logs
ALTER TABLE carer_visit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE carer_visit_logs FORCE ROW LEVEL SECURITY;
10.2 incidents
SQL

CREATE TABLE incidents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id                UUID NOT NULL REFERENCES profiles(id),
  reported_by_id          UUID NOT NULL REFERENCES profiles(id),
  incident_type           TEXT NOT NULL,               -- meldcode categories
  description_nl          TEXT NOT NULL,
  severity                TEXT NOT NULL CHECK (severity IN ('laag', 'gemiddeld', 'hoog', 'kritiek')),
  meldcode_step_reached   SMALLINT CHECK (meldcode_step_reached BETWEEN 1 AND 5),
  external_report_made    BOOLEAN NOT NULL DEFAULT FALSE,
  external_authority_nl   TEXT,                        -- "Veilig Thuis", "huisarts", etc.
  resolved                BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at             TIMESTAMPTZ,
  resolution_notes_nl     TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- incidents
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents FORCE ROW LEVEL SECURITY;
11. System Tables
11.1 notifications
SQL

CREATE TABLE notifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id          UUID NOT NULL REFERENCES profiles(id),
  notification_type     notification_type NOT NULL,
  title_nl              TEXT NOT NULL,
  body_nl               TEXT NOT NULL,
  data                  JSONB,
  read                  BOOLEAN NOT NULL DEFAULT FALSE,
  read_at               TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  send_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_notifications_recipient_read
  ON notifications(recipient_id, read, created_at DESC);
11.2 push_tokens
SQL

CREATE TABLE push_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_tokens_profile_id ON push_tokens(profile_id);

-- push_tokens
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens FORCE ROW LEVEL SECURITY;
12. RLS Policy Definitions

## 🔴 CANONICAL RLS SOURCE — READ THIS FIRST

The **authoritative, complete, production-ready RLS policy SQL** for all tables
is defined in **Addendum A** (`docs/addenda/A-rls-policies.md`).

The policy examples shown in this section (Doc 05) are **illustrative summaries
only** — they exist to explain the access-control philosophy, not to be
implemented directly.

**Engineer rule:** When implementing or auditing RLS, use ONLY Addendum A.
If Doc 05 and Addendum A ever conflict, **Addendum A wins**.

Last reconciliation check: 2026-06-10 ✅

These are illustrative RLS policy examples only. All are PERMISSIVE unless stated.

SQL

-- ─────────────────────────────────────────────────
-- profiles: users can only read/update their own profile
-- ─────────────────────────────────────────────────
CREATE POLICY "profiles: self access"
  ON profiles FOR ALL
  USING (id = auth.uid());

-- ─────────────────────────────────────────────────
-- elder_profiles: elder sees own; family sees via relationship + consent
-- ─────────────────────────────────────────────────
CREATE POLICY "elder_profiles: elder access"
  ON elder_profiles FOR ALL
  USING (profile_id = auth.uid());

CREATE POLICY "elder_profiles: family read"
  ON elder_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_relationships fr
      WHERE fr.elder_id = elder_profiles.profile_id
        AND fr.family_member_id = auth.uid()
        AND fr.elder_consented = TRUE
        AND fr.deleted_at IS NULL
    )
  );

-- ─────────────────────────────────────────────────
-- scam_events: elder sees own; family sees if rood/zwart + permission
-- ─────────────────────────────────────────────────
CREATE POLICY "scam_events: elder access"
  ON scam_events FOR ALL
  USING (elder_id = auth.uid());

CREATE POLICY "scam_events: family read"
  ON scam_events FOR SELECT
  USING (
    alert_level IN ('rood', 'zwart')
    AND EXISTS (
      SELECT 1 FROM family_relationships fr
      WHERE fr.elder_id = scam_events.elder_id
        AND fr.family_member_id = auth.uid()
        AND fr.elder_consented = TRUE
        AND fr.deleted_at IS NULL
    )
  );

-- ─────────────────────────────────────────────────
-- medication_reminders: elder sees own; family sees if can_view_medications
-- ─────────────────────────────────────────────────
CREATE POLICY "medication_reminders: elder access"
  ON medication_reminders FOR ALL
  USING (elder_id = auth.uid());

CREATE POLICY "medication_reminders: family read"
  ON medication_reminders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_relationships fr
      WHERE fr.elder_id = medication_reminders.elder_id
        AND fr.family_member_id = auth.uid()
        AND fr.can_view_medications = TRUE
        AND fr.elder_consented = TRUE
        AND fr.deleted_at IS NULL
    )
  );

-- ─────────────────────────────────────────────────
-- location_events: elder sees own; family sees if can_view_location
-- ─────────────────────────────────────────────────
CREATE POLICY "location_events: elder access"
  ON location_events FOR ALL
  USING (elder_id = auth.uid());

CREATE POLICY "location_events: family read (fuzzed only)"
  ON location_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_relationships fr
      WHERE fr.elder_id = location_events.elder_id
        AND fr.family_member_id = auth.uid()
        AND fr.can_view_location_events = TRUE
        AND fr.elder_consented = TRUE
        AND fr.deleted_at IS NULL
    )
  );
-- Note: location_precise column is additionally masked in the PostgREST view

-- ─────────────────────────────────────────────────
-- family_messages: sender or elder
-- ─────────────────────────────────────────────────
CREATE POLICY "family_messages: access"
  ON family_messages FOR ALL
  USING (
    elder_id = auth.uid()
    OR sender_id = auth.uid()
  );

-- ─────────────────────────────────────────────────
-- life_stories: elder owns; family reads if can_view_stories
-- ─────────────────────────────────────────────────
CREATE POLICY "life_stories: elder access"
  ON life_stories FOR ALL
  USING (elder_id = auth.uid());

CREATE POLICY "life_stories: family read"
  ON life_stories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_relationships fr
      WHERE fr.elder_id = life_stories.elder_id
        AND fr.family_member_id = auth.uid()
        AND fr.can_view_stories = TRUE
        AND fr.elder_consented = TRUE
        AND fr.deleted_at IS NULL
    )
  );

-- ─────────────────────────────────────────────────
-- notifications: recipient only
-- ─────────────────────────────────────────────────
CREATE POLICY "notifications: recipient access"
  ON notifications FOR ALL
  USING (recipient_id = auth.uid());

-- ─────────────────────────────────────────────────
-- companion_memory: elder only (never exposed to family by design)
-- ─────────────────────────────────────────────────
CREATE POLICY "companion_memory: elder only"
  ON companion_memory FOR ALL
  USING (elder_id = auth.uid());

-- ─────────────────────────────────────────────────
-- incidents: carer who reported + service role
-- ─────────────────────────────────────────────────
CREATE POLICY "incidents: carer access"
  ON incidents FOR ALL
  USING (
    reported_by_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM carer_relationships cr
      WHERE cr.elder_id = incidents.elder_id
        AND cr.carer_member_id = auth.uid()
        AND cr.is_active = TRUE
        AND cr.can_report_incidents = TRUE
    )
  );
13. Indexing Strategy
SQL

-- High-volume time-series tables: partition by month (Phase 2 migration)
-- For now: B-tree on (elder_id, created_at DESC) is sufficient

-- Full-text search on Dutch content (pg_trgm)
CREATE INDEX idx_tasks_title_trgm ON tasks USING gin (title_nl gin_trgm_ops);
CREATE INDEX idx_life_stories_transcript_trgm
  ON life_stories USING gin (transcript_nl gin_trgm_ops);

-- Safe zone geometry
CREATE INDEX idx_elder_profiles_safe_zone
  ON elder_profiles USING GIST (safe_zone_centre);
CREATE INDEX idx_location_events_fuzzed
  ON location_events USING GIST (location_fuzzed);
14. Scheduled Jobs (pg_cron)
SQL

-- Weekly digest: every Monday 08:00 Amsterdam time
SELECT cron.schedule('weekly-digest', '0 8 * * 1',
  $$SELECT net.http_post(url := current_setting('app.edge_fn_url') || '/fn-weekly-digest',
    headers := '{"Authorization": "Bearer " || current_setting(''app.service_role_key'')}'::jsonb
  )$$);

-- Medication escalation: every 10 minutes
SELECT cron.schedule('medication-escalation', '*/10 * * * *',
  $$SELECT net.http_post(url := current_setting('app.edge_fn_url') || '/fn-medication-escalation',
    headers := '{"Authorization": "Bearer " || current_setting(''app.service_role_key'')}'::jsonb
  )$$);

-- Precise location cleanup: every 30 minutes
SELECT cron.schedule('location-precise-cleanup', '*/30 * * * *',
  $$UPDATE location_events
    SET location_precise = NULL
    WHERE auto_delete_at < NOW()
      AND location_precise IS NOT NULL$$);

-- Voice audio cleanup: daily at 03:00
SELECT cron.schedule('voice-audio-cleanup', '0 3 * * *',
  $$UPDATE voice_interactions
    SET audio_path = NULL
    WHERE auto_delete_audio_at < NOW()
      AND audio_path IS NOT NULL$$);

-- Phone reputation cache cleanup: daily at 04:00
SELECT cron.schedule('reputation-cache-cleanup', '0 4 * * *',
  $$DELETE FROM phone_reputation_cache WHERE expires_at < NOW()$$);
Document 06 — Security & Compliance
1. Regulatory Framework (Netherlands)
Regulation	Relevance to HAVEN	Owner
AVG (Algemene Verordening Gegevensbescherming = GDPR)	Primary data protection law. All personal data processing must have a legal basis.	CTO + DPO
Uitvoeringswet AVG (UAVG)	Dutch implementation of GDPR with supplementary rules	CTO + DPO
WGBO (Wet op de geneeskundige behandelingsovereenkomst)	Governs medical data handling; relevant for medication, health, and care data	CTO + Legal
WMO (Wet maatschappelijke ondersteuning)	Governs home care and social support services; relevant for WACHT pillar	Product + Legal
Meldcode Huiselijk Geweld en Kindermishandeling	Governs incident reporting obligations for professional carers	WACHT module
NEN 7510	Dutch standard for information security in healthcare	Security team
MedMij Afsprakenstelsel	Framework for personal health data exchange (Phase 2)	Phase 2 CTO
PSD2 / PSD3	Payment services directive; governs banking data access	Phase 2 (SCHILD)
ePrivacy Directive (Dutch implementation)	Governs cookies, electronic communications, push notifications	Frontend
2. Legal Bases for Processing (AVG Article 6 + Article 9)
HAVEN processes multiple categories of data. Each requires an explicit legal basis.

Data Category	AVG Article 9 Special Category?	Legal Basis	Notes
Name, contact details, profile	No	Article 6(1)(b) — contract performance	Core service delivery
Voice recordings (STEM)	No (unless health content)	Article 6(1)(a) — explicit consent	Consent captured on onboarding; withdrawable at any time
Medication data	Yes — health data	Article 9(2)(a) — explicit consent	Must be granular and informed
BSN (Burgerservicenummer)	Forbidden to collect	Not stored, not processed, not transmitted. UI warns users not to upload documents containing unredacted BSN.
Location data	No	Article 6(1)(a) — explicit consent	Consent per-family-member; elder can revoke
Financial transaction data (Phase 2)	No	Article 6(1)(a) — explicit consent	PSD2 consent flow required
Health check-ins / wellness	Yes — health data	Article 9(2)(a) — explicit consent	
Cognitive check-in scores	Yes — health data	Article 9(2)(a) — explicit consent	
Life stories / voice diaries	No (unless health content)	Article 6(1)(a) — explicit consent	Elder controls sharing
Scam event data	No	Article 6(1)(f) — legitimate interest	Fraud prevention; LIA documented
Neighbourhood profile	No	Article 6(1)(a) — explicit consent	Opt-in required
Interest tags	No	Article 6(1)(a) — explicit consent	Selected from curated catalogue
PC4 neighbourhood	No	Article 6(1)(a) — explicit consent	Declared by elder; not real-time location
Name reveal (double opt-in)	No	Article 6(1)(a) — explicit consent	Double opt-in is the consent mechanism
Carer visit logs	Yes — health data	Article 9(2)(h) — healthcare provision	Carer professional obligation
Incident reports	Yes — health data	Article 9(2)(h) + Meldcode obligations	
3. Consent Management
3.1 Consent Principles
Consent is granular — separate consent for each data category (not bundled)
Consent is recorded — stored in consent_records table (see below) with timestamp, version, and channel
Consent is withdrawable — at any time via elder app settings; withdrawal triggers immediate processing halt + soft deletion where applicable
Consent language is plain Dutch — maximum 8th-grade reading level; no legal jargon
Consent for health data requires a separate explicit confirmation step (double-tap or voice "ja, ik ga akkoord")
3.2 consent_records Table
SQL

CREATE TABLE consent_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id              UUID NOT NULL REFERENCES profiles(id),
  consent_type          TEXT NOT NULL,    -- e.g., 'voice_recordings', 'medication_data'
  granted               BOOLEAN NOT NULL,
  consent_version       TEXT NOT NULL,    -- e.g., 'v1.2'
  channel               TEXT NOT NULL,   -- 'elder_app', 'family_onboarding', 'api'
  ip_address_hashed     TEXT,
  device_id             TEXT,
  granted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- consent_records
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;

CREATE POLICY "consent_records: elder access"
  ON consent_records FOR ALL
  USING (elder_id = auth.uid());
4. Data Classification
Class	Definition	Examples	Controls
Class 1 — Openbaar	Non-personal, non-sensitive	App UI text, community event data	Standard
Class 2 — Persoonlijk	Personal data (AVG Article 4)	Name, phone, email, push tokens	Encrypted in transit (TLS 1.3), RLS enforced
Class 3 — Gevoelig Persoonlijk	Sensitive personal data	Location, financial, scam events	Class 2 controls + field-level encryption where feasible
Class 4 — Bijzondere Categorie (AVG Art. 9)	Health-adjacent data (medications, wellness, cognitive check-ins), precise location (transient, 24h), voice recordings (transient, 30d), crisis/distress signals, bereavement state	Class 3 controls + explicit consent + access audit log + encryption at rest (AES-256)

---
> ⚠️ **BSN is NOT in Class 4 — it is in Class 5 (Forbidden to collect).**
> See the BSN hard rule below. Do not place BSN in any "storable" data class.
---

Class 5 — Verboden te verzamelen	BSN (Burgerservicenummer) — HAVEN does not collect, store, process, or transmit BSN under any circumstances. This is a hard product rule enforced at schema, UI, Edge Function, and vendor contract level. See ADR-008 and Doc 06 BSN section.	Forbidden to collect
5. Encryption
5.1 In Transit
All API traffic: TLS 1.3 minimum
WebSocket (Realtime): WSS with TLS 1.3
Internal Supabase service communication: encrypted by Supabase platform
5.2 At Rest
Supabase hosted PostgreSQL: AES-256 disk encryption (AWS EBS)
Supabase Storage: AES-256 (AWS S3)
(No BSN field — HAVEN does not store BSN. See BSN hard product rule below.)
Voice recordings: encrypted at storage path level via Supabase Storage (AES-256); paths are not guessable (UUID-based)
5.3 Key Management
Application secrets: Supabase Vault
Service role key: never exposed to frontend; only used in Edge Functions server-side
(No BSN encryption key — BSN is not stored or processed. See BSN hard product rule below.)
5.4 BSN — Not Processed (Hard Product Rule)

HAVEN does not collect, store, or process BSN.
This is a hard product rule enforced at:
  - DB schema level (no BSN columns)
  - UI level (vault upload warning)
  - Data classification level (Class 4 — forbidden to collect)
  - Vendor contract level (vendors must not receive BSN from HAVEN)

If any integration partner requests BSN transmission, this must be escalated
to the DPO immediately and rejected unless a specific statutory basis is confirmed.

6. Threat Model
6.1 Assets to Protect
Elder personal and health data (Class 4)
Family member access credentials
Voice recordings and life stories
Companion memory (persistent personal history)
Financial data (Phase 2)
Healthcare identifiers (zorgverzekering nummer, huisarts contact) — BSN is not stored (hard product rule)
6.2 Threat Actors
Actor	Motivation	Capability
Opportunistic attacker	Financial gain via elder data	Low-medium
Targeted scammer	Access to elder's financial/identity data to facilitate fraud	Medium
Compromised family member	Misuse of elder monitoring capabilities	Low
Malicious carer	Unauthorised access to elder personal data	Low-medium
HAVEN insider	Unauthorised data access	Medium
State actor	Data espionage	Low (not a target at this scale)
6.3 Attack Surfaces
Surface	Threat	Mitigation
Elder app (mobile)	Stolen device → app access	Biometric/PIN lock required; tokens in Keychain; no sensitive data in AsyncStorage
Elder app (mobile)	Malicious app update	Expo EAS signed builds; code signing
Family dashboard (web)	XSS	Next.js App Router (no dangerouslySetInnerHTML); CSP headers
Family dashboard (web)	CSRF	SameSite=Strict cookies; CSRF tokens on state-changing requests
Supabase API	Unauthorised data access	RLS on all tables; service role key never in frontend
Edge Functions	Injection via malformed audio/text	Input validation + sanitisation on all Edge Function inputs
Push notifications	Spoofed notifications	Notifications only sent server-side via service role
PSD2 webhooks (Phase 2)	Spoofed webhook	HMAC-SHA256 signature verification on all inbound webhooks
BSN	Not collected	N/A — HAVEN does not store BSN (hard product rule; see Section 5.4)
## Retention policy (canonical — v1.2.0)

> **SSOT rule:** This table is the single canonical retention reference.
> Any other retention table elsewhere in this document or its addenda is
> superseded by this one. Last reviewed: 2026-06-10.

| Data category | Table / Storage bucket | Retention | Basis | Notes |
|---|---|---|---|---|
| Elder profile | `elder_profiles` | Until account deletion | AVG Art. 6(1)(b) | GDPR right-to-erasure applies |
| Family relationship | `family_relationships` | Until consent revoked + 30 days | AVG Art. 6(1)(a) | Soft delete; hard delete after 30 days |
| Medication definitions | `medications` | 12 months after `end_date` or account deletion | AVG proportionality | Elder-requested deletion honoured immediately |
| Medication reminders | `medication_reminders` | 12 months | AVG proportionality | |
| Family messages | `family_messages` | 24 months | AVG proportionality | Elder can delete own messages at any time |
| Voice interaction transcripts | `voice_interactions` | 30 days | Minimal retention (sensitive) | Transcript only; no audio retained after TTS |
| Voice audio (TTS cache) | `tts-cache` bucket | 48 hours | Transient | pg_cron auto-delete |
| Voice notes (family↔elder) | `voice-notes` bucket | 24 months | AVG proportionality | Either party can delete |
| Life stories (audio + transcript) | `life-story-audio`, `life_stories` | Permanent until elder requests deletion | Elder agency | Right-to-erasure: delete within 30 days of request |
| Companion memory | `companion_memory` | Per-type (see trigger) | AVG proportionality | personal_fact + life_event = permanent; others 90 days–1 year |
| Scam events | `scam_events` | 24 months | AVG Art. 6(1)(f) (legitimate interest) | Used for pattern detection + family digests |
| Location events (fuzzed) | `location_events` | 90 days | AVG proportionality + ADR-007 | pg_cron auto-null of precise field after 24h |
| Precise location field | `location_events.location_precise` | **24 hours maximum, then nulled** | ADR-007 (canonical TTL) | pg_cron uses auto_delete_at field set by fn-location-ingest. Never 48h. |
| OCR inbox (med photos) | `ocr-inbox` bucket | 24 hours after processing | Transient | pg_cron auto-delete |
| Wellness check-ins | `wellness_checkins` | 12 months | AVG proportionality | |
| Cognitive check-ins | `cognitive_checkins` | 12 months | AVG proportionality | |
| Weekly digests | `safety_digests` | 24 months | AVG proportionality | |
| Push tokens | `push_tokens` | Until device deregistration | Operational necessity | |
| Audit log | `audit_log` | **7 years** | WGBO / NEN 7510 compliance | Immutable; manual DPO sign-off required for purge (pg_cron auto-delete forbidden) |
| Carer visit logs (WACHT Phase 2) | `carer_visit_logs` | **20 years (WGBO Art. 7:454 BW)** | WGBO statutory | Applies only when HAVEN operates in professional care context |
| Safeguarding incidents (WACHT Phase 2) | `incidents` | **20 years (WGBO Art. 7:454 BW)** | WGBO statutory | Same as above |
| Neighbourhood profile | `neighbourhood_profiles` | Until opt-out + 30 days | AVG Art. 6(1)(a) | Opt-out deletes immediately; 30-day buffer for recovery |
| Interest tags | `elder_interest_tags` | Until profile deletion | AVG Art. 6(1)(a) | Deleted with profile |
| PC4 postcode | `neighbourhood_profiles.postcode_pc4` | Until profile deletion | AVG Art. 6(1)(a) | Never stored at PC6 level |
| Connection records | `neighbourhood_connections` | 12 months after `ended` / `declined` | AVG proportionality | Aggregate counts kept for safety digest; identifiers purged |
| Local events | `neighbourhood_events` | Auto-expired after `event_date` | Operational | pg_cron; not personal data |
| Event interests | `event_interests` | 12 months | AVG proportionality | |

### Retention pg_cron jobs (canonical)

```sql
-- Precise location: null after 24 hours (canonical TTL — see ADR-007)
-- v1.2.1: corrected from 48h to 24h throughout
SELECT cron.schedule(
  'null-precise-location',
  '0 * * * *',    -- runs every hour; idempotent
  $$
    UPDATE location_events
    SET   location_precise = NULL,
          auto_delete_at   = NULL,
          updated_at       = now()
    WHERE location_precise IS NOT NULL
      AND auto_delete_at   IS NOT NULL
      AND auto_delete_at   < now();
    -- Uses auto_delete_at (set to created_at + 24h by fn-location-ingest)
    -- rather than a hardcoded interval, so each row's TTL is independent.
  $$
);

-- Voice interaction transcripts: null transcript + soft-delete after 30 days
SELECT cron.schedule(
  'expire-voice-interactions',
  '0 3 * * *',
  $$
    -- Step 1: null the transcript and flag as redacted (PII erasure — AVG proportionality)
    UPDATE voice_interactions
    SET   transcript_nl       = NULL,
          transcript_redacted = TRUE,
          response_text_nl    = NULL,       -- null response too (may contain PII)
          updated_at          = now()
    WHERE created_at < now() - interval '30 days'
      AND (transcript_nl IS NOT NULL OR transcript_redacted = FALSE)
      AND deleted_at IS NULL;

    -- Step 2: soft-delete the row (retains metadata for aggregate analytics)
    UPDATE voice_interactions
    SET   deleted_at  = now(),
          updated_at  = now()
    WHERE created_at < now() - interval '30 days'
      AND deleted_at IS NULL;
  $$
);

-- Scam events: soft delete after 24 months
SELECT cron.schedule(
  'expire-scam-events',
  '0 4 1 * *',
  $$
    UPDATE scam_events
    SET deleted_at = now()
    WHERE created_at < now() - interval '24 months'
      AND deleted_at IS NULL;
  $$
);

-- Location events: soft delete after 90 days
SELECT cron.schedule(
  'expire-location-events',
  '0 4 2 * *',
  $$
    UPDATE location_events
    SET deleted_at = now()
    WHERE created_at < now() - interval '90 days'
      AND deleted_at IS NULL;
  $$
);

-- Companion memory: expire per expires_at (see Patch 3)
-- Already scheduled in Patch 3 above.
```

7.1 Right to Erasure Process
Elder or authorised family member submits deletion request (in-app or email to privacy@haven.nl)
Request logged in deletion_requests table with timestamp
Automated pipeline runs within 72 hours: cascades soft deletes, nulls encrypted fields, removes Storage files
Confirmation sent to elder within 30 days (AVG Article 12(3))
Any legally retained data (carer logs, financial records) listed explicitly in the confirmation
8. Audit Logging
All access to Class 3/4 data is logged in an append-only audit table.

SQL

CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,               -- sequential for ordering
  actor_id        UUID NOT NULL,
  actor_role      user_role NOT NULL,
  action          TEXT NOT NULL,                       -- e.g., 'READ', 'UPDATE', 'DELETE'
  table_name      TEXT NOT NULL,
  record_id       UUID NOT NULL,
  elder_id        UUID,
  ip_address_hash TEXT,
  user_agent      TEXT,
  extra           JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS delete policy — audit_log is append-only
-- Only service role can INSERT
-- Retention: 7 years (legal obligation — WGBO / NEN 7510)
-- EXCLUSION: Automated purging of audit logs via pg_cron is strictly FORBIDDEN.
-- Purging of records older than 7 years requires manual DPO review, sign-off, and process documentation.
Audit events are triggered via Supabase database triggers on:

elder_profiles (all operations)
medications (all operations)
scam_events (all operations)
financial_transactions (all operations)
documents (all operations)
companion_memory (read events via Edge Function logging)
consent_records (all operations)
9. AVG / GDPR Operational Obligations
Obligation	Implementation
Privacy by Design	Schema-driven UI prevents accidental data collection; fuzzed location; no raw audio stored beyond 30 days
Data Minimisation	Only data necessary for each feature is collected; fields for Phase 2 features are nullable and not populated
Verwerkingsregister (Article 30 Record of Processing)	Maintained as living document in Notion; reviewed quarterly
DPIA (Data Protection Impact Assessment)	Required for voice recordings, location, and health data. Completed before MVP launch. (BSN is not processed — no BSN-specific DPIA scope.)
Privacy Policy (Privacyverklaring)	Available in plain Dutch at haven.nl/privacy; version-controlled
Autoriteit Persoonsgegevens Registration	Not mandatory unless processing meets Article 37 DPO threshold; assessed at launch
Data Breach Notification	Within 72 hours to AP (Autoriteit Persoonsgegevens) per AVG Article 33; within "without undue delay" to affected elders per Article 34
DPA with Supabase	In place (Supabase EU DPA)
DPA with OpenAI	In place (OpenAI Data Processing Addendum for EU customers)
DPA with ElevenLabs	Required — confirm EU DPA availability before launch
DPA with Expo/Vercel	In place (both offer EU DPAs)
10. Security Review Plan
Review Type	Frequency	Owner
Dependency vulnerability scan (Snyk)	Every CI run	Automated
Static code analysis (ESLint security rules)	Every CI run	Automated
Supabase RLS policy review	Each schema migration	CTO
Internal security review	Quarterly	CTO
External penetration test	Before MVP launch + annually	Third-party (NEN 7510 certified firm)
AVG compliance review	Annually	DPO + Legal
Document 07 — Elder App Specification
1. Overview
The elder app is a React Native (Expo) application. Its central engineering bet is that every screen is a data schema and the UI is built by a renderer from that schema. This makes it structurally impossible to accidentally add complexity — any screen that violates the UX constitution will fail the CI test suite.

2. UX Constitution (Enforced in CI)
These rules are non-negotiable and tested automatically:

Rule	Constraint
Max navigation depth from home	≤ 2 levels
Max primary items per screen	≤ 4
Max bottom actions per screen	≤ 2
Voice fallback	Required on every screen; ≤ 15 words
Offline cache TTL	Required on every screen
Emergency button	Required on all screens except modals
Accessibility label	Required on every interactive element
Banned words (deceptive/scary)	fout, mislukt, waarschuwing, gevaar, ongeldig, fout opgetreden; "Ik ben een echte medewerker", "Ik ben geen computer", "U spreekt met een persoon" (EU AI Act Art. 50 — deceptive identity claims banned; AI disclosure required)
Banned words (SCHILD exception)	"Nooit" is allowed on SCHILD screens only
Font size	Minimum 18sp body; minimum 24sp primary actions
Touch targets	Minimum 56×56dp
Colour contrast	WCAG 2.1 AA minimum; AAA for primary text
3. TypeScript Schema Types
TypeScript

// types/screen-schema.ts

export type ScreenId =
  | 'HOME'
  | 'VANDAAG'
  | 'MIJN_PILLEN'
  | 'PIL_BEVESTIGING'
  | 'FAMILIE'
  | 'BERICHT_STUREN'
  | 'MIJN_VERHAAL'
  | 'VERHAAL_OPNEMEN'
  | 'SCHILD_AMBER'
  | 'SCHILD_ROOD'
  | 'SCHILD_ZWART'
  | 'DOCUMENT_UITLEG'
  | 'KOMPAS_VEILIGE_ZONE'
  | 'WAT_IS_DIT'
  | 'WELZIJN_CHECKIN'
  | 'COGNITIEVE_CHECKIN'
  | 'INSTELLINGEN'
  | 'NOODPROFIEL';

export type BlockType =
  | 'greeting'
  | 'halo_status'
  | 'hero_button_grid'
  | 'medication_card'
  | 'task_list'
  | 'family_thread'
  | 'voice_note_player'
  | 'story_prompt'
  | 'alert_banner'
  | 'transaction_alert'
  | 'map_zone'
  | 'wellness_sliders'
  | 'cognitive_question'
  | 'photo_explainer'
  | 'empty_state';

export type AlertLevel = 'none' | 'amber' | 'rood' | 'zwart';

export interface ContentBlock {
  id: string;
  type: BlockType;
  accessibilityLabel: string;
  accessibilityHint?: string;
  props?: Record<string, unknown>;
}

export interface BottomAction {
  id: string;
  labelNl: string;
  icon: string;
  action: ActionType;
  voiceAlias?: string[];            // Dutch phrases that trigger this action
  accessibilityLabel: string;
  style?: 'primary' | 'secondary' | 'danger';
}

export interface VoiceSchema {
  entrySpeak: string;               // What HAVEN says when screen opens (Dutch, ≤ 20 words)
  fallbackSpeak: string;            // What HAVEN says if elder seems stuck (≤ 15 words)
  commands: VoiceCommand[];
  distressPhrases: string[];        // Dutch phrases that trigger crisis flow
}

export interface VoiceCommand {
  intentNl: string;
  examplePhrases: string[];         // Dutch example phrases for this command
  action: ActionType;
  confirmationRequired?: boolean;
}

export interface DataSource {
  key: string;
  table?: string;
  edgeFunction?: string;
  offlineCacheTtlSeconds: number;
}

export interface ScreenSchema {
  screenId: ScreenId;
  titleNl: string;
  accessibilityLabel: string;
  layout: 'single_column' | 'two_column' | 'full_screen_overlay';
  themeVariant: 'default' | 'night' | 'schild_amber' | 'schild_rood' | 'schild_zwart';
  headerVariant: 'greeting' | 'title' | 'minimal' | 'hidden';
  depthFromHome: number;            // CI enforces ≤ 2
  maxPrimaryItems: number;          // CI enforces ≤ 4
  contentBlocks: ContentBlock[];
  bottomActions: BottomAction[];    // CI enforces ≤ 2
  persistentElements: {
    emergencyButton: boolean;       // CI enforces true on all non-modal screens
    voiceButton: boolean;
    haloStatus: boolean;
    backButton: boolean;
  };
  voice: VoiceSchema;
  dataSources: DataSource[];
  emptyState?: ContentBlock;
  screenStates?: Record<string, Partial<ScreenSchema>>;
}
4. Concrete Screen Schemas
4.1 HOME
TypeScript

export const HOME_SCHEMA: ScreenSchema = {
  screenId: 'HOME',
  titleNl: 'HAVEN',
  accessibilityLabel: 'Hoofdscherm van HAVEN',
  layout: 'single_column',
  themeVariant: 'default',
  headerVariant: 'greeting',
  depthFromHome: 0,
  maxPrimaryItems: 4,
  contentBlocks: [
    {
      id: 'greeting_block',
      type: 'greeting',
      accessibilityLabel: 'Begroeting van HAVEN',
      props: { includeTimeOfDay: true, includeWeather: false }
    },
    {
      id: 'halo_block',
      type: 'halo_status',
      accessibilityLabel: 'Jouw dagelijks overzicht',
      props: {
        dimensions: ['pillen', 'veiligheid', 'familie'],
        pulsing: true
      }
    },
    {
      id: 'hero_grid',
      type: 'hero_button_grid',
      accessibilityLabel: 'Kies wat je wilt doen',
      props: {
        items: [
          { id: 'pills', labelNl: 'Mijn Pillen', icon: 'pill', screenTarget: 'MIJN_PILLEN', badgeSource: 'pending_medications' },
          { id: 'today', labelNl: 'Vandaag', icon: 'calendar', screenTarget: 'VANDAAG', badgeSource: 'pending_tasks' },
          { id: 'family', labelNl: 'Familie', icon: 'heart', screenTarget: 'FAMILIE', badgeSource: 'unread_messages' },
          { id: 'help', labelNl: 'Hulp', icon: 'shield', screenTarget: 'NOODPROFIEL' }
        ]
      }
    }
  ],
  bottomActions: [
    {
      id: 'voice_action',
      labelNl: 'Praat met HAVEN',
      icon: 'mic',
      action: 'OPEN_VOICE',
      accessibilityLabel: 'Praat met HAVEN',
      voiceAlias: ['hallo haven', 'haven', 'luister'],
      style: 'primary'
    }
  ],
  persistentElements: {
    emergencyButton: true,
    voiceButton: true,
    haloStatus: true,
    backButton: false
  },
  voice: {
    entrySpeak: 'Goedemorgen. Alles goed met u vandaag?',
    fallbackSpeak: 'Waarmee kan ik u helpen?',
    commands: [
      {
        intentNl: 'navigeer_pillen',
        examplePhrases: ['mijn pillen', 'medicijnen', 'heb ik mijn pillen al genomen?'],
        action: 'NAVIGATE_MIJN_PILLEN'
      },
      {
        intentNl: 'navigeer_vandaag',
        examplePhrases: ['wat staat er vandaag op het programma?', 'vandaag', 'mijn dag'],
        action: 'NAVIGATE_VANDAAG'
      },
      {
        intentNl: 'navigeer_familie',
        examplePhrases: ['familie', 'berichten', 'heeft iemand geschreven?'],
        action: 'NAVIGATE_FAMILIE'
      },
      {
        intentNl: 'crisis',
        examplePhrases: ['ik voel me niet goed', 'help', 'ik ben bang', 'ik ben gevallen'],
        action: 'TRIGGER_CRISIS_FLOW',
        confirmationRequired: false
      }
    ],
    distressPhrases: [
      'ik voel me niet goed',
      'help me',
      'ik ben gevallen',
      'ik ben bang',
      'bel een ambulance'
    ]
  },
  dataSources: [
    { key: 'pending_medications', table: 'medication_reminders', offlineCacheTtlSeconds: 300 },
    { key: 'pending_tasks', table: 'tasks', offlineCacheTtlSeconds: 600 },
    { key: 'unread_messages', table: 'family_messages', offlineCacheTtlSeconds: 120 }
  ]
};
4.2 MIJN_PILLEN (My Pills)
TypeScript

export const MIJN_PILLEN_SCHEMA: ScreenSchema = {
  screenId: 'MIJN_PILLEN',
  titleNl: 'Mijn Pillen',
  accessibilityLabel: 'Overzicht van uw medicijnen voor vandaag',
  layout: 'single_column',
  themeVariant: 'default',
  headerVariant: 'title',
  depthFromHome: 1,
  maxPrimaryItems: 4,
  contentBlocks: [
    {
      id: 'medication_list',
      type: 'medication_card',
      accessibilityLabel: 'Uw medicijnen voor vandaag',
      props: {
        groupBy: 'scheduled_time',
        showStatus: true,
        showInstructions: true,
        maxVisible: 4
      }
    }
  ],
  bottomActions: [
    {
      id: 'confirm_taken',
      labelNl: 'Ingenomen',
      icon: 'check',
      action: 'CONFIRM_MEDICATION_TAKEN',
      voiceAlias: ['ingenomen', 'ik heb mijn pillen genomen', 'klaar'],
      accessibilityLabel: 'Bevestig dat u uw medicijnen heeft ingenomen',
      style: 'primary'
    },
    {
      id: 'remind_later',
      labelNl: 'Straks',
      icon: 'clock',
      action: 'SNOOZE_MEDICATION',
      voiceAlias: ['straks', 'later', 'herinner me over tien minuten'],
      accessibilityLabel: 'Herinner mij later aan mijn medicijnen',
      style: 'secondary'
    }
  ],
  persistentElements: {
    emergencyButton: true,
    voiceButton: true,
    haloStatus: false,
    backButton: true
  },
  voice: {
    entrySpeak: 'Dit zijn uw medicijnen voor vandaag.',
    fallbackSpeak: 'Zegt u "ingenomen" als u klaar bent.',
    commands: [
      {
        intentNl: 'bevestig_ingenomen',
        examplePhrases: ['ingenomen', 'ik heb ze genomen', 'klaar', 'gedaan'],
        action: 'CONFIRM_MEDICATION_TAKEN'
      },
      {
        intentNl: 'snoeze_herinnering',
        examplePhrases: ['straks', 'later', 'over tien minuten'],
        action: 'SNOOZE_MEDICATION'
      },
      {
        intentNl: 'vraag_instructies',
        examplePhrases: ['waarvoor is dit?', 'wat doet dit medicijn?', 'uitleg'],
        action: 'EXPLAIN_MEDICATION'
      }
    ],
    distressPhrases: ['ik voel me ziek', 'ik ben misselijk', 'bijwerking']
  },
  dataSources: [
    { key: 'todays_medications', table: 'medication_reminders', offlineCacheTtlSeconds: 300 },
    { key: 'medications_detail', table: 'medications', offlineCacheTtlSeconds: 3600 }
  ]
};
4.3 SCHILD_ROOD (Scam Alert — Red)
TypeScript

export const SCHILD_ROOD_SCHEMA: ScreenSchema = {
  screenId: 'SCHILD_ROOD',
  titleNl: 'Let Op',
  accessibilityLabel: 'Veiligheidswaarschuwing — mogelijke oplichting',
  layout: 'full_screen_overlay',
  themeVariant: 'schild_rood',
  headerVariant: 'minimal',
  depthFromHome: 1,
  maxPrimaryItems: 2,
  contentBlocks: [
    {
      id: 'alert_banner_rood',
      type: 'alert_banner',
      accessibilityLabel: 'Mogelijke oplichting gedetecteerd',
      props: {
        level: 'rood',
        iconName: 'shield-alert',
        headingNl: 'Pas op',
        bodyNl: 'Dit gesprek lijkt verdacht. U hoeft geen geld over te maken of uw codes te geven.'
      }
    }
  ],
  bottomActions: [
    {
      id: 'stop_gesprek',
      labelNl: 'Verbreek verbinding',
      icon: 'phone-off',
      action: 'END_CALL_FLAGGED',
      voiceAlias: ['ophangen', 'verbinding verbreken', 'stop'],
      accessibilityLabel: 'Verbreek de verdachte verbinding',
      style: 'danger'
    },
    {
      id: 'ik_vertrouw_dit',
      labelNl: 'Ik vertrouw dit',
      icon: 'check-circle',
      action: 'DISMISS_SCAM_ALERT',
      voiceAlias: ['ik vertrouw dit', 'dit is goed'],
      accessibilityLabel: 'Markeer dit gesprek als betrouwbaar',
      confirmationRequired: true,
      style: 'secondary'
    }
  ],
  persistentElements: {
    emergencyButton: true,
    voiceButton: true,
    haloStatus: false,
    backButton: false                // no back on a ROOD alert
  },
  voice: {
    entrySpeak: 'Pas op. Dit gesprek lijkt verdacht. U hoeft nooit uw pincode te geven.',
    fallbackSpeak: 'Zeg "ophangen" als u wilt stoppen.',
    commands: [
      {
        intentNl: 'verbreek_verbinding',
        examplePhrases: ['ophangen', 'stop', 'weg'],
        action: 'END_CALL_FLAGGED'
      }
    ],
    distressPhrases: ['ik ben bang', 'help', 'ze bedreigen me']
  },
  dataSources: [
    { key: 'scam_event', table: 'scam_events', offlineCacheTtlSeconds: 0 }
  ]
};

export const BUURT_SCHEMA: ScreenSchema = {
  screenId: 'BUURT',
  titleNl: 'Uw Buurt',
  accessibilityLabel: 'De Buurtverbinder scherm',
  layout: 'single_column',
  themeVariant: 'default',
  headerVariant: 'title',
  depthFromHome: 1,
  maxPrimaryItems: 4,
  contentBlocks: [
    {
      id: 'buurt_count',
      type: 'info_card',
      accessibilityLabel: 'Anoniem aantal buurtbewoners dat HAVEN gebruikt',
      props: {
        contentKey: 'buurt.nearby_count'
      }
    },
    {
      id: 'interest_matches',
      type: 'tag_list',
      accessibilityLabel: 'Gedeelde interesses in de buurt',
      props: {
        contentKey: 'buurt.shared_interests',
        maxItems: 3
      }
    },
    {
      id: 'local_events',
      type: 'event_cards',
      accessibilityLabel: 'Aanbevolen lokale activiteiten',
      props: {
        contentKey: 'buurt.suggested_events',
        maxItems: 2
      }
    }
  ],
  bottomActions: [
    {
      id: 'find_walk_buddy',
      labelNl: 'Wandelmaatje',
      voiceAlias: ['wandelmaatje', 'wandel partner'],
      accessibilityLabel: 'Zoek een wandelmaatje in uw buurt',
      style: 'primary'
    },
    {
      id: 'manage_interests',
      labelNl: 'Interesses',
      voiceAlias: ['interesses', 'hobby aanpassen'],
      accessibilityLabel: 'Beheer uw interesse-tags',
      style: 'secondary'
    }
  ],
  persistentElements: {
    emergencyButton: true,
    voiceButton: true,
    haloStatus: false,
    backButton: true
  },
  voice: {
    entrySpeak: 'In uw buurt zijn mensen die ook HAVEN gebruiken.',
    fallbackSpeak: 'Wilt u een wandelmaatje zoeken, of uw interesses aanpassen?',
    commands: [
      {
        intentNl: 'find_walk_buddy',
        examplePhrases: ['wandelmaatje', 'wandel partner'],
        action: 'find_walk_buddy'
      },
      {
        intentNl: 'read_nearby_count',
        examplePhrases: ['wie is er in mijn buurt', 'hoeveel mensen'],
        action: 'read_nearby_count'
      },
      {
        intentNl: 'read_events',
        examplePhrases: ['activiteiten', 'wat is er te doen'],
        action: 'read_events'
      },
      {
        intentNl: 'manage_interests',
        examplePhrases: ['interesses', 'hobby aanpassen'],
        action: 'manage_interests'
      }
    ],
    distressPhrases: []
  },
  dataSources: [
    {
      key: 'buurt_discover',
      table: 'neighbourhood_profiles',
      offlineCacheTtlSeconds: 3600
    }
  ]
};

export const BUURT_VERBINDING_SCHEMA: ScreenSchema = {
  screenId: 'BUURT_VERBINDING',
  titleNl: 'Verbindingsverzoek',
  accessibilityLabel: 'Verbindingsverzoek scherm',
  layout: 'focused_decision',
  themeVariant: 'default',
  headerVariant: 'title',
  depthFromHome: 2,
  maxPrimaryItems: 2,
  contentBlocks: [
    {
      id: 'connection_context',
      type: 'info_card',
      accessibilityLabel: 'Beschrijving van de voorgestelde kennismaking',
      props: {
        contentKey: 'buurt.connection.context'
      }
    },
    {
      id: 'privacy_reassurance',
      type: 'info_text',
      accessibilityLabel: 'Informatie over uw privacy',
      props: {
        contentKey: 'buurt.connection.privacy_note'
      }
    }
  ],
  bottomActions: [
    {
      id: 'accept_connection',
      labelNl: 'Ja, leuk!',
      voiceAlias: ['ja', 'ja leuk', 'akkoord'],
      accessibilityLabel: 'Accepteer het verbindingsverzoek',
      style: 'primary'
    },
    {
      id: 'decline_connection',
      labelNl: 'Nee, bedankt',
      voiceAlias: ['nee', 'nee bedankt', 'geen interesse'],
      accessibilityLabel: 'Wijs het verbindingsverzoek af',
      style: 'secondary'
    }
  ],
  persistentElements: {
    emergencyButton: true,
    voiceButton: true,
    haloStatus: false,
    backButton: true
  },
  voice: {
    entrySpeak: 'Iemand in uw buurt wil graag kennismaken. Wilt u ja zeggen?',
    fallbackSpeak: 'Zeg "ja" of "nee".',
    commands: [
      {
        intentNl: 'accept_connection',
        examplePhrases: ['ja', 'ja leuk', 'akkoord'],
        action: 'accept_connection'
      },
      {
        intentNl: 'decline_connection',
        examplePhrases: ['nee', 'nee bedankt', 'geen interesse'],
        action: 'decline_connection'
      }
    ],
    distressPhrases: []
  },
  dataSources: []
};

5. Screen Renderer Architecture
TypeScript

// components/ScreenRenderer.tsx

import React, { useEffect } from 'react';
import { View, AccessibilityInfo } from 'react-native';
import { ScreenSchema } from '../types/screen-schema';
import { useScreenData } from '../hooks/useScreenData';
import { useVoiceEngine } from '../hooks/useVoiceEngine';
import { renderBlock } from './blocks';
import { EmergencyButton } from './EmergencyButton';
import { VoiceButton } from './VoiceButton';

interface Props {
  schema: ScreenSchema;
}

export const ScreenRenderer: React.FC<Props> = ({ schema }) => {
  const { data, loading, offline } = useScreenData(schema.dataSources);
  const { bootVoice, speak } = useVoiceEngine(schema.voice);

  useEffect(() => {
    bootVoice();
    speak(schema.voice.entrySpeak);
    AccessibilityInfo.announceForAccessibility(schema.accessibilityLabel);
  }, [schema.screenId]);

  const resolvedBlocks = schema.contentBlocks.map(block => ({
    ...block,
    data: data[block.id] ?? null,
  }));

  return (
    <View
      accessible={true}
      accessibilityLabel={schema.accessibilityLabel}
      style={[styles.container, themeStyles[schema.themeVariant]]}
    >
      {resolvedBlocks.map(block => renderBlock(block, offline))}

      {schema.persistentElements.emergencyButton && (
        <EmergencyButton accessibilityLabel="Noodknop — bel 112 of stuur bericht naar familie" />
      )}

      {schema.persistentElements.voiceButton && (
        <VoiceButton voiceSchema={schema.voice} />
      )}
    </View>
  );
};
6. CI Schema Test Suite (UX Constitution Enforcement)
TypeScript

// __tests__/schema-constitution.test.ts

import { SCREEN_REGISTRY } from '../schema/registry';

// ✅ CORRECT EU AI ACT COMPLIANCE RULE:
// EU AI Act Art. 50 requires disclosure that the user is interacting with
// an AI system (unless context makes it obvious). Therefore:

// BANNED — because they are evasive/misleading (not because they mention AI):
const BANNED_AI_COPY = [
  'Ik ben een echte medewerker',        // false claim of human identity
  'Ik ben geen computer',               // deceptive denial
  'U spreekt met een persoon',          // impersonation
];

// REQUIRED — first interaction per day must include a disclosure variant:
const REQUIRED_AI_DISCLOSURE_NL = [
  // Option A (warm, brief):
  'Hallo, ik ben HAVEN — uw digitale hulp.',
  // Option B (slightly more explicit, for first-ever use):
  'Hallo, ik ben HAVEN. Ik ben een digitale hulp, geen echte persoon.',
  // Option C (if elder directly asks "ben jij een mens?"):
  'Nee, ik ben een digitale hulp. Maar ik ben er wel voor u.',
];

// RULE: If a user directly asks "ben jij een mens?" or "ben jij echt?",
// HAVEN MUST answer honestly. This is a hard product rule, not just a
// compliance rule — it is also the right thing to do for elder dignity.

// STILL BANNED (tone/anxiety reasons, unchanged):
const BANNED_WORDS_NL = [
  'fout', 'foutmelding', 'error', 'mislukt',
  'gevaar', 'gevaarlijk', 'waarschuwing', 'kritiek',
  'illegaal',
  'nooit', 'altijd', 'onmogelijk',
];

describe('HAVEN UX Constitution', () => {

  Object.entries(SCREEN_REGISTRY).forEach(([screenId, schema]) => {

    describe(`Screen: ${screenId}`, () => {

      it('depth from home must be ≤ 2', () => {
        expect(schema.depthFromHome).toBeLessThanOrEqual(2);
      });

      it('bottom actions must be ≤ 2', () => {
        expect(schema.bottomActions.length).toBeLessThanOrEqual(2);
      });

      it('max primary items must be ≤ 4', () => {
        expect(schema.maxPrimaryItems).toBeLessThanOrEqual(4);
      });

      it('all content blocks must have unique IDs', () => {
        const ids = schema.contentBlocks.map(b => b.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('all content blocks must have accessibility labels', () => {
        schema.contentBlocks.forEach(block => {
          expect(block.accessibilityLabel).toBeTruthy();
          expect(block.accessibilityLabel.length).toBeGreaterThan(0);
        });
      });

      it('voice fallback must exist and be ≤ 15 words', () => {
        const wordCount = schema.voice.fallbackSpeak.split(' ').length;
        expect(wordCount).toBeLessThanOrEqual(15);
      });

      it('every data source must define offlineCacheTtlSeconds', () => {
        schema.dataSources.forEach(ds => {
          expect(ds.offlineCacheTtlSeconds).toBeDefined();
          expect(typeof ds.offlineCacheTtlSeconds).toBe('number');
        });
      });

      it('emergency button must be present (except modals)', () => {
        if (schema.layout !== 'full_screen_overlay') {
          expect(schema.persistentElements.emergencyButton).toBe(true);
        }
      });

      it('must not contain banned Dutch words in any text', () => {
        const isShieldScreen = screenId.startsWith('SCHILD');
        const allText = JSON.stringify(schema).toLowerCase();

        BANNED_WORDS_NL.forEach(word => {
          if (word === 'nooit' && isShieldScreen) return; // SCHILD exception
          expect(allText).not.toContain(word);
        });
      });

      it('all bottom actions must have voice aliases', () => {
        schema.bottomActions.forEach(action => {
          expect(action.voiceAlias).toBeDefined();
          expect(action.voiceAlias!.length).toBeGreaterThan(0);
        });
      });

      it('distress phrases must be defined on all screens', () => {
        expect(schema.voice.distressPhrases.length).toBeGreaterThan(0);
      });

    });
  });
});
7. Accessibility
Standard	Requirement
WCAG 2.1 Level AA	Minimum compliance for all screens
WCAG 2.1 Level AAA	Target for primary text and primary actions
Touch targets	Minimum 56×56dp (exceeds WCAG 44×44px)
Font sizes	Body: 18sp minimum; Primary actions: 24sp minimum; Headers: 32sp minimum
Font scaling	Respect system font scale up to 200%; layouts tested at 150% and 200%
Screen reader	Full VoiceOver (iOS) and TalkBack (Android) support; all interactive elements labelled
Colour	Never use colour as the only differentiator; always pair with icon + text
High contrast mode	Supported via high_contrast profile flag; all themes have high-contrast variants
Haptics	All confirmations have haptic feedback; all alerts have a distinct haptic pattern
Audio alerts	All alerts have a voice equivalent; visual-only alerts are never used alone
Document 08 — Family Dashboard Specification
1. Overview
The family dashboard is a Next.js 14 (App Router) web application hosted on Vercel (EU region). It is the primary interface for family members (mantelzorgers) to stay connected with their elder, monitor wellbeing, and respond to alerts.

The dashboard is role-aware — what a primary family member sees differs from a secondary family member, based on the permissions granted in family_relationships.

2. Screen Inventory
Screen	Route	Access	Description
Login	/inloggen	Public	Email/password login
Dashboard Home	/dashboard	Family	Overview: halo, alerts, quick actions
Alerts	/dashboard/meldingen	Family (can_view_safety)	All scam alerts, medication misses, zone exits
Alert Detail	/dashboard/meldingen/[id]	Family (can_view_safety)	Full scam event details + pipeline scores
Medications	/dashboard/medicijnen	Family (can_view_medications)	Today's status + history
Messages	/dashboard/berichten	Family (can_view_messages)	Send/read family messages
Stories	/dashboard/verhalen	Family (can_view_stories)	Life story archive (read-only)
Wellness	/dashboard/welzijn	Family (can_view_health)	Wellness trends + check-in history
Location	/dashboard/locatie	Family (can_view_location_events)	Fuzzed map: safe zone + last known area
Buurt Connections	/dashboard/buurt	Family (can_view_stories + consent)	Neighbourhood connections overview
Weekly Digest	/dashboard/overzicht	Family	Weekly safety + wellbeing summary
Elder Profile	/dashboard/profiel	Primary family only	Edit elder profile, manage permissions
Medications Setup	/dashboard/medicijnen/beheren	Primary + can_manage_medications	Add/edit medications
Safe Zone Setup	/dashboard/locatie/zone	Primary + can_manage_safe_zone	Edit safe zone on map
Settings	/dashboard/instellingen	Family	Notification preferences, account
3. Halo Status Component
The halo is the primary "how is mum/dad doing today" indicator on the dashboard home. It maps to the same three-axis model in the elder app.

Axis	Colour	Logic
Pillen (green/amber/red)	Green	All medications taken today
Amber	Some missed; not yet escalated
Red	Escalated; family notification sent
Veiligheid (green/amber/red)	Green	No scam events in 7 days
Amber	Amber scam event in last 24h
Red	Rood or Zwart event in last 24h
Familie (green/amber/grey)	Green	Message exchanged in last 48h
Grey	No family interaction in 7+ days
4. Real-time Alert Experience
When an alert arrives:

Browser push notification (if tab not active)
In-app toast notification (if tab active): Supabase Realtime subscription
Dashboard halo status updates live
Alert appears at top of /dashboard/meldingen
Alert tone by level:

Level	Visual	Sound	Action Required
Amber	Soft orange banner	Gentle chime	No — informational
Rood	Orange/red card, pulse animation	Alert tone	Yes — review recommended
Zwart	Full-screen warning overlay with bank deep-link	Urgent tone	Yes — immediate review and verification required
5. Permission-Scoped Views
The dashboard checks family_relationships permissions on every sensitive page via Next.js middleware:

TypeScript

// middleware.ts (simplified)
export async function middleware(request: NextRequest) {
  const { session } = await getSession(request);
  const { data: relationship } = await supabase
    .from('family_relationships')
    .select('*')
    .eq('family_member_id', session.user.id)
    .single();

  const PERMISSION_MAP: Record<string, keyof FamilyRelationship> = {
    '/dashboard/medicijnen': 'can_view_medications',
    '/dashboard/locatie': 'can_view_location_events',
    '/dashboard/verhalen': 'can_view_stories',
    '/dashboard/welzijn': 'can_view_health',
    '/dashboard/meldingen': 'can_view_safety',
  };

  const requiredPermission = PERMISSION_MAP[request.nextUrl.pathname];
  if (requiredPermission && !relationship[requiredPermission]) {
    return NextResponse.redirect(new URL('/dashboard/geen-toegang', request.url));
  }
}
6. Location Map (Fuzzed Privacy Model)
The location screen shows:

Elder's safe zone as a circle on a Dutch map (Mapbox/OpenStreetMap, OSM preferred for EU data residency)
Last known neighbourhood-level fuzzed position (100m+ noise applied before storage)
Safe zone exit events (time of exit, time of return — no route shown)
The map never shows:

Precise GPS coordinates
Route history
Real-time tracking
This is enforced at:

Database level (fuzzed geometry stored; precise auto-deleted after 24h)
API level (PostgREST view masks location_precise column for family role)
UI level (map component only accepts fuzzed coordinates)
7. Family Message Composer
Supported message types (matching family_messages schema):

Type	UI	Elder App Display
Tekst	Text input (max 280 chars, large font preview)	Voice-read aloud by HAVEN
Voice note	Browser mic recording (max 60s)	Playable audio card
Foto	Image upload (max 10MB, HEIC supported)	Full-screen photo
Video hallo	Browser camera recording (max 60s)	Auto-plays once on open
Tekening	Simple canvas (finger/mouse drawing)	Displayed as image
8. Weekly Digest View
The weekly digest (/dashboard/overzicht) renders the safety_digests table record for the current week:

text

┌─────────────────────────────────────────────┐
│ Week van 2 juni 2026                        │
├────────────────────┬────────────────────────┤
│ Veiligheid         │ 2 amber meldingen      │
│                    │ 0 rood/zwart            │
├────────────────────┼────────────────────────┤
│ Medicijnen         │ 94% ingenomen          │
│                    │ 2x gemist (dinsdag)    │
├────────────────────┼────────────────────────┤
│ Welzijn (gem.)     │ Humeur: 4.1/5          │
│                    │ Energie: 3.8/5         │
├────────────────────┼────────────────────────┤
│ Familie contact    │ 6 berichten gewisseld  │
└────────────────────┴────────────────────────┘
Family dashboard BUURT visibility rules:
Family members can see the BUURT section ONLY if:
1. Elder has set `neighbourhood_profiles.family_can_see_connections = true` AND
2. `family_relationships.can_view_stories = true` (KRING permission proxy)

What family can see (when permitted):
- Whether elder has a neighbourhood profile (active/inactive)
- Interest tags elder has selected
- Count of connections (accepted only)
- Events elder has marked as interesting

What family can NEVER see (hard rule):
- Identity of any other elder in BUURT (even after connection is accepted)
- Connection request content or anonymous messages
- Whether elder declined any requests (privacy of third parties)

Family dashboard BUURT section UI:
- "Buurt" tab in KRING section
- Shows: "[Voornaam] heeft 2 buurtverbindingen" + interest tags
- Shows: "Komende activiteiten: [event title], [date]"
- Cannot initiate connections on behalf of elder
- Can help set up neighbourhood profile during onboarding

Document 09 — Integrations Specification
1. Integration Inventory
Integration	Pillar	Phase	Type	Data Stored
OpenAI Whisper	STEM	MVP	STT API	Transcript text only; audio not retained by OpenAI
OpenAI Embeddings	STEM + SCHILD + KRING	MVP	Embedding API	Embedding vectors in pgvector
ElevenLabs	STEM	MVP	TTS API	No data stored; audio streamed and ephemeral
Expo Push (APNs/FCM)	All	MVP	Push API	Push tokens only
Tink / Gocardless	SCHILD	Phase 2	PSD2 AISP	Masked transaction metadata only
MedMij / PGO	ANKER	Phase 2	FHIR R4	Medication and appointment data
Call reputation service	SCHILD	Phase 2	Reputation API	Cached score + source (phone hashed)
OpenStreetMap / Mapbox	KOMPAS	MVP	Tile API	No personal data
ANBO / KBO-PCOB	KRING	Phase 3	Event feed	Community event metadata
2. OpenAI Whisper
Purpose: Dutch STT for voice interactions Endpoint: POST https://api.openai.com/v1/audio/transcriptions Model: whisper-1

Request (from fn-voice-pipeline):

text

Content-Type: multipart/form-data
file: <audio file, 16kHz mono WAV, max 25MB>
model: whisper-1
language: nl
response_format: json
Response:

JSON

{ "text": "Ik heb mijn pillen al ingenomen." }
Error handling:

429 Rate limit: retry with exponential backoff (3 retries max)
400 Audio too short (< 0.1s): return empty transcript, trigger fallback voice prompt
500: return fallback voice prompt ("Kunt u dat herhalen?")
Data governance:

Audio is sent to OpenAI and not stored after transcription (per OpenAI DPA)
OpenAI DPA signed and on file
Transcript (text only) is stored in voice_interactions
3. OpenAI Embeddings
Purpose: Companion memory similarity, scam event pattern matching, story retrieval Endpoint: POST https://api.openai.com/v1/embeddings Model: text-embedding-3-small Dimensions: 1536

Request:

JSON

{
  "model": "text-embedding-3-small",
  "input": "Ik houd van mijn kleinkinderen Sofia en Tim.",
  "dimensions": 1536
}
Response:

JSON

{
  "data": [{ "embedding": [...], "index": 0 }],
  "usage": { "prompt_tokens": 14, "total_tokens": 14 }
}
Usage limits:

Called for every voice interaction (companion memory upsert)
Called for every scam event (similarity search)
Called for every life story transcription
Estimated: ~500 tokens/elder/day → ~15k tokens/month/elder
Batched where possible (max 2048 inputs per request)
4. ElevenLabs TTS
Purpose: nl-NL voice output for STEM companion Endpoint: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream Voice: Custom nl-NL voice "Hanna" (voice_id stored in Supabase Vault)

Request:

JSON

{
  "text": "Goedemorgen! U heeft vandaag twee medicijnen om negen uur.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.75,
    "similarity_boost": 0.85,
    "style": 0.3,
    "use_speaker_boost": true
  }
}
Response: Audio stream (MP3); streamed to client for low-latency first-byte delivery.

Storage: Audio is NOT stored permanently. The stream is played directly on the device. For offline fallback (Phase 2), a limited set of pre-generated phrases are cached locally.

Failure mode: If ElevenLabs is unavailable, fall back to expo-speech (device TTS) with language: nl-NL. Quality degrades but functionality is maintained.

5. Expo Push Notifications
Purpose: Alert family and elders of medication misses, scam events, family messages Service: Expo Push API → routes to APNs (iOS) or FCM (Android)

Token registration:

TypeScript

// On app launch (after permission granted)
const token = await Notifications.getExpoPushTokenAsync({
  projectId: Constants.expoConfig.extra.eas.projectId
});
await supabase.from('push_tokens').upsert({
  profile_id: session.user.id,
  token: token.data,
  platform: Platform.OS,
  active: true
});
Sending (from fn-notification-dispatch):

TypeScript

await fetch('https://exp.host/--/api/v2/push/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: pushToken,
    title: titleNl,
    body: bodyNl,
    data: extraData,
    priority: priority === 'high' ? 'high' : 'normal',
    sound: priority === 'high' ? 'default' : null,
    badge: 1
  })
});
Consent: Notification permission requested with Dutch explanation. Elder can opt out per notification type in settings.

6. PSD2 / Tink — Banking Integration (Phase 2)
Purpose: Read-only access to Dutch bank accounts for transaction anomaly detection Provider target: Tink (EU-licensed AISP) or Gocardless Banks supported (NL): ING, Rabobank, ABN AMRO, SNS, Triodos

Consent flow:

Elder (or primary family with explicit consent) initiates in-app
HAVEN redirects to Tink OAuth flow
Elder selects their bank and authenticates (strong customer authentication — bank's own)
Tink returns access token → stored encrypted in Supabase Vault (not in DB)
financial_accounts record created (masked account details only)
Data received and stored:

Account identifier: masked (last 4 digits of IBAN only)
Bank name
Transaction date, amount (cents, EUR), counterparty name, description
NO full IBAN, NO full account number, NO authentication credentials
Anomaly scoring:

Large unusual amounts (> 3 standard deviations from 90-day average)
New counterparty + large amount
Multiple small transactions to same new counterparty ("structuring")
Transaction to counterparty flagged in phone_reputation_cache
PSD2 legal basis: AVG Article 6(1)(a) explicit consent + PSD2 Article 67 (AISP access rights)

7. MedMij / PGO — Health Records (Phase 2)
Purpose: Import medication history and GP correspondence from Dutch personal health record Standard: MedMij Afsprakenstelsel v2.x; FHIR R4

Prerequisites:

HAVEN must obtain MedMij toelating (accreditation) — initiate 6 months before Phase 2 launch
Elder must authenticate via a MedMij-approved identity provider (e.g., DigiD — deferred pending Phase 3+ legal/BSN review, see ADR-011)
Elder must have a PGO account (or HAVEN creates one as a PGO participant)
Data imported:

MedicationRequest (FHIR R4): maps to medications table
Appointment (FHIR R4): maps to tasks (huisarts appointments)
AllergyIntolerance (FHIR R4): maps to elder_profiles.allergies
FHIR R4 resource mapping (medications example):

text

MedicationRequest.medicationCodeableConcept.text → medications.name_nl
MedicationRequest.dosageInstruction[0].text → medications.dose_description_nl
MedicationRequest.dosageInstruction[0].timing → medications.frequency + schedule_times
MedicationRequest.medication.code (G-Standaard) → medications.g_standaard_code
8. Call Reputation Service (Phase 2)
Purpose: Look up reputation score for incoming phone numbers in the SCHILD pipeline Target providers (NL-specific):

Fraudehelpdesk API (if public API available) — Dutch fraud reports database
Truecaller API — global call reputation
Marktplaats Veiligheidsteam data sharing (partnership)
Request:

TypeScript

const score = await lookupPhoneReputation(hashedPhone);
// Returns: { score: 0–100, reportCount: number, source: string }
Caching: Results cached in phone_reputation_cache for 7 days. Cache-first always — no live lookup during an active call (latency constraints).

Document 10 — Testing & Observability
1. Testing Strategy
1.1 Philosophy
Testing in HAVEN must validate not only correctness but tone, cognitive load, and dignity. The UX constitution tests (Document 07) are first-class tests — not lint rules.

1.2 Test Pyramid
text

         ┌────────────────────────┐
         │     E2E Tests          │  ← Maestro (iOS) + Playwright (web)
         │  (Critical user flows) │    ~20 flows
         ├────────────────────────┤
         │   Integration Tests    │  ← Supabase local + Edge Function tests
         │  (API + DB contracts)  │    ~80 tests
         ├────────────────────────┤
         │      Unit Tests        │  ← Jest + React Native Testing Library
         │  (Components + logic)  │    ~200 tests
         ├────────────────────────┤
         │  Schema Constitution   │  ← Jest (Document 07, Section 6)
         │     Tests (CI gate)    │    ~10 rules × N screens
         └────────────────────────┘
1.3 Unit Tests
Framework: Jest + React Native Testing Library Coverage target: 80% line coverage on business logic; 70% on UI components

Key areas:

Intent classifier (Dutch phrase → intent mapping)
Medication escalation state machine logic
Scam composite score calculation
Screen schema type validation
Notification dispatch logic
Date/time utilities (Europe/Amsterdam timezone handling)
Dutch number/currency formatting (€ EUR, commas not dots)
1.4 Integration Tests
Framework: Jest + Supabase local (supabase start) Approach: Each Edge Function has a corresponding integration test that:

Seeds the local Supabase DB with fixture data
Calls the Edge Function with test input
Asserts the expected DB state changes + return values
TypeScript

// __tests__/integration/fn-medication-escalation.test.ts
describe('fn-medication-escalation', () => {
  it('escalates a reminder after 30 minutes with no response', async () => {
    // Seed: create a reminder in 'gesnoozed_2' state, 35 minutes ago
    await seedMedicationReminder({ status: 'gesnoozed_2', scheduledAgo: 35 });

    // Run the function
    await invoke('fn-medication-escalation');

    // Assert: status updated to 'geëscaleerd', family notification created
    const reminder = await getReminder();
    expect(reminder.status).toBe('geëscaleerd');
    const notification = await getLatestNotification();
    expect(notification.notification_type).toBe('medicijn_gemist');
  });
});
RLS integration tests:

TypeScript

describe('RLS: family cannot see companion_memory', () => {
  it('returns empty result for family role', async () => {
    const familyClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${familyJwt}` } }
    });
    const { data, error } = await familyClient
      .from('companion_memory')
      .select('*');
    expect(data).toHaveLength(0); // RLS blocks all rows
  });
});
1.5 E2E Tests
Framework:

Elder app (iOS): Maestro
Family dashboard (web): Playwright
Critical flows tested (E2E):

Flow	Tool	Priority
Elder onboarding (family sets up → elder activates)	Maestro	P0
Medication reminder → confirmation	Maestro	P0
Medication reminder → escalation to family	Maestro + Playwright	P0
Scam amber alert → elder dismisses	Maestro	P0
Scam rood alert → family notified	Maestro + Playwright	P0
Voice command: "Ik heb mijn pillen genomen"	Maestro	P0
Crisis phrase: "Ik ben gevallen" → family notified	Maestro + Playwright	P0
Safe zone exit → family dashboard alert	Maestro + Playwright	P1
Family sends voice note → elder receives	Maestro + Playwright	P1
Life story recording → transcript	Maestro	P1
Weekly digest generation → family email	Playwright	P1
Elder consent withdrawal → family loses access	Maestro + Playwright	P0
Maestro example (medication confirmation):

YAML

# flows/medication-confirmation.yaml
appId: nl.haven.elder
---
- launchApp
- waitForAnimationToEnd
- assertVisible: "Mijn Pillen"
- tapOn: "Mijn Pillen"
- assertVisible: "Metformine 500mg"
- tapOn: "Ingenomen"
- assertVisible: "Goed gedaan"
- assertNotVisible: "Ingenomen" # button should be gone post-confirmation
1.6 Accessibility Testing
Test	Tool	Standard
Colour contrast	Automated: axe-core (web), Accessibility Scanner (Android)	WCAG 2.1 AA
Touch target sizes	Manual + automated UI test assertions	WCAG 2.5.5 (56×56dp)
Screen reader flow (VoiceOver)	Manual testing protocol — every screen	WCAG 4.1.2
Screen reader flow (TalkBack)	Manual testing protocol — every screen	WCAG 4.1.2
Font scaling (200%)	Automated snapshot tests	WCAG 1.4.4
Keyboard navigation (web dashboard)	Playwright keyboard navigation tests	WCAG 2.1.1
1.7 Test Data & Fixtures
No real elder personal data is ever used in tests
Fixture data is entirely synthetic: generated Dutch names (Jan de Vries, Maria Bakker). No BSN numbers in test data — HAVEN does not store or process BSN
Synthetic voice audio for Whisper testing: recorded by team members reading Dutch test phrases
Test Supabase project (separate from production): haven-test.supabase.co
2. Observability
2.1 Structured Logging
All Edge Functions emit structured JSON logs:

JSON

{
  "timestamp": "2026-06-10T08:32:11.234Z",
  "level": "info",
  "function": "fn-voice-pipeline",
  "elder_id_hash": "sha256:abc123...",  // hashed — never raw UUID in logs
  "intent": "bevestig_ingenomen",
  "duration_ms": 847,
  "whisper_tokens": 12,
  "elevenlabs_chars": 48,
  "action_taken": "CONFIRM_MEDICATION_TAKEN",
  "distress_detected": false
}
Note: elder_id is always SHA-256 hashed in logs. Never log raw personal data.

## Observability stack (v1.2.1 — Supabase-native + standard OSS)

> ⚠️ **CloudWatch references removed in v1.2.1.**
> Supabase Edge Functions do not natively emit to CloudWatch.
> The following stack is the canonical HAVEN observability approach.

### Layer 1 — Error tracking (client + server)
**Tool:** Sentry (EU endpoint — `https://sentry.io`, hosted in EU region)
**What it captures:**
- Elder app crashes + unhandled exceptions (React Native Sentry SDK)
- Family dashboard errors (Next.js Sentry SDK)
- Edge Function exceptions (Deno Sentry SDK)

**PII scrubbing rules (mandatory):**
```typescript
// sentry.config.ts — applies to all surfaces
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.HAVEN_ENV,
  beforeSend(event) {
    // Strip all personal data before sending to Sentry
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      event.user = { id: event.user.id }; // keep only opaque ID
    }
    // Strip request bodies (may contain voice transcripts)
    if (event.request?.data) {
      delete event.request.data;
    }
    return event;
  },
});
```

### Layer 2 — Edge Function logs + metrics
**Tool:** Supabase built-in Edge Function logs → **log drain to Logflare** (EU region)
or alternatively **Axiom** (EU region, Supabase native integration)

**Structured log format (emit from every Edge Function):**
```typescript
// packages/utils/logger.ts
export function logEvent(params: {
  fn: string;
  elder_id_hash: string;   // SHA-256 of elder_id — never raw ID in logs
  duration_ms: number;
  status: 'success' | 'error' | 'fallback';
  intent?: string;
  error_code?: string;
}) {
  console.log(JSON.stringify({
    ...params,
    ts: new Date().toISOString(),
    env: Deno.env.get('HAVEN_ENV'),
  }));
}
```

**What every Edge Function must log (at minimum):**
| Field | Type | Notes |
|---|---|---|
| `fn` | string | Function name |
| `elder_id_hash` | string | SHA-256(elder_id) — never raw |
| `duration_ms` | number | Wall clock time |
| `status` | enum | success / error / fallback |
| `intent` | string | (voice pipeline only) detected intent |
| `error_code` | string | (errors only) |

### Layer 3 — Custom metrics table (p50/p95 dashboarding)
```sql
-- Performance metrics table (service role inserts; no client access)
CREATE TABLE perf_metrics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fn_name      text NOT NULL,
  duration_ms  integer NOT NULL,
  status       text NOT NULL,
  env          text DEFAULT 'production',
  recorded_at  timestamptz DEFAULT now()
);

-- No RLS client access; service role only
ALTER TABLE perf_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE perf_metrics FORCE ROW LEVEL SECURITY;

-- Retention: 90 days of raw metrics (then aggregate + purge)
SELECT cron.schedule(
  'purge-perf-metrics',
  '0 5 * * 0',   -- weekly, Sunday 05:00
  $$
    DELETE FROM perf_metrics
    WHERE recorded_at < now() - interval '90 days';
  $$
);

-- p95 query (use in Supabase Studio dashboard or Metabase):
SELECT
  fn_name,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms,
  count(*) AS sample_count,
  date_trunc('hour', recorded_at) AS hour
FROM perf_metrics
WHERE recorded_at > now() - interval '24 hours'
  AND env = 'production'
GROUP BY fn_name, hour
ORDER BY hour DESC, fn_name;
```

### Layer 4 — SLO measurement (canonical, replaces all CloudWatch references)

| SLO | Metric source | Measurement query |
|---|---|---|
| Voice pipeline p95 ≤ 3s | `perf_metrics` WHERE fn_name = 'fn-voice-pipeline' | `percentile_cont(0.95)` over rolling 1h window |
| Push delivery p95 ≤ 5s | `notifications.created_at` vs `notifications.sent_at` | `EXTRACT(EPOCH FROM (sent_at - created_at)) * 1000` |
| Safe-zone notification p95 ≤ 15s | `location_events.created_at` vs `notifications.created_at` | JOIN on metadata->>'source_event_id' |
| Medication escalation p95 ≤ 10min | `medication_reminders.scheduled_time` vs `medication_reminders.first_reminded_at` | EXTRACT EPOCH |
| Elder app cold start p95 ≤ 4s | Sentry performance transactions | Filter: op='app.start' |
| Family dashboard TTFB p95 ≤ 800ms | Vercel Analytics (built-in) | No additional setup |

### Layer 5 — Alerting (PagerDuty / Slack integration)
**Tool:** Supabase Database Webhooks → Slack webhook (staging/production alerts channel)

```sql
-- Alert on P0 error spike (>5 errors in 5 minutes from any Edge Function)
-- Implement as a Supabase Database Webhook on perf_metrics INSERT
-- with a pg_notify trigger:

CREATE OR REPLACE FUNCTION notify_error_spike()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  error_count integer;
BEGIN
  IF NEW.status = 'error' THEN
    SELECT count(*) INTO error_count
    FROM perf_metrics
    WHERE status = 'error'
      AND fn_name = NEW.fn_name
      AND recorded_at > now() - interval '5 minutes'
      AND env = 'production';

    IF error_count >= 5 THEN
      PERFORM pg_notify(
        'haven_alert',
        json_build_object(
          'type',     'error_spike',
          'fn',       NEW.fn_name,
          'count',    error_count,
          'ts',       now()
        )::text
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_error_spike_alert
  AFTER INSERT ON perf_metrics
  FOR EACH ROW EXECUTE FUNCTION notify_error_spike();
```

**Slack message format** (sent by a Supabase Edge Function subscribed to `haven_alert`):
```
🚨 HAVEN ALERT — Production
Function: fn-voice-pipeline
Error count: 6 in last 5 minutes
Time: 2026-06-10T14:32:00Z
Action: Check Logflare → https://logflare.app/sources/haven-production
```
```

2.4 Performance Budgets
Metric	Budget
Elder app cold start (iPhone SE 2022)	< 2.5 seconds to interactive
Elder app cold start (mid-range Android)	< 3.5 seconds to interactive
Home screen render (warm start)	< 500ms
Voice button to first audio byte	< 1.5 seconds (online)
Voice button to first audio byte	< 500ms (offline cached response)
Family dashboard LCP (desktop)	< 1.2 seconds
Family dashboard LCP (mobile)	< 2.0 seconds
Family dashboard FID	< 100ms
3. Cost Model
3.1 Assumptions (per 1,000 active elder users/month)
Service	Usage Estimate	Unit Cost	Monthly Cost
Supabase Pro	1 project	€25/month	€25
Supabase Compute	2× small instances	€15/month each	€30
Supabase Storage	~50GB (voice notes, photos)	€0.021/GB	~€1
OpenAI Whisper	1,000 elders × 10 voice interactions/day × 30 days × avg 5s = 1,500,000 seconds	$0.006/min = $0.0001/sec	~€900
OpenAI Embeddings	~15k tokens/elder/month × 1,000 = 15M tokens	$0.02/1M tokens	~€0.30
ElevenLabs	1,000 elders × 10 responses/day × 30 days × avg 50 chars = 15M chars	€0.30/1,000 chars (Creator plan)	~€4,500
Expo Push	1,000 elders








# HAVEN — Addendum Document Suite (v1.0.0)

**Status:** Approved — SSOT addendums to `Havenbuildcompletedesigndoc.md`
**Version:** 1.0.0
**Last updated:** 2026-06-10
**Locale:** Netherlands (nl-NL) / EU
**These documents patch the gaps identified in the gap audit and together with `Havenbuildcompletedesigndoc.md` constitute the complete engineer reference.**

---

# Addendum A — RLS Policies (Complete SQL)

**File:** `docs/addenda/addendum-a-rls-canonical.md`

> [!IMPORTANT]
> The canonical Row-Level Security (RLS) policies have been moved to [addendum-a-rls-canonical.md](file:///Users/macbookprom1pro/.gemini/antigravity/scratch/Haven-build/docs/addenda/addendum-a-rls-canonical.md) to serve as the single source of truth for the RLS implementation. Please reference that file for all database implementation, reviews, and test validations.

# Addendum B — Database Indexes & Migration Strategy

**File:** `docs/addenda/B-db-indexes-migrations.md`

## B.1 Index strategy

### B.1.1 Standard FK + query indexes

```sql
-- profiles
CREATE INDEX idx_profiles_role ON profiles(role);

-- elder_profiles
CREATE INDEX idx_elder_profiles_elder_id ON elder_profiles(elder_id);

-- family_relationships
CREATE INDEX idx_fam_rel_elder_id ON family_relationships(elder_id);
CREATE INDEX idx_fam_rel_family_member_id ON family_relationships(family_member_id);
CREATE INDEX idx_fam_rel_active ON family_relationships(elder_id, is_active)
  WHERE is_active = true AND elder_consented = true;

-- medications (active only — most common query)
CREATE INDEX idx_medications_elder_active ON medications(elder_id)
  WHERE deleted_at IS NULL;

-- medication_reminders (cron query: upcoming + overdue)
CREATE INDEX idx_reminders_scheduled ON medication_reminders(scheduled_time)
  WHERE status IN ('gepland', 'gesnoozed');
CREATE INDEX idx_reminders_medication_id ON medication_reminders(medication_id);

-- family_messages
CREATE INDEX idx_messages_elder_id ON family_messages(elder_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_messages_created ON family_messages(elder_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- scam_events
CREATE INDEX idx_scam_elder_id ON scam_events(elder_id);
CREATE INDEX idx_scam_created ON scam_events(elder_id, created_at DESC);
CREATE INDEX idx_scam_alert_level ON scam_events(alert_level)
  WHERE family_notified = false;

-- location_events
CREATE INDEX idx_location_elder_time ON location_events(elder_id, created_at DESC);

-- notifications
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id)
  WHERE read_at IS NULL;

-- voice_interactions
CREATE INDEX idx_voice_elder_time ON voice_interactions(elder_id, created_at DESC);

-- cognitive_checkins
CREATE INDEX idx_cognitive_elder_time ON cognitive_checkins(elder_id, created_at DESC);

-- life_stories
CREATE INDEX idx_stories_elder ON life_stories(elder_id)
  WHERE deleted_at IS NULL;

-- companion_memory
CREATE INDEX idx_memory_elder ON companion_memory(elder_id);
CREATE INDEX idx_memory_type ON companion_memory(elder_id, memory_type);
```

---

### B.1.2 PostGIS indexes (safe-zone + location)

```sql
-- Safe-zone centre on elder_profiles
CREATE INDEX idx_elder_safe_zone_centre
  ON elder_profiles USING GIST (safe_zone_centre);

-- Fuzzed geometry on location_events
CREATE INDEX idx_location_events_geom
  ON location_events USING GIST (location_fuzzed);
```

---

### B.1.3 pgvector indexes (HNSW — recommended over IVFFlat for HAVEN's workload)

```sql
-- voice_interactions embeddings
CREATE INDEX idx_voice_embedding
  ON voice_interactions USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- companion_memory embeddings
CREATE INDEX idx_companion_memory_embedding
  ON companion_memory USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- life_stories embeddings
CREATE INDEX idx_life_stories_embedding
  ON life_stories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- scam_events embeddings (for similarity matching across events)
CREATE INDEX idx_scam_events_embedding
  ON scam_events USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**HNSW parameter guidance:**
- `m = 16` is the default and appropriate for HAVEN's data volumes at launch
- `ef_construction = 64` balances build time vs. recall quality
- Re-evaluate at 100k+ rows per table with `EXPLAIN ANALYZE`

---

## B.2 Migration strategy

### B.2.1 Tooling
Use **Supabase CLI** (`supabase migrate`) as the single migration tool.

```bash
# Init (once, in monorepo root)
supabase init

# Create a new migration
supabase migration new <descriptive_name>
# e.g.: supabase migration new add_medications_table

# Apply locally
supabase db reset   # full reset + all migrations
supabase db push    # apply pending migrations to linked project

# List migrations
supabase migration list
```

---

### B.2.2 File naming convention
```
supabase/migrations/
  20260610000001_extensions_and_enums.sql
  20260610000002_core_tables.sql
  20260610000003_rls_helper_functions.sql
  20260610000004_rls_policies.sql
  20260610000005_indexes.sql
  20260610000006_pg_cron_jobs.sql
  20260610000007_seed_dev_data.sql  -- local dev only
  20260610000008_buurt_neighbourhood_connector.sql
```

**Format:** `YYYYMMDDHHMMSS_descriptive_name.sql`

---

### B.2.3 Migration rules (non-negotiable)
1. **Never edit an applied migration** — create a new one
2. **No destructive changes in a single migration** — always: add column nullable → backfill → add constraint → drop old column (separate migrations)
3. **Every migration is idempotent** where possible (use `IF NOT EXISTS`, `IF EXISTS`)
4. **Migrations must pass locally before PR merge** (enforced in CI — see Addendum I)
5. **Production migrations are applied manually by a named engineer** with a signed-off checklist (not auto-deployed)

---

### B.2.4 Seed data (local dev only)

```sql
-- ==========================================================
-- supabase/seed.sql  (v1.1.1 — matches canonical schema)
-- Run via: supabase db reset
-- ==========================================================

-- -------------------------------------------------------
-- Test elder user
-- -------------------------------------------------------
INSERT INTO auth.users (
  id, email, email_confirmed_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'oudere@haven.test',
  now(), now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (
  id, role, locale, timezone, created_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'elder',
  'nl-NL',
  'Europe/Amsterdam',
  now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO elder_profiles (
  id,
  elder_id,                             -- canonical: elder_id
  safe_zone_radius_m,
  safe_zone_label_nl,
  night_mode_start,
  night_mode_end,
  night_mode_active,
  cognitive_support,
  created_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  300,
  'Thuis',
  '22:00',
  '08:00',
  false,
  false,
  now()
) ON CONFLICT DO NOTHING;

-- -------------------------------------------------------
-- Test family member
-- -------------------------------------------------------
INSERT INTO auth.users (
  id, email, email_confirmed_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'familie@haven.test',
  now(), now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (
  id, role, locale, timezone, created_at
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'family',
  'nl-NL',
  'Europe/Amsterdam',
  now()
) ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------
-- Consented family relationship
-- (canonical fields: family_member_id, is_active, can_view_medications)
-- -------------------------------------------------------
INSERT INTO family_relationships (
  id,
  elder_id,
  family_member_id,
  relation_label_nl,
  is_primary,
  elder_consented,
  elder_consented_at,
  is_active,
  can_view_medications,
  can_view_messages,
  can_view_location_events,
  can_view_stories,
  can_view_financials,
  can_view_voice,
  can_view_health,
  can_view_safety,
  notify_on_scam,
  notify_on_missed_medication,
  notify_on_safe_zone_exit,
  notify_on_weekly_digest,
  created_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'dochter',
  true,
  true,
  now(),
  true,
  true,
  true,
  true,
  true,
  false,   -- financials: off by default even in seed
  true,    -- voice
  true,    -- health
  true,    -- safety
  true,    -- notify_on_scam
  true,    -- notify_on_missed_medication
  true,    -- notify_on_safe_zone_exit
  true,    -- notify_on_weekly_digest
  now()
) ON CONFLICT DO NOTHING;

-- -------------------------------------------------------
-- Test medications
-- (canonical fields: name_nl, dose_description_nl, is_active, frequency as Dutch enum)
-- -------------------------------------------------------
INSERT INTO medications (
  id,
  elder_id,
  name_nl,                              -- canonical: name_nl
  dose_description_nl,                  -- canonical: dose_description_nl
  frequency,                            -- enum value must match medication_frequency type
  schedule_times,
  instructions_nl,
  with_food,
  is_active,                            -- canonical: is_active
  start_date,
  created_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Metformine',
  '500mg per tablet',
  'tweemaal_daags',                     -- Dutch enum value
  ARRAY['08:00', '18:00']::time[],
  'Met voedsel innemen',
  true,
  true,
  CURRENT_DATE,
  now()
),
(
  '10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Lisinopril',
  '10mg per tablet',
  'eenmaal_daags',                      -- Dutch enum value
  ARRAY['08:00']::time[],
  NULL,
  false,
  true,
  CURRENT_DATE,
  now()
) ON CONFLICT DO NOTHING;

-- -------------------------------------------------------
-- Test medication reminders (today — matches canonical schema)
-- Uses: scheduled_time, reminder_status enum, snooze_count
-- -------------------------------------------------------
INSERT INTO medication_reminders (
  id,
  medication_id,
  elder_id,
  scheduled_time,                       -- canonical: scheduled_time (not scheduled_for)
  status,                               -- canonical: reminder_status enum
  snooze_count,
  created_at
) VALUES (
  gen_random_uuid(),
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  (CURRENT_DATE + TIME '08:00')::timestamptz AT TIME ZONE 'Europe/Amsterdam',
  'gepland',                            -- canonical Dutch reminder_status enum value
  0,
  now()
),
(
  gen_random_uuid(),
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  (CURRENT_DATE + TIME '18:00')::timestamptz AT TIME ZONE 'Europe/Amsterdam',
  'gepland',
  0,
  now()
),
(
  gen_random_uuid(),
  '10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  (CURRENT_DATE + TIME '08:00')::timestamptz AT TIME ZONE 'Europe/Amsterdam',
  'gepland',
  0,
  now()
) ON CONFLICT DO NOTHING;

-- -------------------------------------------------------
-- Test companion memory
-- (canonical fields: importance_score, content_nl, memory_type as enum)
-- -------------------------------------------------------
INSERT INTO companion_memory (
  id,
  elder_id,
  memory_type,
  content_nl,
  importance_score,                     -- canonical: importance_score
  source,
  created_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'personal_fact',
  'De kleindochter van de oudere heet Sofia.',
  8,
  'manual',
  now()
),
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'preference',
  'De oudere luistert graag naar klassieke muziek.',
  6,
  'manual',
  now()
) ON CONFLICT DO NOTHING;

-- -------------------------------------------------------
-- Test push tokens (matches canonical schema: profile_id, is_active)
-- -------------------------------------------------------
INSERT INTO push_tokens (
  id,
  profile_id,                           -- canonical: profile_id (not user_id)
  token,
  platform,
  is_active,                            -- canonical: is_active
  created_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'ExponentPushToken[DEV-PLACEHOLDER-ELDER]',
  'ios',
  true,
  now()
),
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000002',
  'ExponentPushToken[DEV-PLACEHOLDER-FAMILY]',
  'android',
  true,
  now()
) ON CONFLICT DO NOTHING;

-- -------------------------------------------------------
-- Test neighbourhood profile (BUURT — test elder opts in)
-- -------------------------------------------------------
INSERT INTO neighbourhood_profiles (
  id,
  elder_id,
  postcode_pc4,
  neighbourhood_label,
  radius_km,
  is_active,
  opted_in_at,
  walk_buddy_seeking,
  walk_preferred_time,
  family_can_see_connections,
  created_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  '1234',                               -- test PC4 (non-real)
  'Testbuurt, Amsterdam',
  2,
  true,
  now(),
  true,
  'ochtend',
  true,                                 -- family visibility on for test
  now()
) ON CONFLICT DO NOTHING;

-- Test interest tags for elder (tuinieren + wandelen)
INSERT INTO elder_interest_tags (
  id, elder_id, tag_id, created_at
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  it.id,
  now()
FROM interest_tags it
WHERE it.tag_key IN ('tuinieren', 'wandelen')
ON CONFLICT DO NOTHING;
```

---

### B.2.5 Breaking change protocol
Before any breaking DB change in production:
1. Deploy backwards-compatible version (new column nullable, old + new code paths live)
2. Verify both paths work in production
3. Migrate data (Edge Function or SQL job)
4. Remove old column/code path in a follow-up deploy
5. Document in ADRs if the change affects the data model significantly

---

# Addendum C — Authentication & Onboarding Flows

**File:** `docs/addenda/C-auth-flows.md`

## C.1 Auth method decisions

| Actor | Auth method | Rationale |
|---|---|---|
| Elder | **OTP (SMS or email)** — no password | Passwords are a cognitive barrier; OTP via SMS is familiar to Dutch older adults via iDEAL/DigiD patterns |
| Family | **Magic link email** or **OTP** | Low friction for initial setup |
| Carer (Phase 2) | **Email + password + MFA** | Professional context; higher security requirement |
| Edge Functions | Supabase service role key | Never client-facing |

**Implementation:** Supabase Auth (built-in OTP + magic link support).

---

## C.2 JWT custom claims

Custom claims are injected via a Supabase Auth hook (PostgreSQL function):

```sql
-- Auth hook: inject role + elder_context into JWT
CREATE OR REPLACE FUNCTION auth.custom_claims(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  user_role text;
  claims jsonb;
BEGIN
  SELECT role INTO user_role
  FROM profiles
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{role}', to_jsonb(user_role));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
```

---

## C.3 Onboarding flow (family-initiated, elder-activates)

This is the single most critical UX + auth flow in the product.

```
STEP 1 — Family registers
  Family member opens Family Dashboard
  Enters email → receives magic link
  Completes profile (name, relation to elder)
  ↓
STEP 2 — Family creates elder profile
  Family enters elder's:
    - First name (no BSN — see ADR-008)
    - Date of birth (optional)
    - Language preference (nl-NL default)
    - Phone number (for OTP delivery to elder)
  System creates:
    - auth.users row for elder (unconfirmed)
    - profiles row (role = elder)
    - elder_profiles row
    - family_relationships row
      (elder_consented = false, is_active = false)
  ↓
STEP 3 — Elder receives activation
  System sends elder an SMS:
    "Welkom bij HAVEN. Uw familie heeft een account
     voor u aangemaakt. Druk op [link] of bel [nummer]
     om te starten."
  ↓
STEP 4 — Elder activates (voice-guided)
  Elder opens app (deep link from SMS)
  App presents: "Bent u [Voornaam]?"
  Elder confirms by tapping large YES button or saying "Ja"
  Elder receives OTP SMS
  Elder enters OTP (large keypad, auto-submit on 6 digits)
  ↓
STEP 5 — Consent screen (elder grants family permissions)
  App reads aloud (Dutch, TTS):
    "[Familienaam] wil uw herinneringsberichten,
     medicijnen en veiligheidsberichten kunnen zien.
     Gaat u daarmee akkoord?"
  Elder taps "Ja, dat is goed" or "Nee"
  System sets elder_consented = true per permission flag
  family_relationships.is_active = true
  ↓
STEP 6 — Elder onboarding complete
  App: "Welkom bij HAVEN, [Voornaam]. Ik ben uw
        digitale hulp. Wat wilt u doen?"
  Home screen renders
```

---

## C.4 Session management

| Scenario | Behaviour |
|---|---|
| Token expiry (elder app, foreground) | Silent refresh via Supabase SDK |
| Token expiry (elder app, background/offline) | Show friendly re-auth screen on next open: "Welkom terug! Voer uw code in." |
| Token expiry (family dashboard) | Redirect to login; preserve intended route |
| Invalid session | Clear local storage; restart auth flow |
| Elder device lost/stolen | Family can trigger session revocation from dashboard (service function) |

---

## C.5 Family invite link flow

```
Family dashboard → "Voeg familielid toe"
  → System generates signed invite token (expiry: 72h)
  → Family shares link via WhatsApp/email (standard NL pattern)
  → New family member clicks link
  → Registers with email OTP
  → Relationship row created (elder_consented = false)
  → Elder receives in-app notification:
    "[Naam] wil uw HAVEN-hulp kunnen zien. Akkoord?"
  → Elder approves → elder_consented = true
```

---

## C.6 Permission revocation (elder withdraws consent)

```
Elder: Settings → "Mijn Familie" → [Familienaam] → "Toegang intrekken"
  → Confirm screen (TTS reads aloud)
  → family_relationships.elder_consented = false
  → family_relationships.is_active = false
  → All active sessions for that family member lose access immediately
  → Family member receives email: "Toegang ingetrokken"
```

---

# Addendum D — Offline & Sync Strategy

**File:** `docs/addenda/D-offline-sync.md`

## D.1 Offline philosophy
> **The elder app must never show a dead or broken state.** The family dashboard can tolerate a loading/stale indicator.

---

## D.2 What is cached locally (elder app)

| Data | Cache duration | Storage method |
|---|---|---|
| Today's medication reminders | 24 hours | SQLite via Expo SQLite |
| Today's tasks | 24 hours | SQLite |
| Last 10 family messages | 7 days | SQLite |
| Current elder profile | 24 hours | SQLite |
| Recent life story prompts | 7 days | SQLite |
| Voice responses (last 5) | Session only | In-memory |
| Home screen badge counts | 1 hour | SQLite |
| Safe-zone config | 24 hours | SQLite |

**NOT cached locally:**
- Scam event full details (privacy + freshness required)
- Location events (server only)
- Companion memory (server only)

---

## D.3 Offline-first reminder firing

```
Scheduled reminder fires (local notification — device-native, not push)
  ↓
Elder responds (taken / snooze)
  ↓
Action queued in local action queue (SQLite)
  ↓
App checks connectivity
  ├── Online → flush queue immediately
  └── Offline → retry every 60s with exponential backoff
              → max 5 retries
              → if still offline after 5 retries:
                   mark as "pending_sync"
                   continue functioning locally
  ↓
On next foreground + online:
  flush all pending_sync actions
  reconcile with server state
```

---

## D.4 Conflict resolution rules

| Scenario | Resolution |
|---|---|
| Elder marks med taken offline; server already shows escalated | Accept elder's action; clear escalation; log reconciliation |
| Elder creates task offline; duplicate detected on sync | Keep elder's version; deduplicate by idempotency key |
| Family message sent while elder offline | Message sits in queue; delivered on reconnect; no duplicate |
| Companion memory update conflicts | Server wins; local cache refreshed |

**Idempotency key pattern:**
Every offline action has an `idempotency_key = uuid()` generated at creation time. Edge Functions check for duplicate keys and return the existing result if already processed.

---

## D.5 Family dashboard offline behaviour

The family dashboard is a **web app** — full offline is not a goal. Behaviour:

- **Offline detected:** Show banner "Geen verbinding — gegevens kunnen verouderd zijn"
- Supabase Realtime subscription pauses; reconnects automatically
- No queuing of family actions (messages, permission changes) while offline — user must retry manually

---

## D.6 Local notification strategy (elder app)

Medication reminders and daily rhythm events are **local notifications** first (not push-only), so they fire even if push is unavailable:

```typescript
// Scheduled at onboarding + updated when reminder schedule changes
import * as Notifications from 'expo-notifications';

interface LocalReminder {
  id:              string;
  medication_name: string;
  dosage:          string;
  scheduled_time:  string;   // ✅ canonical (ISO 8601 timestamptz string)
  status:          ReminderStatus;  // ✅ use enum not bare string
}

// ReminderStatus enum (matches DB reminder_status_enum):
type ReminderStatus =
  | 'gepland'
  | 'herinnerd'
  | 'gesnoozed'
  | 'geëscaleerd'
  | 'gemist'
  | 'bevestigd';

async function scheduleLocalReminder(reminder: LocalReminder) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Medicijn herinnering',
      body:  `${reminder.medication_name} — ${reminder.dosage}`,
    },
    trigger: { date: new Date(reminder.scheduled_time) },  // ✅ canonical
    identifier: reminder.id, // idempotent
  });
}
```

Push notifications are used for **family-initiated events** (messages, check-ins) and **escalation events** only.

---

# Addendum E — Supabase Storage Specification

**File:** `docs/addenda/E-storage-spec.md`

## E.1 Bucket definitions

| Bucket name | Access | Purpose |
|---|---|---|
| `voice-notes` | Private | Family ↔ Elder audio messages |
| `life-story-audio` | Private | Elder story recordings |
| `life-story-photos` | Private | Photos attached to life stories |
| `profile-photos` | Private | Elder + family profile photos |
| `document-vault` | Private | Scanned documents (no BSN per ADR-008) |
| `ocr-inbox` | Private (transient) | Medication photo OCR input; auto-deleted after processing |
| `tts-cache` | Private (transient) | Pre-generated TTS audio; short TTL |

**No public buckets** — all content served via signed URLs only.

---

## E.2 File path conventions

```
voice-notes/
  {elder_id}/{message_id}.m4a

life-story-audio/
  {elder_id}/{story_id}.m4a

life-story-photos/
  {elder_id}/{story_id}/{photo_id}.jpg

profile-photos/
  {user_id}/avatar.jpg

document-vault/
  {elder_id}/{document_id}/{filename}

ocr-inbox/
  {elder_id}/pending/{upload_id}.jpg

tts-cache/
  {elder_id}/{interaction_id}.mp3
```

---

## E.3 Storage RLS policies

```sql
-- voice-notes: elder reads/writes own; family reads with permission
CREATE POLICY "voice_notes_elder_all"
ON storage.objects FOR ALL
USING (
  bucket_id = 'voice-notes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "voice_notes_family_read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'voice-notes'
  AND auth.family_can(
    (storage.foldername(name))[1]::uuid,
    'messages'
  )
);

-- life-story-audio: elder all; family reads with stories permission
CREATE POLICY "story_audio_elder_all"
ON storage.objects FOR ALL
USING (
  bucket_id = 'life-story-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "story_audio_family_read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'life-story-audio'
  AND auth.family_can(
    (storage.foldername(name))[1]::uuid,
    'stories'
  )
);

-- document-vault: elder only (no family access to documents)
CREATE POLICY "document_vault_elder_only"
ON storage.objects FOR ALL
USING (
  bucket_id = 'document-vault'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ocr-inbox: elder write; service-role read for processing
CREATE POLICY "ocr_inbox_elder_write"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ocr-inbox'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

---

## E.4 File size limits

| Bucket | Max file size | Notes |
|---|---|---|
| `voice-notes` | 15 MB | ~10 min audio at low bitrate |
| `life-story-audio` | 50 MB | ~30 min |
| `life-story-photos` | 8 MB | Compressed on client before upload |
| `profile-photos` | 2 MB | Compressed to 512×512 max |
| `document-vault` | 10 MB | PDF or image |
| `ocr-inbox` | 5 MB | Transient; auto-deleted after OCR |
| `tts-cache` | 2 MB | Short clips only |

---

## E.5 Retention & deletion

```sql
-- pg_cron: delete processed OCR inbox files after 24h
SELECT cron.schedule(
  'clean-ocr-inbox',
  '0 * * * *',  -- hourly
  $$
    DELETE FROM storage.objects
    WHERE bucket_id = 'ocr-inbox'
      AND created_at < now() - interval '24 hours';
  $$
);

-- pg_cron: delete TTS cache after 48h
SELECT cron.schedule(
  'clean-tts-cache',
  '30 * * * *',
  $$
    DELETE FROM storage.objects
    WHERE bucket_id = 'tts-cache'
      AND created_at < now() - interval '48 hours';
  $$
);
```

**GDPR right-to-erasure:** When an elder account is deleted, a service function cascades deletion across all buckets for that `elder_id`. This is a hard requirement.

---

## E.6 Signed URL generation (client pattern)

```typescript
// Never expose raw storage paths to clients
// Always generate short-lived signed URLs server-side or via Edge Function

const { data } = await supabase.storage
  .from('voice-notes')
  .createSignedUrl(`${elderId}/${messageId}.m4a`, 300); // 5 min TTL

// Family dashboard: signed URL requested per message render
// Elder app: signed URL cached for session duration of playback
```

---

# Addendum F — Error States, Empty States & Dutch UI Copy

**File:** `docs/addenda/F-copy-and-states.md`

## F.1 Dutch copy style guide

### F.1.1 Pronoun register (critical for NL elder UX)
**Use formal "u" / "uw" throughout the elder app.**

This is non-negotiable for a 68–90 year old Dutch audience. Using "jij/je" with older Dutch adults is widely perceived as disrespectful or overly casual.

| ❌ Do not use | ✅ Use instead |
|---|---|
| "Je hebt je medicijn genomen" | "U heeft uw medicijn genomen" |
| "Jij kunt dit later doen" | "U kunt dit later doen" |
| "Wat wil jij vandaag doen?" | "Wat wilt u vandaag doen?" |
| "Je bent buiten je veilige zone" | "U bent buiten uw veilige zone" |

**Family dashboard:** informal "je/jij" is acceptable (younger audience).

---

### F.1.2 Sentence length rules (voice + screen)

| Context | Max sentence length | Rationale |
|---|---|---|
| TTS voice output (elder) | 15 words per sentence | Working memory load |
| Screen body text (elder) | 12 words per line | Visual scanning |
| Alert explanation (elder) | 2 sentences max | Panic prevention |
| Family dashboard | No strict limit | Standard web copy |

---

### F.1.3 Banned words (enforced in CI)

```typescript
// ✅ CORRECT EU AI ACT COMPLIANCE RULE:
// EU AI Act Art. 50 requires disclosure that the user is interacting with
// an AI system (unless context makes it obvious). Therefore:

// BANNED — because they are evasive/misleading (not because they mention AI):
const BANNED_AI_COPY = [
  'Ik ben een echte medewerker',        // false claim of human identity
  'Ik ben geen computer',               // deceptive denial
  'U spreekt met een persoon',          // impersonation
];

// REQUIRED — first interaction per day must include a disclosure variant:
const REQUIRED_AI_DISCLOSURE_NL = [
  // Option A (warm, brief):
  'Hallo, ik ben HAVEN — uw digitale hulp.',
  // Option B (slightly more explicit, for first-ever use):
  'Hallo, ik ben HAVEN. Ik ben een digitale hulp, geen echte persoon.',
  // Option C (if elder directly asks "ben jij een mens?"):
  'Nee, ik ben een digitale hulp. Maar ik ben er wel voor u.',
];

// RULE: If a user directly asks "ben jij een mens?" or "ben jij echt?",
// HAVEN MUST answer honestly. This is a hard product rule, not just a
// compliance rule — it is also the right thing to do for elder dignity.

// STILL BANNED (tone/anxiety reasons, unchanged):
const BANNED_WORDS_NL = [
  'fout', 'foutmelding', 'error', 'mislukt',
  'gevaar', 'gevaarlijk', 'waarschuwing', 'kritiek',
  'illegaal',
  'nooit', 'altijd', 'onmogelijk',
];

// Allowed exceptions for SCHILD screens only
const SCHILD_EXCEPTIONS = ['verdacht', 'voorzichtig'];
```

---

### F.1.4 Number & date formatting (NL)

| Format | Correct NL | Incorrect |
|---|---|---|
| Date (long) | `maandag 10 juni 2026` | `Monday, June 10, 2026` |
| Date (short) | `10-06-2026` | `06/10/2026` |
| Time | `14:30` (24h) | `2:30 PM` |
| Currency | `€ 1.234,56` | `€1,234.56` |
| Phone | `06-12345678` (mobile) | `+31612345678` |
| Decimal separator | `,` (comma) | `.` (period) |
| Thousands separator | `.` (period) | `,` (comma) |

---

## F.2 Empty states (all MVP screens)

### HOME — no data yet
**Title:** "Goedemorgen, [Voornaam]"
**Body:** "Uw familie stelt uw HAVEN nog in."
**Voice:** "Uw familie stelt alles voor u in. Even geduld."

---

### PILLS — no medications set up
**Title:** "Geen medicijnen"
**Body:** "Uw familie kan uw medicijnen hier toevoegen."
**Voice:** "Er zijn nog geen medicijnen ingesteld."
**CTA:** none (elder cannot add medications in v1 without family setup)

---

### PILLS — all meds taken today
**Title:** "Alle medicijnen ingenomen 🎉"
**Body:** "Goed gedaan. U bent klaar voor vandaag."
**Voice:** "U heeft al uw medicijnen ingenomen. Heel goed."

---

### BERICHTEN — no messages
**Title:** "Nog geen berichten"
**Body:** "Uw familie kan u hier berichten sturen."
**Voice:** "Er zijn nog geen berichten van uw familie."

---

### MIJN VERHAAL — no stories yet
**Title:** "Uw verhaal begint hier"
**Body:** "Vertel uw eerste herinnering."
**CTA:** "Opname starten"
**Voice:** "Druk op de knop om uw eerste herinnering te vertellen."

---

## F.3 Error states (Dutch copy)

### Network error (elder app)
**Title:** "Geen verbinding"
**Body:** "HAVEN werkt nu zonder internet. Uw herinneringen werken gewoon."
**Voice:** "Even geen internet. Uw medicijnherinneringen werken gewoon door."
**Action:** No retry button — app continues in offline mode silently.

---

### Voice not understood
**Title:** *(no title — voice-only response)*
**Voice:** "Ik heb u niet goed verstaan. Kunt u het nog eens zeggen?"
*(after 2 failures):* "Wilt u de knop gebruiken?"
*(after 3 failures):* *(show button alternatives silently)*

---

### SCHILD — suspicious call (amber)
**Title:** "Dit nummer is mogelijk verdacht"
**Body:** "Geef nooit uw pincode of wachtwoord door. U hoeft nu nergens op te klikken."
**Voice:** "Wees voorzichtig. Dit nummer is mogelijk verdacht. U hoeft niets te doen."
**CTA:** "Ik begrijp het" / "Terugbellen"

---

### SCHILD — high-risk alert (red)
**Title:** "Wees voorzichtig"
**Body:** "Wij hebben uw familie gewaarschuwd. U hoeft niets te doen."
**Voice:** "Uw familie is gewaarschuwd. U hoeft niets te doen. U bent veilig."
**CTA:** "Bel familie" / "Bel 112"

---

### Session expired (elder app)
**Title:** "Welkom terug"
**Body:** "Voer uw code in om verder te gaan."
**Voice:** "Welkom terug. Voer uw code in."

---

### BUURT copy (nl-NL, formal "u/uw" register)

#### Anonymous proximity display
"Er zijn 3 mensen in uw buurt die ook HAVEN gebruiken."
"Er is 1 persoon in uw buurt die ook HAVEN gebruikt."
"Er zijn nog geen HAVEN-gebruikers in uw directe buurt gevonden."

#### Interest match display
"Iemand vlakbij houdt ook van 🌿 tuinieren."
"2 mensen in uw buurt houden ook van 🎵 muziek."

#### Connection request (incoming — voice + screen)
"Iemand in uw buurt die ook van [tag] houdt wil graag kennismaken. Uw naam wordt pas gedeeld als u allebei ja zegt."

#### Connection accepted
"Goed nieuws! U heeft een nieuwe buurtverbinding. Uw naam is nu gedeeld. Misschien ziet u elkaar binnenkort."

#### Connection declined (to initiator)
"De persoon heeft helaas nee gezegd. Dat is prima."
*(No shame language; normalize declining)*

#### Walk buddy request
"Wilt u dat HAVEN een wandelmaatje zoekt? Iemand in uw buurt gaat ook graag 's ochtends wandelen."

#### Walk buddy match found
"Goed nieuws! Er is een wandelmaatje gevonden in uw buurt. Wilt u kennismaken?"

#### Event suggestion
"[Event title], [distance], [day]. Het is gratis. Twee mensen in uw buurt hebben hier ook interesse in."

#### Privacy reassurance (shown on opt-in screen)
"HAVEN deelt nooit uw adres of foto. Alleen uw voornaam — en alleen als u allebei ja zegt."

#### Opt-out confirmation
"U heeft de Buurtverbinder uitgeschakeld. Uw buurtprofiel is verwijderd."

#### Banned words for BUURT specifically
- "In uw buurt woont..." (implies address knowledge — forbidden)
- "Uw buurman/buurvrouw..." (implies identity before consent)
- "We weten waar u woont..." (alarming — obviously forbidden)

---

# Addendum G — Local Development Environment Setup

**File:** `docs/addenda/G-local-dev-setup.md`

## G.1 Prerequisites

| Tool | Required version | Install |
|---|---|---|
| Node.js | ≥ 20 LTS | `nvm install 20` |
| pnpm | ≥ 9 | `npm i -g pnpm` |
| Docker Desktop | ≥ 4.x | docker.com |
| Supabase CLI | ≥ 1.200 | `brew install supabase/tap/supabase` |
| Expo CLI | ≥ 0.18 | `pnpm add -g expo-cli` |
| iOS Simulator | Xcode 15+ | App Store |
| Android Emulator | Android Studio | developer.android.com |

---

## G.2 Environment variables

**Never commit `.env` files.** Use `.env.example` as the template.

### Elder app (`apps/elder/.env`)

```bash
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_LOCALE=nl-NL
EXPO_PUBLIC_TZ=Europe/Amsterdam
```

### Family dashboard (`apps/family/.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
NEXT_PUBLIC_ENV=development
NEXT_PUBLIC_LOCALE=nl-NL
```

### Edge Functions (`supabase/functions/.env`)

```bash
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>
STT_PROVIDER_API_KEY=<openai or whisper key>
TTS_PROVIDER_API_KEY=<elevenlabs key>
LLM_API_KEY=<openai key>
PHONE_REPUTATION_API_KEY=<vendor key>
PUSH_VAPID_KEY=<expo push token>
```

---

## G.3 First-time setup (run once)

```bash
# 1. Clone repo
git clone https://github.com/knarayanareddy/Haven-build.git
cd Haven-build

# 2. Install dependencies
pnpm install

# 3. Start Supabase locally (requires Docker running)
supabase start
# Note the output: API URL, anon key, service role key
# Copy these into your .env files

# 4. Run all migrations + seed data
supabase db reset
# This applies all migrations in supabase/migrations/
# and runs supabase/seed.sql

# 5. Verify DB state
supabase db diff  # should show no pending changes

# 6. Start Edge Functions locally
supabase functions serve --env-file ./supabase/functions/.env

# 7. Start elder app
cd apps/elder
cp .env.example .env  # fill in values
pnpm start
# Then press 'i' for iOS simulator or 'a' for Android

# 8. Start family dashboard
cd apps/family
cp .env.example .env.local  # fill in values
pnpm dev
# Open http://localhost:3000
```

---

## G.4 Daily dev workflow

```bash
# Start everything (from monorepo root)
pnpm dev

# This runs (via Turborepo):
#   supabase start (if not already running)
#   supabase functions serve
#   apps/elder: expo start
#   apps/family: next dev

# Reset DB to clean state
supabase db reset

# Create a new migration
supabase migration new <name>

# Run tests
pnpm test               # all tests
pnpm test:unit          # unit tests only
pnpm test:integration   # integration (requires local Supabase)
pnpm test:e2e           # E2E (requires simulators)

# Type check everything
pnpm typecheck

# Lint
pnpm lint
```

---

## G.5 Common issues & fixes

| Issue | Fix |
|---|---|
| `supabase start` fails — port conflict | `supabase stop --no-backup && supabase start` |
| OTP not received locally | Use Supabase Studio (localhost:54323) → Auth → Users → manually confirm |
| Edge Function not hot-reloading | Kill `supabase functions serve` and restart |
| Expo QR not scanning | Ensure device + Mac on same Wi-Fi; use tunnel mode |
| Migration fails | Check for syntax errors; run `supabase db lint` |
| pgvector extension not found | Ensure Supabase CLI ≥ 1.200 (includes pgvector) |

---

# Addendum H — Monorepo Structure & Code Conventions

**File:** `docs/addenda/H-monorepo-structure.md`

## H.1 Top-level structure

```
haven/
├── apps/
│   ├── elder/          # React Native + Expo (nl-NL first)
│   └── family/         # Next.js 14 family dashboard
├── packages/
│   ├── ui/             # Shared component library (design system)
│   ├── schema/         # ScreenSchema types + registry (elder app)
│   ├── database/       # Supabase client factory + typed DB helpers
│   ├── i18n/           # Translation files (nl-NL primary, en-GB secondary)
│   ├── hooks/          # Shared React hooks (useRealtime, useMedications, etc.)
│   └── utils/          # Shared utilities (formatting, validation, dates)
├── supabase/
│   ├── functions/      # Edge Functions (Deno)
│   ├── migrations/     # Numbered SQL migrations
│   └── seed.sql        # Local dev seed data
├── docs/               # This design suite
├── .github/
│   └── workflows/      # CI/CD pipelines (Addendum I)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## H.2 Package naming

All internal packages are scoped: `@haven/<name>`

```
@haven/ui
@haven/schema
@haven/database
@haven/i18n
@haven/hooks
@haven/utils
```

---

## H.3 `@haven/i18n` structure

```
packages/i18n/
  locales/
    nl-NL/
      common.json       # Shared: button labels, status words
      elder-app.json    # Elder app screens
      family-dash.json  # Family dashboard
      errors.json       # Error + empty state copy
      voice.json        # Voice prompt scripts
    en-GB/
      (same structure — secondary locale)
  index.ts             # i18next config + exports
```

**Key rule:** all Dutch copy lives in `nl-NL/*.json` — **no hardcoded Dutch strings in component files.**

---

## H.4 `@haven/schema` structure

```
packages/schema/
  types.ts              # ScreenSchema TypeScript interfaces
  screens/
    home.schema.ts
    pills.schema.ts
    messages.schema.ts
    story.schema.ts
    safe-zone.schema.ts
    schild-alert.schema.ts
    settings.schema.ts
  registry.ts           # SCREEN_REGISTRY map
  validator.ts          # Schema validation (used in CI tests)
  __tests__/
    constitution.test.ts  # UX constitution CI tests
```

---

## H.5 `@haven/database` structure

```
packages/database/
  client.ts             # Supabase client factory (env-aware)
  types.ts              # Generated DB types (supabase gen types typescript)
  queries/
    medications.ts
    reminders.ts
    messages.ts
    scam-events.ts
    location-events.ts
    family-relationships.ts
    companion-memory.ts
  realtime/
    subscriptions.ts    # Typed realtime subscription helpers
```

**Type generation (run after every migration):**

```bash
supabase gen types typescript \
  --local \
  > packages/database/types.ts
```

---

## H.6 Edge Function structure

```
supabase/functions/
  _shared/              # Shared Deno modules
    supabase.ts         # Supabase admin client
    auth.ts             # JWT verification helpers
    push.ts             # Push notification helpers
    errors.ts           # Standard error responses
  fn-voice-pipeline/
    index.ts
  fn-medication-escalation/
    index.ts
  fn-location-ingest/
    index.ts
  fn-scam-score/
    index.ts
  fn-weekly-digest/
    index.ts
  fn-companion-memory-update/
    index.ts
```

---

## H.7 Git conventions

### Branch strategy

```
main              ← production-ready; protected; requires PR + review
staging           ← staging environment; auto-deployed
develop           ← integration branch
feature/<ticket>  ← feature branches
fix/<ticket>      ← bug fixes
chore/<ticket>    ← infra/tooling/docs
```

### Commit message format (Conventional Commits)

```
<type>(<scope>): <subject>

Types: feat | fix | chore | docs | test | refactor | perf | ci
Scope: elder-app | family-dash | db | edge-fn | schema | i18n | ci

Examples:
  feat(elder-app): add offline medication reminder queue
  fix(db): correct RLS policy on life_stories table
  chore(ci): add schema constitution tests to PR pipeline
  docs(addenda): add offline sync strategy
```

### PR requirements
- At least 1 reviewer approval
- All CI checks passing (see Addendum I)
- `pnpm typecheck` passing
- No new banned words in NL copy

---

# Addendum I — CI/CD Pipeline Specification

**File:** `docs/addenda/I-cicd-pipeline.md`

## I.1 Pipeline overview

```
PR opened/updated
  → lint + typecheck
  → unit tests
  → schema constitution tests
  → DB migration lint
  → RLS integration tests
  → build check (elder app + family dashboard)
  ↓
All pass → PR mergeable

Merge to develop
  → all above
  → E2E smoke tests
  → supabase db push (staging)
  → deploy Edge Functions (staging)
  → deploy family dashboard (staging, Vercel preview)
  → build Expo preview (EAS Build internal)
  ↓
Merge to staging → staging.haven.nl

Manual promote to main
  → human sign-off checklist
  → supabase db push (production) ← manual step with approval
  → deploy Edge Functions (production)
  → deploy family dashboard (production, Vercel)
  → EAS Build production (TestFlight + Play Store internal track)
```

---

## I.2 GitHub Actions workflow files

### `pr-checks.yml`

```yaml
name: PR Checks
on:
  pull_request:
    branches: [develop, staging, main]

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck

  unit-tests:
    runs-on: ubuntu-latest
    needs: lint-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  schema-constitution:
    runs-on: ubuntu-latest
    needs: lint-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test --testPathPattern="constitution"

  migration-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase db lint --level warning

  rls-integration-tests:
    runs-on: ubuntu-latest
    needs: migration-lint
    services:
      docker:
        image: docker:dind
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start
      - run: supabase db reset
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:integration
      - run: supabase stop
```

---

### `deploy-staging.yml`

```yaml
name: Deploy Staging
on:
  push:
    branches: [develop]

jobs:
  deploy-db-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF_STAGING }}
          supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

  deploy-functions-staging:
    runs-on: ubuntu-latest
    needs: deploy-db-staging
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF_STAGING }}
          supabase functions deploy
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

  deploy-family-dashboard-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_FAMILY }}
          working-directory: apps/family
```

---

## I.3 Required secrets (GitHub → Settings → Secrets)

```
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF_STAGING
SUPABASE_PROJECT_REF_PRODUCTION
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID_FAMILY
EAS_TOKEN
EXPO_APPLE_APP_SPECIFIC_PASSWORD  (iOS builds)
```

---

## I.4 Production deploy checklist (human sign-off required)

```
[ ] DB migration reviewed by 2 engineers
[ ] No destructive schema changes without data migration
[ ] RLS tests passing on staging
[ ] E2E smoke tests passing on staging
[ ] Rollback plan documented (what SQL reverses this migration?)
[ ] Privacy review: does this migration touch sensitive data categories?
[ ] DPO notified if new personal data processing is introduced
[ ] Supabase DB push to production approved by lead engineer
```

---

# Addendum J — DPIA Template (AVG Article 35)

**File:** `docs/addenda/J-dpia-template.md`

> ⚠️ **This template must be completed by the responsible DPO or privacy officer before HAVEN begins processing personal data in production. Processing before DPIA completion is an AVG/GDPR violation.**

## J.1 Document information

| Field | Value |
|---|---|
| Product | HAVEN |
| Version | 1.0.0 |
| Date | *(to be completed)* |
| Responsible | *(DPO name)* |
| Status | **DRAFT — must be completed before launch** |
| AP notification required? | *(to be assessed — likely yes for health-adjacent + location + vulnerable persons)* |

---

## J.2 Description of processing

| Field | Description |
|---|---|
| **Purpose** | Voice-first companion for older adults; fraud protection; medication reminders; family connection |
| **Data subjects** | Older adults (68–90); family members/mantelzorgers; professional carers (Phase 2) |
| **Personal data categories** | Name, date of birth, phone number, location (fuzzed), medication names + schedules, voice recordings (transient), conversation transcripts, wellness check-ins, family relationships, life stories |
| **Special category data** | Health-adjacent data (medication, wellness); potentially data about mental health (bereavement state, cognitive check-ins) |
| **Legal basis** | *(to be determined: consent (Art. 6(1)(a)) + explicit consent for special category (Art. 9(2)(a)) — must be reviewed by legal)* |
| **Retention periods** | See Doc 05 + Addendum B (B.2.5) + Storage spec (Addendum E.5) |
| **Processors / sub-processors** | See Addendum K (Vendor Register) |

---

## J.3 Necessity & proportionality assessment
*(To be completed by DPO)*

| Question | Assessment |
|---|---|
| Is the processing necessary for the stated purpose? | |
| Could the purpose be achieved with less data? | |
| Is the retention period proportionate? | |
| Are special category data minimised? | |
| Is location data fuzzed and short-lived? | |
| Are voice recordings deleted promptly? | |

---

## J.4 Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Unauthorised access to health data | Medium | High | RLS + encryption + audit log |
| Elder voice recording breach | Medium | High | Short retention + encrypted storage |
| Location tracking misuse by family | Medium | High | Fuzzy storage + elder-controlled permissions |
| AI companion providing unsafe advice | Medium | Very high | Crisis phrase detection + 112/113 referral |
| BSN inadvertently collected via document vault | Low | High | UI warnings + no BSN fields in schema |
| Scam event data used to profile elder | Low | Medium | No third-party data sharing |
| Breach notification delay (AVG: 72h to AP) | Low | High | Incident response plan (Addendum L) |

---

## J.5 Consultation
*(To be completed)*
- [ ] Data subjects consulted? (elder + family representatives)
- [ ] AP consulted if high residual risk?
- [ ] Legal counsel reviewed?

---

## J.6 Sign-off
*(DPO signature + date required before production launch)*

---

## J.7 DPIA supplementary item: BUURT feature

The BUURT feature introduces additional processing that must be assessed in the DPIA before activation:

| New processing | Risk level | Notes |
|---|---|---|
| PC4 postcode stored per elder | Medium | Not precise location, but still geographic data |
| Anonymous proximity matching (count display) | Low | No identifiers exchanged; count only |
| Interest tags profile | Low | Non-sensitive; elder-selected from fixed list |
| Double opt-in connection (name reveal post-consent) | Medium | First name + HAVEN status revealed to another elder |
| Family visibility of connections | Medium | Requires explicit elder consent + permission flag |

Additional AVG Article 6 legal basis required for BUURT:
- Processing basis: Art. 6(1)(a) — explicit consent (elder opts in to BUURT)
- Interest tags: Art. 6(1)(a) — consent
- PC4 neighbourhood: Art. 6(1)(a) — consent
- Name reveal to matched elder: Art. 6(1)(a) — consent (double opt-in IS the consent)

DPO must assess whether BUURT triggers a new or expanded DPIA before Phase 2 launch.

---

# Addendum K — Vendor Register & DPA Tracking

**File:** `docs/addenda/K-vendor-register.md`

## K.1 Vendor register

> **Hard rule: BSN (Burgerservicenummer) is NEVER transmitted to any vendor. This is a non-negotiable product constraint. Any integration partner requesting BSN transmission must be escalated to the DPO immediately and rejected unless a specific statutory basis is confirmed.**

| Vendor | Purpose | Data shared | Storage location | DPA signed? | SCC needed? | BSN transmitted? | Review date |
|---|---|---|---|---|---|---|---|
| Supabase | Backend + DB + storage | All personal data | EU (to be confirmed: select EU region in Supabase) | ✅ (Supabase DPA available) | No (EU hosted) | Never. Hard rule. | Annual |
| OpenAI | STT (Whisper) + LLM + embeddings | Voice transcript text (no names if possible); context text | USA | ⚠️ Required | Yes — SCC required | Never. Hard rule. | Annual |
| ElevenLabs | TTS voice output | Response text (no personal data) | USA | ⚠️ Required | Yes — SCC required | Never. Hard rule. | Annual |
| Expo (EAS Build) | Mobile build pipeline | App binary (no personal data) | USA | ✅ | Review | Never. Hard rule. | Annual |
| Vercel | Family dashboard hosting | Request logs (IP, headers) | USA/EU | ⚠️ Review | Review | Never. Hard rule. | Annual |
| Sentry | Error tracking | Stack traces, device info | EU option available | ✅ | No if EU region | Never. Hard rule. | Annual |
| APNs (Apple) | iOS push | Push token + notification payload | USA | Review Apple DPA | Review | Never. Hard rule. | Annual |
| FCM (Google) | Android push | Push token + notification payload | USA | Review Google DPA | Review | Never. Hard rule. | Annual |

---

## K.2 Adding a new vendor (process)

1. Open a `chore(vendor): add <vendor-name>` PR
2. Add vendor to this register with all columns filled
3. DPO reviews + signs off
4. DPA signed with vendor before any data flows to them
5. SCC assessment completed if non-EU storage
6. PR merged only after DPO sign-off

---

## K.3 Removing a vendor (process)

1. Confirm data deletion obligations from existing DPA
2. Request data deletion from vendor (in writing)
3. Receive written confirmation of deletion
4. Archive confirmation + mark vendor as removed in this register
5. Update Addendum J (DPIA) to reflect changed processing

---

## K.4 supplementary items: BUURT feature

| Vendor | Purpose | Data shared | BSN? | DPA? |
|---|---|---|---|---|
| OpenData/gemeente APIs (Phase 2+) | Neighbourhood event ingestion | No personal data (events only) | Never | Review per municipality |

Note: if HAVEN integrates with gemeente (municipality) open data portals for event feeds (e.g. Amsterdam Open Data, Rotterdam Open Data), each integration should be reviewed by the DPO — though public event data sharing is typically low-risk.

---

# Addendum L — Incident Response Plan

**File:** `docs/addenda/L-incident-response.md`

## L.1 Scope
This plan covers **data breaches and security incidents** affecting HAVEN personal data, in compliance with AVG Article 33 (AP notification within 72 hours) and Article 34 (user notification where high risk).

---

## L.2 Severity levels

| Level | Description | Example |
|---|---|---|
| P0 — Critical | Mass data exposure; production DB accessible without auth | Supabase misconfiguration; RLS disabled |
| P1 — High | Individual elder's health or location data exposed | Broken RLS policy; storage bucket made public |
| P2 — Medium | Session token leaked; limited scope breach | App logging JWT claims |
| P3 — Low | Suspected anomaly; no confirmed breach | Unusual query patterns |

---

## L.3 Response timeline (AVG-aligned)

```
T+0h  → Incident detected (automated alert OR manual report)
T+1h  → Incident lead assigned (on-call engineer)
T+2h  → Initial triage: scope, severity level, data categories affected
T+4h  → Containment action (disable affected function / revoke keys / RLS patch)
T+24h → Internal incident report drafted
T+48h → DPO notified; breach assessment: does this require AP notification?
T+72h → AP (Autoriteit Persoonsgegevens) notified IF required (P0/P1 likely)
T+72h → Affected users notified IF high risk to rights and freedoms (AVG Art. 34)
T+7d  → Full post-mortem completed
T+14d → Corrective actions deployed + verified
```

---

## L.4 AP notification template

```
Autoriteit Persoonsgegevens
Postbus 93374
2509 AJ Den Haag
meldloket@autoriteitpersoonsgegevens.nl

Subject: Melding datalek - HAVEN [datum]

1. Aard van het datalek:
   [Beschrijf wat er is gebeurd]

2. Categorieën en (bij benadering) het aantal betrokkenen:
   [Bijv. gezondheidsgegevens van ~X ouderen]

3. Categorieën en (bij benadering) het aantal persoonsgegevens:
   [Bijv. medicijnnamen, locatiegegevens]

4. Naam en contactgegevens FG/DPO:
   [Naam, e-mail, telefoon]

5. Waarschijnlijke gevolgen:
   [Beschrijf risico's voor betrokkenen]

6. Getroffen maatregelen:
   [Wat is er gedaan om het lek te dichten en schade te beperken]
```

---

## L.5 User notification template (Dutch)

```
Onderwerp: Belangrijke mededeling over uw HAVEN-account

Beste [Voornaam],

Wij willen u informeren dat er een beveiligingsincident heeft
plaatsgevonden waarbij mogelijk uw gegevens betrokken zijn.

Wat is er gebeurd:
[Duidelijke, niet-technische beschrijving]

Welke gegevens:
[Specifiek benoemen]

Wat wij hebben gedaan:
[Acties]

Wat u kunt doen:
[Concrete stap(pen)]

Heeft u vragen? Bel ons op [nummer] of mail [adres].

Met vriendelijke groet,
Het HAVEN team
```

---

# Addendum M — Accessibility Testing Plan

**File:** `docs/addenda/M-accessibility.md`

## M.1 Standard & target

| Standard | Target |
|---|---|
| WCAG | 2.2 AA |
| EU standard | EN 301 549 (where applicable) |
| Screen reader (iOS) | VoiceOver — full navigation without visual |
| Screen reader (Android) | TalkBack — full navigation without visual |
| Motor accessibility | Switch access (iOS) + Switch Access (Android) |

---

## M.2 Automated accessibility checks (in CI)

```bash
# React Native / Expo: use jest-native + @testing-library/react-native
# Every component test must include accessibility assertions:

it('has accessible medication card', () => {
  const { getByRole } = render(<MedicationCard medication={mockMed} />);
  expect(getByRole('button', { name: /Metformine ingenomen/i }))
    .toBeVisible();
});

# Family dashboard: axe-core via jest-axe
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

it('alerts page has no axe violations', async () => {
  const { container } = render(<AlertsPage />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

---

## M.3 Manual testing checklist (per screen, per release)

### Elder app — VoiceOver/TalkBack

```
[ ] Every interactive element has an accessibilityLabel in Dutch
[ ] Reading order is logical (top-to-bottom, left-to-right)
[ ] No "unlabelled button" errors
[ ] Swipe navigation reaches all interactive elements
[ ] Double-tap activates the correct action
[ ] All images have accessibilityLabel or are marked decorative
[ ] Error/empty states are announced correctly
[ ] Voice companion TTS integrates correctly with screen reader
    (does not conflict)
```

---

### Elder app — Visual

```
[ ] Minimum touch target: 48×48dp (WCAG 2.5.5)
[ ] Minimum contrast ratio: 4.5:1 for normal text (WCAG 1.4.3)
[ ] Minimum contrast ratio: 3:1 for large text + UI components
[ ] High contrast mode tested (iOS + Android system setting)
[ ] Font scaling tested at 200% (iOS) and 2x (Android)
[ ] No information conveyed by colour alone
[ ] Focus indicator visible for keyboard/switch navigation
```

---

## M.4 Real-user accessibility testing (mandatory before launch)

> **You cannot ship a product for 68–90 year old users without testing with actual 68–90 year old users.** Automated tests catch code issues; they do not catch "I don't understand what this does."

Minimum requirement before closed beta:
- **5 usability sessions** with Dutch older adults (aged 68+)
- At least **2 participants with low digital literacy**
- At least **1 participant using a screen reader**
- Sessions recorded (with consent) and findings fed back into copy + UX updates

---

# Addendum N — Feature Flags & Rollout Strategy

**File:** `docs/addenda/N-feature-flags.md`

## N.1 Feature flag implementation

Feature flags are stored in a Supabase config table (no external dependency needed for MVP):

```sql
CREATE TABLE feature_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key    text UNIQUE NOT NULL,
  description text,
  enabled     boolean DEFAULT false,
  rollout_pct integer DEFAULT 0
    CHECK (rollout_pct BETWEEN 0 AND 100),
  elder_ids   uuid[],   -- override: enabled for specific elders
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- No RLS for clients; flags fetched via Edge Function with service role
```

---

## N.2 Flag evaluation (Edge Function helper)

```typescript
// packages/utils/flags.ts
export async function isFlagEnabled(
  flagKey: string,
  elderId: string,
  adminClient: SupabaseClient
): Promise<boolean> {
  const { data: flag } = await adminClient
    .from('feature_flags')
    .select('enabled, rollout_pct, elder_ids')
    .eq('flag_key', flagKey)
    .single();

  if (!flag) return false;
  if (!flag.enabled) return false;
  if (flag.elder_ids?.includes(elderId)) return true;
  if (flag.rollout_pct === 100) return true;
  if (flag.rollout_pct === 0) return false;

  // Deterministic rollout by hashing elder_id
  const hash = parseInt(elderId.replace(/-/g, '').slice(0, 8), 16);
  return (hash % 100) < flag.rollout_pct;
}
```

---

## N.3 MVP flag definitions

```sql
INSERT INTO feature_flags (flag_key, description, enabled, rollout_pct)
VALUES
  ('schild_call_reputation',
   'Show caller reputation indicator',
   false, 0),
  ('anker_medication_ocr',
   'OCR-based medication setup from photo',
   false, 0),
  ('kring_life_story_recording',
   'Enable life story audio recording',
   true, 100),
  ('kompas_safe_zone_alerts',
   'Safe zone exit family notifications',
   true, 100),
  ('stem_companion',
   'Dutch voice companion (STEM)',
   true, 100),
  ('companion_memory',
   'Persistent companion memory',
   false, 0),    -- Phase 2
  ('psd2_transaction_alerts',
   'PSD2 transaction anomaly alerts with bank deep-linking',
   false, 0),   -- Phase 2
  ('wacht_professional_portal',
   'Professional carer portal',
   false, 0),   -- Phase 2
  ('buurt_neighbourhood_connector',
   'BUURT: De Buurtverbinder — anonieme buurtprofielen + interesse-matching',
   false, 0),   -- Phase 2; off by default
  ('buurt_walk_buddy',
   'BUURT: Wandelmaatje matching',
   false, 0),   -- Phase 2; only enable after base BUURT is stable
  ('buurt_events',
   'BUURT: Lokale activiteiten suggesties',
   false, 0);   -- Phase 2
```

---

## N.4 Closed beta rollout sequence

```
Week 1-2:  Internal team only (5 households)
  → All flags at rollout_pct = 0 except core flows
  → Focus: auth, medication reminders, family messages

Week 3-4:  Extended pilot (20 households)
  → Enable: safe-zone alerts, life story recording
  → Focus: SCHILD alert flows, STEM companion

Month 2:   Closed beta (50 households)
  → Full MVP feature set
  → rollout_pct increases to 100 for stable features

Month 3+:  Open beta (invite-only, NL only)
  → Phase 2 flags begin internal testing
```

---

# Addendum O — Companion Memory Sub-Specification

**File:** `docs/addenda/O-companion-memory.md`

## O.1 What companion memory is

The STEM voice companion maintains a **persistent, elder-specific memory** of:
- Personal facts ("mijn kleindochter heet Sofia")
- Preferences ("ik hou van klassieke muziek")
- Recurring events ("elke dinsdag belt mijn dochter")
- Emotional states (grief, celebration)
- Key life narrative facts (from life stories)

This memory is used to make STEM feel like **a companion who remembers**, not a generic assistant.

---

## O.2 Data model

```sql
See Doc 05 (`9.2 companion_memory`) for the canonical companion_memory DDL and memory_type enum.
```

---

## O.3 Embedding model spec

| Property | Value |
|---|---|
| Model | `text-embedding-3-small` |
| Dimensions | 1536 |
| Similarity metric | Cosine |
| pgvector index | HNSW (m=16, ef_construction=64) — see Addendum B |
| Language | Dutch (nl-NL) text stored + embedded |

---

## O.4 Memory creation pipeline

```
Voice interaction completed (fn-voice-pipeline)
  ↓
LLM extracts memory candidates from transcript
  [{"type": "personal_fact", "content": "mijn kleindochter heet Sofia"}]
  ↓
fn-companion-memory-update (Edge Function)
  ↓
For each candidate:
  1. Generate embedding
  2. Search for near-duplicate (cosine similarity > 0.92)
  ├── Near-duplicate found → update existing + refresh last_referenced
  └── No duplicate → insert new memory
  ↓
Memory stored in companion_memory table
```

---

## O.5 Memory retrieval (prompt injection)

```typescript
// At voice pipeline start, retrieve relevant memories for context

async function getRelevantMemories(
  elderId: string,
  queryText: string,
  adminClient: SupabaseClient
): Promise<CompanionMemory[]> {

  const queryEmbedding = await generateEmbedding(queryText);

  const { data } = await adminClient.rpc('match_companion_memory', {
    p_elder_id: elderId,
    p_query_embedding: queryEmbedding,
    p_match_threshold: 0.75,
    p_match_count: 8,
  });

  return data ?? [];
}
```

```sql
-- Supabase RPC function for memory similarity search
CREATE OR REPLACE FUNCTION match_companion_memory(
  p_elder_id        uuid,
  p_query_embedding vector(1536),
  p_match_threshold float,
  p_match_count     int
)
RETURNS TABLE (
  id               uuid,
  memory_type      memory_type,
  content_nl       text,
  importance_score int,                          -- canonical: importance_score
  similarity       float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.memory_type,
    cm.content_nl,
    cm.importance_score,                         -- canonical: importance_score
    1 - (cm.embedding <=> p_query_embedding) AS similarity
  FROM companion_memory cm
  WHERE cm.elder_id   = p_elder_id
    AND cm.deleted_at IS NULL
    AND (cm.expires_at IS NULL OR cm.expires_at > now())
    AND 1 - (cm.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY
    similarity       DESC,
    cm.importance_score DESC                     -- canonical: importance_score
  LIMIT p_match_count;
END;
$$;
```

---

## O.6 Context window management (prompt structure)

```typescript
function buildCompanionPrompt(
  memories: CompanionMemoryRow[],
  currentScreen: string,
): string {

  const memoryContext = memories
    .sort((a, b) => b.importance_score - a.importance_score)  // canonical sort
    .slice(0, 6)
    .map(m => `- ${m.content_nl}`)
    .join('\n');

  return `
Je bent HAVEN, een vriendelijke digitale hulp voor een oudere in Nederland.
Je spreekt altijd respectvol Nederlands met "u" en "uw".
Je bent een digitale hulp — geen echte persoon. Wees eerlijk als iemand dit vraagt.
Je geeft korte, duidelijke antwoorden van maximaal twee zinnen.
Je bent geen arts en geeft geen medisch advies.

Wat je weet over deze persoon:
${memoryContext}

Huidige situatie: ${currentScreen}

Antwoord altijd in het Nederlands. Wees warm maar beknopt.
`.trim();
}
```

---

## O.7 Memory retention policy

See Doc 05 retention table.
```

---

## O.8 Edge Function: `fn-companion-memory-update`

**Trigger:** called by `fn-voice-pipeline` after each interaction  
**Auth:** service role only

**Input:**
```typescript
// packages/utils/companion-memory.types.ts  (v1.1.1 canonical)

export type MemoryType =
  | 'personal_fact'
  | 'preference'
  | 'recurring_event'
  | 'life_event'
  | 'emotional_state'
  | 'medical_context';

export interface ExtractedMemory {
  type: MemoryType;
  content_nl: string;
  importance_score: number;          // canonical: importance_score (1-10)
}

export interface MemoryUpdateInput {
  elder_id: string;
  interaction_id: string;
  transcript_nl: string;
  extracted_memories: ExtractedMemory[];
}

export interface MemoryUpdateOutput {
  memories_created: number;
  memories_updated: number;
  memories_skipped: number;         // near-duplicates (cosine sim > 0.92)
}

export interface CompanionMemoryRow {
  id: string;
  elder_id: string;
  memory_type: MemoryType;
  content_nl: string;
  importance_score: number;          // canonical: importance_score
  source: 'voice_interaction' | 'life_story' | 'manual' | 'anker_sync';
  source_id: string | null;
  last_referenced: string | null;
  expires_at: string | null;
  created_at: string;
}

// Memory extraction system prompt (nl-NL, sent to LLM inside fn-voice-pipeline)
const MEMORY_EXTRACTION_PROMPT = `
Je analyseert een gesprekstranscript en extraheert herinneringen over de oudere.
Retourneer een JSON array. Gebruik uitsluitend deze types:
- personal_fact     (naam, familie, huisdier, woonplaats)
- preference        (muziek, eten, hobby, gewoonten)
- recurring_event   (wekelijkse afspraken, vaste gewoonten)
- life_event        (belangrijke levensgebeurtenissen uit het verleden)
- emotional_state   (huidige gemoedstoestand: rouw, vreugde, bezorgdheid)
- medical_context   (alleen als expliciet vermeld: medicijnnaam, bijwerking)

Regels:
- Alleen vermelde feiten — GEEN aannames
- Alle content_nl in het Nederlands
- importance_score: 1 (laag) tot 10 (hoog)
- Geen BSN, adres, telefoonnummer of financiële gegevens
- Maximaal 5 herinneringen per gesprek

Formaat:
[
  {
    "type": "personal_fact",
    "content_nl": "De kleindochter van de oudere heet Sofia.",
    "importance_score": 8
  }
]

Als er geen herinneringen zijn, retourneer een lege array: []
`.trim();
```

---

# Complete Addendum Suite Index

| Addendum | File | Status |
|---|---|---|
| A — RLS Policies (complete SQL) | `docs/addenda/A-rls-policies.md` | ✅ |
| B — DB Indexes + Migration Strategy | `docs/addenda/B-db-indexes-migrations.md` | ⚠️ FILE PENDING — content embedded in §DB this doc |
| C — Auth & Onboarding Flows | `docs/addenda/C-auth-flows.md` | ⚠️ FILE PENDING — content embedded in §Auth/Onboarding this doc |
| D — Offline & Sync Strategy | `docs/addenda/D-offline-sync.md` | ⚠️ FILE PENDING — content embedded in §Offline this doc |
| E — Supabase Storage Spec | `docs/addenda/E-storage-spec.md` | ⚠️ FILE PENDING — content embedded in §Storage this doc |
| F — Error/Empty States + Dutch Copy | `docs/addenda/F-copy-and-states.md` | ✅ |
| G — Local Dev Environment Setup | `docs/addenda/G-local-dev-setup.md` | ✅ |
| H — Monorepo Structure + Conventions | `docs/addenda/H-monorepo-structure.md` | ✅ |
| I — CI/CD Pipeline | `docs/addenda/I-cicd-pipeline.md` | ✅ |
| J — DPIA Template (AVG Art. 35) | `docs/addenda/J-dpia-template.md` | ⚠️ Requires DPO completion |
| K — Vendor Register + DPA Tracking | `docs/addenda/K-vendor-register.md` | ⚠️ Requires DPO review |
| L — Incident Response Plan | `docs/addenda/L-incident-response.md` | ✅ |
| M — Accessibility Testing Plan | `docs/addenda/M-accessibility.md` | ✅ |
| N — Feature Flags + Rollout Strategy | `docs/addenda/N-feature-flags.md` | ✅ |
| O — Companion Memory Sub-Spec | `docs/addenda/O-companion-memory.md` | ✅ |
| P — BUURT (De Buurtverbinder) | `docs/addenda/P-buurt-neighbourhood-connector.md` | ✅ |

---

> **`Havenbuildcompletedesigndoc.md` + these 16 addenda = complete SSOT.**
>
> The two items marked ⚠️ (DPIA + Vendor Register) are not engineering gaps — they are **legal process gaps** that require a named DPO or privacy officer to complete before production launch. No engineer can close them. Flag these to leadership immediately if a DPO has not been appointed.

---

# Addendum P — BUURT: Neighbourhood Connector (De Buurtverbinder)

**File:** `docs/addenda/P-buurt-neighbourhood-connector.md`

## P.1 — The problem (NL-verified statistics only)

### P.1.1 Living alone in the Netherlands
At the beginning of 2024, 19 percent of the Dutch population — **3.3 million people** — lived alone. The largest group of people living alone are **women aged 70 and older**, often left living alone after the death of a partner.
Among people aged 70 to 80 specifically, **31% are single** (living alone).
The number of households where the reference person is 65 or older is expected to rise significantly — from **2.5 million in 2024 to 3 million by 2035** — with much of this growth coming from individuals living alone, fuelled by increasing life expectancy, widowhood, and higher divorce rates among older adults.

### P.1.2 Loneliness in the Netherlands (older adults specifically)
Of all people aged **75 and over** in the Netherlands, **51% felt lonely in 2024**. Of those aged **85 and over, 60%** felt lonely.
More than half of the Dutch population older than 65 feels lonely sometimes (RIVM 2024). As people are predominantly **ageing in place** instead of in care homes, their everyday experiences become more localised and **neighbourhood spaces gain traction as important spaces of encounter**.
Among people aged 45 to 75, **social loneliness** — missing a wider social network — is most common.
Of people who do not have regular social contact, **over 46% feel strongly socially lonely**, compared to almost 13% of people who do see, speak, or message someone every week.
Modern society has become increasingly individualistic — signified by smaller households and **longer geographical distance between parents and their children**. Loneliness is negatively associated with physical and mental wellbeing: it is a **strong predictor for premature death, depression, dementia and heart failure**.

**The neighbourhood opportunity:**
Spaces of encounter can serve as important spaces for social contact for older people, and even **reduce their loneliness** — but only if their physical mobility and the accessibility and proximity of these spaces allow them to.
BUURT is HAVEN's answer: **bring the neighbourhood to the elder, not the elder to the neighbourhood.**

### P.1.3 What this means for HAVEN's product rationale
The NL-verified figures above represent a compelling rationale for a Netherlands-specific elder-care product and are the authoritative source for KRING loneliness justifications.

---

## P.2 — Feature definition (BUURT — De Buurtverbinder)
**Pillar assignment:** KRING (connection) — sub-feature of Pillar 3
**Core promise:**
> "U bent niet alleen in uw buurt. Er zijn mensen vlakbij die ook van [tuinieren] houden."
> *(You are not alone in your neighbourhood. There are people nearby who also enjoy gardening.)*

**What BUURT does:**
- **Buurtprofiel**: Elder opts in and selects up to 5 interest tags from a fixed Dutch catalogue.
- **Anonieme nabijheid**: Shows a count only: "3 mensen in uw buurt gebruiken ook HAVEN" — no names, no photos.
- **Interesse-match**: Shows shared interest tags anonymously: "Iemand vlakbij houdt ook van 🌿 tuinieren".
- **Activiteiten**: Hyper-local events within configurable radius: "Gratis lezing over vogels, 600m, donderdag".
- **Wandelmaatje**: "Wilt u dat HAVEN een wandelmaatje zoekt in uw buurt?" — mutual opt-in only.
- **Verbindingsverzoek**: Anonymous request → both parties must accept before any contact.
- **Familie-zichtbaarheid**: Family can see who elder has connected with — only after elder shares this.

---

## P.3 — Privacy architecture (non-negotiable)
This is the most privacy-sensitive feature in HAVEN. Every design decision is AVG-first.
- **Fuzzy location only**: Neighbourhood stored at 4-digit postcode area (PC4) level — never address, never GPS point.
- **No reverse lookup**: PC4 is one-way; there is no way to derive address from stored neighbourhood.
- **Anonymous until double opt-in**: Both parties must actively accept before any identity is revealed.
- **No direct messaging**: HAVEN does not provide a chat function; connections lead to family-mediated or activity-level contact only.
- **Elder controls family visibility**: Family can only see connections if elder explicitly shares them.
- **Full opt-out at any time**: No dark patterns; opt-out deletes neighbourhood profile and all derived data immediately.
- **No persistent location tracking**: BUURT uses a **declared neighbourhood** (elder sets it once), not real-time location.
- **Minimum age gap matching**: Interest matching only; no age, gender, or demographic matching.
- **No profiling for advertising**: Neighbourhood data is never used for targeting, profiling, or third-party purposes.

---

## P.4 — What BUURT explicitly is NOT
- A dating app (no romantic matching, no photos until mutual opt-in)
- A real-time location tracker ("where is my neighbour now?")
- A direct messaging platform (no in-app chat)
- A social network with profiles, followers, or public presence
- A tool for family to see who their parent is socialising with (without elder's consent)

# Section §TM — Threat Model

This section documents the security threat model for HAVEN, focusing on risks to dignity, privacy, and compliance in an elder-care context.

## TM.1 STRIDE Threat Matrix

| Threat ID | Category | Description | Target | Mitigation | Residual Risk |
|---|---|---|---|---|---|
| **T-01** | Information Disclosure | Authorized family member abuses location/financial read access to spy on or control the elder. | `location_events`, `financial_transactions` | Granular opt-in permissions with clear elder-facing voice review triggers. | Low |
| **T-02** | Tampering / Elevation | Malicious actor updates medication schedules or wellness check-in records. | `medications`, `medication_reminders` | Strict RLS (only elder can write/update meds; family has read-only access). | Very Low |
| **T-03** | Information Disclosure | Sentry error logs or analytics logs capture raw Dutch voice transcripts containing health info or BSN. | Cloud Logs, Sentry | Strict structured logging (UUIDs hashed, PII stripped) + Sentry client-side scrubbing rules (Class 4 fields). | Low |
| **T-04** | Tampering (Injection) | Adversary injects malicious voice commands to bypass local fraud detection prompts. | STT / Whisper intake | Rigid local validation grammar + LLM prompt constraints restricting action triggers. | Medium |
| **T-05** | Spoofing | Fraudster calls the elder pretending to be a bank helpdesk to initiate a scam call. | Phone / voice intake | SCHILD phone reputation validation + real-time audio analysis alerting family. | Medium |

---

# Section §DC — Data Classification Registry

This registry defines the security classification tiers for all data handled by HAVEN, governing logging, scrubbing, and vendor sharing bounds.

## DC.1 Table and Column Classification Tiers

| Tier | Security Class | Encryption & Controls | Tables & Columns |
|---|---|---|---|
| **Class 1** | Openbaar (Public) | Standard access; no PII | `interest_tags`, `neighbourhood_events`, UI copy strings |
| **Class 2** | Persoonlijk (Personal) | TLS 1.3 in transit; RLS enforced | `profiles.phone_nl`, `profiles.locale`, `profiles.timezone`, `family_relationships` |
| **Class 3** | Gevoelig (Sensitive) | Class 2 + strict audit logging | `location_events.location_fuzzed`, `scam_events`, `financial_transactions` |
| **Class 4** | Bijzondere (Special/Health) | Class 3 + field-level encryption + 30d transcripts/voice TTL | `medications`, `medication_reminders`, `voice_interactions.transcript_nl`, `companion_memory.content_nl` |
| **Class 5** | Verboden (Forbidden) | Strictly prohibited to collect | **BSN (Burgerservicenummer)** |

## DC.2 Sentry & Logging Scrub Rules
To prevent accidental exfiltration of Class 4 health data to logging/monitoring platforms, the following client-side scrub rules are enforced in `sentry.config.js`:
- Hashing of all UUIDs (e.g., `elder_id_hash` = `sha256(elder_id)`).
- Automatic regex scrubbing of BSN-like 9-digit patterns (`^[0-9]{9}$`).
- Hard deny-list of request body keys: `transcript_nl`, `content_nl`, `dosage`, `zorgverzekering_nummer`.

---

# Section §RT — RLS Test Harness

Row-Level Security is a critical security boundary. RLS regressions are caught automatically in CI/CD using **pgTAP** tests.

## RT.1 pgTAP Automated Test Execution
pgTAP test scripts are stored under `supabase/tests/rls/`. The tests run against a localized Supabase container in the GitHub Actions workflow.

```bash
# Run the pgTAP RLS test harness locally
supabase test db supabase/tests/rls/voice_interactions.sql
```

## RT.2 CI/CD Verification Gate
Any PR modifying database tables or migration files must pass the pgTAP test suite. A failed assertion blocks PR merge:
- Assert that anonymous users cannot read any tables.
- Assert that family members cannot select raw `voice_interactions` transcripts.
- Assert that only the elder profile owner can access their own `companion_memory`.

---

# Section §VF — Voice Pipeline Failure-Mode Design

When the voice companion loses connectivity or API timeouts occur, HAVEN must fail gracefully to protect elder dignity.

## VF.1 Timeout Thresholds
To prevent long, confusing silences for the elder, the voice pipeline enforces the following strict timeouts:
- **Speech-to-Text (Whisper):** 3.0 seconds max.
- **Large Language Model (GPT):** 4.0 seconds max.
- **Text-to-Speech (ElevenLabs):** 3.0 seconds max.

## VF.2 Cached Fallback Audio Assets (nl-NL)
The HAVEN client application pre-caches audio clips on the local device storage. If a pipeline step exceeds the timeout threshold or network fails, the app plays one of these local Dutch voice clips (using polite "u" form):

| Failure Mode | Trigger | Local Voice Feedback Copy (nl-NL) | Action |
|---|---|---|---|
| **STT Timeout / Network Failure** | Whisper API takes > 3s or fails | *"Sorry, ik kon u niet goed horen. Kunt u dat herhalen?"* | Restart voice intake |
| **LLM / Processing Error** | LLM fails or returns error | *"Er is een kleine storing in mijn systeem. Ik probeer het over een moment opnieuw."* | Retain intent state |
| **TTS Timeout / Error** | ElevenLabs takes > 3s or fails | *(Plays a gentle chime, then falls back to local TTS engine)* | Use default OS speech engine |

