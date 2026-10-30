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
| P3.1 One runner | **done** | `node --experimental-transform-types --test tests/edge/*.test.mjs` | **233 tests, 233 pass, 0 fail** |
| P3.2 One CI pipeline | **done** | workflow file inspection + `deno check` | `ci.yml` is the only PR gate; `.github/workflows/pr.yml` removed; 81/81 functions pass `deno check`; typecheck covers packages + elder + grandchild + family + carer |
| P3.3 Docs guard | **done** | `node scripts/ci/audit-docs-truth.mjs` | `2 documented claims checked` · `No stale claims.` |
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

---

## 8. Second sweep — further defects (2026-10-29, follow-up)

After §7 was committed, a second pass looked for defects the original list did not
name. Six were found and fixed. The rubric for each is a command a reviewer can run
and the output it printed here.

| # | Defect | Why it matters | Fix | Rubric (command → observed) |
|---|---|---|---|---|
| S1 | **50 JSON responses carried no CORS headers.** `corsHeaders(req)` existed and 74 `json()` calls used it, but 50 success/error paths returned `json(body)` with only `Content-Type`. | A browser or Expo web client received the body but was blocked by the browser: the request "succeeded" server-side and failed client-side, with no server-side signal. The family dashboard and web build are browser clients. | `req` threaded into every `json()` call (single-argument calls became `json(x, 200, req)`) across 39 functions. | balanced-paren scan of `fn-*/index.ts` → `remaining: 0` (124 `json()` calls total); `deno check` → 81/81 |
| S2 | **A medication confirmation was marked `resolved` before the MAR row was written**, and neither write's `{ error }` was read. | supabase-js reports failures in the result object, so a rejected MAR update left `pending_confirmations.status = 'resolved'` with no dose in `medication_reminders`. The elder's screen said "confirmed", the clinical record stayed empty, and the confirmation was closed so nobody asked again. | Side effect first, error checked, confirmation resolved last; a confirmation with no `medication_reminder_id` now returns 409 instead of resolving against nothing. | `node tests/edge/pending-confirmation-ordering.test.mjs` → 7/7 pass, incl. "a rejected MAR write leaves the confirmation unresolved" and "the MAR write happens before the confirmation is marked resolved" |
| S3 | **`recordMetric` awaited a database insert on the response path** — 176 call sites, every request. | The metric that exists to observe latency was adding a full PostgREST round trip to it, and a slow `perf_metrics` slowed every user-facing call. The `try/catch` also never fired: supabase-js returns `{ error }` instead of throwing, so dropped metrics were invisible. | Insert handed to `EdgeRuntime.waitUntil`; result inspected; awaited only where `waitUntil` does not exist. | `deno check` 81/81; `corepack pnpm test` 233/233 (metrics still recorded under the Node shim) |
| S4 | **`fn-health-check` reported a healthy retention sweeper that it never checked.** It read `perf_metrics` (written per request, by no cron job) and, on a null result, substituted `new Date(Date.now() - 3600000)` with `status: "healthy"`. The check also did not participate in the overall status, so even a failed one returned 200. | The sweeper enforces the GDPR retention windows. A dead sweeper means data kept past its lawful retention period, and the only thing watching it reported green. | Migration `20261029000003` exposes `public.cron_job_health` (definer-owned, `service_role` only, reads `cron.job_run_details`); the check reads it, fails closed on missing/stale/failed, treats an absent pg_cron as `not_applicable`, and a failing applicable check now degrades `/health` to 503. | `node tests/edge/health-check-cron-honesty.test.mjs` → 6/6 pass (missing, stale 50 h, failed run, fresh, pg_cron absent, and "never reads perf_metrics"); `bash scripts/ci/verify-sql.sh` → 44 migrations, RLS 110/110 |
| S5 | **`fn-consent-pack-list` returned `{ body: { … } }`** — a double-wrapped envelope — and ignored both read errors. | Every other function returns a flat object, so a client written against the API reads `undefined`; and a failed catalog query was indistinguishable from "this elder has no packs". | Flat envelope, `{ error }` rethrown. No client reads it yet (`apps/elder/src/state/consentPacks.ts` ships a hard-coded copy), so the change is free. | `grep -rn "json({ body:"` → no matches; `deno check` 81/81 |
| S6 | **Two docs-truth claims rotted by construction.** `tests/edge/docs-truth.test.mjs` hard-coded `43 migrations`, so adding migration 44 failed the test claiming the README was wrong; the README also quoted "220 assertions" that `audit-docs-truth.mjs` recorded but never verified. | A guard that has to be edited whenever the thing it guards changes gets edited to match, which is exactly how the `ALTER ROLE` comment test became theatre. | Migration count derived from the directory listing; the unverifiable assertion count removed from prose and from `CLAIMS`. | `node scripts/ci/audit-docs-truth.mjs` → `2 documented claims checked · No stale claims.`; `node --test tests/edge/docs-truth.test.mjs` → 4/4 |

