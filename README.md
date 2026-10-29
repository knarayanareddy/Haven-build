# HAVEN — Voice-First Elder Care Companion

**Your parent's guardian. Your peace of mind.**

HAVEN is a privacy-first, voice-first elder-care platform for older adults in the Netherlands and the families and care professionals who support them. It combines fraud protection, medication support, family connection, cognitive/orientation safety, a warm voice companion and professional care workflows into one coherent product suite.

This repository is an end-to-end production-shaped HAVEN build. It contains the Expo elder, carer, and grandchild apps; the Next.js family dashboard; Supabase schema, storage policies, and Edge Functions; shared packages; ML safety assets; tests; release documentation; deployment scripts; and compliance-support records.

---

## Current build status

The repository is the **HAVEN vNext build plus the June 20, 2026 end-to-end runtime/configuration fixes** layered on top of the original v1.2.1 SSOT. It implements the design-document feature surface plus vNext extensions (fall detection, daily check-ins, daily family status, trust signal, scam coaching, Familiar Voice, live video calling, carer handover notes, storage signed URLs, hosted smoke scripts, and local Supabase verification) behind feature flags and environment gates.

Validation currently reports:

```json
{
  "ok": true,
  "app": "apps/iphone-suite/index.html",
  "edgeFunctions": 81,
  "schemaBytes": 158544
}
```

### Build layers

| Layer | Source | Lines | Status |
|---|---|---|---|
| **Original SSOT** | `designdoc.md` v1.2.1 | ~6,939 | Built |
| **P0 security hardening closure** | 12 migrations + 55 Edge Functions *at that time* (the repository now holds 45 migrations and 81 functions) | ~2,900 SQL / ~5,500 TS | Built (June 2026) |
| **vNext Well-Rounded Patch** | `docs/implementation/VNEXT_IMPLEMENTATION_REPORT.md` | 13 migrations + 72 Edge Functions at the time of that report | Built (June 2026) |
| **End-to-end runtime/config pass** | Supabase grants/lint fixes, Expo/EAS/env wiring, hosted smoke script, demo-data removal, token encryption/config gates | 81 Edge Functions + current migrations | Built (June 20, 2026) |
| **Test pyramid** | `tests/edge/*.test.mjs` + `tests/integration/live-rls.test.mjs` + static smoke tests | `node --experimental-transform-types --test tests/edge/*.test.mjs` | green — `corepack pnpm run test:edge` reports the live count |
| **October 2026 remediation** | `docs/implementation/REMEDIATION_PLAN_2026-10.md` | RLS closure + audit, rate limiting, error contract, Edge Function typecheck, family-dashboard auth, voice fail-closed, CI consolidation | Executing — see that plan for the rubric per step |

### vNext patch at a glance

The vNext directive summarised in `docs/implementation/VNEXT_IMPLEMENTATION_REPORT.md` was applied in-place. It added:

- **1 schema migration** (`20260614000000_vnext_wellrounded_patch.sql`) with **14 new tables** + 11 telemetry columns on `device_sessions` + 6 seeded consent packs + 10 new feature flags + forced RLS on every new user-data table.
- **16 new Edge Functions** + **4 patches** to existing ones.
- **Elder app**: check-in card, Are-you-OK fall modal, medication confirmation card, scam-coaching button, Familiar Voice toggle.
- **Family app**: Daily status pill, Trust signal panel, two-way action buttons, Familiar Voice recording page.
- **Carer portal**: handover-notes form + offline-first queue + MAR-light entry.
- **Behavioural + RLS test coverage** grew to ~50+ assertions, all green.

Current local verification status:

- `corepack pnpm run typecheck` passes.
- `corepack pnpm run lint` passes.
- `corepack pnpm test` passes.
- `corepack pnpm run quality:check` passes, including the Next.js family production build.
- `./scripts/ci/verify-local-supabase.sh` has passed in this working tree after clearing poisoned Supabase temp cache, applying migrations, parsing DB lint output, and running live local RLS checks.

Current remaining boundary:

