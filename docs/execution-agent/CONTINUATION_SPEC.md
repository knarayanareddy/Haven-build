# Authoritative Execution Agent Master Continuation Specification

## 1. System Identity & Engagement Goal
You are assuming engineering execution control over **HAVEN** (`Haven-build`), a life-safety critical older adult monitoring, clinical observation, and financial anomaly detection monorepo. 

Your overarching objective is to maintain `100% Execution Fidelity` without ever summarizing, truncating, or abstracting concrete technical specifications. You must seamlessly resume production development, adhere to canonical Dutch healthcare security mandates (**NEN 7510 / NEN 7512**), execute automated regulatory compliance processes (GDPR Art. 17 / Art. 25, *Wet Wkkgz*), and preserve our `100% Green Flawless Test Execution` standard.

## 2. Monorepo Architectural Single Source of Truth
The canonical working tree is located at `/home/user/Haven-build/`. It contains exactly:
- **11 Workspace Packages:** Managed via `pnpm-workspace.yaml` and fully locked via `pnpm-lock.yaml`.
- **81 Distributed Cloud Edge Functions:** Located inside `supabase/functions/` running on Deno serverless isolates.
- **104 PostgreSQL Relational Database Tables:** Managed strictly via 26 chronological Supabase SQL migrations in `supabase/migrations/`.
- **22 Operable Verification Suites:** Executable Node.js / Deno Tap-compliant testing harnesses in `tests/edge/` and Playwright mobile end-to-end runners.

## 3. Mandatory Operating Guardrails for Execution Agents
When performing any investigation, coding, or DDL schema modification, execute strictly under the following guardrails:
1. **Never Hard-Delete Clinical Ledgers:** To satisfy NEN 7510 and regulatory Dutch IGJ non-repudiation mandates, never execute raw `DELETE` operations across clinical time-series entities (`fall_events`, `medication_reminders`, `device_health_events`, `carer_handover_notes`). Use declarative immutability (`ON DELETE RESTRICT`) or our documented GDPR soft-purging stored procedures (`soft_purge_profile()`).
2. **Always Enforce Universal BSN Ingestion Guards:** Ingested cleartext unstructured prose or conversational audio must be passed through `_shared/bsn_guard.ts` to execute Modulo-11 Dutch structural checks (*11-proef*), returning `422 Prohibited BSN` at the ingress boundary.
3. **Always Return Uniform Structured JSON Errors:** Encapsulate all Edge Function business logic inside `asyncWrapper` (`_shared/async_wrapper.ts`) to intercept raw throws, return structured JSON `{ ok: false, error_code: "..." }` ledgers, automatically append `Retry-After: 60` HTTP headers on `429` breaches, and await SIEM exception telemetry (`captureException`) inside an active `1500ms` `Promise.race` enclosure.
4. **Enforce Highly Optimized RBAC & Access Matrix helpers:** Evaluate relational permissions by calling authoritative primitives in `_shared/authz.ts` (`assertSelf`, `assertActorMatches`, `assertElderOrFamilyCan`, `assertCarerCan`, `assertCarerPermission`). Do **not** add a process-local cache in front of them: a module-scoped Map lives in a single isolate and cannot be invalidated across the fleet (a 10s `delegateCache` was removed on 2026-10-29 for exactly that reason). Each helper reads the authoritative row.
5. **Absolute Deliverable Completeness:** Any code written must be 100% complete, fully implemented, and ready for copy-paste production deployment. Omit all placeholders, handwaving, polite commentary, or partial helper methods.

## 4. Execution Roadmap Directory Guide
To load specific domain expertise into your active context window, consult the specialized execution agent references in `docs/execution-agent/`:
- **Database Schema & Migrations:** `docs/execution-agent/DATABASE_MIGRATIONS_LEDGER.md`
- **Cloud Edge Functions & Primitives:** `docs/execution-agent/EDGE_FUNCTIONS_SPEC.md`
- **Security & Architectural Remediation History:** `docs/execution-agent/REMEDIATION_HISTORY.md`
- **Test Runners & Sandboxed Verification:** `docs/execution-agent/TESTING_AND_VERIFICATION.md`
- **Immediate Sprint 1 Implementation Runbook:** `docs/execution-agent/SPRINT_1_ROADMAP_AND_RUNBOOK.md`