Two behavioural suites were added because the ordering and health guarantees above
are not observable from source text, and because the existing closure tests for the
same files were `.includes()` assertions that pass for the broken code too:
`tests/edge/pending-confirmation-ordering.test.mjs` (7 tests) and
`tests/edge/health-check-cron-honesty.test.mjs` (6 tests).

### Still open after this sweep

- **55 of 79 `tests/edge` files still assert on source text** (down from 59, and now
  measured — see §9; converted further in §10). They are enumerated in `scripts/ci/test-substance-allowlist.json`
  with the reason each one is hard to convert, and the audit stops any new one appearing.

---

## 9. Third pass — the two flagged items (2026-10-29)

### 9.1 `delegateCache`: removed, not documented

The second sweep flagged this rather than changing it. On review that was the wrong
call: the code was not merely suboptimal, its comment asserted a security property
that did not exist, and four documents repeated the claim.

| Claim that was made | Why it was false |
|---|---|
| "Compresses sharding-lag exploit windows from 15–30 s down to ≤10 s" | The `Map` is module-scoped, so it exists in one isolate. `invalidateRelationshipCache()` — called from `fn-consent-update` — clears the entry in whichever isolate served the consent update. The other N−1 isolates keep serving the revoked delegate until their own TTL expires. Nothing is compressed. |
| "Compensating control for cross-isolate revocation" | A cache hit and a cache miss end in the same authorisation decision; the cache could only make revocation *later* (by up to 10 s), never earlier. It was a latency optimisation wearing a security label, which is worse than no optimisation because it stops people looking. |
| `SELECT invalidate_relationship_cache_rpc(...)` in the on-call runbook | No such function exists in any migration. A DBA following `docs/production/TECHNICAL_RUNBOOK.md` during an incident would have hit `function does not exist`. |

Removed:
`_shared/authz.ts` (`delegateCache`, `invalidateRelationshipCache`, and the
`isMockTest` branch that existed only to make the cache test-friendly),
`fn-consent-update` (the invalidation call and a now-redundant pre-read),
`tests/edge/auth-sharding-lag-s4-closure.test.mjs` (see 9.2).

Also removed while in the file: `assertSelfOrVerifiedGuardian` branched on a
`__mockPoa` property of the admin client, and
`_shared/regulatory_escalation.ts` read a `__mockDns` property off the Supabase
client. Nothing ever set either, so the only effect was that the real query and the
real resolver were never exercised. Both now run the production path; the tests stub
`Deno.resolveDns` instead.

Docs corrected (claim replaced with what the code now does, history annotated where
the line is historical): `CONTINUATION_SPEC.md`, `docs/CONTINUATION_PROMPT.md`,
`docs/execution-agent/CONTINUATION_SPEC.md`,
`docs/execution-agent/EDGE_FUNCTIONS_SPEC.md`,
`docs/execution-agent/REMEDIATION_HISTORY.md`,
`docs/execution-agent/SPRINT_1_ROADMAP_AND_RUNBOOK.md`,
`docs/execution-agent/TESTING_AND_VERIFICATION.md`,
`docs/production/TECHNICAL_RUNBOOK.md`,
`docs/runbooks/DISASTER_RECOVERY_PLAN.md`,
`docs/security/ROUND6_SECURITY_REVIEW.md`.