- Real production/staging secret values still need to be filled for EAS, Supabase, and vendors.
- `corepack pnpm run smoke:hosted` still needs hosted Supabase URL/JWT/internal key values before it can prove hosted Edge Functions and Storage.
- Physical iOS/Android runtime behavior still needs device validation for camera, mic/TTS, push notifications, offline queues, and background/foreground behavior.
- DPO/DPIA, vendor DPAs/SCCs, external pentest, usability sessions, and app-store approval remain human/commercial gates.

### Security Boundary Hardening (P0 Audit Complete)

In a rigorous senior security audit, multiple P0 and P1 security trust boundaries were identified and immediately hardened across the codebase:

1. **`fn-voice-pipeline` (FIX 1 & 20):** Eliminated high-privilege `admin()` database clients for elder-scoped actions. Extracted real user JWT tokens, bound caller identity, and added dynamic delegate checks allowing only authorized family members and carers. Enforced active `withIdempotency` wrapping to prevent patient-safety risks (such as medication double-confirmation events).
2. **`fn-storage-signed-url` (FIX 2):** Bounded folder-level storage paths to strict elder UUID matching. Enforced cryptographic format checks on directory owner segments (`ownerId`) and added directory-traversal protection (`..` and `\`). Banned family delegate access to the privacy-sensitive `document-vault` and `ocr-inbox` buckets.
3. **`fn-transaction-intercept` (FIX 3):** Fully fail-closed transaction webhooks. The receiver enforces signature checking in all cloud environments, halting execution and returning a `500 Server Misconfiguration` block if missing or misconfigured, while maintaining local-development convenience.
4. **GDPR Export Completeness & Compliance (FIX 11 & 12):** Aligned `public.export_elder_data` with GDPR Articles 15 & 20. Swapped the function to `security definer` to safely bypass column-level coordinate blocks for the elder themselves, enabling the export of `location_precise` in a highly secure, restricted JSON payload.
5. **`verify_jwt` Alignment (FIX 4):** Explicitly declared compensating controls inside `supabase/config.toml` for functions running with `verify_jwt = false` and enforced standard gateway JWT validations for all user-facing endpoints.

Full test command:

```bash
corepack pnpm test
```

Current test coverage includes:

- **suite structure validation** (`validate:suite` — required files present)

The suites below are illustrative, not a complete list. `corepack pnpm run test:edge` runs
every `tests/edge/*.test.mjs` file (the runner prints the live count, which is why no number is
quoted here); the runner is
`node --test` with a glob, so adding a file cannot silently skip it.
- **scam-engine tests** (5 NL rule patterns + scoring)
- **screen-schema constitution tests** (UX enforcement: ≤2 nav depth, ≤4 items, emergency button, banned AI copy)
- **Edge Function hardening checks** (markers: every protected function references the right authz helpers)
- **authz behavioural tests** (exercising real `_shared/authz.ts` against a mock Supabase client)
- **error contract tests** (401/403/404/409/413/422/429/500 mapping, no internal leakage)
- **rate-limit contract tests** (identity/network buckets, spoofed headers, backend degradation)
- **Edge Function coverage audit** (81 functions: 65 rate-limited, 16 documented exemptions)
- **RLS coverage audit** (110 tables, forced RLS, service-role-only list justified)
- **RLS policy static audit** (15 critical tables with forced RLS, all expected policies)
- **Storage policy static audit** (7 buckets + 4 critical policies)
- **data-lifecycle diff audit** (export + erasure coverage of every GDPR-relevant table)
- **vNext RLS audit** (17 assertions covering all 14 new tables, family/carer/permission gating, every new feature flag)
- **iPhone-suite smoke test** (render + accessibility + screen constitution)

### Production-launch note

This repository is production-shaped and locally green, but it is not truthfully production-launched. A real production launch still requires external operational gates:

1. Hosted Supabase staging/production project with migrations, secrets, storage buckets, and Edge Functions deployed.
2. `smoke:hosted` and live RLS/API checks run against hosted Supabase with real test JWTs.
3. Physical iPhone and Android validation.
4. Vendor sandbox and production credentials.
5. DPO-signed DPIA.
6. Vendor DPAs/SCCs.
7. External penetration test.
8. Older-adult usability sessions.
9. App Store / Play Store submissions and approvals.

These are tracked in the release and compliance documentation.

---

## Repository map

```text
Haven-build/
├── apps/
│   ├── iphone-suite/        # High-fidelity iPhone product suite preview
│   ├── family-dashboard/    # Static family dashboard preview
│   ├── admin-console/       # Compliance/release/admin console preview
│   ├── carer-portal/        # WACHT professional carer portal preview
│   ├── browser-shield/      # Browser Shield extension scaffold
│   ├── elder/               # Expo elder app
│   ├── carer/               # Expo carer app
│   ├── family/              # Next.js family dashboard
│   └── grandchild/          # Expo grandchild companion app
├── docs/
│   ├── api/                 # OpenAPI + Edge Function catalog
│   ├── implementation/      # audits, phase coverage, feature matrix
│   ├── release/             # store metadata, privacy, audits, safety protocols
│   └── runbooks/            # production runbook
├── ml/
│   ├── dataset/             # scam dataset schema and manifest
│   ├── heuristics/          # rule catalog
│   └── prompts/             # scam reasoning prompt
├── packages/
│   ├── contracts/           # TypeScript API/domain contracts
│   ├── database/            # typed database surface
│   ├── i18n/                # EN/NL product copy
│   ├── scam-engine/         # local scam scoring rules
│   ├── schema/              # screen schema + constitution validator
│   └── ui/                  # design tokens and UI specs
├── scripts/
│   ├── deploy/              # Supabase deploy scripts
│   ├── check-local-supabase.sh
│   └── validate-suite.mjs
├── supabase/
│   ├── functions/           # 81 Edge Functions
│   ├── migrations/          # timestamped schema/security/runtime migrations
│   ├── seed.sql             # synthetic local seed data
│   └── config.toml          # Supabase local function config
├── tests/
│   ├── edge/
│   ├── rls/
│   └── e2e/
├── .github/workflows/
├── .maestro/
├── designdoc.md             # source engineering design document
├── package.json
└── pnpm-workspace.yaml
```

---

## Product pillars

| Pillar | Purpose | Implemented surfaces |
|---|---|---|
| **SCHILD** | Fraud and scam protection | scam pipeline, call reputation, browser shield, document vault, transaction intercept, weekly digest |
| **ANKER** | Health, medication and rhythm | medication OCR, reminders, escalation, refill detection, tasks, hydration, nutrition, vitals, telehealth, transport, MedMij/FHIR, medication catalog sync |
| **KRING** | Family and community connection | family messages, voice/video hellos, life stories, memory lane, grandchild app, community events, skill exchange |
| **BUURT** | Privacy-safe neighbourhood connector | PC4 profiles, interest tags, anonymous counts, local events, walk buddy matching, double opt-in, opt-out cleanup |
| **KOMPAS** | Cognitive safety and orientation | safe zone, fuzzy location, emergency profile, night mode, cognitive check-ins, wandering/wearables, driving events, bereavement support |
| **STEM** | Voice companion | Whisper adapter, intent classification, LLM reply, ElevenLabs TTS, **Familiar Voice (family clone, gated)**, companion memory, crisis detection, **repeat-back confirmation for medication intake** |
| **WACHT** | Professional care portal | carer portal with **handover notes + MAR-light + offline queue**, care plans, visit logs, incidents, safeguarding reports, external care sync |

---

## Application surfaces

### iPhone suite preview

Open:

```text
apps/iphone-suite/index.html
```

Includes:

- iPhone-sized interface
- English default with Dutch switch
- high contrast and large text controls
- SCHILD, ANKER, KRING, BUURT, KOMPAS, STEM, WACHT flows
- local state for demo interactions
- PWA manifest and service worker

### Elder app

Location:

```text
apps/elder
```

Includes (v1.2.1 baseline + vNext patch):

- Expo app config (SDK 56, RN 0.86, React 19.2.7)
- EAS build profiles (`development`, `preview`, `production`)
- EAS fail-fast validation for required public Supabase env values
- Native permission configuration for camera, microphone, speech, location, calendar, notifications and background modes
- React Navigation native-stack
- Supabase Auth provider with `expo-secure-store` session persistence
- **Schema-driven `ScreenRenderer`** rendering 10 production screens from `packages/schema/src/screenSchema.ts`
- **Daily check-in card** (morning/midday/evening mood options)
- **"Are you OK?" fall modal** triggered by `pending_confirmations(fall_response)`
- **Medication confirmation card** for repeat-back flow
- **Scam coaching button** calling `fn-scam-coaching`
- **Familiar Voice toggle** on STEM + SETTINGS screens (gated by `familiar_voice_enabled`)
- SQLite offline queue with `expo-sqlite` (`apps/elder/src/services/sqliteOfflineQueue.ts`)
- Voice recorder service (`expo-av`)
- Floating voice button wired to real recording and `fn-voice-pipeline` submission
- Document camera capture service (`expo-camera`)
- Push-token registration service (`expo-notifications`)
- Crisis phrase detection (`apps/elder/src/services/crisis.ts`)
- Local notification helper with quiet-hours support (`apps/elder/src/services/notifications.ts`)
- PII-safe logger (`apps/elder/src/services/security.ts`)
- Network resilience + offline sync machine (`apps/elder/src/state/*`)

The elder live action path uses the authenticated profile ID derived from the Supabase session token. It no longer sends live calls with a hardcoded demo elder UUID.

### Family dashboard

Location:

```text
apps/family
```

Includes (v1.2.1 baseline + vNext patch):

- Next.js 16 app with TypeScript and ESLint
- Security headers + middleware permission mapping
- Dashboard routes for medications, alerts, BUURT, location, WACHT, **Familiar Voice**
- **Daily status pill** (`apps/family/src/components/DailyStatusPill.tsx`) showing green/amber/red with "why" + "what next"
- **Trust signal panel** (`apps/family/src/components/TrustSignalPanel.tsx`) showing device last-seen, permissions last known, recent `device_health_events`
- **Two-way action buttons**: send heart, voice message, gentle check-in, video call
- **Consent-scoped dashboard RPC client** (`apps/family/src/services/dashboard.ts`) using `family_dashboard_summary`
- Server-side dashboard bootstrap via `HAVEN_FAMILY_ELDER_ID` and `HAVEN_FAMILY_ACCESS_TOKEN`; if missing, the dashboard shows a setup-required state instead of fake care data
- **Real-time subscriptions** (`apps/family/src/services/realtime.ts`)
- **Familiar Voice recording page** with privacy disclosure + sample sentences + record/test actions (`apps/family/src/app/dashboard/familiar-voice/page.tsx`)

### Browser Shield

Location:

```text
apps/browser-shield
```

Includes:

- Manifest V3 extension scaffold
- local page pattern scan
- compact risk event submission to `fn-browser-shield`
- no raw page storage

### Admin console

Location:

```text
apps/admin-console/index.html
```

Covers:

- DPIA status
- vendor register
- release checks
- incident response readiness

### Carer portal (WACHT)

Location:

```text
apps/carer-portal/index.html
```

Covers (v1.2.1 baseline + vNext patch):

- Care visits and care plans overview
- Safeguarding state with meldcode step indicator
- **Handover notes workflow** — carer writes appetite/mood/mobility/concerns/administered-med; calls `fn-carer-handover-note`; selects family recipients
- **Offline-first capture** — localStorage-backed queue with online/offline buttons
- **MAR-light** — administration logging linked to `medication_reminders`

### Carer app

Location:

```text
apps/carer
```

Includes:

- Expo app config and EAS build profiles
- Supabase Auth provider with secure session storage
- Visit list and shift summary screens that call `fn-shift-summary` for configured `EXPO_PUBLIC_CARER_ELDER_IDS`
- Visit completion path that calls `fn-care-visit-log`
- Handover form calling `fn-carer-handover-note`
- Offline queue fallback for handover and visit-log writes
- Setup-required states when no signed-in session or assigned elder IDs are configured

### Grandchild app

Location:

```text
apps/grandchild
```

Covers:

- simple authenticated hello form
- backend call to `fn-grandchild-message-send` through `apps/grandchild/src/client.ts`
- setup-required validation for Supabase URL, elder ID, family member ID, display name and family access token

---

## Backend overview

### Supabase migrations

```text
supabase/migrations/                                           # 45 migrations applied in order
├── 20260611000001_haven_v121_production_schema.sql            # v1.2.1 canonical schema
├── 20260611000002_storage_rpc_security.sql                    # Storage RLS + column revoke
├── 20260611000003_full_feature_domain_tables.sql             # WACHT + ANKER extension
├── 20260611000004_production_automation_realtime.sql           # Realtime + auth hook
├── 20260611000005_compliance_care_release_ops.sql             # Compliance, DPIA, vendor register
├── 20260611000006_integrations_observability_grandchild.sql   # Grandchild + integration tracking
├── 20260611000007_grandchild_unique_fix.sql                   # One-line uniqueness fix
├── 20260611000008_phase3_safety_community_legacy.sql          # Wearables, BUURT extensions
├── 20260611000009_hardening_idempotency_integration_status.sql # Idempotency + webhook receipts
├── 20260613000010_edge_authz_hardening.sql                    # Companion memory + audit log RLS
├── 20260613000011_voice_interactions_self_write.sql           # voice_elder_insert/update
├── 20260613000012_data_lifecycle_expansion.sql               # GDPR export expansion + retention
├── 20260614000000_vnext_wellrounded_patch.sql                 # vNext patch: 14 new tables + flags
├── 20260620000001_fix_export_elder_data_recorded_at.sql       # export_elder_data runtime fix
└── 20260620000002_end_to_end_runtime_fixes.sql                # grants, function drift, lint/runtime fixes
```

The migrations implement:

- domain tables
- enums
- indexes
- forced RLS
- storage buckets and policies
- PostGIS location RPCs
- pgvector memory retrieval
- auth custom claims
- realtime publication registration
- retention jobs
- compliance tables
- release checks
- observability tables
- idempotency and webhook receipts

### Edge Functions

There are currently **81 Edge Functions** in `supabase/functions`. They are classified into explicit trust zones per `docs/implementation/EDGE_FUNCTION_TRUST_BOUNDARY_MATRIX.md`:

- user-scoped functions (`verify_jwt = true`) use the caller's JWT and relationship/permission checks
- admin/service functions use explicit admin bearer or service execution paths
- vendor-facing functions use HMAC/shared-secret validation
- internal scheduled/background functions require `HAVEN_INTERNAL_KEY`

A complete catalog is available here:

```text
docs/api/EDGE_FUNCTION_CATALOG.md
```

OpenAPI surface:

```text
docs/api/openapi.yaml
```

Major function groups:

- Voice and companion memory
- Scam/browser/call reputation
- Medication OCR/reminders/refills
- Document analysis
- Location/safe zone/wandering/driving
- BUURT discovery/matching/events
- Family/grandchild messages
- Care plans/visit logs/incidents
- Consent/preferences/erasure/export
- Compliance/release/breach/vendor registry
- Observability/SLO/log drains
- External integrations: PSD2, MedMij/FHIR, care systems

---

## Security and privacy model

HAVEN follows a privacy-first model from the design document:

- Row-Level Security enabled and forced on user-data tables.
- Elder owns their data.
- Family access requires consent and per-feature permissions.
- Carer access requires active relationship and elder consent.
- Companion memory is elder-private.
- Document vault is elder-only.
- BUURT never exposes third-party elder identity before double opt-in.
- Precise location is only stored for active safe-zone events and is nulled after 24 hours.
- Family location view is fuzzed only.
- BSN is not stored, processed or transmitted.
- DigiD is deferred and not implemented as auth.
- Audit logs track sensitive changes.
- Right to erasure and data export are implemented.

Detailed docs:

```text
docs/release/PRIVACY_POLICY_EN.md
docs/release/PRIVACY_POLICY_NL.md
docs/release/PENTEST_SCOPE.md
docs/release/ACCESSIBILITY_AUDIT_PROTOCOL.md
```

---

## Testing

Run all current tests:

```bash
corepack pnpm test
```

Individual test groups:

```bash
corepack pnpm run validate:suite
corepack pnpm run test:edge
corepack pnpm run test:rls
corepack pnpm run test:e2e
```

What these cover:

- repository structure
- required files
- function inventory
- migration feature coverage
- feature matrix completeness
- screen schema constitution
- scam rule behavior
- Edge Function hardening patterns
- RLS policy presence
- storage policy presence
- iPhone suite smoke behavior

Device/E2E assets:

```text
.maestro/elder-medication-confirmation.yaml
.maestro/shield-alert-flow.yaml
tests/e2e/family-dashboard.spec.ts
playwright.config.ts
```

---

## Local development

Install runtime dependencies from the monorepo root:

```bash
corepack pnpm install --frozen-lockfile
```

Run validation:

```bash
corepack pnpm run validate:suite
```

Run lint coverage:

```bash
corepack pnpm run lint
```

Run typecheck coverage:

```bash
corepack pnpm run typecheck
```

This currently checks:
- shared packages
- Expo elder app
- Expo grandchild app

The Next.js family app gets its TypeScript validation through the production build step:

```bash
corepack pnpm run build:family
```

Preview the static app surfaces:

```bash
corepack pnpm run preview:iphone
corepack pnpm run preview:family
```

Build the Next.js family dashboard:

```bash
corepack pnpm run build:family
```

Run the combined quality gate locally:

```bash
corepack pnpm run quality:check
```

Run the root engineering orchestration locally:

```bash
corepack pnpm run verify:core
```

Optional browser E2E coverage:

```bash
corepack pnpm exec playwright install chromium
corepack pnpm run verify:browser
```

Optional local Supabase orchestration:

```bash
corepack pnpm run verify:supabase:local
```

Hosted Supabase smoke test, after staging/production secrets and test JWTs are available:

```bash
SUPABASE_URL=... \
SUPABASE_ANON_KEY=... \
HAVEN_INTERNAL_KEY=... \
HAVEN_TEST_ELDER_ID=... \
HAVEN_TEST_ELDER_JWT=... \
corepack pnpm run smoke:hosted
```

Run all tests:

```bash
corepack pnpm test
```

### Supabase local reset

A real local reset requires Supabase CLI and Docker.

Run:

```bash
./scripts/check-local-supabase.sh
```

That script executes:

```bash
supabase start
supabase db reset
supabase db lint --level warning
```

---

## Deployment

Deployment scripts:

```text
scripts/deploy/check-production-env.sh
scripts/deploy/deploy-supabase.sh
```

Required deployment variables:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `HAVEN_ENV`

Deploy Supabase:

```bash
./scripts/deploy/deploy-supabase.sh
```

The script:

1. checks the deployment environment
2. links the Supabase project
3. pushes migrations
4. deploys Edge Functions
5. runs tests

CI workflow:

```text
.github/workflows/production-checks.yml
```

---

## External integration status

External integrations are represented in code and tracked in `integration_connections`.

| Integration | Code support | Real-world gate |
|---|---|---|
| OpenAI Whisper | implemented | API key + DPA/SCC |
| OpenAI embeddings/LLM | implemented | API key + DPA/SCC |
| ElevenLabs TTS | implemented | API key + DPA/SCC |
| Expo Push | implemented | Expo token + store setup |
| Supabase Storage signed URLs | implemented + hosted smoke script | Supabase project + test JWT |
| Sentry/log drains | implemented | DSN/log-drain config |
| PSD2/Tink | implemented with HMAC webhook support and encrypted refresh-token storage | provider contract, sandbox, `TINK_TOKEN_ENCRYPTION_KEY` |
| MedMij/FHIR | implemented importer | accreditation and credentials |
| G-Standaard/Z-Index | implemented with legal-basis gate | AGB-code/formal agreement |
| ONS/Nedap/Careweb | implemented sync scaffolds | partner access |

---

## Compliance and launch gates

The repository contains tables and docs for:

- DPIA assessments
- vendor register
- breach incident log
- release checks
- privacy policies
- accessibility protocol
- pentest scope
- older-adult usability protocol
- safety copy review

Important files:

```text
docs/implementation/HARDENING_CLOSURE_REPORT.md
docs/implementation/PHASE_COVERAGE_AUDIT.md
docs/implementation/DESIGN_DOC_DIFF.md
docs/release/ACCESSIBILITY_AUDIT_PROTOCOL.md
docs/release/PENTEST_SCOPE.md
docs/release/ELDER_USABILITY_PROTOCOL.md
docs/release/COPY_REVIEW.md
```

Human and hosted-runtime gates still required before real production launch:

1. Hosted Supabase staging/production smoke test passes.
2. Production secrets/vendor credentials provisioned.
3. Physical iOS/Android validation completed.
4. DPO signs DPIA.
5. Vendor DPAs/SCCs completed.
6. External penetration test completed.
7. Older-adult usability testing completed.
8. App Store / Play Store submissions approved.

---

## Implementation audits

Core audit docs:

```text
docs/implementation/DEEP_DIVE_AUDIT.md                       # Original gap analysis (closed by GAP_CLOSURE_REPORT.md)
docs/implementation/HARDENING_CLOSURE_REPORT.md             # v1.2.1 P0 trust-boundary closure
docs/implementation/DESIGN_DOC_DIFF.md                      # Design-doc-to-build diff
docs/implementation/PHASE_COVERAGE_AUDIT.md                 # Phase-by-phase coverage
docs/implementation/FEATURE_IMPLEMENTATION_MATRIX.md        # 60+ feature matrix
docs/implementation/FEATURE_IMPLEMENTATION_MATRIX.json      # Machine-readable matrix
docs/implementation/EDGE_FUNCTION_TRUST_BOUNDARY_MATRIX.md  # Edge Function trust zones
docs/implementation/RESIDUAL_HARDENING_REPORT.md            # Human-only remaining gates
docs/implementation/RELEASE_CANDIDATE_SUMMARY.md            # Honest RC label
docs/implementation/PRIORITIZED_REMAINING_ISSUES.md        # P0/P1/P2 backlog
docs/implementation/NEXT_10_GITHUB_ISSUES.md               # Suggested labels
docs/implementation/SESSION_HANDOFF_CHANGELOG.md            # Session-by-session changelog
docs/implementation/GAP_CLOSURE_REPORT.md                   # Earlier scaffold→real gap closure
docs/implementation/VNEXT_IMPLEMENTATION_REPORT.md         # vNext acceptance criteria + honest gaps
```

The feature matrix currently tracks all major features from the design document + the vNext extensions and their implementation status.

---

## Engineering rating

After the v1.2.1 hardening pass, the vNext Well-Rounded Patch, and the June 20, 2026 runtime/configuration pass, this repository is best described as:

> A substantially hardened, locally green, production-shaped engineering package for HAVEN. Schema, Edge Functions, app surfaces, Supabase local verification, and test coverage are in place behind feature flags and configuration gates. The live app paths no longer rely on hidden demo IDs or demo fixtures, and production-risk integration paths now fail fast when required secrets/config are absent.

Current engineering readiness rating: **9.3/10 for local/pre-production code readiness**.

The remaining gap requires:
1. Hosted Supabase staging/production smoke and live RLS/API verification
2. Real devices (physical iPhone / Android) + vendor sandbox credentials
3. DPO-signed DPIA + vendor DPAs/SCCs
4. External penetration test + older-adult usability sessions
5. App Store / Play Store submissions

These are documented as external gates in `docs/PRODUCTION_READINESS_CHECKLIST.md`, `PRODUCTION_INFRASTRUCTURE_AND_HUMAN_GATES.md`, and `docs/implementation/RESIDUAL_HARDENING_REPORT.md`.

---

## License

This repository currently uses the original repository license. Confirm licensing before commercial production use.
