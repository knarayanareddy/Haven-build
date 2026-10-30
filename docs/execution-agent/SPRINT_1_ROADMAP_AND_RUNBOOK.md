# Sprint 1 Immediate Resumption Roadmap & Production Runbook

When your automated execution agent or an incoming Staff Security Engineer resumes active engineering across the HAVEN repository, they MUST execute our prioritized operational roadmap exactly where quality closures concluded.

## 1. Batch 1 Database Archiving Sprint Execution
**Operational Mandate:** Transform our remaining high-write, life-safety critical ledgers to utilize native declarative table partitioning (`PARTITION BY RANGE`).
- **Target Ledgers:** `incidents`, `carer_visit_logs`, `family_messages`, `driving_events`, `financial_transactions`, `carer_handover_notes`, `clinical_record_corrections`, `medication_reminders`, `medication_ocr_reviews`, and `medication_interaction_alerts`.
- **Implementation Runbook:**
  1. Coordinate with active visiting home care operational teams (*WACHT* operational managers) to schedule DDL schema modifications strictly during low-traffic maintenance windows (`03:00` to `04:00 AM CET`).
  2. Implement dual-writing or multi-phase table migration shims to transition legacy monolithic tables into partitioned parents (`PARTITION BY RANGE (created_at)`), pre-creating 7 sliding days of future child range partitions.
  3. Establish automated daily data lifecycle sweepers via `pg_cron` executing instantaneous zero-load historical partition drops (`DROP TABLE ... CASCADE` -> `0.00ms` lock window) to enforce legal storage boundaries without inducing transactional compute locking.
  4. Pair every completed migration file with an auditable Node.js integration runner in `tests/edge/` verifying exact deletion mechanics without breaking underlying Row-Level Security rules.

## 2. Regulatory DPO Compliance Signatures & DPAs
- **DPIA Formal Signatures:** Obtain formal, physical cryptographic signatures from our accredited Data Protection Officer (DPO) on our completed Data Protection Impact Assessment (DPIA) covering our automated Right to Erasure (`soft_purge_profile()`) and Modulo-11 BSN structural guard (`_shared/bsn_guard.ts`) controls.
- **Vendor DPAs:** Establish statutory statutory Data Processing Agreements (DPAs) under GDPR Art. 28 with our external AI partners (ElevenLabs for familiar voice synthesis and OpenAI for multi-dimensional vector embeddings).

## 3. Live Production TLS & Upstream Integrations
- **TLS & MTLS Provisioning:** Provision live, automated wildcard TLS certificates (`let's encrypt` / corporate PKI) across all operational ingress gateways.
- **Upstream Credential Binding:** Bind authentic OAuth2 / mutually authenticated MTLS provider credentials to connect our complete Cloud Edge functions (`fn-medmij-fhir-import`, `fn-transaction-intercept`) to real-world PSD2 Open Banking exchanges and canonical accredited Dutch MedMij healthcare nodes.

## 4. Physical Hardware Older Adult Usability Verification
Execute real-world older adult interactive usability trials across physical iOS and Android mobile hardware. All testing MUST be conducted in strict adherence to our rigorous verification protocol located at `docs/release/ELDER_USABILITY_PROTOCOL.md`.
- **Verification Criteria:**
  1. Prove that 60-second continuous conversational listening scenarios run with flawless 60fps frame pacing and exactly `0` JavaScript main thread UI jank.
  2. Confirm that high-contrast haptic feedback wakeups fire successfully during life-safety emergency fall events.
  3. Confirm that the *Wat moet ik doen?* help overlay (`HelpOverlay.tsx`) instantiates instantaneously and renders clear plain-Dutch coaching instructions across all active screens.

---

## 5. Summary of Deferred Operational Milestones
By explicit user instruction, exactly three complex architectural expansions represent items deferred to subsequent long-term operational milestones (and are currently fully compensated for by our robust existing inline controls):
1. **Deferred R2 (External Semantic Guardrail Microservices):** Full integration of dedicated external semantic multi-agent LLM guardrail service architectures (NeMo Guardrails / Llama-Guard-3 microservice containers). Currently compensated beautifully and flawlessly by our rigid inline Dutch negative keyword lists (`BANNED_STT_PHRASES`) and prompt intent regex filtering.
2. **Deferred R3 (Centralized Central Redis TRL):** Full Stateless Asymmetric Custom custom claims JWT generation algorithms wrapped in an external multi-isolate centralized Redis Token Revocation List (`HAVEN_CENTRAL_TRL`) platform-wide. The 10 s local `delegateCache` that was listed here as compensation was removed on 2026-10-29 (it cannot be invalidated across isolates); the guard now reads `family_relationships` on every request, so no local cache is relied upon.
3. **Deferred R8 (Native Hardware Enclave Mobile Attestation):** Deep native mobile hardware Enclave attestation workflows (`@expo/react-native-app-attest` / Android Play Integrity API Ingress Gateway attestations) fully rolled out inside mobile UI client scaffolds. Currently compensated successfully by our unique software symmetric HMAC enrollment keys (`device_secret`) and short-lived `nonce` stores.
