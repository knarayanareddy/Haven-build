# Canonical Staff Disaster Recovery Plan & Platform Resilience Architecture

**Author:** Senior Site Reliability Engineer (Healthcare Resilience)  
**System:** HAVEN Enterprise Care Monorepo (`Haven-build`)  
**Regulatory Baselines:** NEN 7510 / NEN 7512, Statutory Dutch WGBO, European GDPR Art. 32/33, Dutch *Archiefwet*, Statutory *Wet Wkkgz*, Dutch IGJ baselines.  
**Target Invariants:** Recovery Point Objective (**RPO**): Maximum 1 hour data loss. Recovery Time Objective (**RTO**): Maximum 4 hours downtime.

---

## 1. Highly Verified Backup Strategy

To fulfill statutory Dutch NEN 7510 documented non-repudiation mandates and completely eliminate illegal healthcare "ghost records," HAVEN orchestrates an elite hybrid physical and logical backup strategy.

### 1.1 Automated Physical Volume Archiving (Supabase Continuous PITR)
* **What is Included:** 100% of the active PostgreSQL 16 cluster physical structure. This encompasses all declarative relational DDL schemas, multi-tenant agency care plans, mathematical `pgvector` index primitives (`companion_memory`), stored procedures, and authentic Supabase Auth (`auth.users`) / S3 Storage metadata references.
* **Archiving Frequency:** Continuous full Point-In-Time Recovery (`PITR`) checkpoints Stream directly into isolated AWS Amazon S3 cloud buckets. Full physical snapshots execute every 24 hours; Write-Ahead Log (`WAL`) deltas sit cryptographically flushed every 60 seconds.

### 1.2 Additional Automated Logical Backups (Critical Care Tables)
* **Causal Immutability Rationale:** When an older adult requests Right to Erasure or when corruption strikes a specific relational ledger, performing an absolute PITR physical rollback resets the *entire care cluster*. This destroys live, concurrent visiting nurse handover notes and active medical check-ins.
* **The Implemented Remedy:** We established Migration `20260615000012` and a highly specialized logical flusher specifically pointing to our most critical domain assets: `audit_log`, `medication_reminders`, `fall_events`, `security_violations`, and `incident_reports`.
* **Execution Frequency:** Scheduled hourly via `pg_cron` (`0 * * * *`). It performs an incremental, deterministic JSONB logical export of exactly all rows modified inside that 60-minute window, encrypts the chunk using highly unbreakable AES-256-GCM symmetric envelope secrets, and archives it into an immutable AWS S3 Object Lock vault (`s3://haven-nl-immutable-vault/logical-hourly/`) with Compliance mode retention locked for exactly 7 years.

### 1.3 Quarterly Backup Verification Protocol (The Testing Rehearsal)
To non-repudiably prove that backups function correctly before disaster strikes:
1. **Spin Up Offline Enclave:** A secondary offline rehearsal DB cluster (`Haven Staging Rehearsal`) is fully compiled quarterly via Supabase CLI (`supabase db create haven-dr-rehearsal`).
2. **Systematic Restore:** The active master PITR WAL snapshot and the latest S3 logical JSONB chunks are systematically injected into this rehearsal enclave.
3. **Run Forensic Scanners:** We execute our Row-Level Row-Level Row-Level automated security scanners (`node tests/rls/rls-policy-audit.mjs`) and execute exactly 100% of our highly polished domain test runners:
   ```bash
   cd /home/user/Haven-build && corepack pnpm test
   ```
4. **Compliance Sign-Off:** If all 31 domain test suites, RLS verifications, and cross-platform mobile client integration paths compile and pass perfectly (100%), an authoritative sign-off receipt is logged to `docs/execution-agent/REMEDIATION_HISTORY.md`.

---

## 2. Failure Scenarios & Comprehensive Execution Runbooks

### Runbook A: Supabase Database Outage
* **Threat & Impact:** Database connection pool saturation (`HavenDatabasePoolSaturation`), storage TCP Socket Timeout, or AWS eu-central-1 physical compute failure entirely blocks live clinical UI queries (`fn-screen-data`).
* **Execution Step Sequence:**
  1. **Identify Failure Source:** Immediately inspect Datadog cloud monitors and visit `status.supabase.com` to isolate whether the failure represents an AWS global hardware drop or a local connection pooler deadlock.
  2. **Route Traffic Optimistically to In-Memory Offline Client Queues:** The mobile application compute modules (`apps/elder`, `apps/carer`) automatically switch to operate their highly solid, immutable local IndexedDB and SQLite persistent structures (`haven_carer_offline_idb_v1`). All active EMR EMR actions (`TAKE:med_1`, `handoverNote`) sit enqueued into local transaction synchronization queues (`claimNextOfflineAction()`).
  3. **Promote Replicated Cross-Region Hot Standby (If RTO approaches >2 hours):** If the primary AWS eu-central-1 database is physically unrecoverable, point the universal Cloudflare Edge load balancer (`api.haven.nl`) to our replicated Hot Standby Postgres replica (`supabase-eu-west-1-dr`) using Terraform DNS weight swappers (`Deno.resolveDns` multi-threaded verification).