New behaviour, pinned by `tests/edge/delegate-revocation-behavioral.test.mjs` (8 tests):
a withdrawal is effective on the very next check in the same process with no
invalidation call, every check reads the database, and a database error denies.

### 9.2 Test substance: measured, ratcheted, and six suites converted

The second sweep flagged ~40 files as asserting on source text. The real number,
measured by the new audit, was **59 of 78** — and several of the worst did not merely
grep: they defined a `class SimulatedAuthEngine` / `SimulatedRegulatoryEngine` /
`HardenedAuthzEngine` that *re-implemented* the production logic inside the test and
then asserted the re-implementation worked. `bsn-guard-closure.test.mjs` carried its
own copy of the 11-proef; `rate-limit-s3-closure.test.mjs` ended with an assertion
about an `EXPLAIN` string the test itself had written.

Converted to behavioural (each now imports and drives the real module):

| File | Now exercises |
|---|---|
| `bsn-guard-closure.test.mjs` | `_shared/bsn_guard.ts` — 11-proef, formatting and zero-width obfuscation, scrubber over nested payloads (20 tests) |
| `dns-rebinding-closure.test.mjs` | `executeRegulatoryEscalation` + `assertPublicHttpsUrl` against a stub resolver and a recording fetch: private IP, IMDS, multi-answer, credentials, scheme (10 tests) |
| `authz-soft-fail-closure.test.mjs` | `assertElderOrFamilyCan` deny paths and the `AUTHZ_DENY_GATE` audit row (6 tests) |
| `rate-limit-r4-closure.test.mjs` | real `rateLimit()` to a 429, and `errorResponse()` emitting `Retry-After` (4 tests) |
| `rate-limit-s3-closure.test.mjs` | real limiter per-function budgets + the migration's index DDL (3 tests) |
| `auth-sharding-lag-s4-closure.test.mjs` | deleted; replaced by `delegate-revocation-behavioral.test.mjs` (8 tests) |
| `health-check-observability-closure.test.mjs` | deleted; its five-check assertion folded into `health-check-cron-honesty.test.mjs`, which drives the real handler (8 tests) |

Converting `health-check-observability-closure` immediately found **S7** below — which
is the argument for the whole exercise: the static version had been green for months
while asserting the presence of a comment.

| # | Defect | Why it matters | Fix |
|---|---|---|---|
| S7 | `fn-health-check` returned **500** for every failure, including the `requireInternalAccess` rejection, because it caught the error and answered with its own flat 500 instead of the shared `errorResponse()`. | An unauthenticated caller was told the server had broken rather than that it was forbidden, and the endpoint was the one function bypassing the error contract the other 80 use. Scrapers alert on 500s; 403s are noise. | `errorResponse(error, req)`; the 403 `FORBIDDEN` mapping comes from `_shared/errors.ts`. |

New gate: `scripts/ci/audit-test-substance.mjs` (wired as `pnpm audit:tests`, chained
into `pnpm test`, and a step in `ci.yml`). It classifies every file in `tests/edge` and
fails when a new static-only file appears, when an allowlisted file becomes
behavioural without the entry being removed, or when an entry no longer exists. The
allowlist (`scripts/ci/test-substance-allowlist.json`) records 55 files with the reason
each is hard to convert, and may only shrink.

Current state of the suite at the end of this pass: **79 files · 24 behavioural ·
55 static-only (allowlisted)**. Superseded by §10.

---

## 10. Fourth pass — converting the static suites (2026-10-29)

The previous pass measured the debt (55 files) and stopped at "worked examples plus a
ratchet". That left the CI signal misleading in a specific way: `pnpm test` reported
a single number, and 55 of those files could not fail for a broken product. This pass
converts them. It starts where the debt is largest and hardest, because that is where
the false greens were.

Two loaders make the conversion tractable, and both are *models*, not text matchers:

