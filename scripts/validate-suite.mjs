import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const required = [
  'apps/iphone-suite/index.html',
  'supabase/migrations/20260611000001_haven_v121_production_schema.sql',
  'supabase/migrations/20260611000002_storage_rpc_security.sql',
  'supabase/migrations/20260611000003_full_feature_domain_tables.sql',
  'supabase/migrations/20260611000004_production_automation_realtime.sql',
  'supabase/migrations/20260611000005_compliance_care_release_ops.sql',
  'supabase/migrations/20260611000006_integrations_observability_grandchild.sql',
  'supabase/migrations/20260611000007_grandchild_unique_fix.sql',
  'supabase/migrations/20260611000008_phase3_safety_community_legacy.sql',
  'supabase/seed.sql',
  'supabase/config.toml',
  'apps/family-dashboard/index.html',
  'apps/admin-console/index.html',
  'apps/carer-portal/index.html',
  'apps/browser-shield/manifest.json',
  'apps/browser-shield/src/content.js',
  'apps/browser-shield/src/background.js',
  'apps/elder/App.tsx',
  'apps/elder/src/services/havenClient.ts',
  'apps/elder/src/auth/AuthProvider.tsx',
  'apps/elder/src/navigation/AppNavigator.tsx',
  'apps/elder/src/renderer/ScreenRenderer.tsx',
  'apps/elder/src/screens/ElderScreen.tsx',
  'apps/elder/src/hooks/useHavenActions.ts',
  'apps/elder/src/services/sqliteOfflineQueue.ts',
  'apps/elder/src/services/voiceRecorder.ts',
  'apps/elder/src/services/documentCamera.ts',
  'apps/elder/src/services/pushRegistration.ts',
  'apps/elder/src/schema/screens.ts',
  'apps/family/src/services/dashboard.ts',
  'apps/grandchild/App.tsx',
  'apps/grandchild/src/client.ts',
  'packages/contracts/src/haven.ts',
  'packages/i18n/src/copy.ts',
  'packages/scam-engine/src/rules.ts',
  'packages/ui/src/tokens.ts',
  'packages/ui/src/components.ts',
  'packages/schema/src/screenSchema.ts',
  'packages/schema/src/validator.ts',
  'packages/database/src/types.ts',
  'packages/database/src/client.ts',
  'supabase/functions/_shared/validation.ts',
  'supabase/functions/_shared/authz.ts',
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
  'docs/release/ACCESSIBILITY_AUDIT_PROTOCOL.md',
  'docs/release/PENTEST_SCOPE.md',
  'docs/release/ELDER_USABILITY_PROTOCOL.md',
  'docs/release/COPY_REVIEW.md',
  'scripts/check-local-supabase.sh',
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
];
for (const rel of required) {
  statSync(join(root, rel));
}
const html = readFileSync(join(root, 'apps/iphone-suite/index.html'), 'utf8');
const sql = readFileSync(join(root, 'supabase/migrations/20260611000001_haven_v121_production_schema.sql'), 'utf8');
const sql2 = readFileSync(join(root, 'supabase/migrations/20260611000002_storage_rpc_security.sql'), 'utf8');
const sql3 = readFileSync(join(root, 'supabase/migrations/20260611000003_full_feature_domain_tables.sql'), 'utf8');
const sql4 = readFileSync(join(root, 'supabase/migrations/20260611000004_production_automation_realtime.sql'), 'utf8');
const sql5 = readFileSync(join(root, 'supabase/migrations/20260611000005_compliance_care_release_ops.sql'), 'utf8');
const sql6 = readFileSync(join(root, 'supabase/migrations/20260611000006_integrations_observability_grandchild.sql'), 'utf8');
const sql7 = readFileSync(join(root, 'supabase/migrations/20260611000007_grandchild_unique_fix.sql'), 'utf8');
const sql8 = readFileSync(join(root, 'supabase/migrations/20260611000008_phase3_safety_community_legacy.sql'), 'utf8');
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
    if (rx.test(html) || rx.test(sql) || rx.test(sql2) || rx.test(sql3) || rx.test(sql4) || rx.test(sql5) || rx.test(sql6) || rx.test(sql7) || rx.test(sql8)) throw new Error(`Found ${label}`);
  } else if (!rx.test(sql + '\n' + sql2 + '\n' + sql3 + '\n' + sql4 + '\n' + sql5 + '\n' + sql6 + '\n' + sql7 + '\n' + sql8)) {
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
console.log(JSON.stringify({ ok: true, app: 'apps/iphone-suite/index.html', edgeFunctions: functions.length, schemaBytes: sql.length + sql2.length + sql3.length + sql4.length + sql5.length + sql6.length + sql7.length + sql8.length }, null, 2));
