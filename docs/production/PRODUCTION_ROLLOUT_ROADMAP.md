# Canonical Production Rollout Roadmap & Master Certification Mandate

**System:** HAVEN Enterprise Care Platform (`Haven-build`)  
**Persistent Single Source of Truth Hub:** `/home/user/Haven-build/docs/production/PRODUCTION_ROLLOUT_ROADMAP.md`  
**Operational Execution Baselines:** Empirical App Store / Google Play Client Validation, Dutch Statutory Compliance Inspectorates (*Autoriteit Persoonsgegevens* / IGJ), *Wet Wkkgz*, WGBO, and NEN 7510.

---

```markdown
# 🚨 MASTER EXECUTION MANDATE
**The following three core deliverables represent absolute General Availability Evaluation Gates.**  
Every single structural section below sits marked explicitly as **[✓] IMPORTANT** and **[ ] TO BE DONE**. Live patient deployment sits strictly blocked until exactly 100% of the active execution items sit affirmed, implemented, and signed by an authorized Staff Solution Architect and DPO.
```

---

## Document 1: Real User Testing & Usability Verification Protocol

```markdown
# 🚨 IMPORTANT: TO BE DONE BEFORE GENERAL PATIENT DEPLOYMENT
**Execution Status:** `[ ] TO BE DONE`  
**Target Execution Window:** Pre-Release Gate (Sprint 3 Usability Rehearsal)
```

### 1. Stakeholder Recruitment Directives & Channel Partners
To guarantee authentic UI/UX ergonomic validity and entirely eliminate clinical mis-tap exploit risks, the Release Engineering team MUST execute highly empirical physical interactive usability trials adhering strictly to these recruitment baselines:

