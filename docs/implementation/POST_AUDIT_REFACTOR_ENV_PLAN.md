# Post-Audit Refactor and Env Hygiene Plan

Date: 2026-06-20

This report captures the items that are better handled as staged engineering work rather than one broad rewrite. Values are intentionally redacted; use `pnpm audit:env` for the machine-readable local view.

## Fixed in this pass

- Removed tracked `apps/elder/.env.production` from Git. The local file may still exist and remains ignored.
- Removed hardcoded staging Supabase anon JWTs from `apps/elder/eas.json`, `apps/carer/eas.json`, and `apps/grandchild/eas.json`.
- Added `scripts/ci/audit-env-hygiene.mjs`, which reports env key names and JWT roles without printing values.
- Added a static guard in `tests/edge/hardening-static.test.mjs` to prevent JWT-shaped Supabase keys from being committed in tracked env/EAS files.
- Added `tests/edge/elder-resilience-coverage.test.mjs` for elder retry/offline/notification/retry/i18n/UI-token behavior.

## Env hygiene audit

Tracked env/EAS files should contain templates, local placeholders, or non-secret public flags only.

Current expected state after this pass:

- Tracked mobile EAS configs keep `EXPO_PUBLIC_HAVEN_ENV` in preview/production profiles.
- Staging/production `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` must be configured in EAS remote environment variables, not committed in `eas.json`.
- `SUPABASE_SERVICE_ROLE_KEY`, `STAGING_SERVICE_ROLE_KEY`, vendor secrets, and webhook secrets remain local/Supabase/GitHub-secret only.
- Local ignored files may contain real values, but `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` must never contain `service_role` JWTs.

Manual follow-up:

- Rotate any Supabase service-role key that was ever committed historically.
- Consider rotating the exposed staging anon key for clean provenance, even though it is an anon key.
- Confirm EAS remote env for each app/profile before the next cloud build:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Duplicate-code analysis

The broad duplication hotspots are real, but should be split into small PRs:

| Priority | Duplication | Current files | Recommended extraction |
| --- | --- | --- | --- |
| P1 | JWT/session user parsing | `apps/carer/src/screens/VisitList.tsx`, `apps/elder/src/hooks/useHavenActions.ts`, `apps/elder/src/screens/ElderScreen.tsx` | `packages/database/src/session.ts` or `packages/contracts/src/auth.ts` |
| P1 | Mobile API invocation core | elder/carer/grandchild client helpers | `packages/database/src/havenClient.ts` with app-specific thin wrappers |
| P1 | Expo public env assertion | `apps/elder/app.config.js`, `apps/carer/app.config.js`, `apps/grandchild/app.config.js` | `packages/config/expoPublicEnv.js` |
| P2 | AuthProvider session lifecycle | elder and carer auth providers | shared hook for session restore/persist/signout, app-specific UI remains local |
| P2 | Offline queue concepts | elder SQLite queue and carer IndexedDB queue | shared types and state-machine tests, not shared storage backend |
| P2 | Family dashboard formatting helpers | repeated small formatters | local dashboard utility module |

Suggested Devin prompt:

> Produce a focused refactor PR for one duplication row only. Preserve behavior and tests. Do not migrate Edge Functions or touch env files in the same PR.

## asyncWrapper and rate-limit migration plan

Static census from this pass:

- Edge Functions total: 81
- Use `asyncWrapper`: 7
- Contain explicit `rateLimit(`: 29

Do not migrate all functions at once. The safer order is:

1. Internal/admin functions with simple request bodies and no special response contract.
2. Authenticated CRUD-style functions already using `corsHeaders`, `recordMetric`, and `safeErrorMessage`.
3. Vendor webhook functions, preserving their required status-code semantics.
4. Functions that intentionally return `200` on validation failures to external providers.
5. High-risk functions with idempotency or custom streaming behavior.

Acceptance criteria for each batch:

- Function has one top-level `Deno.serve(asyncWrapper("fn-name", ...))`.
- Function either calls `rateLimit` or documents why it is exempt.
- Existing status-code behavior is preserved.
- `OPTIONS` handling is not duplicated inside the wrapped body unless required by external provider behavior.
- Static tests include the function in an allowlist or assert the wrapper/rate-limit contract.

Suggested Devin prompt:

> Pick five low-risk authenticated Edge Functions missing `asyncWrapper`, migrate only those five, preserve existing API responses, and add/adjust static tests. Do not change vendor webhook functions in this PR.

## Test coverage gap plan

Implemented now:

- `tests/edge/elder-resilience-coverage.test.mjs`
  - `networkResilience.ts`
  - elder `offlineQueue.ts`
  - elder `notifications.ts`
  - shared `_shared/retry.ts`
  - i18n copy fallback smoke
  - UI touch/contrast token smoke

Next focused modules:

1. `apps/elder/src/state/voiceRecordingMachine.ts`
2. `apps/family/src/services/realtime.ts`
3. `packages/ui/src/components.ts`
4. Carer and grandchild state-machine lifecycle tests

Suggested Devin prompt:

> Add tests for `apps/elder/src/state/voiceRecordingMachine.ts` only. Use direct module imports where possible. Do not refactor production code unless a test exposes a specific bug.
