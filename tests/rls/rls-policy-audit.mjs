import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrations = [
  '../../supabase/migrations/20260611000001_haven_v121_production_schema.sql',
  '../../supabase/migrations/20260611000002_storage_rpc_security.sql',
  '../../supabase/migrations/20260611000003_full_feature_domain_tables.sql',
  '../../supabase/migrations/20260611000004_production_automation_realtime.sql',
  '../../supabase/migrations/20260611000005_compliance_care_release_ops.sql',
  '../../supabase/migrations/20260611000006_integrations_observability_grandchild.sql',
  '../../supabase/migrations/20260611000007_grandchild_unique_fix.sql',
  '../../supabase/migrations/20260611000008_phase3_safety_community_legacy.sql',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

for (const table of ['profiles', 'medications', 'scam_events', 'location_events', 'companion_memory', 'neighbourhood_profiles', 'carer_visit_logs', 'care_plans', 'vendor_register', 'browser_shield_events', 'grandchild_profiles', 'wearable_devices', 'driving_events', 'legacy_accounts']) {
  assert.ok(migrations.includes(`alter table ${table} enable row level security`), `${table} should enable RLS`);
  assert.ok(migrations.includes(`alter table ${table} force row level security`), `${table} should force RLS`);
}
assert.ok(migrations.includes('revoke select (location_precise)'), 'precise location column should be revoked');
assert.ok(migrations.includes('document_vault_elder_only'), 'document vault storage policy exists');
console.log('rls-policy audit passed');