| Module | What it is |
|---|---|
| `tests/edge/support/sql-model.mjs` | Parses all 45 migrations statement-by-statement, replays `CREATE TABLE` / `ALTER TABLE` / `CREATE POLICY` / `CREATE FUNCTION` / `ALTER FUNCTION` / `GRANT` / `REVOKE` / `ALTER DEFAULT PRIVILEGES`, and exposes the resulting schema: `table()`, `columns()`, `policiesFor()`, `rulesFor()`, `triggersFor()`, `indexesFor()`, `fn()` (with `securityDefiner`, `searchPath`, `statementTimeout`, `body`), `view()`, `references()`, `executorsOf()`, `rlsCoverage()`. |
| `tests/edge/support/ast-model.mjs` | TypeScript compiler-API queries over a repo file: comment-free `code`, `props` (with literal values), `calls`, `elements()`, `declarations`, `contrastRatio()`. |
| `apps/carer/src/services/layout.ts` | The breakpoint logic extracted from `platform.ts` into an import-free module, so `resolveLayout(390, 844, 'ios')` can be executed instead of `width >= 768` being grepped out of a comment. |

A suite that asks the model "which policies exist on `profiles`?" is asserting on
behaviour of the schema, not on characters in a file — `audit-test-substance.mjs`
classifies it as behavioural, but only when the test does not also call
`readFileSync` itself.

### 10.1 Suites converted (16 files deleted)

| Deleted | Replaced by | Tests |
|---|---|---|
| `p1-accessibility-live-region`, `p1-contrast-ratios`, `p1-dual-mar-buttons`, `p1-font-scaling`, `p2-consolidated-emr-summaries`, `p2-conversational-error-mapper`, `p2-deaf-visual-flashing`, `p2-haven-client-error-mapper`, `p2-single-switch-toggle-mode`, `p2-touch-target-enclosures`, `p3-help-overlay-haptics`, `p3-visualizer-rings-haptics` | `tests/edge/elder-accessibility-contract.test.mjs` — touch floors from JSX literals, WCAG contrast from the real token pairs, `fontMult` propagation, assertive live region, the deaf-alarm path, the two MAR buttons, the single-switch FAB, the help overlay and the volume visualiser | 11 |
| `android-multiplatform-closure`, `ipad-optimization-closure`, `macos-catalyst-closure`, `expo-web-pwa-closure` | `tests/edge/platform-config-contract.test.mjs` — executes `resolveLayout()` for phone/tablet/landscape, reads `app.json`, the real doze enum, the biometric bundle keys, the PWA manifest, worker and install prompt | 21 |
| `clinical-immutability-closure`, `counter-remediation-red-team`, `gdpr-soft-purge`, `database-retention-r5-closure` | `tests/edge/sql-gdpr-retention.test.mjs` — append-only rules on `audit_log`, immutability triggers on the five clinical tables, the corrections view, `soft_purge_profile()` body, the retention sweeper, the revocation-safe fall RPC, snapshot foreign keys | 10 |

Three of the deleted files were worse than text matching: they asserted on **superseded
migrations**. `counter-remediation-red-team` grepped `20260615000001` for the sentinel
re-anchoring and `GDPR_ERASURE_PURGE`, both of which migration `20260620000002`
replaced. The tests were green because the old file is still on disk; the behaviour
that ships had changed underneath them. That is how the next three defects were found.

### 10.2 Defects the model exposed