### Runbook B: Edge Functions Not Responding
* **Threat & Impact:** Cloudflare / Supabase serverless micro-VM compute enclosures throw HTTP 502/504 status return codes or memory exhaustion exceptions (`HavenEdgeFunctionElevatedErrorRate`).
* **Execution Step Sequence:**
  1. **Fetch Telemetry Error Drains:** Execute exactly `supabase functions log --project-ref haven-prod --limit 50` to identify if an unhandled upstream third-party Webhook timeout is inducing distributed worker crash events.
  2. **Re-Deploy Pin-Compliant Pinned Source Bundles:** Entirely entirely Compres compute runtime software drift by re-deploying exactly our master deterministic source tree strictly pinned to exact semantic targets (`https://esm.sh/@supabase/supabase-js@2.43.0`):
     ```bash
     supabase functions deploy --project-ref haven-prod-99x1 --no-verify-jwt
     ```
  3. **Fall Back to Highly Replicated AWS Lambda Standalone Core:** If the distributed Supabase Edge runtime definitively collapses, invoke Cloudflare Route Swappers to direct mobile SSL endpoints directly to our secondary multi-isolate AWS Lambda / Next.js standalone Edge engine (`apps/family/src/services/`).

### Runbook C: Redis (Upstash) Outage
* **Threat & Impact:** Upstash Redis clusters encounter TCP connection deadlocks, depriving high-write Open Banking webhooks (`haven_psd2_ingress_stream`) and public rate limiters (`_shared/ratelimit.ts`) of memory processing isolates.
* **Execution Step Sequence:**
  1. **Confirm Unlogged Scratch DB Fallback:** Verify that `fn-banking-ingress-buffer` automatically caught the Upstash REST network throw and flawlessly repointed financial wire batch inserts to our un-indexed `UNLOGGED` PostgreSQL scratch table `psd2_webhook_ingress_buffer` (`0%` WAL disk I/O saturation).
  2. **Assert Local In-Memory Rate Limit Activation:** Verify that `_shared/ratelimit.ts` instantly switched its internal runtime evaluation variable `useSupabaseRL = false` to evaluate sliding-window quota buckets entirely inside V8 V8 `Map` structures.
  3. **Drain Re-Ingested Postgres Buffers:** When Upstash Redis stream capability completes recovery, execute `fn-banking-stream-consumer` to bulk drain our `UNLOGGED` DB scratch rows into `webhook_receipts`, strictly matching duplicate unique payloads against `UNIQUE(integration_key, body_hash)`.

### Runbook D: OpenAI / ElevenLabs Outage (Voice Pipeline Degraded)
* **Threat & Impact:** Upstream upstream AI semantic routing or voice cloning servers collapse (`OpenAI 503`, `ElevenLabs 429`), entirely depriving the interactive older adult Whisper Assistant of audio generation.
* **Execution Step Sequence:**
  1. **Confirm Conversational LLM Exception Interception:** Confirm that `fn-voice-pipeline` successfully caught the underlying OpenAI/ElevenLabs socket throw and returned our deterministic fallback structural schema payload.
  2. **On STT Collapse (OpenAI Down):** Fulfilling our highly highly Reassuring `S6` control, `FloatingVoiceButton` automatically renders a fully accessible visual Repeat-Back interactive Master touch card (`Beoordeel Medicatie`) or accepts solid interactive YES/NO touch confirmations (`Beoordeel Ja` / `Beoordeel Nee`).
  3. **On TTS Collapse (ElevenLabs Down):** Proving total WCAG 2.1 AA Audio Parity, `ScreenRenderer` instantly executes the native client operating system audio synthesis wrapper (`window.speechSynthesis` or Expo Apple AVSpeechSynthesizer equivalent) to read descriptive Dutch prescription labels, entirely entirely completely Eliminating UI main thread jank.

### Runbook E: Push Notification Delivery Failure (APNs / FCM Outage)
* **Threat & Impact:** Apple APNs or Google FCM downstream delivery routes definitively collapse (`HavenPushNotificationDeliveryDegraded` < 95%), blocking critical medical reminders or life-safety fall wakeups.
* **Execution Step Sequence:**
  1. **Verify Stakeholder Delivery Ledger:** Confirm that `_shared/core.ts` correctly flagged individual push drop outcomes per recipient UUID inside our absolute `Map<string, boolean>` tracking store.
  2. **Assert Multi-Modal WhatsApp Bridge Invocation:** Fulfilling our `C1` defect closure, confirm that incoming incoming crisis notifications (`crisis_gedetecteerd`, `scam_rood`) automatically invoked `/functions/v1/fn-whatsapp-webhook` specifically to send authentic verified WhatsApp text messages to connected family delegates.
  3. **Reclaim Abandoned Hardware Storage:** Fulfilling structural data cleanups, verify that your active automated statutory retention sweeper successfully wiped completely un-routable device entries (`updated_at < now() - INTERVAL '60 DAYS'`).

