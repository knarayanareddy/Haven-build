# HAVEN Remediation Plan — October 2026

Status: **Phases 1–4 executed and verified** (see §7 for the per-step evidence; this file is the source of truth for the pass)
Scope owner: engineering
Baseline commit: `f8c8d19`
Working branch: `arena/76ad940d-haven-build`

This plan converts the October 2026 repository review into ordered, individually verifiable steps.
Every step has a **rubric** — a command that must pass, and the observable result that proves the step
is done. A step is not "done" because code was written; it is done when its rubric passes in a clean
checkout (`corepack pnpm install --frozen-lockfile && <command>`).

---

## 0. Why this order

The review found a recurring pattern: the control exists in one layer but is not wired up in the layer
that actually ships. That is why static grep-based tests stayed green while real gaps remained.

Ordering principle: **stop the harm → make failures visible → make CI trustworthy → make docs honest.**
Doing CI before code would mean encoding the current (wrong) behaviour as the gate. Doing docs first
would document fiction.

---

## 1. Global definition of done

| Gate | Command | Required result |
|---|---|---|
| G1 Install | `corepack pnpm install --frozen-lockfile` | exit 0, lockfile unchanged |
| G2 Types | `corepack pnpm run typecheck` | exit 0, covers packages + elder + carer + grandchild + family |
| G3 Lint | `corepack pnpm run lint` | exit 0, `--max-warnings=0` |
| G4 Tests | `corepack pnpm run test` | exit 0; **every** file in `tests/edge` executed, N pass / 0 fail |
| G5 Build | `corepack pnpm run build:family` | exit 0 |
| G6 Guards | `corepack pnpm run test:guards` | exit 0 (RLS coverage, rate-limit coverage, docs truth) |
| G7 Clean tree | `git diff --exit-code` after a full run | no tracked file is mutated by the build/test run |

---

## 2. Phase 1 — Safety-critical (items 1–4)

### P1.1 RLS coverage closure — 12 unprotected tables

**Problem.** 12 tables in `public` are created without `enable row level security`. Supabase grants
`anon`/`authenticated` table privileges by default, so they are reachable through PostgREST with the
public anon key: `fhir_medication_staging`, `location_events_partitioned`, `psd2_webhook_ingress_buffer`,
`device_telemetry_nonces`, `phone_reputation_cache`, `domain_reputation_cache`, `profiles_snapshot`,
`gdpr_pii_fields`, `dpo_pii_incident_review`, `security_violations`, `clinical_record_corrections`,
`consent_packs`.

**Files.** `supabase/migrations/20261029000001_rls_coverage_closure.sql` (new).

**Approach.** Per-table posture, not a blanket policy:

| Table | Posture | Rationale |
|---|---|---|
| `phone_reputation_cache`, `domain_reputation_cache` | service-role only (no policies, revoke from anon+authenticated) | tampering = scam-detection bypass |
| `device_telemetry_nonces` | service-role only | pre-seeding nonces defeats replay defence |
| `psd2_webhook_ingress_buffer` | service-role only | raw bank payloads |
| `profiles_snapshot` | service-role only | internal FK anchor |
| `gdpr_pii_fields`, `dpo_pii_incident_review`, `security_violations` | service-role + admin select | forensic / DPO surfaces |
| `clinical_record_corrections` | service-role + admin select; carers read via `effective_carer_handover_notes` view | append-only ledger, no `elder_id` column to scope on |
| `consent_packs` | authenticated select | reference catalogue, non-PII |
| `fhir_medication_staging` | elder select own, carer all (medications), admin select; writes service-role only | clinical staging |
| `location_events_partitioned` | elder own + family `location` permission (mirrors `location_events`), column-level revoke of `location_precise` | geospatial PII |

Adds `public.is_haven_admin()` (SECURITY DEFINER, pinned `search_path`, execute revoked from `PUBLIC`,
granted to `authenticated`/`service_role`) and `public.ensure_location_partition_rls()` which enables +
forces RLS on every existing and future `location_events_p_*` partition; the partition-creation function
is redefined to call it, and a daily `pg_cron` job is scheduled when the extension is present.

**Rubric.**
```
node scripts/ci/audit-rls-coverage.mjs
```
→ prints `RLS coverage: 110/110 tables` and exits 0; lists zero tables without `enable row level security`
or without a posture entry in the audit's `EXPECTED_POSTURE` map. Also: every new table appears in exactly
one posture bucket, and `revoke all on <table> from anon` is present for all 12.

