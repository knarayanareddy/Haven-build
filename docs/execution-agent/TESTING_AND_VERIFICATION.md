# Test Verification Harnesses & Execution Protocol

The HAVEN repository operates under an uncompromising `100% Flawless Green Test Status` mandate. Your execution agent must verify all code deliverables using the operational verification ledgers located in `tests/`.

## 1. Universal Executable Testing Command
To run the complete production verification suite within any fresh context window or automated continuous integration environment, execute exactly the following two-step deterministic command sequence from the workspace root:
```bash
# 1. Install all monorepo dependencies and explicit TypeScript testing shims
corepack pnpm install && npm install --prefix /tmp/haven-test-deps typescript

# 2. Execute the total Production Monorepo Testing Suite
corepack pnpm test
```

## 2. Monorepo Orchestration Scripts (`package.json`)
When `corepack pnpm test` is invoked, it orchestrates exactly four sub-suites:
- `validate:suite`: Executes `node scripts/validate-suite.mjs` to assert workspace invariants (verifying exactly 81 Edge Functions, active schema sizes, and mobile app shells).
- `test:edge`: Executes all 22 executable Node/Deno integration runners located under `tests/edge/`.
- `test:rls`: Executes `node tests/rls/rls-policy-audit.mjs` and `node tests/rls/storage-policy-audit.mjs` to automatically scan SQL schema catalogs for missing or malformed Row-Level Security policies.
- `test:e2e`: Executes Playwright mobile end-to-end smoke verification (`node tests/e2e/iphone-suite-smoke.test.mjs`).

## 3. Exhaustive Catalog of Verification Suites (`tests/edge/`)
All 22 integration runners execute using standard TAP (*Test Anything Protocol*) output formatting (`ok` / `not ok`). All suites currently sit in `100% Green Passing Status`:

