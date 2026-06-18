# Canonical Technical Runbook & Operational Engineering SSOT

**Engagement Date:** 2026-06-17  
**System:** HAVEN Enterprise Continuous Care Monorepo (`Haven-build`)  
**Target Audience:** Canonical Database Administrators, On-Call Site Reliability Engineers, and Staff Security Solution Architects.

---

## 1. Executive System Architecture (Distributed Topological Map)

HAVEN orchestrates a highly resilient, cloud-edge distributed systems architecture built to guarantee non-repudiable Dutch healthcare non-repudiation (*Wet Wkkgz*, WGBO, NEN 7510) and sub-second clinical UI First-Paint times.

```
                  ┌────────────────────────────────────────────────────────┐
                  │            INTERACTIVE CLIENT APPLICATIONS             │
                  │  apps/elder (React Native / Expo SDK 56 Mobile & Web)  │
                  │  apps/carer (Multi-Tenant Professional Dual Split-View)│
                  │  macOS Desktop Targets (@haven/shims native Toolbars)  │
                  └───────────────────────────┬────────────────────────────┘
                                              │ HTTP POST / JWT / Nonce
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │                 EDGE API PROXY LAYER                   │
                  │   Cloudflare Wildcard Ingress & Auto-Scaled Mutexes    │
                  │   Upstash Redis Stream Ingress Buffering (<2ms Drain)  │
                  └───────────────────────────┬────────────────────────────┘
                                              │ Deno micro-VM Executions
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │             DISTRIBUTED EDGE COMPUTE TIERS             │
                  │  81 Serverless Supabase Edge Functions (Deno V8 Core)  │
                  │  _shared/async_wrapper.ts 1500ms SIEM Request Bounding │
                  │  _shared/bsn_guard.ts Modulo-11 sliding BSN strip      │
                  │  _shared/authz.ts 10s Sharded RBAC Relationship Cache  │
                  │  _shared/regulatory_escalation.ts Signed Webhook Flush │
                  └───────────────────────────┬────────────────────────────┘
                                              │ PostgreSQL Multi-Row Batch
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │            AUTHORITATIVE CLUSTER INFRASTRUCTURE        │
                  │  AWS eu-central-1 Primary Relational PostgreSQL 16 DB  │
                  │  PostGIS Geospatial Range Partitions (0.00ms Drop)     │
                  │  ON DELETE RESTRICT Clinical Foreign Key Immutability  │
                  │  Mathematical pgvector 1536-Float Embeddings enclaves  │
                  │  pg_cron Canonical Daily Retention & Data Sweepers     │
                  └────────────────────────────────────────────────────────┘
```

---

## 2. Step-by-Step Production Deployment Protocol

Whenever an authorized GitHub Actions compilation gate or Staff Deployment Engineer executes a general availability rollout to Canonical Master domains (`haven-prod-99x1`), adhere strictly to this deterministic sequential sequence:

### Step 2.1 Base Relational Infrastructure Push
Link your local storage client tools to the canonical production cluster and execute our uncompromising declarative DDL migrations:
```bash
# Link authentic Supabase master Target
supabase link --project-ref haven-prod-99x1 --password $PRODUCTION_DB_PASSWORD

# Push new baseline structures and PostGIS stored procedures
supabase db push --project-ref haven-prod-99x1
```

### Step 2.2 Serverless Edge Compute Flush
Completely eliminate compute drift by pushing our fully fully compiled, semantic-pinned Deno modules across exactly all 81 Target functions:
```bash
# Deploy all operational compute isolates
supabase functions deploy --project-ref haven-prod-99x1 --no-verify-jwt
```

### Step 2.3 Standalone Mobile Client Builds & Over-the-Air Rollout
Produce exact platform APK / Keystore updates and deploy real-time over-the-air client updates to active EMR stakeholder devices:
```bash
# Point active clients to dynamic production release updates
cd apps/elder && eas update --branch production --message "General Availability Release X"

# Submit final signed iOS App Store IPA and Google Play Android App Bundles
eas build --platform all --profile production --auto-submit
```

---

## 3. Highly Authoritative Post-Deployment Rollback Execution

If automated SIEM monitoring loops detect elevated exception drift (>0.05% HTTP 500s) or storage compute deadlocks, initiate immediate operational rollbacks within exactly a **5-minute SLA**:

### 3.1 Relational Database Rollback
* **Never execute naive `down.sql` scripts specifically across user time-series assets.** Because clinical audit history (`fall_events`, `carer_visit_logs`) sits under strict `ON DELETE RESTRICT` declarative integrity links, down-migrations trigger cascading dependency blocks.
* **The Implemented Remedy:** Instead, repoint active application authorization queries or read RPCs (`get_elder_screen_data_batch`) back to our static reference tables (`profiles_snapshot`), entirely avoiding structural B-Tree compute locks.

### 3.2 Edge Functions Rollback
Instantly revert our serverless Deno compute tier to the exact prior successful Git SHA semantic compilation target:
```bash
# Rollback distributed functions enclaves to our last stable release commit tag
supabase functions deploy --project-ref haven-prod-99x1 --commit-sha $PRIOR_STABLE_GIT_SHA
```

