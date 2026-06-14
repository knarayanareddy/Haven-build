import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
  'apps/iphone-suite/index.html',
  'pnpm-lock.yaml',
  'eslint.config.mjs',
  'tsconfig.base.json',
  'tsconfig.packages.json',
  'types/mobile-shims.d.ts',
  'supabase/migrations/20260611000001_haven_v121_production_schema.sql',
  'supabase/migrations/20260611000002_storage_rpc_security.sql',
  'supabase/migrations/20260611000003_full_feature_domain_tables.sql',
  'supabase/migrations/20260611000004_production_automation_realtime.sql',
  'supabase/migrations/20260611000005_compliance_care_release_ops.sql',
  'supabase/migrations/20260611000006_integrations_observability_grandchild.sql',
  'supabase/migrations/20260611000007_grandchild_unique_fix.sql',
  'supabase/migrations/20260611000008_phase3_safety_community_legacy.sql',
  'supabase/migrations/20260611000009_hardening_idempotency_integration_status.sql',
  'supabase/migrations/20260613000010_edge_authz_hardening.sql',
  'supabase/migrations/20260613000011_voice_interactions_self_write.sql',
  'supabase/migrations/20260613000012_data_lifecycle_expansion.sql',
  'supabase/migrations/20260614000000_vnext_wellrounded_patch.sql',
  'playwright.family.config.ts',
  'supabase/seed.sql',
  'supabase/config.toml',
  'apps/family-dashboard/index.html',
  'apps/family/next-env.d.ts',
  'apps/family/tsconfig.json',
  'apps/family/src/app/layout.tsx',
  'apps/family/src/app/inloggen/page.tsx',
  'apps/admin-console/index.html',
  'apps/carer-portal/index.html',
  'apps/browser-shield/manifest.json',
  'apps/browser-shield/src/content.js',
  'apps/browser-shield/src/background.js',
  'apps/elder/App.tsx',
  'apps/elder/tsconfig.json',
  'apps/elder/src/services/havenClient.ts',
  'apps/elder/src/auth/AuthProvider.tsx',
  'apps/elder/src/navigation/AppNavigator.tsx',
  'apps/elder/src/renderer/ScreenRenderer.tsx',
  'apps/elder/src/screens/ElderScreen.tsx',
  'apps/elder/src/hooks/useHavenActions.ts',
  'apps/elder/src/services/sqliteOfflineQueue.ts',
  'apps/elder/src/services/voiceRecorder.ts',
  'apps/elder/src/services/documentCamera.ts',
  'apps/elder/src/services/documentCameraView.tsx',
  'apps/elder/src/services/pushRegistration.ts',
  'apps/elder/src/services/crisis.ts',
  'apps/elder/src/services/notifications.ts',
  'apps/elder/src/services/offlineQueue.ts',
  'apps/elder/src/services/security.ts',
  'apps/elder/src/state/networkResilience.ts',
  'apps/elder/src/state/offlineSyncMachine.ts',
  'apps/elder/src/state/voiceRecordingMachine.ts',
  'apps/elder/src/state/networkResilience.ts',
  'apps/elder/src/state/offlineSyncMachine.ts',
  'apps/elder/src/state/voiceRecordingMachine.ts',
  'apps/family/src/services/realtime.ts',
  'apps/grandchild/src/state.ts',
  'apps/elder/src/schema/screens.ts',
  'apps/family/src/services/dashboard.ts',
  'apps/grandchild/App.tsx',
  'apps/grandchild/tsconfig.json',
  'apps/grandchild/src/client.ts',
  'packages/contracts/src/haven.ts',
  'packages/i18n/src/copy.ts',
  'packages/scam-engine/src/catalog.mjs',
  'packages/scam-engine/src/catalog.d.ts',
  'packages/scam-engine/src/catalog.d.mts',
  'packages/scam-engine/src/rules.ts',
  'packages/ui/src/tokens.ts',
  'packages/ui/src/components.ts',
  'packages/schema/src/screenSchema.ts',
  'packages/schema/src/validator.ts',
  'packages/database/src/types.ts',
  'packages/database/src/client.ts',
  'supabase/functions/_shared/validation.ts',
  'supabase/functions/_shared/authz.ts',
  'supabase/functions/_shared/internal.ts',
  'supabase/functions/_shared/idempotency.ts',
  'supabase/functions/_shared/retry.ts',
  'supabase/functions/_shared/webhook.ts',
  'supabase/functions/_shared/sentry.ts',
  'ml/dataset/schema.ts',
  'ml/dataset/manifest.yaml',
  'ml/prompts/scam_reasoning_nl.ts',
  'ml/heuristics/rules.json',
  'docs/implementation/FEATURE_IMPLEMENTATION_MATRIX.json',
  'docs/implementation/FEATURE_IMPLEMENTATION_MATRIX.md',
  'docs/implementation/DESIGN_DOC_DIFF.md',
  'docs/implementation/PHASE_COVERAGE_AUDIT.md',
  'docs/implementation/HARDENING_CLOSURE_REPORT.md',
  'docs/implementation/EDGE_FUNCTION_TRUST_BOUNDARY_MATRIX.md',
  'docs/implementation/DATA_LIFECYCLE_AUDIT.md',
  'docs/implementation/STORAGE_BLOB_LIFECYCLE_AUDIT.md',
  'docs/implementation/CODE_QUALITY_GUARDRAILS.md',
  'docs/implementation/SUPABASE_CI_STRATEGY.md',
  'docs/implementation/RESIDUAL_HARDENING_REPORT.md',
  'docs/implementation/RELEASE_CANDIDATE_SUMMARY.md',
  'docs/implementation/PRIORITIZED_REMAINING_ISSUES.md',
  'docs/implementation/NEXT_10_GITHUB_ISSUES.md',
  'docs/implementation/SESSION_HANDOFF_CHANGELOG.md',

  'docs/PROJECT_PACKAGE_INDEX.md',
  'docs/ENVIRONMENT.md',
  'docs/ARCHITECTURE.md',
  'docs/DATA_MODEL.md',
  'docs/DEVELOPMENT.md',
  'docs/OPERATIONS.md',
  'docs/SECURITY.md',
  'docs/TESTING.md',
  'docs/COMPLIANCE.md',
  'docs/release/ACCESSIBILITY_AUDIT_PROTOCOL.md',
  'docs/release/PENTEST_SCOPE.md',
  'docs/release/ELDER_USABILITY_PROTOCOL.md',
  'docs/release/COPY_REVIEW.md',
  'scripts/check-local-supabase.sh',
  'scripts/export-scam-rules.mjs',
  'tests/integration/live-rls.test.mjs',
  'tests/edge/data-lifecycle-diff.test.mjs',
  'tests/edge/authz-behavioral.test.mjs',
  '.github/workflows/supabase-integration.yml',
  'docs/api/openapi.yaml',
  'docs/api/EDGE_FUNCTION_CATALOG.md',
  'scripts/deploy/check-production-env.sh',
  'scripts/deploy/deploy-supabase.sh',
  'supabase/functions/fn-voice-pipeline/index.ts',
  'supabase/functions/fn-scam-pipeline/index.ts',
  'supabase/functions/fn-medication-escalation/index.ts',
  'supabase/functions/fn-notification-dispatch/index.ts',
  'supabase/functions/fn-location-ingest/index.ts',
  'supabase/functions/fn-weekly-digest/index.ts',
  'supabase/functions/fn-companion-memory/index.ts',
  'supabase/functions/fn-buurt-discover/index.ts',
  'supabase/functions/fn-buurt-match/index.ts',
  'supabase/functions/fn-buurt-events-ingest/index.ts',

  'supabase/functions/fn-medication-ocr/index.ts',
  'supabase/functions/fn-document-analyse/index.ts',
  'supabase/functions/fn-family-message-send/index.ts',
  'supabase/functions/fn-consent-update/index.ts',
  'supabase/functions/fn-emergency-profile/index.ts',
  'supabase/functions/fn-transaction-intercept/index.ts',
  'supabase/functions/fn-right-to-erasure/index.ts',
  'supabase/functions/fn-health-log/index.ts',
  'supabase/functions/fn-telehealth-transport/index.ts',
  'supabase/functions/fn-feature-flags/index.ts',
  'supabase/functions/fn-screen-data/index.ts',

  'supabase/functions/fn-onboarding/index.ts',
  'supabase/functions/fn-storage-signed-url/index.ts',
  'supabase/functions/fn-daily-reminder-scheduler/index.ts',
  'supabase/functions/fn-care-visit-log/index.ts',
  'supabase/functions/fn-vital-threshold-check/index.ts',
  'supabase/functions/fn-life-story-process/index.ts',
  'supabase/functions/fn-notification-preferences/index.ts',
  'supabase/functions/fn-data-export/index.ts',

  'supabase/functions/fn-push-token-register/index.ts',
  'supabase/functions/fn-incident-report/index.ts',
  'supabase/functions/fn-release-check/index.ts',
  'supabase/functions/fn-compliance-register/index.ts',
  'supabase/functions/fn-breach-incident/index.ts',
  'supabase/functions/fn-care-plan/index.ts',
  'supabase/functions/fn-medication-refill/index.ts',
  'supabase/functions/fn-device-session/index.ts',
  'supabase/functions/fn-buurt-optout/index.ts',
  'supabase/functions/fn-audit-query/index.ts',

  'supabase/functions/fn-browser-shield/index.ts',
  'supabase/functions/fn-medmij-fhir-import/index.ts',
  'supabase/functions/fn-care-system-sync/index.ts',
  'supabase/functions/fn-grandchild-message-send/index.ts',
  'supabase/functions/fn-observability-alert/index.ts',
  'supabase/functions/fn-health-check/index.ts',

  'supabase/functions/fn-call-reputation/index.ts',
  'supabase/functions/fn-wearable-event/index.ts',
  'supabase/functions/fn-driving-event/index.ts',
  'supabase/functions/fn-community-events-ingest/index.ts',
  'supabase/functions/fn-skill-exchange/index.ts',
  'supabase/functions/fn-legacy-vault/index.ts',
  'supabase/functions/fn-bereavement-support/index.ts',
  'supabase/functions/fn-medication-catalog-sync/index.ts',
  'supabase/functions/fn-log-drain-config/index.ts',
  'supabase/functions/fn-slo-measure/index.ts',
  'supabase/functions/fn-fall-event/index.ts',
  'supabase/functions/fn-fall-escalation/index.ts',
  'supabase/functions/fn-wellness-checkin/index.ts',
  'supabase/functions/fn-scam-coaching/index.ts',
  'supabase/functions/fn-medication-interactions-check/index.ts',
  'supabase/functions/fn-medication-ocr-review/index.ts',
  'supabase/functions/fn-device-health-monitor/index.ts',
  'supabase/functions/fn-quiet-day-detector/index.ts',
  'supabase/functions/fn-daily-status-digest/index.ts',
  'supabase/functions/fn-pending-confirmation-respond/index.ts',
  'supabase/functions/fn-voice-profile-create/index.ts',
  'supabase/functions/fn-voice-profile-test/index.ts',
  'supabase/functions/fn-video-call-create/index.ts',
  'supabase/functions/fn-video-call-join-token/index.ts',
  'supabase/functions/fn-video-call-end/index.ts',
  'supabase/functions/fn-daily-checkin-scheduler/index.ts',
  'supabase/functions/fn-carer-handover-note/index.ts',
  'supabase/functions/fn-consent-pack-list/index.ts',
  'supabase/functions/fn-consent-pack-decide/index.ts',
  'supabase/functions/fn-voice-profile-revoke/index.ts',
];
for (const rel of required) {
  statSync(join(root, rel));
}
const html = readFileSync(join(root, 'apps/iphone-suite/index.html'), 'utf8');
const workflow = readFileSync(join(root, '.github/workflows/production-checks.yml'), 'utf8');
const supabaseWorkflow = readFileSync(join(root, '.github/workflows/supabase-integration.yml'), 'utf8');
const verifyCore = readFileSync(join(root, 'scripts/ci/verify-core.sh'), 'utf8');
const verifyBrowser = readFileSync(join(root, 'scripts/ci/verify-browser.sh'), 'utf8');
const verifyLocalSupabase = readFileSync(join(root, 'scripts/ci/verify-local-supabase.sh'), 'utf8');
const sql = readFileSync(join(root, 'supabase/migrations/20260611000001_haven_v121_production_schema.sql'), 'utf8');
const sql2 = readFileSync(join(root, 'supabase/migrations/20260611000002_storage_rpc_security.sql'), 'utf8');
const sql3 = readFileSync(join(root, 'supabase/migrations/20260611000003_full_feature_domain_tables.sql'), 'utf8');
const sql4 = readFileSync(join(root, 'supabase/migrations/20260611000004_production_automation_realtime.sql'), 'utf8');
const sql5 = readFileSync(join(root, 'supabase/migrations/20260611000005_compliance_care_release_ops.sql'), 'utf8');
const sql6 = readFileSync(join(root, 'supabase/migrations/20260611000006_integrations_observability_grandchild.sql'), 'utf8');
const sql7 = readFileSync(join(root, 'supabase/migrations/20260611000007_grandchild_unique_fix.sql'), 'utf8');
const sql8 = readFileSync(join(root, 'supabase/migrations/20260611000008_phase3_safety_community_legacy.sql'), 'utf8');
const sql9 = readFileSync(join(root, 'supabase/migrations/20260611000009_hardening_idempotency_integration_status.sql'), 'utf8');
const sql10 = readFileSync(join(root, 'supabase/migrations/20260613000010_edge_authz_hardening.sql'), 'utf8');
const sql11 = readFileSync(join(root, 'supabase/migrations/20260613000011_voice_interactions_self_write.sql'), 'utf8');
const sql12 = readFileSync(join(root, 'supabase/migrations/20260613000012_data_lifecycle_expansion.sql'), 'utf8');
const sql13 = readFileSync(join(root, 'supabase/migrations/20260614000000_vnext_wellrounded_patch.sql'), 'utf8');
const checks = [
  [new RegExp(['TO','DO'].join('') + '|' + ['FIX','ME'].join('') + '|' + String.fromCharCode(123,123), 'i'), 'unresolved build token'],
  [/create table profiles/i, 'profiles table'],
  [/alter table profiles force row level security/i, 'forced RLS'],
  [/create policy .*companion_memory/i, 'companion memory RLS'],
  [/create table neighbourhood_profiles/i, 'BUURT schema'],
  [/create table perf_metrics/i, 'observability metrics'],
  [/create table medication_ocr_jobs/i, 'medication OCR jobs'],
  [/create table document_analysis_jobs/i, 'document analysis jobs'],
  [/create table hydration_logs/i, 'hydration logs'],
  [/create table financial_accounts/i, 'financial accounts'],
  [/create table emergency_access_tokens/i, 'emergency access tokens'],
  [/create or replace function public.get_emergency_profile/i, 'emergency profile RPC'],
  [/create or replace function public.evaluate_feature_flag/i, 'feature flag RPC'],
  [/create or replace function public.custom_access_token_hook/i, 'auth custom claims hook'],
  [/create or replace function public.export_elder_data/i, 'data export RPC'],
  [/create table fall_events/i, 'fall_events table'],
  [/create table device_health_events/i, 'device_health_events table'],
  [/create table scam_coaching_sessions/i, 'scam_coaching_sessions table'],
  [/create table voice_profiles/i, 'voice_profiles table'],
  [/create table elder_voice_preferences/i, 'elder_voice_preferences table'],
  [/create table video_call_sessions/i, 'video_call_sessions table'],
  [/create table pending_confirmations/i, 'pending_confirmations table'],
  [/create table consent_packs/i, 'consent_packs table'],
  [/create table medication_interaction_alerts/i, 'medication_interaction_alerts table'],
  [/create table medication_ocr_reviews/i, 'medication_ocr_reviews table'],
  [/create table elder_baselines/i, 'elder_baselines table'],
  [/create table carer_handover_notes/i, 'carer_handover_notes table'],
  [/med_repeatback_confirmation_enabled/i, 'repeat-back confirmation flag'],
  [/familiar_voice_enabled/i, 'familiar voice flag'],
  [/fall_detection_enabled/i, 'fall detection flag'],
  [/daily_status_digest_enabled/i, 'daily status digest flag'],
  [/med_ocr_review_required/i, 'med ocr review required flag'],
  [/video_calling_enabled/i, 'video calling flag'],

  [/create table vendor_register/i, 'vendor register'],
  [/create table dpia_assessments/i, 'DPIA assessments'],
  [/create table care_plans/i, 'care plans'],
  [/create table medication_refill_events/i, 'medication refill events'],
  [/create table browser_shield_events/i, 'browser shield events'],
  [/create table fhir_import_jobs/i, 'FHIR import jobs'],
  [/create table grandchild_profiles/i, 'grandchild profiles'],
  [/create table slo_alerts/i, 'SLO alerts'],
  [/create table wearable_devices/i, 'wearable devices'],
  [/create table driving_events/i, 'driving events'],
  [/create table skill_offerings/i, 'skill exchange'],
  [/create table legacy_accounts/i, 'legacy accounts'],
  [/create table medication_catalog_entries/i, 'medication catalog entries'],
  [/create table log_drain_configs/i, 'log drain configs'],
];
for (const [rx, label] of checks) {
  if (label === 'unresolved build token') {
    if (rx.test(html) || rx.test(sql) || rx.test(sql2) || rx.test(sql3) || rx.test(sql4) || rx.test(sql5) || rx.test(sql6) || rx.test(sql7) || rx.test(sql8) || rx.test(sql9) || rx.test(sql10) || rx.test(sql11) || rx.test(sql12) || rx.test(sql13)) throw new Error(`Found ${label}`);
  } else if (!rx.test(sql + '\n' + sql2 + '\n' + sql3 + '\n' + sql4 + '\n' + sql5 + '\n' + sql6 + '\n' + sql7 + '\n' + sql8 + '\n' + sql9 + '\n' + sql10 + '\n' + sql11 + '\n' + sql12 + '\n' + sql13)) {
    throw new Error(`Missing ${label}`);
  }
}
const fnDir = join(root, 'supabase/functions');
const functions = readdirSync(fnDir).filter((name) => name.startsWith('fn-'));
if (functions.length < 55) throw new Error('Expected all Edge Function folders');
const matrix = JSON.parse(readFileSync(join(root, 'docs/implementation/FEATURE_IMPLEMENTATION_MATRIX.json'), 'utf8'));
const missingFeatures = matrix.features.filter((feature) => feature.status !== 'implemented');
if (missingFeatures.length) throw new Error(`Feature matrix has non-implemented features: ${missingFeatures.map((f) => f.key).join(', ')}`);
if (matrix.features.length < 17) throw new Error('Feature matrix is incomplete');
for (const rel of ['package.json', 'apps/elder/package.json', 'apps/family/package.json', 'apps/grandchild/package.json']) {
  const pkg = readFileSync(join(root, rel), 'utf8');
  if (pkg.includes('"latest"')) throw new Error(`Found non-reproducible latest dependency in ${rel}`);
}
if (!workflow.includes('./scripts/ci/verify-core.sh')) throw new Error('CI workflow is missing root core orchestration');
if (!workflow.includes('./scripts/ci/verify-browser.sh')) throw new Error('CI workflow is missing root browser orchestration');
if (!verifyCore.includes('git diff --exit-code')) throw new Error('verify-core.sh is missing clean-tree drift checks');
if (!verifyCore.includes('corepack pnpm run quality:check')) throw new Error('verify-core.sh should run the combined quality gate');
if (!verifyBrowser.includes('tests/e2e/vnext-flows.test.mjs')) throw new Error('verify-browser.sh should run static node tests');
if (!verifyLocalSupabase.includes('HAVEN_LIVE_RLS=1 corepack pnpm run test:integration:live')) throw new Error('verify-local-supabase.sh is missing live RLS execution');
if (!supabaseWorkflow.includes('./scripts/ci/verify-local-supabase.sh')) throw new Error('Supabase workflow is missing local reset orchestration');
if (!supabaseWorkflow.includes('HAVEN_LIVE_RLS=1 corepack pnpm run test:integration:live')) throw new Error('Supabase workflow is missing live RLS coverage');
if (!supabaseWorkflow.includes('workflow_dispatch')) throw new Error('Supabase workflow should support manual dispatch');
console.log(JSON.stringify({ ok: true, app: 'apps/iphone-suite/index.html', edgeFunctions: functions.length, schemaBytes: sql.length + sql2.length + sql3.length + sql4.length + sql5.length + sql6.length + sql7.length + sql8.length + sql9.length + sql10.length + sql11.length + (sql12 + sql13).length }, null, 2));
