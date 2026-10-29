# Cloud Edge Functions & Shared Engineering Primitives Specification

The HAVEN distributed compute layer comprises exactly 81 Cloud Edge Functions running inside `supabase/functions/` on Deno serverless isolates. All functions must incorporate the authoritative structural primitives defined in `_shared/`.

## 1. Universal Edge Execution Enclosure (`asyncWrapper`)
Because serverless Deno instances instantly terminate upon encountering unhandled promise rejections or socket TCP timeouts, all Edge Functions must wrap their core handlers inside `asyncWrapper` (`_shared/async_wrapper.ts`).
- **Standard JSON Returns:** Forces all operational responses into uniform `{ ok: true, data: ... }` or `{ ok: false, error_code: ... }` structures.
- **Automated Rate Limit Handling:** When a `429 Too Many Requests` status is intercepted, it automatically appends an explicit `Retry-After: 60` HTTP header.
- **Resilient Exception Logging:** Asynchronously awaits SIEM metric flushing (`captureException`, `recordMetric`) enclosed within an active `1500ms` `Promise.race` execution enclosure to ensure observability drains cannot hang or crash the isolate.

## 2. Core RBAC & Access Matrix helpers (`_shared/authz.ts`)
To prevent horizontal authorization sharding lag and ensure strict multi-tenant PII isolation, evaluate operational access purely via our authoritative primitives:
- `getJwtUserId(req: Request)`: Resolves authenticated `userId` from `Authorization: Bearer <token>` headers.
- `getProfileRole(db: SupabaseClient, userId: string)`: Resolves exact actor identity role (`elder`, `family`, `carer`, `admin`) from `profiles`.
- `assertSelf(userId: string, claimedId: string)`: Enforces absolute self-only data isolation boundaries.
- `assertActorMatches(userId: string, claimedId?: string)`: Verifies claimed execution identity matches authenticated token ownership.
- `assertElderOrFamilyCan(db: SupabaseClient, userId: string, elderId: string, requiredPermission: string)`: Authoritative relational RBAC guard. Evaluates active delegate links, explicit stakeholder relationship consent (`has_consent = true`), exact operational permissions (`can_view_medical`, `notify_on_crisis`). Reads the authoritative row on every call; the 10s in-process `delegateCache` was removed on 2026-10-29 because a per-isolate Map cannot be invalidated across isolates.
- `assertCarerCan(db: SupabaseClient, userId: string, elderId: string)`: Authoritative visiting nurse guard verifying active relationship links in `carer_relationships` and querying `profiles.status` to immediately block re-injections for erased adults.
- `assertCarerPermission(db: SupabaseClient, userId: string, requiredPermission: string)`: Validates that an accredited visiting nurse holds explicit institutional shift execution grants (`create_visit_logs`, `create_handover_notes`).

## 3. Structural BSN Ingestion Guards (`_shared/bsn_guard.ts`)
Under the Modulo-11 Dutch computational mandate (*11-proef*), user text or speech transcriptions must be validated before reaching active ledgers.
- `assertNoBsnInPayload(payload: string)`: Deterministically strips all formatting, whitespace, and zero-width chars (`\u200B-\u200D\uFEFF`) before sliding a 9-digit evaluation window across the input to execute the exact Modulo-11 check (`(9×d1 + 8×d2 + ... - 1×d9) % 11 === 0`), returning `422 Prohibited BSN` at the ingress gateway.
- `scrubBsnFromLogs(text: string)`: Masker matching obfuscated BSN variants to deterministically scrub Sentry and Datadog SIEM log drains.

## 4. Universal Rate Control Layer (`_shared/ratelimit.ts`)
Public ingress and sensitive operational functions (`fn-health-log`, `fn-wearable-event`, `fn-fall-event`, `fn-location-ingest`, `fn-family-message-send`, `fn-document-analyse`, `fn-wellness-checkin`, `fn-banking-ingress-buffer`, `fn-whatsapp-webhook`, `fn-photo-checkin`, `fn-onboarding`, `fn-right-to-erasure`, `fn-screen-data`) MUST execute `ratelimit_check` prior to database execution. Returns exact HTTP `429 Too Many Requests` and `Retry-After: 60` headers upon hitting burst thresholds.

## 5. Summary of Priority Operational Functions
- `fn-banking-ingress-buffer/index.ts`: Real-time public Open Banking webhook receiver publishing instantly into Upstash Redis Streams (`haven_psd2_ingress_stream`), with automated fallback to our `UNLOGGED` scratch Postgres table `psd2_webhook_ingress_buffer` with exactly `0%` WAL disk overhead.
- `fn-banking-stream-consumer/index.ts`: High-write bulk batch consumer Edge worker draining 500-record batches from Redis Streams or `psd2_webhook_ingress_buffer` and batch bulk inserting multi-row vectors into `webhook_receipts`.
- `fn-carer-handover-note/index.ts`: Upgraded with authoritative early identity status checks querying `profiles.status` (returning `403 Forbidden` if user is erased or suspended) to completely block visiting nurse offline IndexedDB queue re-injections, while calling `assertNoBsnInPayload`.
- `fn-device-health-monitor/index.ts`: Authoritative active signed device telemetry POST handler with replay protection (`nonce`), `+/- 5 minute` timestamp execution bounds, sequential `consecutive_auth_failures` incrementers, and automated session soft-revocation (`revoked_at := now()`) on reaching 5 failures.
- `fn-fall-escalation/index.ts`: Completely revocation-agnostic life-safety emergency fall escalator. Bundles recipients into highly secure `Promise.allSettled` multi-modal haptic arrays, deactivates exactly only failing target watch tokens on `410 Unregistered` errors, executes idempotent status progression, and enforces basic S3 object creation spike alerting.
- `fn-incident-report/index.ts`: Visiting nurse care shift incident capture wired to call `executeRegulatoryEscalation` (`_shared/regulatory_escalation.ts`) right after database insertion, compiling and transmitting cryptographically signed JSON webhooks (`X-Haven-Regulatory-Signature`) to management SIEM and canonical Dutch IGJ tracking endpoints.
- `fn-medmij-fhir-import/index.ts`: Partner FHIR bundle receiver writing exclusively to `fhir_medication_staging` (`status := 'pending_review'`), executing `check_medication_interactions_sql()` contraindication rules BEFORE activation via `promote_fhir_medication_staging()`.
- `fn-voice-pipeline/index.ts`: Universal STEM conversational Assistant. Features Modulo-11 BSN guards, requires 2-step multi-modal Repeat Back Administration action prompts (`AWAIT_REPEAT_BACK`), and executes an inline Dutch negative keyword STT hijacking check (`BANNED_STT_PHRASES`) BEFORE intent classification.
