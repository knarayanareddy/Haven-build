# HAVEN — Production Infrastructure & Human Gates Checklist

**Version**: 1.0.0  
**Date**: 2026-06-19  
**Status**: Required before any production deployment or public beta  
**Owner**: CTO + DPO + Legal + Release Manager  
**Reference**: README.md (Production-launch note), designdoc.md (Addenda J, K, L), VNEXT_IMPLEMENTATION_REPORT.md, RESIDUAL_HARDENING_REPORT.md

This document expands on the **remaining 1.0 engineering rating gap** identified in the repository. It details every infrastructure component, credential, configuration file, and human gate that must be completed before HAVEN can be considered production-ready.

---

## 1. Real Infrastructure Requirements

### 1.1 Supabase Production Project

**Current state**: All code assumes a local Supabase instance (`supabase start`) or placeholder project.

**Actions required**:

1. **Create Production Supabase Project**
   - Go to https://supabase.com/dashboard
   - Create new project in **EU region** (Frankfurt / `eu-central-1` recommended for AVG compliance)
   - Project name: `haven-production`
   - Database password: Store in 1Password / Vault (minimum 32 chars)
   - **Files to update**:
     - `supabase/config.toml` → update `project_id`, `api` keys, `db` connection strings
     - `.env.production` (new file) and `apps/elder/.env.production`
     - `apps/family/.env.production.local`

2. **Generate Production Database Types**
   ```bash
   supabase gen types typescript --linked > packages/database/types.ts
   ```
   - Commit the generated file.
   - Update `packages/database/client.ts` to use production URL + anon key via environment variables.

3. **Apply All Migrations to Production**
   ```bash
   supabase link --project-ref <PROD_REF>
   supabase db push
   ```
   - Run `supabase db lint --level warning` first.
   - Verify with `supabase db diff`.

4. **Deploy All 82 Edge Functions**
   ```bash
   supabase functions deploy --all
   ```
   - Use `scripts/deploy/deploy-supabase.sh` (update with production token).
   - **Critical**: Set `verify_jwt = true` for all user-scoped functions in `supabase/config.toml`.

5. **Configure Storage Buckets & Policies**
   - Create buckets: `voice-notes`, `life-story-audio`, `document-vault`, `ocr-inbox`, `tts-cache`, `profile-photos`
   - Apply RLS policies from `docs/addenda/E-storage-spec.md`
   - Set lifecycle rules (especially `ocr-inbox` 24h, `tts-cache` 48h).

6. **Enable Required Extensions**
   - `pgvector`, `postgis`, `pg_cron`, `moddatetime`, `pg_trgm` (already in migrations).

**Verification**:
- Run `pnpm run validate:suite` against production project.
- Run full test suite with `HAVEN_LIVE_RLS=1 pnpm run test:integration:live`.

---

### 1.2 Vendor Integrations & Credentials

**Required vendors** (from designdoc.md Document 09 & Addendum K):

| Vendor              | Purpose                        | Required Credentials                          | File(s) to Configure                          | DPA/SCC Status     | Notes |
|---------------------|--------------------------------|-----------------------------------------------|-----------------------------------------------|--------------------|-------|
| **OpenAI**          | Whisper STT + Embeddings       | `OPENAI_API_KEY`                              | `supabase/functions/.env`, Edge Functions     | Required + SCC     | EU DPA needed |
| **ElevenLabs**      | TTS (nl-NL "Hanna" voice)      | `ELEVENLABS_API_KEY`, voice_id                | `supabase/functions/.env`, `fn-voice-pipeline` | Required + SCC     | Custom voice cloning |
| **Expo**            | Push Notifications + EAS Build | `EXPO_TOKEN`, projectId                       | `apps/elder/app.json`, EAS config             | Review             | Already partially configured |
| **Sentry**          | Error tracking (EU)            | `SENTRY_DSN` (EU endpoint)                    | All apps + Edge Functions                     | ✅ EU available    | PII scrubbing mandatory |
| **Vercel**          | Family dashboard hosting       | `VERCEL_TOKEN`, project IDs                   | `apps/family/vercel.json`                     | Review             | EU region preferred |
| **Supabase**        | Backend                        | Service role key, project ref                 | All deployment scripts                        | ✅ EU DPA          | Primary backend |
| **Apple APNs**      | iOS Push                       | APNs key (.p8) + Team ID                      | Expo dashboard / EAS                          | Review             | Via Expo |
| **Google FCM**      | Android Push                   | `google-services.json`                        | `apps/elder/android/app`                      | Review             | Via Expo |