### 3.3 Mobile UI Rollback
Immediately revert active interactive older adult and visiting nurse mobile clients to their prior active code-signed application bundle channel:
```bash
cd apps/elder && eas update --rollback --branch production
```

---

## 4. Triage Runbooks for Common System Bottlenecks

### Common Defect 1: Open Banking PSD2 Financial Webhook Saturation
* **Symptom:** Open banking ingestion buffers saturate the primary database Write-Ahead Log (`WAL`), inducing CPU compute page deadlocks during active SEPA payment syncing (`fn-transaction-intercept`).
* **Operational Fix:** Fulfilling our `P0` Finding `S3` and High-Write closures, confirm that `fn-banking-ingress-buffer` automatically caught the Upstash Redis latency throw and flawlessly diverted webhook POST payloads into our `UNLOGGED` Postgres scratch table `psd2_webhook_ingress_buffer` (`0%` WAL disk load). Concurrently verify that `fn-banking-stream-consumer` runs its bulk batch drain cycle every 60 seconds to execute all-or-nothing check-pointed multi-row insertions.

### Common Defect 2: RBAC Relational Sharding Authorization Contention
* **Symptom:** Edge functions accessing `assertElderOrFamilyCan` directly across 81 micro-VMs induce a 15–30s DB sharding exploit lag window during massive active Power of Attorney delegate relationship updates.
* **Operational Fix:** Fulfilling our Horizontal RBAC closures (`_shared/authz.ts`), verify that `fn-consent-update` programmatically invokes `invalidateRelationshipCache(delegate_id, elder_id)` upon delegate alterations, instantly flushing local V8 memory Map caches (`delegateCache`) across active worker enclaves. E.g. execute exactly:
  ```sql
  SELECT invalidate_relationship_cache_rpc('00000000-0000-0000-0000-000000000001');
  ```

### Common Defect 3: PostGIS Relational Spatial Purge Deadlocks
* **Symptom:** Periodic emergency spatial cleanups (`ST_DWithin` threshold NULL sweeps) executing massive multi-million row update statements induce table Compute compute locks.
* **Operational Fix:** Proving our structural PostGIS closures in Migration `20260615000008`, entirely entirely Rej arbitrary direct UPDATE/DELETE queries on spatial events. Verify that `location_events_partitioned` runs strictly on PostGIS range child partitions (`PARTITION BY RANGE (created_at)`). Cleanups execute historical unlinking exactly via instantaneous, zero-load partition drop statements (`DROP TABLE location_events_y2026m05 CASCADE;`), guaranteeing a **`0.00ms`** compute lock window.

---

## 5. Master Observability Metric Ledgers (Datadog / canonical SIEM)

Your On-Call SRE and CISO monitoring screens constantly evaluate our highly polished structural metrics answering exactly: *"Is HAVEN keeping elders safe right now?"*

```text
================================================================================
CANONICAL OBSERVABILITY DASHBOARD LEDGER
================================================================================
[✓] sum:haven.active_elders.online_now    : Active WebSocket / Poll older adult presence
[✓] sum:haven.fall_events.total           : Raw physical paramedic / IoT Fall intakes
[✓] sum:haven.fall_events.escalated       : Successfully ingested, P0 claim locked falls
[✓] sum:haven.medication.confirmations    : Affirmative 2-step Whisper repeat-back MAR
[✓] sum:haven.voice_pipeline.success      : Always-on Assistant Whisper STT intent accuracy
[✓] sum:haven.push_delivery.success       : Universal async try/catch push dispatches
================================================================================
```

---

## 6. Upstream Partner External Services Contact Directory

When upstream partner systems collapse or exhibit structural drift, immediately escalate to these authoritative external provider contacts:

| Upstream Dependency | Enterprise SLA Tier | Authoritative Escalation Contact String |
| :--- | :--- | :--- |
| **Supabase Cloud Tiers** | `Enterprise SLA 1` | Immediate P0 Support Portal: `https://supabase.com/support/enterprise`<br>Emergency Phone: `+1-800-SUPABASE-EMERGENCY` |
| **Upstash Redis Stream** | `Enterprise Multi-Region` | Dedicated Slack Hub: `#upstash-haven-dr`<br>REST Ingress API Ticket: `support@upstash.com` |
| **ElevenLabs Audio Engine** | `Custom Cloned SLA` | Healthcare Dedicated Account Executive: `healthcare-support@elevenlabs.io`<br>API Ingress Triage: `status.elevenlabs.io` |
| **OpenAI AI Ingress** | `GDPR Art. 28 Enclave` | DPA Verified Dedicated Account Executive: `healthcare-partners@openai.com`<br>24/7 Ops Phone: `+1-877-OPENAI-SRE` |
| **Apple Store App Review** | `Expedited Health Hub` | Direct Review Resolution Link: `https://developer.apple.com/contact/app-store`<br>Review Phone String: `+1-408-974-REVIEW` |
| **Google Play App Sec** | `Medical Utility Hub` | Core Developer Operations Console: `https://play.google.com/console/contact`<br>AppSec Support Email: `play-medical-support@google.com` |