---

### P1.2 RLS + policy audit in CI (guard against regression)

**Problem.** `tests/rls/rls-policy-audit.mjs` greps 11 of 41 migrations for substrings and cannot fail
when a new table ships without RLS.

**Files.** `scripts/ci/audit-rls-coverage.mjs`, `tests/edge/rls-coverage-audit.test.mjs` (new).

**Rubric.**
```
node --test tests/edge/rls-coverage-audit.test.mjs
```
→ passes; and the test fails when a scratch migration creating a table without RLS is added to a fixture
directory (proved by the test's negative case).

---

### P1.3 Family dashboard: real authenticated sessions

**Problem.** `apps/family/middleware.ts` accepts any `sb-access-token` cookie; `apps/family/src/app/inloggen/page.tsx`
is a placeholder; the dashboard authenticates with one deployment-wide `HAVEN_FAMILY_ACCESS_TOKEN` env var that
is passed as a prop into a `"use client"` component (`CallButton`), so it is serialised into the RSC payload and
shipped to the browser. Consent permissions cannot be enforced per delegate.

**Files.** `apps/family/package.json`, `apps/family/middleware.ts`,
`apps/family/src/lib/{env,guard}.ts`, `apps/family/src/lib/supabase/{server,browser,admin}.ts`,
`apps/family/src/app/inloggen/page.tsx` + `SignInForm.tsx`, `apps/family/src/app/auth/callback/route.ts`,
`apps/family/src/app/actions/{call,sign-out}.ts`, `apps/family/src/app/dashboard/**/page.tsx`,
`apps/family/src/services/dashboard.ts`, `apps/family/src/components/CallButton.tsx`,
`tests/e2e/family-dashboard.spec.ts`.

**Approach.** `@supabase/ssr` cookie sessions. Server components resolve the user via `auth.getUser()`;
`elderId` is resolved from `family_relationships` for that user (not an env var); permissions are read from the
same row and enforced before render; the access token never leaves the server — `CallButton` calls a server
action. Missing env → a "configuration required" card, never a crash (keeps `next build` green without secrets).
`HAVEN_FAMILY_ACCESS_TOKEN`/`HAVEN_FAMILY_ELDER_ID` are removed from the code path and from the env examples.

**Rubric.**
```
corepack pnpm run build:family && corepack pnpm run typecheck
```
→ exit 0, and `grep -rn "HAVEN_FAMILY_ACCESS_TOKEN" apps/family/src` returns nothing.
Behavioural rubric (manual + e2e): `playwright test -c playwright.family.config.ts` → `/dashboard/*` without a
session redirects to `/inloggen`; `/inloggen` renders an email field; no token appears in the HTML/RSC payload
(`grep -r "access_token" .next/server/app/dashboard*.html` → nothing).

---

### P1.4 Elder app: connect the safety loops

**Problem.** `EMERGENCY` / `CALL_FAMILY` / `CRISIS` / `FALL_HELP` only call `Alert.alert`. `pushRegistration.ts`
is imported by nothing (so the server records `send_error: no_active_token`). `offlineSyncMachine.ts` — the queue
drainer — is imported by nothing, so offline medication confirmations never leave the device. `ElderScreen` renders
every list as `[]` even though `fn-screen-data` returns reminders/messages/scam events.

**Files.** `apps/elder/src/services/emergency.ts` (new), `apps/elder/src/hooks/useOfflineSync.ts` (new),
`apps/elder/src/hooks/useHavenActions.ts`, `apps/elder/src/screens/ElderScreen.tsx`,
`apps/elder/src/state/offlineSyncMachine.ts`, `apps/elder/src/services/sqliteOfflineQueue.ts`,
`apps/elder/src/services/havenClient.ts`, `apps/elder/App.tsx`.

**Approach.**
- `emergency.ts`: `dial(number)` via `Linking`, `placeEmergencyCall()` (112), `requestFamilyHelp(client, elderId)`
  which posts a `hulp_gevraagd` family message (which fans out a push through `fn-family-message-send`), then dials
  the family contact when a number is known. Works with no network for the dialer path.
- `useHavenActions`: `EMERGENCY` → confirmation dialog → `placeEmergencyCall()` + best-effort family help;
  `CALL_FAMILY` → `requestFamilyHelp`; `CRISIS`/`FALL_HELP` → family help, not a dead alert.
- `useOfflineSync`: drains the SQLite queue on mount, on `AppState` → `active`, and every 60 s while a session
  exists; stops on repeated failure; never throws.
- Push registration: `registerPushToken` called once per session from `ElderScreen`, failures swallowed and logged.
- `ElderScreen`: hydrate medications/messages/scam events from `fn-screen-data`; keep explicit empty states.

**Rubric.**
```
node --test tests/edge/elder-safety-loops.test.mjs
```
→ passes: asserts (a) `EMERGENCY` path calls `Linking.openURL` with `tel:112` and cannot throw when
`openURL` rejects, (b) `requestFamilyHelp` posts `message_type: hulp_gevraagd` and still returns when the
client throws, (c) the drain loop calls `sync` and swallows failures, (d) `registerPushToken` is invoked from
a mounted effect. Plus: `grep -rn "Alert.alert('HAVEN', t('actions.emergency" apps/elder/src` → nothing.

---

### P1.5 Voice pipeline: fail closed, never fabricate a transcript

**Problem.** `fn-voice-pipeline` defaults a missing transcript to `"Ik heb mijn pillen ingenomen…"`, which
creates a `pending_confirmations` medication row from no input. Classification also falls back to a client-supplied
locale, and MAR confirmations can be created with no active reminder.

**Files.** `supabase/functions/_shared/voice_input.ts` (new), `supabase/functions/fn-voice-pipeline/index.ts`,
`apps/elder/src/hooks/useHavenActions.ts`.

**Approach.** `resolveVoiceInput(body)` requires exactly one of `audio_base64` / `transcript_text`, rejects empty
strings, caps length, and returns a discriminated union. `locale` is resolved from `profiles.locale` via
`assertSafeLocale`; the client no longer sends `'en-GB'` + `'I took it'`. The MAR branch refuses to create a
confirmation when no active reminder exists and returns a calm "nothing due" response.

**Rubric.**
```
node --test tests/edge/voice-input-contract.test.mjs
```
→ passes: empty body, both fields, neither field, whitespace-only transcript, oversized audio, and valid single-field
inputs are each asserted. Plus: `grep -n "Ik heb mijn pillen ingenomen" supabase/functions/fn-voice-pipeline/index.ts`
→ nothing.

---

## 3. Phase 2 — Limits, amplification, observability (items 5–8)

### P2.1 Rate limiter rewrite (identity + backend + memory bounds)

**Problem.** Caller identity is derived from client-controlled headers (`x-real-ip`, `x-forwarded-for`);
the in-memory `Map` is unbounded; the Supabase backend writes `status = <64-char hash>` into
`perf_metrics` whose CHECK allows only `('success','error','fallback')`, so **every** DB-backed check
fails the constraint and the limiter silently and permanently disables itself (`useSupabaseRL = false`).

**Files.** `supabase/functions/_shared/ratelimit.ts`, `supabase/functions/_shared/internal.ts`,
`supabase/migrations/20261029000002_ratelimit_and_telemetry.sql` (new).

**Approach.** Identity = verified JWT `sub`, else verified internal key, else hashed trusted-proxy IP, else a
narrow `anon` bucket (not a 400). Dedicated `rate_limit_counters` table + `consume_rate_limit()` RPC
(SECURITY DEFINER, pinned `search_path`, execute revoked from `PUBLIC`, granted to `service_role` only),
opportunistic expiry. Memory map bounded at 10 000 with FIFO eviction. Backend failure degrades for 60 s
then retries (no permanent disable). Deprecated `ratelimit_check` dropped.

**Rubric.**
```
node --test tests/edge/rate-limit-contract.test.mjs
```
→ passes: JWT identity wins over headers; spoofed `x-forwarded-for` does not create a new bucket; missing
identity falls into `anon` and is capped; map stays ≤ 10 000 after 20 000 distinct keys; a backend error
degrades and re-probes after the cooldown; `429` carries `Retry-After`.

---

### P2.2 Rate-limit coverage on the unprotected high-risk functions

**Problem.** 29/81 functions call `rateLimit`. Unprotected: `fn-medication-ocr`, `fn-document-analyse`,
`fn-storage-signed-url`, `fn-consent-update`, `fn-audit-query`, `fn-medication-escalation`,
`fn-transaction-intercept` (webhook, HMAC-gated) and others, while `SECURITY_FIXES_IMPLEMENTED.md` claims
coverage "for all functions".

**Files.** the function files listed above, `scripts/ci/audit-function-coverage.mjs`,
`tests/edge/function-coverage.test.mjs` (new), `docs/api/EDGE_FUNCTION_CATALOG.md`.

**Approach.** Add `rateLimit()` to every user-facing function; for signature-verified webhooks add a
post-verification limiter keyed on `integration:<name>`. Ship an explicit, reviewed exemption file
(`scripts/ci/function-coverage-allowlist.json`) so new functions cannot ship uncovered.

**Rubric.**
```
node scripts/ci/audit-function-coverage.mjs
```
→ `Functions: 81 | rate-limited: 81 | exempt: n (documented) | unaccounted: 0`, exit 0; adding a new
`fn-*/index.ts` without `rateLimit` makes the audit exit 1 (negative case asserted in the test).

---

### P2.3 `fn-transaction-intercept`: no side effects before signature verification

**Problem.** The `catch` block (which also catches `403: Invalid PSD2 webhook signature`) writes audit rows,
marks the transaction `intercept_failed`, and dispatches `scam_zwart` notifications to every consented family
member **and every admin**. Unauthenticated attacker → notification flood. The `financial_transactions` insert
also runs before `withIdempotency`, leaving a stuck `processing` row per retry.

**Files.** `supabase/functions/fn-transaction-intercept/index.ts`.

**Approach.** Verify signature first and return 401/403 with no side effects; move the insert inside the
idempotent block; only escalate when a *verified* call fails after persistence; separate
`PSD2_TRANSACTION_INTERCEPT_FAILURE` (verified) from `PSD2_WEBHOOK_REJECTED` (unverified, no fan-out).

**Rubric.**
```
node --test tests/edge/transaction-intercept-ordering.test.mjs
```
→ passes: invalid signature ⇒ 403, zero `dispatchNotification` calls, zero `financial_transactions` inserts;
duplicate delivery with the same key ⇒ exactly one transaction row; verified failure ⇒ one escalation.

---

### P2.4 Error contract: correct statuses and non-leaking messages

**Problem.** `handler.ts` returns 400 for everything (dropping `AuthzError.status = 403` and
`RateLimitBreachError.retryAfterSeconds`); `core.ts json()` flips to 429 by substring-sniffing the body;
`safeErrorMessage()` maps "429 Too Many Requests: Rate limit exceeded…" to **"Request too large"** because the
`limit` rule fires first; `async_wrapper.ts` re-derives status from the sanitised string, so the two wrappers
disagree for the same error.

**Files.** `supabase/functions/_shared/errors.ts` (new, pure — no Deno APIs),
`supabase/functions/_shared/{core,handler,async_wrapper,ratelimit,authz}.ts`.

**Approach.** Single `toHttpError(error)` → `{status, code, message, retryAfter?}`, precedence:
explicit `status` on the error → class mapping → 400/500. Message allow-list keyed on error class/code, not
message text. `core.json()` stops mutating status. Both wrappers use the same resolver. `AuthzError` and
`RateLimitBreachError` carry `status`/`code`.

**Rubric.**
```
node --test tests/edge/error-contract.test.mjs
```
→ passes: 403 stays 403; 429 stays 429 with `Retry-After` and the message "Too many requests"; 422 BSN stays
422; unknown errors → 500 "An unexpected error occurred"; no internal string (SQL, stack, table names) is
echoed; a body containing the text "429" does not change a 200 response's status.

---

### P2.5 Error reporting that actually delivers

**Problem.** `sentry.ts` POSTs JSON to the DSN root. Sentry needs `…/api/<project>/store/` (or an envelope),
and the DSN regex rejects standard `o<org>.ingest.sentry.io` hosts, so events are dropped with a warning.

**Files.** `supabase/functions/_shared/errors.ts` (builder), `supabase/functions/_shared/sentry.ts`,
`scripts/ci/verify-sentry.mjs` (new).

**Rubric.**
```
node --test tests/edge/sentry-envelope.test.mjs
```
→ passes: `https://abc123@o123.ingest.sentry.io/456` → `https://o123.ingest.sentry.io/api/456/envelope/`
with `X-Sentry-Auth` containing `sentry_key=abc123` and `sentry_version=7`; envelope body is
`{header}\n{type:event}\n{event}`; PII keys (`email`, `phone`, `name`, `token`, `transcript`, `audio`, `bsn`)
are redacted at any depth. `node scripts/ci/verify-sentry.mjs --dsn <dsn>` performs a live send when a DSN is set.

---

## 4. Phase 3 — Make CI honest (items 14, 17)

### P3.1 One test runner that runs every test

**Problem.** `package.json test:edge` chains 48 of 66 files with `&&`; 18 are never executed. Two of the
orphans **fail today**: `android-multiplatform-closure` (asserts `"windowSoftInputMode": "adjustResize"` in
`app.json` — never added; real Expo key is `android.softwareKeyboardLayoutMode`) and
`clinical-immutability-closure` (asserts `ALTER ROLE … NOSUPERUSER` which the baseline commit removed).
`tests/rls/*.mjs` are substring greps that cannot fail for a dropped policy.

**Files.** `package.json`, `tests/edge/android-multiplatform-closure.test.mjs`, `apps/elder/app.json`,
`supabase/migrations/20261029000003_role_hardening_guarded.sql` (new), `tests/edge/clinical-immutability-closure.test.mjs`,
`scripts/ci/verify-core.sh`.

**Approach.** `node --test --experimental-transform-types tests/edge/*.test.mjs` (proved: 122 tests run in ~6 s).
Fix `app.json` with `android.softwareKeyboardLayoutMode: "resize"` and update the assertion to the real key.
Restore the role hardening as a **guarded** migration (only when the executing role is superuser) so it no
longer breaks `db push`, and assert the guarded form. Delete `tests/rls/*` in favour of the executable
`audit-rls-coverage.mjs`.

**Rubric.**
```
corepack pnpm run test
```
→ exit 0; `# tests` ≥ 130, `# fail 0`; `node -e "..."` verification that every `tests/edge/*.test.mjs` file
appears in the run (no skipped files); the negative case for each newly fixed test is documented in a comment.

---

### P3.2 One CI pipeline; typecheck everywhere; pinned runtime

**Problem.** Three overlapping workflows with drift: `pr.yml` (Node 20) cannot run `--experimental-transform-types`
(Node ≥ 22.7) and never typechecks; `production-checks.yml` runs `verify-core.sh` (does typecheck); `deploy.yml`
auto-deploys with no environment approval, `sleep 10` labelled "30-minute monitoring", a commented-out rollback,
and `trufflesecurity/trufflehog@main`. `apps/carer` has a tsconfig but no `typecheck:carer`. No `engines`, no `.nvmrc`.
The tracked `apps/family/tsconfig.tsbuildinfo` is rewritten by every build, so `git diff --exit-code` fails.

**Files.** `.github/workflows/{quality,pr,production-checks,deploy}.yml`, `package.json`, `.nvmrc`,
`.gitignore`, `apps/family/tsconfig.tsbuildinfo` (untracked), `scripts/ci/check-sentry-error-rate.mjs` (new).

**Approach.** `.github/workflows/quality.yml` is the only place steps live (`workflow_call` + `workflow_dispatch`);
`pr.yml`, `production-checks.yml` and `deploy.yml` all call it. Node 22 everywhere with pnpm cache. `quality:check`
gains carer + family typecheck. Production deploy gets `environment: production`, `permissions:` blocks,
explicit `concurrency`, a real error-rate gate script, honest step names, and pinned actions.

**Rubric.**
```
node scripts/ci/audit-workflows.mjs
```
→ passes: every `uses:` is pinned to a tag ≥ v1 or a full SHA (no `@main`/`@master`); every workflow that runs
Node uses the same major version as `.nvmrc`; exactly one workflow defines the quality steps; every workflow that
runs tests calls `corepack pnpm test`; `deploy.yml` has `environment: production` and a `permissions:` block.
Plus `grep -rn "sleep 10" .github/workflows` → nothing.

---

### P3.3 Docs-truth guard

**Files.** `scripts/ci/audit-docs-truth.mjs` (new), `tests/edge/docs-truth.test.mjs`.

**Rubric.**
```
node --test tests/edge/docs-truth.test.mjs
```
→ passes: README's stated edge-function count, migration count and test-file count equal the real numbers
computed from the filesystem; no doc claims "all tests pass"/"typecheck passes" without a dated, reproducible
command next to it; `docs/PRODUCTION_READINESS_CHECKLIST.md` contains no ticked item whose rubric is unverified.

---

## 5. Phase 4 — Docs and repository hygiene (items 18–19)

### P4.1 Source-of-truth status documents

**Files.** `README.md`, `docs/STATUS.md` (new), `docs/PRODUCTION_READINESS_CHECKLIST.md`,
`docs/implementation/FEATURE_IMPLEMENTATION_MATRIX.json` + `.md`, `docs/SUPERSEDED.md` (new),
`docs/DEVELOPMENT.md`, `supabase/seed.sql` header.

**Approach.** `docs/STATUS.md` becomes the only place that states what works, with three states:
`verified-in-CI`, `implemented-not-wired`, `not-implemented`. The matrix gains `status` values
`implemented | partial | stub` with a `verified_by` pointer to a test or a manual rubric. Mark the ~25
historical status reports as superseded in one index instead of deleting them (audit trail).
`seed.sql`'s "compatible with all 12 migrations" header is corrected to "requires the full migration set".

**Rubric.**
```
node --test tests/edge/docs-truth.test.mjs
```
→ passes, including: every feature claiming `implemented` has a `verified_by` that exists in the repo;
no feature is marked `implemented` when its `verified_by` test does not run in `pnpm test`.

---

### P4.2 Repository hygiene

**Files.** `.gitignore`, `apps/family/tsconfig.tsbuildinfo` (untrack), `supabase/migrations/README.md` (new),
`docs/design/` (index only, no moves of large files in this pass), `CONTRIBUTING.md`, `.github/pull_request_template.md`.

**Approach.** Untrack the build artefact. Document the migration ledger: order, gaps (`…000005 → …000007`,
`…000016 → …000019`, `…000025 → 20260620000001`), and the rule that new migrations are additive and never edited.
Add migration README with the "pre-launch baseline squash" runbook (explicitly a coordinated human action — not
performed here, because rewriting an applied ledger on a shared branch is unsafe).
Add a PR template checklist that mirrors the G1–G7 gates.

**Rubric.**
```
git status --porcelain   # after full verification run
```
→ empty (no tracked artefact churn); `test -f supabase/migrations/README.md`; `git ls-files | grep tsbuildinfo` → nothing;
`node scripts/ci/audit-migrations.mjs` → reports 44 migrations, monotonic ordering, 0 duplicate timestamps,
gaps list matches the README.

---

## 6. Explicitly out of scope for this pass

These were in the review but are not in this plan's scope; they are tracked in `docs/STATUS.md` as known gaps:

- Loading the remaining elder-app data surfaces (tasks, buurt, visits, family contacts) — requires new
  endpoint contracts; P1.4 hydrates medications/messages/scam events only.
- Scam-engine accuracy programme (labelled corpus + eval harness).
- Physical-device validation, pentest, DPIA/DPO gates.
- Git history rewriting (single 77k-line root commit). Provided as a runbook in `supabase/migrations/README.md`
  and `docs/STATUS.md`, because rewriting an applied migration ledger and shared branch history must be a
  coordinated human decision, not an agent side effect.

---

## 7. Execution log — verified results (2026-10-29)

Every row below was observed in this working tree, not asserted from memory. The command in
the *Rubric met by* column is what was run; the *Observed* column is its output.

| Step | Status | Rubric met by | Observed |
|---|---|---|---|
| P1.1 RLS closure | **done** | `node scripts/ci/audit-rls-coverage.mjs` | `RLS coverage: 110/110 tables` · `Service-role-only (documented): 11` · `No violations.` |
| P1.2 RLS audit + tests | **done** | `node --test tests/edge/rls-coverage-audit.test.mjs` | 8/8 pass (incl. negative cases) |
| P1.3 Family auth | **done** | `pnpm run typecheck:family && pnpm run build:family && node --test tests/edge/family-dashboard-auth.test.mjs` | typecheck 0, build 0 (11 routes, `/dashboard` dynamic), 9/9 pass |
| P1.4 Elder safety loops | **done** | `node --test tests/edge/elder-safety-escalation.test.mjs` | 9/9 pass |
| P1.5 Voice fail-closed | **done** | `node --test tests/edge/voice-fail-closed.test.mjs` | 6/6 pass; no fabricated transcript remains in `fn-voice-pipeline` or `_shared/ai.ts` |
| P2.1 Rate limiter | **done** | `node --test tests/edge/rate-limit-contract.test.mjs` | 13/13 pass |
| P2.2 Rate-limit coverage | **done** | `node scripts/ci/audit-function-coverage.mjs` | `Functions: 81 · rate-limited: 65 · exempt: 16 · unaccounted: 0` · `No violations.` |
| P2.3 Intercept ordering | **done** | `node --test tests/edge/transaction-intercept-ordering.test.mjs` | 6/6 pass |
| P2.4 Error contract | **done** | `node --test tests/edge/error-contract.test.mjs` | 13/13 pass |
| P2.5 Error reporting | **done** | `node --test tests/edge/sentry-envelope.test.mjs` | 7/7 pass (envelope endpoint, release/env, PII scrub) |
| P3.1 One runner | **done** | `node --experimental-transform-types --test tests/edge/*.test.mjs` | **220 tests, 220 pass, 0 fail** |
| P3.2 One CI pipeline | **done** | workflow file inspection + `deno check` | `ci.yml` is the only PR gate; `.github/workflows/pr.yml` removed; 81/81 functions pass `deno check`; typecheck covers packages + elder + grandchild + family + carer |
| P3.3 Docs guard | **done** | `node scripts/ci/audit-docs-truth.mjs` | `3 documented claims checked` · `No stale claims.` |
| P4.1 Status docs | **done** | this section | — |
| P4.2 Hygiene | **done** | `git status --short` after a build | `apps/family/tsconfig.tsbuildinfo` untracked and ignored; no build output tracked |

Full gate, one command:

```
corepack pnpm test   # exit 0
```

### Additional defects found while executing (not in the original list)

| Finding | Evidence | Fix |
|---|---|---|
| **33 call sites wrote `.catch()` on a Postgrest builder.** Builders are `PromiseLike`: `then()` only. Every authorisation-denial audit write threw `TypeError: ….catch is not a function`, and the TypeError replaced the failure it was meant to swallow. | `deno check` on `_shared/authz.ts`, plus 32 more | `_shared/settle.ts::settleQuery()` — reports the failure (Sentry + console) instead of discarding it |
| **58 of 81 Edge Functions did not typecheck.** `tsc` never covered `supabase/functions`. | `deno check` before/after | `scripts/ci/verify-edge-functions.sh` + a deno job in `ci.yml`; now 81/81 |
| **`insert(...).onConflict(...).ignore()` does not exist.** 19 call sites; every idempotent request failed before its handler ran. | `deno check` `fn-voice-profile-revoke` | `withIdempotency` uses `upsert(values, { onConflict, ignoreDuplicates })` |
| **`audio_base64` referenced but never defined** in `_shared/ai.ts` (mock mode threw `ReferenceError`), and `userClient` used without an import in `fn-browser-shield`. | `deno check` | fixed |
| **`uuidRegex` declared twice** in `fn-buurt-match` (load-time `SyntaxError`). | `deno check` | fixed |
| **Sentry reporting never delivered.** It POSTed JSON to the bare DSN, which Sentry answers with 405. | `_shared/sentry.ts` | posts a real envelope, adds release/environment/tags, 2s timeout |
| **De-escalation was a comment.** `20260615000002` shipped `-- ALTER ROLE authenticated NOSUPERUSER …` commented out, and the test asserted on the comment text. | migration read | privilege-guarded `DO` block in `20261029000001`, fails closed if a role is still elevated |
| **`pr.yml` ran 48 of 66 test files** via `&&` chaining and never ran typecheck/lint/build. | workflow read | replaced by `ci.yml` |

### Known-remaining (deliberately not closed here)

- `tests/edge/clinical-immutability-closure.test.mjs` asserts on SQL *text*, not behaviour. It is honest about what it checks now, but a real guarantee needs a live database; `ci.yml`'s `database` job is where that belongs.
- The repository still carries 19 root-level planning documents (`HAVEN_BLUEPRINT.md`, `designdoc.md`, `CONTINUATION_SPEC.md`, …). Archiving them is P4.1 follow-up work that changes links in ~6 other documents, so it is left as a single dedicated change rather than mixed into this one.
- `fn-transaction-intercept` still fans out to admins on a *verified* failure. That is intended, but the volume should be capped by a budget rather than an allowlist; tracked as follow-up.