**Actions**:
- Create `.env.production` files in:
  - `supabase/functions/.env`
  - `apps/elder/.env.production`
  - `apps/family/.env.production.local`
- Never commit secrets. Use GitHub Secrets + Supabase Vault.
- Update `docs/addenda/K-vendor-register.md` with actual DPA signing dates and document links.

---

### 1.3 Observability & Monitoring Stack

**Required setup**:

1. **Sentry (EU)**
   - Create project per surface (elder, family, edge-functions)
   - Configure PII scrubbing rules (see designdoc.md)
   - Files: `sentry.config.ts` in each app

2. **Logflare / Axiom** (Supabase native)
   - Enable log drains on production Supabase project
   - Configure alerts for Edge Function errors

3. **Supabase Database Webhooks + pg_notify**
   - Already implemented for `perf_metrics` and error spikes
   - Connect to Slack/PagerDuty

4. **Performance Budget Monitoring**
   - Implement SLO queries from designdoc.md Document 10

**Files to create/update**:
- `docs/runbooks/production-monitoring.md` (new)
- Update `.github/workflows/production-checks.yml`

---

### 1.4 Real Device & Build Infrastructure

**Actions**:

1. **Physical Device Testing Matrix**
   - Minimum devices:
     - iPhone 13/14/15/16 (iOS 17+)
     - iPad (for larger text testing)
     - Samsung Galaxy S23/S24 + mid-range Android (API 31+)
   - Test scenarios: offline mode, low battery, poor network, VoiceOver/TalkBack, high contrast, font scaling 200%

2. **EAS Build Configuration**
   - Update `apps/elder/eas.json` with production profiles
   - Generate production builds:
     ```bash
     eas build --platform ios --profile production
     eas build --platform android --profile production
     ```

3. **App Store Connect & Google Play Console**
   - Create accounts
   - Reserve app names: "HAVEN – Ouderenhulp" (NL) / "HAVEN Elder Companion"
   - Prepare screenshots, privacy policy links, age rating (17+ due to health data)

---

## 2. Human Gates & Compliance Requirements

### 2.1 Data Protection Impact Assessment (DPIA) — Addendum J

**Mandatory before any production data processing**.

**Tasks**:
1. Complete **all sections** of `docs/addenda/J-dpia-template.md`
2. DPO must sign the document (digital signature + date)
3. Assess high-risk processing:
   - Voice recordings
   - Health-adjacent data (medications, wellness)
   - Location (even fuzzed)
   - Vulnerable persons (elders 68–90)
4. Submit to Autoriteit Persoonsgegevens if required (likely)
5. Update `docs/release/PRIVACY_POLICY_EN.md` and `PRIVACY_POLICY_NL.md` based on DPIA findings

**Owner**: Named DPO  
**Deadline**: Before first production elder account creation

---

### 2.2 Vendor Register & Data Processing Agreements (Addendum K)

**Tasks**:
1. Complete `docs/addenda/K-vendor-register.md` with:
   - Actual signed DPA dates
   - SCC references (for non-EU vendors)
   - Document storage links (Notion / Drive)
2. Obtain signed DPAs from:
   - OpenAI
   - ElevenLabs
   - Vercel (if not already)
3. Confirm no BSN is ever transmitted (hard rule enforcement in code already exists)
4. Review all vendor sub-processors

**Owner**: DPO + Legal  
**File updates**: `docs/addenda/K-vendor-register.md`

---

### 2.3 External Penetration Test

**Scope** (from `docs/release/PENTEST_SCOPE.md`):

- All Edge Functions (especially authz, storage signed URLs, voice pipeline)
- RLS policy bypass attempts
- Storage bucket enumeration
- Insecure direct object references
- Rate limiting & idempotency bypass
- Client-side secret leakage

**Requirements**:
- Third-party firm with **NEN 7510 / ISO 27001** certification
- Minimum 2-week engagement
- Remediation of all P0/P1 findings before launch
- Retest after fixes

