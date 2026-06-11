# HAVEN Phase Coverage Audit

Date: 2026-06-11  
Design source: `designdoc.md` v1.2.1

## Executive result

All phases in the design document have engineering implementation coverage in the repository. The build is not production-launched until external credentials, legal sign-offs, penetration testing and store submissions are completed.

## Phase-by-phase coverage

| Phase | Design-doc scope | Repository implementation | Status |
|---|---|---|---|
| Phase 0 — Foundation | Supabase EU backend, Auth roles, core DB schema, RLS, elder app skeleton, screen renderer/schema tests, family dashboard skeleton | 8 Supabase migrations, forced RLS, storage RLS, auth custom claim hook, Expo elder scaffold, family dashboard scaffold/static preview, schema package, validator/tests | Covered |
| Phase 1 — MVP | ANKER medication reminders, SCHILD call screening/document vault, KRING family messages/life stories, STEM online voice companion, KOMPAS safe zone/emergency profile, family dashboard read-only | Medication OCR/reminders/escalation, scam/call/browser shield, document vault/BSN guard, family messages, life stories, voice/LLM/TTS pipeline, safe-zone PostGIS, emergency profile tokens, family dashboard routes | Covered |
| Phase 2 — Depth | PSD2 transaction intercept, cognitive check-ins, “Wat is dit?”, offline fallback, MedMij integration, WACHT carer portal, app-store readiness | Transaction intercept, cognitive tables/screen actions, document analysis/explainer, offline queue/PWA cache, FHIR/MedMij import, WACHT portal/care plans/incidents, App/Play Store metadata and EAS config | Covered with external vendor/legal gates |
| Phase 2 — BUURT | Anonymous neighbourhood profile, interest tags, local events, walk buddy, double opt-in, family visibility controls | BUURT tables, RLS, feature flags, `fn-buurt-discover`, `fn-buurt-match`, `fn-buurt-events-ingest`, `fn-buurt-optout`, UI cards, PC4-only model | Covered |
| Phase 3 — Scale | Community event feeds, G-Standaard medication DB, Nedap/Careweb integrations, ANBO/KBO-PCOB partner portal, multilingual support | Community event source/feed tables and ingest function, medication catalog sync with legal-basis gate, external care sync jobs for ONS/Nedap/Careweb, partner feed tables, EN/NL i18n and Dutch/English surfaces | Covered as gated/scaffolded integrations |
| Cross-phase Security/Compliance | AVG/UAVG/WGBO compliance, consent, retention, audit logs, DPIA/vendor register, incident response, observability | Consent records, right-to-erasure, data export, audit log triggers, retention cron jobs, vendor register, DPIA table, breach log, runbooks, perf metrics, SLO alerts, log-drain configs | Covered; DPO sign-off remains human-owned |

## Validation snapshot

`npm test` passes with:

```json
{
  "ok": true,
  "app": "apps/iphone-suite/index.html",
  "edgeFunctions": 55,
  "schemaBytes": 118552
}
```

## Important distinction

"Covered" means the repository contains production-oriented schemas, functions, app surfaces, tests and runbooks for the phase. It does **not** mean the real-world service is launched. Production launch still requires:

1. Supabase/Vercel/EAS production projects and secrets.
2. OpenAI, ElevenLabs, Expo Push, Sentry/log-drain, PSD2, MedMij and care-system credentials/contracts.
3. DPO-signed DPIA.
4. Vendor DPAs/SCCs completed.
5. External penetration test.
6. Real older-adult usability testing.
7. App Store / Play Store submission and approval.

## Residual implementation risks

- Several Phase 2/3 integrations are implemented as robust service scaffolds because vendor access requires formal contracts or certifications.
- Production-grade React Native native modules for live call interception, background location and wearable integrations require platform-specific builds and permissions.
- The static iPhone suite visualises the full experience; the Expo/Next scaffolds are wired but would need normal product hardening before store submission.
