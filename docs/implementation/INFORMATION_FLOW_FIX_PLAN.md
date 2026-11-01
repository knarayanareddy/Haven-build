# Information-flow repair checklist

Scope: the safety, medication, messaging, task and video-call defects in `INFORMATION_FLOW_DIAGNOSTIC_2026-10-31.md`. Work is incomplete until each applicable box is checked and its rubric is met. A passing mock alone is not evidence of a working live system.

## 1. Fall escalation and emergency actions
- [ ] Use schema-valid durable escalation state and an atomic, time-bounded claim; reclaim abandoned claims without simultaneous active workers. Surface database and dispatch failures, preserve retryability, and never record a family alert solely because dispatch was attempted.
- [ ] Treat a request for help as urgent, provide an immediate way to contact emergency services, and make notification/queue status truthful. Never claim emergency services or family have been alerted without evidence.
- [ ] **Done:** PostgreSQL-backed tests exercise valid statuses, simultaneous claims, stale-claim recovery, false/true answers, delivery failures and retries. Device-level emergency calling and push delivery require explicit verification; no test calls real emergency services.

## 2. Medication
- [ ] Targeted taps and offline retries must work in both supported languages and use the exact selected reminder. Refuse missing, stale, foreign or completed targets instead of silently substituting another dose.
- [ ] Display repeat-back/pending state until a confirmation is actually recorded; surface failures instead of a success claim.
- [ ] **Done:** behavioural app → handler tests cover Dutch and English, offline routing, target ownership/status, pending and confirmation failure, including replay and wrong-dose prevention.

## 3. Family messages and tasks
- [ ] Use the schema's message-type vocabulary, preserve real unread status and implement authorised read receipts without permitting message-content edits.
- [ ] Persist task completion or report failure; make refresh/offline behaviour truthful.
- [ ] **Done:** behavioural tests cover message send through database constraints, unread/read transitions and ownership; task mutation and errors are exercised.

## 4. Video calls
- [ ] Correct decline contract and report server failures honestly. Connect incoming sessions to the elder UI with lifecycle, reconnection and background behaviour accounted for; never represent tokens as established media.
- [ ] **Done:** tests cover creation → incoming screen → decline/end and answer, failed requests, stale sessions and auth boundaries; a configured provider and devices independently verify ringing and media.

## 5. Release verification
- [ ] Run the information-flow diagnostic, full `corepack pnpm test`, migrations on PostgreSQL, Edge checks and browser verification. Record all failures and environment limitations.
- [ ] **Done:** all relevant tests pass with zero static-only additions; safety release is gated on live Supabase, physical-device and clinical/product review. Never infer production delivery from a mock or notification-row insertion.

## Implementation progress (working branch)

- [x] The fall enum mismatch and silent claim error are addressed by `supabase/migrations/20261101010000_fall_escalation_enum.sql`, `supabase/migrations/20261101020000_fall_escalation_claims.sql` and `supabase/functions/fn-fall-escalation/index.ts`. The worker conditionally leases a row, reports failures and returns it to a retryable state when no push submission succeeds. Tests exercise PostgreSQL enum values and lease recovery, plus a handler failure. **Not a production safety sign-off:** no deployed scheduler for this worker was identified in this review; delivery is not equivalent to provider acceptance; multiple-recipient partial failures and stale-worker duplicate delivery require an idempotent outbox/fencing design. The emergency-location JSON upload remains incompatible with the audio-only `tts-cache` bucket (`supabase/migrations/20260611000002_storage_rpc_security.sql`). Full concurrent, live Supabase and clinical verification are still required.
- [x] Emergency UI offers an explicit 112 dialler action; no call is placed without user confirmation. Crisis and fall-help text no longer claim delivery. A negative fall response attempts family notifications (`apps/elder/src/hooks/useHavenActions.ts`, `supabase/functions/fn-pending-confirmation-respond/index.ts`). This is **not** confirmation of receipt or a call to emergency services; offline requests and partial-notification retries still need a durable, independently monitored escalation design.
- [x] Targeted medicine taps and their offline route use an explicit action, reject invalid targets and show repeat-back text (`apps/elder/src/hooks/useHavenActions.ts`, `apps/elder/src/services/offlineDispatch.ts`, `supabase/functions/fn-voice-pipeline/index.ts`). The queued confirmation's message now says it has not yet been recorded. `tests/integration/information-flow-diagnostic.test.mjs` covers Dutch/English, target mismatch and offline dispatch. Queue delivery, expired prompts, and clinical/device verification remain release gates.
- [x] Grandchild text uses the database vocabulary (`apps/grandchild/App.tsx`). Unread state flows from `fn-screen-data` to the mapper; visible non-media messages get a caller-scoped read receipt (`supabase/migrations/20261101030000_message_read_receipts.sql`, `apps/elder/src/screens/ElderScreen.tsx`). The isolated PostgreSQL test covers own, foreign and self-sent rows. The UI cannot yet open media messages, so it does not mark them read; live RLS and device tests remain needed.
- [x] A task completion sends a scoped PostgREST update and refreshes the screen; failures are surfaced (`apps/elder/src/services/havenClient.ts`, `apps/elder/src/hooks/useHavenActions.ts`, `apps/elder/src/screens/ElderScreen.tsx`). Offline task completion is not implemented; it reports failure rather than claiming a saved task.
- [x] Call decline now sends `video_call_session_id` and checks the HTTP response. Recent incoming sessions reach the open elder screen through a 10-second data poll (`supabase/functions/fn-screen-data/index.ts`, `apps/elder/src/services/screenDataMapper.ts`, `apps/elder/src/screens/ElderScreen.tsx`). **Incomplete:** there is no media client or reliable background ringing. Answer is explicitly unavailable rather than falsely reporting a connected call. The family dashboard no longer claims an automatic phone fallback (`apps/family/src/components/CallButton.tsx`). Build real media on both sides before release. A real video-call implementation remains a blocker.
- [ ] Release gate remains open. The focused diagnostic has 16 passing tests and runs as part of the default suite, alongside 550 passing Edge tests; SQL syntax, the family build and touched Edge typechecks pass locally. The existing browser verification still fails on missing `apps/elder/src/state/consentPacks.ts`. Full Supabase migrations/RLS, real provider delivery, physical devices, and clinical/product review were not available here.