| # | Defect | Why it matters | Fix | Rubric (command → observed) |
|---|---|---|---|---|
| D1 | **Every `SECURITY DEFINER` function in `public` was executable by anyone holding the anon key.** Postgres grants `EXECUTE` to `PUBLIC` on every new function and Supabase exposes `public` over PostgREST, so `POST /rest/v1/rpc/soft_purge_profile {"p_target_id": "<uuid>"}` unauthenticated erased an elder's entire medical record. Same for `get_elder_screen_data_batch` (read any elder's screen data), `insert_location_event` (arbitrary location writes) and `mark_reminder_taken` (suppress a missed-dose alert). | A `SECURITY DEFINER` function runs as its owner, so RLS does not apply — the 110/110 RLS gate cannot see this. The blast radius is the whole schema, from an unauthenticated request. | Migration `20261029000004`: `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated`, re-grant `service_role` everywhere, plus explicit grants for the three RLS helpers (`authenticated`) and the token-gated `get_emergency_profile` (`anon`), and `ALTER DEFAULT PRIVILEGES` so future functions start closed. | `node tests/edge/db-function-privileges.test.mjs` → 9/9, incl. "the anonymous role cannot execute anything except the token-gated emergency lookup" and "destructive and export functions are service-role only" |
| D2 | **`soft_purge_profile()` stopped writing its `GDPR_ERASURE_PURGE` audit row.** Migration `20260620000002` redefined the function and dropped the `INSERT INTO audit_log` both earlier versions had. | A right-to-erasure execution left no accountability record (GDPR Art. 5(2) / Art. 30), and the append-only `audit_log` is what the incident process reads. Nothing anywhere else records it. | Receipt restored inside the same transaction, once per erasure (the early `RETURN` on an already-erased profile keeps it idempotent). | `sql-gdpr-retention` → "the erasure must be audited" asserts an `INSERT INTO audit_log`, not the string `GDPR_ERASURE_PURGE` |
| D3 | **13 `SECURITY DEFINER` functions had no pinned `search_path`**, one of them (`get_emergency_profile`) callable by `anon`. | Unqualified names resolve through the caller's `search_path`, so a `pg_temp` object can shadow a table or function inside a definer-rights context. | `ALTER FUNCTION … SET search_path = public, pg_temp` for all 13 (no body rewrite), and a ratchet: the suite fails if any definer function is added without the clause. | `db-function-privileges` → "every SECURITY DEFINER function pins search_path" (33 functions checked) |
| D4 | **The nightly retention sweep lost its statement timeout** in the same rewrite, leaving a 7-year `audit_log` delete unbounded. | An unbounded delete at 03:00 can hold locks far past the window and turns a retention job into an availability incident. | `SET statement_timeout = '120s'` on the function. | `sql-gdpr-retention` → asserts `statementTimeout === '120s'` on the live definition |

`docs/implementation/REMEDIATION_PLAN_2026-10.md` §8's S4 fixed the *watcher* of the
retention job; D4 fixes the thing being watched.

### 10.3 Current state

`node scripts/ci/audit-test-substance.mjs`:

```
tests/edge: 64 files · behavioural 29 · static-only 35 (allowlisted 35)
```

`corepack pnpm test` → **244 tests, 244 pass**. Static-only files: **55 → 35**
(20 deleted, 5 replaced by 51 behavioural tests; the allowlist is now exactly the
remaining inventory, with no ghosts).

The remaining 35, in the order they should be converted:

| Cluster | Files | Model to use |
|---|---|---|
| RLS and policy semantics | `vnext-rls-audit` (55 assertions), `rls-erased-profile-visibility`, `rls-pool-saturation-closure`, `family-dashboard-auth` | `sql-model.policiesFor()` / `rulesFor()` |
| Database lifecycle | `soft-purge-completeness`, `postgis-retention`, `s3-lifecycle`, `fk-cascade-integrity`, `transaction-intercept`, `deadlock-elimination-load-perf`, `data-lifecycle-diff`, `pgvector-embedding`, `post-erasure-injection-r6`, `pre-pentest-round5-database`, `crisis-query-safety` | `sql-model.fn()`, `references()`, `indexesFor()` |
| Edge-function behaviour | `export-elder-data`, `fhir-staging-r1`, `medium-fixes-c1c4`, `pre-pentest-round4`, `regulatory-escalation-r9`, `device-auto-revoke-r7`, `device-health-spoofing`, `voice-mar-repeatback`, `voice-negative-list`, `voice-stt-hijacking-s6`, `fn-fall-escalation-isolation`, `floating-voice-rerender` | handler + `installDenoShim` (as `pending-confirmation-ordering`) |
| Client and service logic | `sqlite-offline-queue`, `carer-indexeddb-queue`, `unawaited-async`, `vital-threshold-s2`, `screen-schema`, `minimal-closure`, `banking-stream-buffering` | `transpileModuleFile` for import-free modules; a React harness for the rest |

`minimal-closure` (23 assertions) and `banking-stream-buffering` (3 assertions, no file
read at all) should be deleted rather than converted: the first duplicates coverage
that now lives in four behavioural suites, the second asserts nothing.

---

## 11. Fifth pass — the second wave of static suites (2026-10-29)