**Files**:
- Update `docs/release/PENTEST_SCOPE.md` with chosen vendor
- Store report in secure location (not in repo)

---

### 2.4 Older-Adult Usability Testing

**Mandatory** (per designdoc.md):

- Minimum **5 sessions** with Dutch adults aged 68+
- At least 2 participants with low digital literacy
- At least 1 participant using screen reader (VoiceOver/TalkBack)
- Record sessions (with consent)
- Test flows: onboarding, medication confirmation, scam alert, voice companion, fall detection, family messaging

**Deliverable**:
- Usability report + action items
- Update `docs/release/ELDER_USABILITY_PROTOCOL.md` with findings

**Owner**: UX Researcher + Product

---

### 2.5 Additional Human Gates

| Gate | Description | Owner | Reference File | Status |
|------|-------------|-------|----------------|--------|
| **Named DPO appointment** | Formal appointment letter | Legal | Doc 06 in designdoc | Required |
| **Vendor DPAs/SCCs** | All non-Supabase vendors | DPO | Addendum K | Required |
| **Privacy Policy finalization** | NL + EN versions | Legal + DPO | `docs/release/PRIVACY_POLICY_*` | Required |
| **Accessibility audit sign-off** | WCAG 2.2 AA + EN 301 549 | Accessibility specialist | Addendum M | Required |
| **Incident Response Plan test** | Tabletop exercise | Security team | Addendum L | Recommended |
| **App Store / Play Store approval** | Metadata + builds submitted | Release Manager | EAS + App Store Connect | Final step |

---

## 3. Step-by-Step Production Readiness Roadmap

### Phase 1: Infrastructure (2–3 weeks)

1. Create Supabase production project + apply migrations
2. Generate DB types
3. Configure all vendor credentials in production environments
4. Deploy Edge Functions + Storage policies
5. Set up Sentry + Logflare drains
6. Update all `.env*` and config files

### Phase 2: Compliance & Human Gates (4–6 weeks, parallel)

1. Appoint DPO
2. Complete and sign DPIA (Addendum J)
3. Complete Vendor Register + obtain DPAs (Addendum K)
4. Commission external penetration test
5. Conduct older-adult usability testing
6. Finalize privacy policies

### Phase 3: Real Device & Store Preparation (3 weeks)

1. Physical device testing matrix
2. Production EAS builds
3. App Store Connect & Google Play setup
4. Submit for review

### Phase 4: Final Verification

1. Full test suite against production Supabase
2. End-to-end flows on physical devices
3. Security retest after pentest fixes
4. DPO final sign-off
5. Production launch

---

## 4. File Inventory — What Needs to Change or Be Created

**New files to create**:
- `.env.production` (root + apps)
- `docs/runbooks/production-monitoring.md`
- `docs/runbooks/incident-response-runbook.md`
- Production Supabase project reference document (internal)

**Files requiring updates**:
- `supabase/config.toml`
- `packages/database/types.ts` (regenerate)
- `docs/addenda/J-dpia-template.md` (complete)
- `docs/addenda/K-vendor-register.md` (complete with real data)
- `docs/release/PENTEST_SCOPE.md`
- `docs/release/ELDER_USABILITY_PROTOCOL.md`
- All `.github/workflows/*.yml` (add production secrets)
- `apps/elder/eas.json`
- `apps/elder/app.json` (production bundle identifiers)
- `README.md` (update production status section)

**Scripts to enhance**:
- `scripts/deploy/deploy-supabase.sh`
- `scripts/check-local-supabase.sh` → create production variant

---

## 5. Risk Summary

| Risk | Mitigation | Owner |
|------|------------|-------|
| DPIA not completed | Block production launch | DPO |
| Missing vendor DPAs | Block data flow to vendor | DPO |
| Pentest findings | Remediation + retest required | Security |
| Usability issues discovered late | Early testing + iteration | Product |
| Real device edge cases | Comprehensive matrix | QA |

---

**This document is now the authoritative source for closing the final 1.0 gap.**

Once all items above are completed and signed off, update the repository README with:

> **Production Status**: ✅ All infrastructure and human gates completed. Ready for public launch.

---

**End of document**