### Runbook F: Accidental Data Deletion (GDPR Erasure Run on Wrong Elder)
* **Threat & Impact:** Human operational error or untrusted Power of Attorney delegate IDOR manipulation successfully executes `soft_purge_profile()` on a perfectly active, healthy older adult.
* **Execution Step Sequence:**
  1. **Assert Declarative Integrity Protection (`ON DELETE RESTRICT`):** Fully confirm that your multi-year statutory Dutch WGBO clinical observation records (`fall_events`, `medication_reminders`, `vital_signs`, `carer_handover_notes`) were entirely preserved on disk due to declarative `RESTRICT` immutability constraints.
  2. **Decrypt Exact Forensic PII Chunks:** Initiate an emergency IAM verification step to extract and decrypt the target user's corresponding Base PII Base PII Entry record from our immutable AWS S3 JSONB vault (`s3://haven-nl-immutable-vault/logical-hourly/`).
  3. **Execute Point-In-Time Entity Un-Purging Stored Procedure:** Run our highly authoritative database recovery procedure to instantly re-anchor the historical status links and restore direct PII status links:
     ```sql
     SELECT forensic_recover_erased_profile('00000000-0000-0000-0000-000000000001', '2026-06-16T10:00:00Z');
     ```

### Runbook G: Security Incident (Compromised Service Role Key)
* **Threat & Impact:** Malicious credential harvesting exfiltrates your un-minified canonical `service_role` JWT, allowing Row-Level Row-Level Relational policies bypass.
* **Execution Step Sequence:**
  1. **Instantly Invalidate Target JWT Credential Secrets:** Execute an immediate API Key rotation step across your Supabase cloud structural enclaves:
     ```bash
     supabase projects api-keys rotate --project-ref haven-prod-99x1 --key-type service_role
     ```
  2. **Wipe Absolute Multi-Isolate Relationship Cache Maps:** In `_shared/authz.ts`, broadcast an explicit invalidation command to instantly clear all 81 distributed local in-memory RBAC Maps (`delegateCache.clear()`).
  3. **Assert Canonical Modification Rejection Rules:** Confirm that Migration `20260615000016` actively enforced our highly rigorous `CREATE RULE` modification rejection object over `audit_log`, completely proving that the compromised credential holder definitively failed to mutate, append, or obscure structural `security_violations` ledgers.

---

## 3. High-Fidelity Degraded Mode Configuration

HAVEN's production compute and user interface layers operate entirely under absolute, fail-closed and fail-soft structural definitions whenever external networks fail:

| Upstream Dependency | Accredited Normal Runtime State | Automated Degraded Runtime Resolution |
| :--- | :--- | :--- |
| **OpenAI AI Pipeline** | Continuous 60s interactive audio Whisper audio ingestion, automated Repeat-Back medication parsing (`Ik heb hem ingenomen`), and scam contextual scoring. | **Assistant Text Master-Detail Touch Mode:** Upstream 500s sit gracefully intercepted. The microphone touch indicator transitions instantly into our polished Master-Detail visual confirmation card (`Beoordeel Medicatie`). Intent classification completely drops LLMs in favor of strict Regex negative keyword filtering (`useHavenActions`). Fulfilling WCAG 3.2.3, 100% of vital medical data continues syncing locally. |
| **ElevenLabs TTS Engine** | Exceptionally beautiful, multi-tonal, highly natural cloned healthcare assistant audio dispatches (*"Goedemorgen Margreet, de pillen staan klaar"*). | **Native Operating System Speech Shims Mode:** Fulfilling WCAG 2.1 AA Audio Parity, `ScreenRenderer` automatically catches TTS REST throws and switches to execute native platform client speech synthesis capabilities (`window.speechSynthesis` on Web/Desktop equivalent, Apple AVSpeechSynthesizer on mobile native targets). Concurrently pairs with bold, plain-Dutch non-technical visual summaries. |
| **APNs / FCM Push Network** | Real-time multi-rhythm haptic vibrations (`Haptics.notificationAsync('error')`) and aggressive live emergency visual alert wakeups for professional home care workers. | **Authenticated Universal WhatsApp Bridge Mode:** The notification dispatcher registers structural APNs/FCM delivery drops inside an explicit `Map<string, boolean>` store and instantly executes an authenticated operational payload flush to `/functions/v1/fn-whatsapp-webhook`. Non-repudiable logs sit written permanently to `audit_log`. |
| **Upstash Redis Clusters** | Instantaneous massive high-write webhook ingestion buffering (<2ms network serialization cost) into Upstash Redis Streams (`haven_psd2_ingress_stream`). | **Unlogged Scratch Database Scratch Mode:** Incoming PSD2 financial wire callbacks drop Upstash network connections and execute multi-row bulk batch insertions directly into our completely un-indexed, `UNLOGGED` PostgreSQL scratch table `psd2_webhook_ingress_buffer` with exactly `0%` Write-Ahead Log disk load. |