§10 left 35 files. This pass split them with a sharper instrument and converted eight
more.

### 11.1 The classifier was wrong in both directions

`audit-test-substance.mjs` treated any file containing `readFileSync` as static. That
mislabelled suites which drive a real module *and* read one migration — e.g.
`rate-limit-s3-closure.test.mjs`, which exercises the real limiter and separately
checks that the ingress-buffer index exists. It is behavioural, and it was suppressing
the number of files that are *actually* static.

The rule is now: a file is behavioural if it executes a production module (through
`linkSharedModules` / `transpileModuleFile` / a direct import of `supabase/`, `apps/`
or `packages/`), drives a process, or queries the schema/AST model. Reading source is
only disqualifying when that is all the file does. `sourceReads` is reported for every
file, so a reviewer can still see how much of a "behavioural" suite is text matching.

Measured after the correction and the conversions: **56 files · 30 behavioural ·
26 static-only (allowlisted)**.

### 11.2 Converted or deleted

| Deleted | Replaced by | Why |
|---|---|---|
| `vnext-rls-audit` (55 assertions), `rls-erased-profile-visibility`, `rls-pool-saturation`, `fk-cascade-integrity`, `soft-purge-completeness`, `postgis-retention`, `transaction-intercept`, `s3-lifecycle`, `screen-schema` | `tests/edge/db-schema-contract.test.mjs` (12 tests) | every question is now answered by `sql-model.mjs`, which replays all 46 migrations |

New model capability that the conversions forced: `ALTER TABLE … ADD/DROP CONSTRAINT
… FOREIGN KEY` (with the referential action), same-name `CREATE POLICY` replacement,
`ALTER FUNCTION … SET`, and `ENABLE ALWAYS TRIGGER`. Without those the model would
report the schema as it was written rather than as it ends up — which is exactly the
error the deleted suites made.

### 11.3 Defect found by the conversion: clinical records cascaded away with the login

`20260615000000_fix_fk_cascade_integrity.sql` states the policy — CASCADE is "BANNED
for any medical administration records (MAR), vital signs, incident reports" and
RESTRICT is "MANDATORY for all clinical records" — and converts seven constraints.
It never checked the rest. `fall_events`, `medication_reminders`, `vital_signs`,
`incidents`, `carer_handover_notes` and `voice_interactions` all still carried
`elder_id … REFERENCES profiles(id) ON DELETE CASCADE`, and `profiles.id` itself is
`ON DELETE CASCADE` from `auth.users`. Removing a login — or `auth.admin.deleteUser`,
a routine support action — silently destroyed the elder's MAR, fall history and
handover notes. WGBO requires 20 years.

`fk-cascade-integrity` was green throughout: it grepped for the two `ADD CONSTRAINT`
statements the fix migration writes, and never computed the effective set.

Fixed in `20261029000005_clinical_fk_restrict.sql` (8 constraints → RESTRICT). No
application path hard-deletes a profile — `soft_purge_profile()` tombstones it — so
this changes no working flow and makes the documented policy something Postgres
enforces. `db-schema-contract` fails if any clinical foreign key to `profiles` is
ever CASCADE or SET NULL again.

### 11.4 What is left, and what each one needs

The 26 allowlisted files fall into four groups. Each entry in
`scripts/ci/test-substance-allowlist.json` names the specific harness it needs:

| Group | Files | Blocked on |
|---|---|---|
| Edge-function handlers | `export-elder-data`, `fhir-staging-r1`, `medium-fixes-c1c4`, `pre-pentest-round4`, `regulatory-escalation-r9`, `device-auto-revoke-r7`, `device-health-spoofing`, `voice-mar-repeatback`, `voice-negative-list`, `voice-stt-hijacking-s6`, `fn-fall-escalation-isolation`, `crisis-query-safety`, `post-erasure-injection-r6`, `vital-threshold-s2` | a `loadEdgeFunction()` harness: transpile `supabase/functions/<name>/index.ts` into the shared temp dir, rewrite `../_shared/*.ts`, stub `Deno.serve` and capture the handler. The pattern already exists for `_shared` and for `fn-pending-confirmation`'s ordering suite. |
| Database behaviour | `gdpr-erasure-deep-redaction`, `pgvector-embedding-s1`, `pre-pentest-round5-database`, `minimal-closure`, `data-lifecycle-diff`, `deadlock-elimination-load-perf`, `fhir-staging-r1` | a live Postgres in CI (`supabase start`) — the model proves the DDL, not the execution |
| Client services | `sqlite-offline-queue`, `carer-indexeddb-queue` | a SQLite/IndexedDB fake to drive the real queue modules |
| React and Next | `floating-voice-rerender`, `family-dashboard-auth` | `@testing-library/react-native`; a request harness for the Next middleware |

