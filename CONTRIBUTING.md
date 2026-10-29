# Contributing to HAVEN

HAVEN is an elder-care, safety and health-adjacent product. Contributions must preserve dignity, privacy and accessibility.

## Required before a pull request

Run the same gates CI runs (`corepack pnpm install --frozen-lockfile` first):

```bash
corepack pnpm run typecheck        # packages + elder, grandchild, family, carer apps
corepack pnpm run lint             # eslint, zero warnings
corepack pnpm run test:edge        # every tests/edge/*.test.mjs file
corepack pnpm run audit:rls        # RLS enabled + forced on every table
corepack pnpm run build:family     # the Next dashboard must build
corepack pnpm run verify:edge      # deno check on every Edge Function (needs Deno)
corepack pnpm run verify:sql       # every migration parses; RLS audit (needs pglast)
```

`corepack pnpm test` runs the first four plus the suite-structure validation.

Nothing may be skipped silently: if a tool is missing, its script exits non-zero and
says how to install it. A pull request is not reviewable until these pass.

## Engineering rules

1. No feature may bypass RLS/consent.
2. No BSN collection, storage, processing or transmission.
3. No deceptive AI copy.
4. No elder-facing action without a clear accessible label.
5. No location feature may expose live route history to family.
6. No family access to companion memory.
7. No BUURT third-party identity exposure before double opt-in.
8. Edge Functions that write data must validate input and enforce authorization.
9. External webhooks must verify signatures when a shared secret is configured.
10. Sensitive logs must be scrubbed.

## Copy rules

Elder-facing Dutch must use formal `u/uw`.

Avoid panic language. Scam and crisis flows must be calm, factual and non-shaming.

Required AI disclosure on first use:

- EN: `Hello, I am HAVEN — your digital helper.`
- NL: `Hallo, ik ben HAVEN — uw digitale hulp.`

Banned deceptive copy:

- `I am a real employee`
- `I am not a computer`
- `You are speaking to a person`

## Database changes

- Add new migrations; do not edit applied migrations.
- Enable and force RLS for new user-data tables.
- Add indexes for common elder-scoped queries.
- Add tests or audit coverage for sensitive policy changes.
- Update `docs/implementation/FEATURE_IMPLEMENTATION_MATRIX.json` when adding a feature.

## Edge Function changes

Use the shared helpers where applicable:

- `_shared/validation.ts` — input validation
- `_shared/authz.ts` — authorization; throws `AuthzError` (403)
- `_shared/idempotency.ts` — `withIdempotency()` for anything that mutates state
- `_shared/webhook.ts` — `verifyHmacSha256()` for vendor webhooks
- `_shared/errors.ts` — throw errors with a `status`/`code`; never format responses ad hoc
- `_shared/sentry.ts` — error reporting (envelope endpoint, PII scrubbed)
- `_shared/settle.ts` — `settleQuery()` for queries that may fail
- `_shared/ratelimit.ts` — `rateLimit(req, "fn-name")`; see `scripts/ci/function-coverage-allowlist.json` if it must not be throttled
- `_shared/core.ts` — client factories, `json()`, `errorResponse()`

A Postgrest builder is `PromiseLike` only: it has `then()` and **no** `catch()`.
Write `await settleQuery(builder, 'table.operation')` instead of `builder.catch(...)` —
the latter throws `TypeError: ….catch is not a function` at runtime.

Every Edge Function must typecheck: `corepack pnpm run verify:edge` runs `deno check`
across all of them. `tsc` does not cover `supabase/functions`.

## Review focus

Reviewers should check:

- consent boundary
- RLS implication
- accessibility
- copy tone
- retention impact
- logging and PII exposure
- failure behavior