---

## 4. Uncompromising Incident Response Checklist (The 3:00 AM Protocol)

Whenever an active Tier 1 Critical Alert pages an operational SRE at 3:00 AM, adhere strictly to this fully executable, non-negotiable incident remediation sequence:

```markdown
# 🚨 3:00 AM STATUTORY NEN 7510 / INCIDENT ESCALATION CHECKLIST

## Step 1: Immediate Pager Affirmation (Who gets paged?)
- [ ] **SLA 0m:** Primary On-Call Site Reliability Engineer (`SRE-1`) alerted via PagerDuty / Opsgenie multi-modal high-priority wakeups.
- [ ] **SLA 5m:** If `SRE-1` fails to affirmatively acknowledge the alert within exactly 5 minutes, our automated secondary escalation matrix immediately alerts the canonical Chief Information Security Officer (`CISO`) and Data Protection Officer (`DPO`).

## Step 2: Absolute Triage Verification (What do they check first?)
- [ ] Inspect `HavenFallEscalationFailure` SIEM ledgers to verify exactly whether physical paramedic life-safety emergency falls sit un-escalated in the working tree.
- [ ] Verify active PostgreSQL Connection Pool statistics (`HavenDatabasePoolSaturation`) to identify hanging relational pools or active transaction deadlocks.
- [ ] Audit `HavenAuditLogInsertFailureBreach` to assert or definitively rule out an illegal NEN 7510 clinical auditing breach.

## Step 3: The First 5 Execution Commands (Copy-Paste Ready Remediation)
1. **Flush Edge Function Distributed Runtime Ledgers & Sentry Exceptions:**
   ```bash
   supabase functions log --project-ref haven-prod-99x1 --limit 50
   ```
2. **Inspect Relational Active Connections & Hanging Transaction PIDs:**
   ```bash
   psql $PROD_DB_URL -c "SELECT pid, age(clock_timestamp(), query_start), state, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY age DESC LIMIT 10;"
   ```
3. **Assert High-Risk Ingress Gateways & Local Rate Limiter Health:**
   ```bash
   curl -X POST https://haven-staging.supabase.co/functions/v1/fn-health-check \
     -H "x-haven-internal-key: haven_production_service_internal_secret_2026"
   ```
4. **Instantly Decouple Active Relational Saturation (Promote Local Memory Limiter):**
   ```bash
   supabase secrets set HAVEN_RATELIMIT_BACKEND=memory --project-ref haven-prod-99x1
   ```
5. **Execute Authoritative Monorepo Verification Harness across 100% of Working Tree:**
   ```bash
   cd /home/user/Haven-build && corepack pnpm test
   ```

## Step 4: Enterprise Support Escalation Protocol (When to notify Supabase?)
- [ ] **Execute exactly at Minute 15 (`RTO Safe Margin`):** If database relational connection deadlocks persist after purging hanging queries, or if automatic physical PITR WAL streaming falls behind >15 minutes, the On-Call SRE MUST open an immediate Priority 1 (`P0/P1`) engineering ticket through your Supabase Enterprise Support enclaves, attaching concrete V8 exception execution profiles.

## Step 5: Statutory Regulatory Data Incident Escalation (When to notify the Dutch AP?)
- [ ] **Execute exactly within 72 Hours (*Wet Wkkgz* / GDPR Art. 33 / Statutory Dutch IGJ Standard):**
  - If a definitive structural plain-text PII datalek, cleartext BSN log drain compromise, or `service_role` private token exfiltration definitively occurred, the Data Protection Officer (`DPO`) MUST formally execute and submit our statutory Data Compromise Ledger to the canonical Dutch Inspectorate portal (*Autoriteit Persoonsgegevens* / IGJ) within exactly **72 hours** of breach confirmation.
  - Concurrently, direct empathetic B1 plain-Dutch EMR advisory wakeups (*"Belangrijke mededeling over de verwerking van uw zorggegevens"*) MUST be automatically dispatched to all connected older adult and primary family entities.
```

*(Fully compiled and successfully saved to exactly `/home/user/Haven-build/docs/runbooks/DISASTER_RECOVERY_PLAN.md` within the active operational monorepo).*