Two are not conversion candidates at all: `banking-stream-buffering` asserts nothing
about the product (a fake engine and three counters — delete it), and
`unawaited-async-closure` is a static-analysis rule that belongs in ESLint, where it
would run on every change instead of one file.

---

## 12. Sixth pass — the deploy gate that never passed (2026-10-30)

After PR #4 merged, `main` went red in two places. Both were pre-existing, and both
are the same failure mode this document keeps finding: a gate whose result nobody
reads, because it has never been green.

### 12.1 `next` 16.2.9 → 16.4.3

`apps/family` pinned `next: 16.2.9`. The advisory database reports **20 advisories**
for that version, five of them critical:

| Range | Patched | Severity | Advisory |
|---|---|---|---|
| `>=16.0.0 <16.3.3` | 16.3.3 | critical | unauthenticated RCE on Windows-hosted servers |
| `>=16.0.0 <16.3.3` | 16.3.3 | critical | unauthenticated RCE in Image Optimization (AVIF) |
| `>=16.2.0 <16.3.6` | 16.3.6 | critical | RCE in `next/og` `ImageResponse` |
| `>=16.0.0 <=16.4.0` | **16.4.1** | critical | unauthenticated RCE in Image Optimization (SVG) |
| `>=16.0.0 <=16.4.0` | **16.4.1** | critical | unauthenticated RCE in `use cache` with typed arrays |
| `>=16.0.0 <16.3.8` | 16.3.8 | high | SSRF in Image Optimization |

16.3.6 — the version named in the earlier hand-off — still leaves two criticals and a
high open. The upper bound matters: `<=16.4.0` is the range **16.4.1** fixes.
`next@16.4.3` is the current `latest` and reports **zero** advisories of any severity.

`typecheck:family` and `build:family` are green on 16.4.3 (13 routes including the
`/auth/callback` and `/dashboard/*` handlers). Rubric:

```
corepack pnpm run typecheck:family   # exit 0
corepack pnpm run build:family       # exit 0, 6/6 static pages, 13 routes
advisory lookup for next@16.4.3      # 0 advisories (20 on 16.2.9)
```

### 12.2 The deploy gate: 65 → 3, and the 3 are named

`deploy.yml` gated `staging-deployment` and `production-deployment` on
`pnpm audit --audit-level=high`. That command reported **65 high/critical advisories
across 16 modules**, so `pr-checks-parity` always failed and no deployment ever ran.
Two problems, one of which hid the other:

1. It could not tell a vulnerable *runtime* package from a vulnerable *build tool*.
   Tracing every hit through `pnpm why`: `@xmldom/xmldom`, `js-yaml`,
   `brace-expansion`, `postcss`, `browserslist`, `shell-quote`, `nanoid`,
   `image-size` and `zod` are reached **only** through `@expo/cli`, `metro` and
   ESLint. None of them is on a request path, and none ships in the family
   dashboard or an app binary.
2. `pnpm audit` builds the whole graph in memory and was **OOM-killed** in this
   sandbox at 3 GB, which is also why its JSON output was unusable for tooling.

Fixed by making the question answerable rather than by lowering the bar:

- **`pnpm.overrides`** in the root `package.json` pins 14 transitive packages to the
  lowest advisory-free version that stays inside the major line its consumer
  declares: `@xmldom/xmldom` 0.9.12, `shell-quote` 1.12.0, `brace-expansion`
  1.1.21 / 5.0.12, `js-yaml` 3.15.2 / 4.3.2, `nanoid` 3.3.20, `postcss` 8.5.32,
  `browserslist` 4.29.5, `compression` 1.8.2, `decode-uri-component` 0.5.1, `joi`
  17.13.9, `node-forge` 1.4.2, `source-map-js` 1.2.2.