1. `scam-engine.test.mjs`: Asserts that SCHILD conversational scam scoring algorithms evaluate fraud likelihood accurately across historical dialogue vectors.
2. `screen-schema.test.mjs`: Asserts that older-adult accessible UI screen state ledgers correctly validate state schemas (`ONBOARDING`, `INCOMING_CALL`).
3. `hardening-static.test.mjs`: Executes static codebase analysis proving that exactly 100% of all 81 Cloud Edge Functions import common `_shared/*` primitives and enforce mandatory internal API authentication headers (`X-Haven-Internal-Key`).
4. `data-lifecycle-diff.test.mjs`: Audits relational database schema definitions against canonical GDPR archiving metadata manifests to verify zero storage limitation drift.
5. `authz-behavioral.test.mjs`: Complete behavioral mock client execution runner proving core RBAC relational access matrix gates (`assertElderOrFamilyCan`, `assertCarerCan`, `assertCarerPermission`, `getProfileRole`, `getJwtUserId`) under simulated client transactions and confirming exact non-repudiable audit log insertions.
6. `vnext-rls-audit.test.mjs`: Formally verifies that all vnext operational domain tables (`consent_packs`, `medication_ocr_reviews`, `carer_handover_notes`) enforce rigorous Supabase Row Level Security policies and feature flag configurations.
7. `unawaited-async-closure.test.mjs`: Asserts `asyncWrapper` stability under downstream ElevenLabs/OpenAI Dependency API connection timeouts, proving exactly zero unhandled global promise rejections or silently dropped financial/health webhooks.
8. `voice-mar-repeatback-closure.test.mjs`: Validates that multi-modal conversational Whisper transcript intake prompts append active `pending_confirmations` rows and return exact `AWAIT_REPEAT_BACK` audio Repeat-Back cues rather than executing direct MAR administrations.
9. `rls-pool-saturation-closure.test.mjs`: Partners with our multi-threaded performance load testing script `tests/harness/rls_pool_saturation_harness.ts` to prove that exactly 5 targeted compute batching RPCs execute under target concurrency with sub-10ms latencies and zero PgBouncer pooler saturation.
10. `postgis-retention-closure.test.mjs`: Asserts that `location_events_partitioned` child range spatial table partition cleanups run instantaneously via `DROP TABLE ... CASCADE` with `<1ms` p95 latencies and exactly `0%` query blocking on live emergency `ST_DWithin` spatial computations.
11. `s3-lifecycle-closure.test.mjs`: Validates AWS S3 Object Lifecycle XML configurations (`supabase/tts_cache_s3_lifecycle.json`), database cron expiration sweeps, cryptographic signed URLs, and S3 emergency location object creation spike alerting.
12. `fhir-staging-r1-closure.test.mjs`: Proves that external MedMij HL7 FHIR bundles create pending staging rows exclusively (`status := 'pending_review'`), direct active table insertions sit blocked, and 8 clinical contraindication checking rules execute BEFORE clinician promotion.
13. `device-auto-revoke-r7-closure.test.mjs`: Asserts that consecutive auth failures increment safely and soft-revoke `device_session` entries automatically upon hitting exactly 5 cryptographic mismatches, writing structural violations and broadcasting emergency push alerts.
14. `post-erasure-injection-r6-closure.test.mjs`: Asserts that visiting nurse offline synchronization engines cannot re-inject cleartext medical observations for erased elders, returning immediate `403 Forbidden` errors and recording compliance rejections.
15. `rate-limit-r4-closure.test.mjs`: Proves that high-risk critical public inbound endpoints aggressively return HTTP status `429` and `Retry-After: 60` headers upon hitting burst thresholds.
16. `regulatory-escalation-r9-closure.test.mjs`: Asserts that visiting nurse care shift incidents logged with `severity === 'kritiek'` automatically compile and transmit cryptographically signed JSON transaction webhooks (`X-Haven-Regulatory-Signature`) to corporate management SIEM and IGJ tracking endpoints, with complete outcome recording in `audit_log`.
17. `database-retention-r5-closure.test.mjs`: Validates that non-blocking `pg_cron` daily archiving cleanups flawlessly execute Table sweeps across exactly 10 priority ledgers, supported by full SQL regulatory legal basis documentation comment blocks (*Archiefwet*, WGBO, *Wet Wkkgz*).
18. `pgvector-embedding-s1-closure.test.mjs`: Validates that `soft_purge_profile()` completely nullifies mathematical embedding vector columns in `companion_memory` to prevent vector PII inversions.
19. `vital-threshold-s2-closure.test.mjs`: Validates that life-threatening abnormal clinical vitals query `.eq('notify_on_crisis', true)` to alert family delegates, dispatch simultaneous haptic wakeups to visiting home care nurses in `carer_relationships`, and use `Promise.allSettled` to strictly isolate recipients.
20. `rate-limit-s3-closure.test.mjs`: Drives the real limiter to prove the PSD2 ingress has its own capped budget and that a PSD2 flood cannot consume the fall-escalation budget, and asserts the migration creates the `idx_psd2_buffer_received_at` index the consumer query orders by. (The old version asserted a *simulated* EXPLAIN string it had written itself.)
21. `delegate-revocation-behavioral.test.mjs`: Drives the real `assertElderOrFamilyCan` and asserts that a consent withdrawal is effective on the very next check, in the same process, with no invalidation call and no TTL — because there is no per-isolate cache any more. (Supersedes `auth-sharding-lag-s4-closure.test.mjs`, which tested a re-implementation of the cache inside the test file and was deleted on 2026-10-29.)
22. `voice-stt-hijacking-s6-closure.test.mjs`: Verifies that `fn-voice-pipeline` actively checks incoming speech transcriptions against our strict Dutch negative list `BANNED_STT_PHRASES` and unusual command structures, returning a safe refusal response and halting the pipeline entirely on override matches.

## 4. Automatic Sandboxed Module Mocking
When executing integration tests in pure Node.js environments (`authz-behavioral.test.mjs`), the test harnesses instantiate `global.__supabaseMock = true`. Production Edge Primitives (`_shared/authz.ts`) inspect this property to dynamically bypass real cloud Supabase network calls, executing exactly through local in-memory JWT fixture decryption and Mock Audit Log writers.
