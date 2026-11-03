# Haven-build remediation plan

[Review and evidence](REVIEW.md). All actions below are **planned**, not executed. Preserve existing gates and use synthetic data. Start with pinned run evidence and owner-approved staging; exit only after independently observed results and explicit risk acceptance.

## Phase 1 — Baseline and reproduction

### T-01 — Attribute failing runs (H-01)
Prerequisite: read access to the three pinned Actions runs. Observed paths: `.github/workflows/ci.yml`, `production-checks.yml`, `deploy.yml`.
1. Record SHA, job, first failed step, logs and whether later jobs ran or were skipped for each run.
2. Reproduce each distinct cause on an isolated runner using the workflow's tool versions and configuration; separate environment failures from source defects.
3. Fix evidenced causes in an authorized change and rerun the same gates, including previously blocked downstream jobs; retain logs.

Output: three root-cause records and candidate-SHA rerun links. Verify failed steps now execute rather than skip.
- [ ] Every historical failure is attributed or explicitly unresolved.
- [ ] Candidate outcomes and skipped jobs are recorded without weakening checks.

## Phase 2 — Correct confirmed behavior

### T-02 — Emergency location (H-04)
Prerequisite: T-01 baseline and domain owner. Observed `supabase/functions/fn-fall-escalation/index.ts:97–130`; proposed regression coverage under `tests/edge/`.
1. Write a handler-boundary test for fresh locations with latitude zero, longitude zero, missing values and invalid ranges; assert the notification's actual location field.
2. Replace truthiness with explicit numeric validity checks; keep missing or invalid locations distinguishable from valid zero values.
3. Test upload/signing failures and consented recipients without reporting location delivery as human receipt.

Output: correction and regression evidence. Verify the original zero-coordinate condition makes the new test fail; verify the corrected handler passes all cases.
- [ ] Zero coordinates produce the intended signed-location path.
- [ ] Invalid or unavailable locations follow an owner-approved fallback.

### T-03 — Offline schema and claim safety (H-05, H-06)
Prerequisite: T-01; observed `apps/elder/src/services/sqliteOfflineQueue.ts:6–22, 56–74, 96–110`.
1. Create old-schema and already-upgraded fixtures; inject a non-duplicate migration error and assert it propagates instead of claiming success.
2. Make schema upgrades detect existing columns explicitly and fail visibly on other errors, retaining existing queued payloads.
3. Force the interleaving where a selected stale processing row becomes failed before claim; restrict the stale update branch to processing rows and assert failed rows remain quarantined.

Output: upgrade/claim correction and behavioral tests against SQLite. Verify the original catch-all and claim predicate each fail their corresponding negative test; also verify one competing worker wins a valid claim.
- [ ] Old and current schemas upgrade without losing synthetic actions.
- [ ] Failed actions cannot be reclaimed by the tested race.

Exit phase: T-02 and T-03 independently reviewed; no claim of live-device safety yet.

## Phase 3 — Security and meaningful automation

### T-04 — Live authorization and dependency boundary (H-02, H-03; preventive security)
Prerequisites: T-01, isolated Supabase staging and synthetic identities. Observed `.github/workflows/supabase-integration.yml`, `supabase/functions/_shared/authz.ts`; proposed release-required live evidence gate.
1. Pin an owner-verified Supabase CLI version, record Node/lockfile versions and review dependency waivers and artifact provenance; do not assume `latest` is reproducible.
2. Map representative elder, family, carer, revoked and unrelated access across edge handlers, RLS and storage. Exercise injection payloads, consent revocation, expired signed URLs, secret redaction and erasure using synthetic records.
3. Make missing credentials block the release gate or report an explicit non-passing release status; retain proof the live tests actually executed.

Output: role/permission matrix, pin and live execution record. Verify a deliberately permissive staging policy makes an unrelated-user test fail, and missing configuration cannot count as release success. Never mutate production policies for a test.
- [ ] Denials, revocation and positive authorized cases observed at the real boundary.
- [ ] Dependency, injection, secret and data-lifecycle gaps are fixed or assigned with owner decisions.

### T-05 — Safety and usability evidence (preventive)
Prerequisites: T-02–T-04; clinical owner and supervised devices. Observed `apps/elder/src/screens/MedicationScanScreen.tsx`, fall handler and queue; proposed device test cases.
1. Trace the actual medication, fall and queue entry points to services and storage; document which implementation and feature flags are active.
2. Exercise permission denial, unreadable medication, review-required results, network loss, retries, duplicate submissions and notification failure on representative devices with synthetic data.
3. Observe elder/carer screen-reader use, touch targets and comprehension; agree safe fallback and escalation language with domain owners.

Output: traceable safety and accessibility observations. Deliberately break one delivery or duplicate guard in an isolated test and show the independent assertion fails; document device/OS and unresolved failures.
- [ ] Participants can distinguish submitted, pending review and failed actions.
- [ ] Domain owner reviews failure handling and residual risk; no certification implied.

## Phase 4 — Operations and independent acceptance

### T-06 — Release, measured monitoring and recovery (H-07; preventive)
Prerequisites: T-04, owner-approved staging, recovery objectives and signing access. Observed `.github/workflows/deploy.yml`; proposed release/restore record.
1. Trace actual deploy conditions, environment approvals, secrets, signing identities, vendor dependencies and candidate SHA; verify approvals in the hosting configuration, not just YAML.
2. Restore synthetic database **and** storage backups into isolation, verify records and permissions, and measure recovery point and time against approved targets.
3. Deploy an approved staging candidate, observe application versions and feature flags, then exercise a compatible rollback and independently verify the resulting runtime.
4. Replace the ten-second placeholder with real error-rate/health observations over an owner-approved monitoring window. Bind results to the release and timestamps; missing telemetry must be unavailable, not healthy. Inject an error spike and a telemetry outage in staging and verify alert and promotion-stop behavior.

Output: deployment, restore and rollback evidence with timestamps and owners. Verification requires observed data and served version, not only successful jobs.
- [ ] Recovery results meet approved targets or have explicit exceptions.
- [ ] Release and rollback observations match the candidate and approved fallback.
- [ ] Monitoring records actual observations; a simulated wait, missing data or injected failure cannot report a healthy release.

### T-07 — Independent acceptance (all findings)
Prerequisites: T-01–T-06. Observed root `package.json:7–23`; proposed acceptance record.
1. An independent reviewer maps each H-ID to corrected code, executed tests and the exact candidate SHA.
2. Repeat negative controls and inspect skipped tests and staging results; confirm test failures occur when the protected behavior is deliberately broken in isolation.
3. Obtain clinical, privacy, security and operations sign-off or record unresolved risks and block release as appropriate.

Output: signed acceptance record linking logs, devices and decisions. Verify each evidence item refers to the candidate, not an older run.
- [ ] No skipped mandatory boundary is represented as a pass.
- [ ] Owners accept or explicitly block every residual risk.

## Dependencies, approval and release policy

T-01 → T-02, T-03 and T-04; T-02–T-04 → T-05; T-04 → T-06; T-01–T-06 → T-07. Production acceptance: [ ] all mandatory tasks complete; [ ] live isolation and clinical failure paths observed; [ ] restore and rollback verified; [ ] responsible owners approve. Clinical use, privacy/retention, production credentials, schema changes, signing and rollout require owner approval. Prefer reversible flags and compatible migrations; never perform destructive schema rollback without an approved recovery plan. No commands above are claimed to have run.