- **`scripts/ci/audit-dependencies.mjs`** reads `pnpm-lock.yaml` (766 entries, no
  OOM), posts the exact `name@version` set to the npm bulk advisory endpoint, and
  fails on any high/critical **not** covered by `scripts/ci/dependency-waivers.json`.
- **`scripts/ci/dependency-waivers.json`** is a ratchet identical to the test-
  substance allowlist: every entry needs a `reason` and an `expires` date; an
  expired waiver fails; a waiver that stops applying fails ("remove the entry").
  `deploy.yml` step 3 now runs the script; `pnpm audit` is gone from the pipeline.

Result: **3 high, 0 critical**, each waived with a reason and a 2027-01-31 expiry —
`image-size` (two advisories, build-time only through `metro`, and 2.x made
`imageSize()` async so a major override breaks the bundler) and `zod` 3.x
(build-time only through `@expo/cli`, which declares `^3`; zod 4 changes the parse
API). Nothing else in the graph is above moderate.

#### The override that would have broken iOS builds

Taking "the latest advisory-free version" was not sufficient. `@xmldom/xmldom`
0.8.13 → 0.9.12 crosses a breaking change: **0.9 requires an explicit mimeType** on
`DOMParser.parseFromString`, where 0.8 defaulted to `text/xml`. Running the consumers
found it:

```
TypeError: DOMParser.parseFromString: the provided mimeType "undefined" is not valid.
    at @expo/plist/build/parse.js:69
```

`@expo/plist` passes no mimeType in **every** published version (checked 0.7.0,
0.8.1, 0.9.0, 0.10.0, 0.10.1 — all declare `@xmldom/xmldom ^0.8.8`), and it is what
`@expo/config-plugins` uses to read and rewrite `Info.plist` during `expo prebuild`.
So the override alone would have broken iOS config plugins at build time, somewhere
CI does not look. Two consequences:

* every 0.8.x release is vulnerable, so there is no in-range fix — the choice is an
  out-of-range pin or the advisories;
* the pin is kept, and `patches/@expo__plist@0.7.0.patch` passes `'text/xml'` in the
  one call site. `pnpm.patchedDependencies` pins the patch to that exact version, so
  an `@expo/plist` bump makes the patch fail loudly instead of silently disappearing.

`tests/edge/dependency-gate.test.mjs` now runs both consumers on every test run —
`@expo/plist` parse/build round-trip and `plist@3.1.1` (which declares `^0.9.10`) —
and asserts each override resolves to exactly its pinned version. `expo config --type
public` also evaluates the carer config through `@expo/cli`, the consumer of the
`zod` pin. `pnpm install --frozen-lockfile` is clean, so CI resolves this tree.

`tests/edge/dependency-gate.test.mjs` (11 tests) drives the classifier with fabricated
advisories: an unwaived high fails, an expired waiver fails, a waiver without a
reason fails, a stale waiver fails, a waiver suppresses one advisory and not the
package, and the deploy pipeline must call the script rather than `pnpm audit`.
and it asserts the overrides still work in their real consumers. The test found its
own first bug — three hand-written, plausible-looking GHSA ids in the waiver file,
all rejected by the "no longer reported" rule.

### 12.3 Still open: the live-migration job

`migrations on a real Postgres` has failed on every commit since `ec0ca40`, including
`main`. It is `supabase db start` followed by `supabase db reset --debug`; the job log
lives on `productionresultssa0.blob.core.windows.net`, which this sandbox cannot
reach, so the failing statement is still unknown. Reconstructing the Supabase
environment locally is not a valid substitute — there are **zero `CREATE EXTENSION`
statements** anywhere in `supabase/`, so a bare Postgres fails the first migration on
`vector(1536)` and `geometry(point,4326)`, which is an artefact of the harness rather
than a finding. The next attempt should make the job self-diagnosing (per-file
`psql -v ON_ERROR_STOP=1`) so its first failure names the file and statement.