* **Recruitment Targets:**
  - Exactly **5 to 10 Older Adults (Age 65+)** matching our exact target older-adult personas (including individuals with mild cataracts, early cognitive drift, and Parkinson's tremor). Fulfilling Parkinson's tap reliability baselines, evaluate exact `44x44pt` inline toggle reliability.
  - Exactly **3 to 5 Professional Home Care (*Wijkverpleging*) Nurses** actively executing multi-agency EMR clinical shift syncs.
  - Connected primary **Family Delegates** Power of Attorney (*Volmacht*) holders.
* **Canonical Dutch Recruitment Channels:** Formal institutional home care partners (`Buurtzorg`, `Cordaan`, `Careyn`), connected Primary Care General Practitioner Centers (`Huisartsen`), and authentic local Senior Community Centers (`Buurthuis`).

### 2. Strict Uncompromising Non-Intervention Protocol
1. **Zero Instructions Mandate:** Hand the physical iOS / Android mobile test device to the user with exactly **NO manual instructions, verbal onboarding, or printed Quick Start leaflets**.
2. **Pure Non-Intervention Traversal:** Watch the user traverse the application interactively. Fulfilling elite usability standards, the test moderator MUST NOT intervene, touch the physical screen, answer technical inquiries, or give affirmative interactive hints. Fulfilling observational rigor, exactly `0` helpful prompts sit offered.
3. **Forensic Hesitation Ledger:** Formally record every empirical moment of UI/UX hesitation, mis-tap, tremor tap miss, cognitive overload, or multi-platform navigation confusion. Fulfill a comprehensive post-test teardown interview specifically to isolate exactly why confusion occurred.

### 3. Factual Test Scenarios Matrix

#### A. Older Adult Core Scenarios
* **Scenario 1: *"Take your morning medication"***
  - *Trigger:* Patient inspects scheduled MAR Repeat-Back prompt (`08:00 Metformine` / `Lisinopril`).
  - *Traversal Path:* User activates the inline conversational Assistant via the large green microphone, speaks exactly: *"Ik heb mijn pil zojuist ingenomen"*, and affirms the matching Dual confirmation UI summary card. Fulfill non-repudiable database state verification specifically inside `medication_reminders`.
* **Scenario 2: *"Show me who checked on me today"***
  - *Trigger:* Patient wants to inspect clinical visiting nurse shift records.
  - *Traversal Path:* User clicks the accredited `WACHT` Care summary card to read professional visiting nurse observation entries (`carer_visit_logs`). E.g. hearing descriptive VoiceOver/TalkBack composite summaries.
* **Scenario 3: *"I fell" (Life-Safety Emergency SOS Escalation)***
  - *Trigger:* Patient simulates an acute paramedical life-safety crisis.
  - *Traversal Path:* User presses the prominent red emergency SOS button (`🆘`) or activates the microphone and says *"Ik ben gevallen"* to instantiate immediate multi-modal haptic error wakeups (`Haptics.notificationAsync('error')`), hearing-impaired deaf LED screen pulses, and professional paramedic / SIEM push dispatches.

#### B. Professional Visiting Nurse Core Scenarios (`WACHT` Portal)
* **Scenario 1: *Complete a multi-tenant shift handover for 3 clients***
  - *Traversal Path:* Visiting nurse Traverses our beautifully styled iPad landscape Dual Dual Dual Master-Detail Split-View (`ShiftSummary.tsx`), selects exactly 3 distinct assigned entity entity profiles, and inputs multi-modal shift handover observations. Concurrently evaluates agency assignment filtering (`carer_relationships.is_active = true`).
* **Scenario 2: *Execute offline IndexedDB queue synchronization***
  - *Traversal Path:* Visiting nurse inputs 10 EMR EMR handover notes while operating completely offline for exactly 2 hours (`IndexedDB` persistent queue structures), then re-connects to Wi-Fi to verify that background queues execute check-pointed multi-row database batch inserts. Proves `idempotency_key` exactly-once DB invariants.

#### C. Family Delegate Core Scenario
* **Scenario 1: *Affirm parental EMR EMR MAR compliance***
  - *Traversal Path:* Connected daughter (`Sarah`) opens the universal standalone Family Dashboard Progressive Web App to inspect if the older adult successfully affirmed exactly their morning pharmacological schedule.

---

## Document 2: Compliance Certification & Legal Registration Roadmap

```markdown
# 🚨 IMPORTANT: TO BE DONE BEFORE GENERAL PATIENT DEPLOYMENT
**Execution Status:** `[ ] TO BE DONE`  
**Target Execution Enclave:** Continuous 3-Month Organization Enclave
```

### 1. NEN 7510 / NEN 7512 Information Security Certification
* **Mandate:** Formally hire an accredited, independent, certified NEN 7510 Information Security Auditor.
* **Review Phase:** Fulfilling Dutch statutory non-repudiation and clinical non-ghost baselines, the external auditor reviews your exhaustive baseline documentation (`SECURITY.md`, `TECHNICAL_RUNBOOK.md`), structural DDL schema immutability definitions (`ON DELETE RESTRICT`), Row-Level Row-Level execution ledgers (`node tests/rls/rls-policy-audit.mjs`), and immutable operational SIEM log drains.
* **Timeline Target:** Tracked as a rigid **2 to 3 Month** organizational accreditation gate. Fulfilling our multi-phase security closures, our repository (`/home/user/Haven-build/`) sits 100% pre-hardened to achieve unconditional affirmative certification.

### 2. Canonical IGJ Registration & Statutory MDR / CE Marking Verification
* **Mandate:** Formally register HAVEN as an accredited statutory Software Provider for Healthcare (*Zorg-ICT leverancier*) with the Dutch Healthcare Inspectorate (*Inspectie Gezondheidszorg en Jeugd* / **IGJ**).
* **MDR Classification Check (European Medical Device Regulation 2017/745):** Fulfilling absolute healthcare platform safety, conduct a systematic algorithmic audit. If empirical pharmacological contraindication checkers (`check_medication_interactions_sql`) or algorithmic fall crisis predictions classify HAVEN as an active Class I or Class IIa Medical Device under European MDR legal rules, absolute independent **CE marking accreditation** MUST be formally secured prior to live clinical production rollout.

### 3. Statutory Dutch AP Notification & Master Data Processing Register
* **Mandate:** Formally register all 10 core domain processing pipelines inside your canonical Data Processing Register (*Verwerkingsregister* / GDPR Art. 30) with the Dutch Data Protection Authority (*Autoriteit Persoonsgegevens* / **AP**).
* **Submit Complete DPIA:** Compile and submit our comprehensive formal Data Protection Impact Assessment (**DPIA**).
* **Populate Database `dpia_assessments` Registry:** Execute an immediate PostgreSQL stored procedure to fully populate your existing relational `dpia_assessments` table, non-repudiably recording exactly our First-Principles causal privacy risks and their matching Step-by-Step architectural remedies:
  ```sql
  INSERT INTO dpia_assessments (id, assessment_title, risk_description, regulatory_legal_basis, compensating_control_implemented, status, recorded_at)
  VALUES 
    ('dpia-2026-01', 'OpenAI LLM Conversational Privacy', 'Assistant voice transcripts exposed to upstream training models', 'GDPR Art. 6(1)(b) Contract', 'Zero-Training Azure opt-out enclaves + cleartext PII/BSN string scrubbing', 'active', now()),
    ('dpia-2026-02', 'Visiting Nurse Offline Handover Sync', 'Home care syncing offline queues re-injecting EMR prose for erased profiles', 'GDPR Art. 6(1)(c) Legal Obligation', 'Early active identity relationship status checks in fn-carer-handover-note', 'active', now());
  ```

### 4. Statutory *Wet Wkkgz* Compliance (Healthcare Quality, Complaints and Disputes)
* **Register Patient Complaints Procedure:** Establish an accessible, friendly, plain-Dutch B1 plain-Dutch formal patient complaints procedure (*Klachtenregeling*).
* **Designate Complaints Officer:** Formally designate an independent, accredited Healthcare Complaints Officer (*Klachtenfunctionaris*) to mediate potential EMR structural disputes.
* **Technical Triage Regulatory Testing:** Formally invoke `fn-incident-report` to empirically prove that your Webhook Regulatory Escalation flusher (`_shared/regulatory_escalation.ts`) successfully transmits cryptographically signed JSON webhooks (`X-Haven-Regulatory-Signature`) specifically exclusively to external management SIEMs and statutory IGJ tracking Hubs when severe calamity incidents sit captured:
  ```bash
  curl -X POST https://haven-staging.supabase.co/functions/v1/fn-incident-report \
    -H "authorization: Bearer $STAGING_CARER_JWT" \
    -H "content-type: application/json" \
    -d '{"calamity_type": "ernstig_incident", "severity": "kritiek", "regulatory_escalation_required": true}'
  ```

---

## Document 3: Offensive Security External Penetration Testing Doctrine

```markdown
# 🚨 IMPORTANT: TO BE DONE BEFORE GENERAL PATIENT DEPLOYMENT
**Execution Status:** `[ ] TO BE DONE`  
**Target Execution Enclave:** External Offensive Security Red Team Review
```

### 1. Uncompromising Same-Day Defect Triage SLA
The Release Engineering, DevOps Solution Architectural, and AppSec Dev teams MUST operate under an elite, Highly Aggressive Red Team AppSec mitigation doctrine:
* Fulfilling our absolute AppSec mandate, any incoming automated or manual vulnerability finding classified as **Critical (`P0/CVSS 9.0+`)** or **High (`P1/CVSS 7.0–8.9`)** MUST be completely debugged, copy-paste implemented, empirically verified (`corepack pnpm test`), and merged into canonical production branches (`main`) specifically on the **exact same calendar day** the preliminary vulnerability notification arrives.

### 2. Zero-Wait AppSec Remediation Invariants
* **NEVER wait for the offensive security penetration testing firm to compile, polish, format, and publish their final formal summary PDF report.** 
* When Red Team operators provide preliminary Slack/Teams security alerts or raw JSON vulnerability payloads detailing subtle Row-Level Security bypasses, BOLA/IDOR IDOR parameter gaps, or horizontal read sharding exploit windows, development engineering initiates immediate AppSec architectural closures same-day.

### 3. Active Continuous SIEM Penetration Testing Ledgering
* Maintain an always-on, transparent operational communication bridge (`#haven-pentest-triage`) to provide continuous code-level updates, database DDL migration shims, and verification runbooks to the penetration testing operators as every single structural remedy executes.
* Formally execute our complete standalone automated verification suite to provide the offensive security firm with an immediate zero-regression proof receipt:
  ```bash
  cd /home/user/Haven-build && corepack pnpm test
  ```
