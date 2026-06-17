import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const allSql = [
  '../../supabase/migrations/20260611000001_haven_v121_production_schema.sql',
  '../../supabase/migrations/20260611000002_storage_rpc_security.sql',
  '../../supabase/migrations/20260611000003_full_feature_domain_tables.sql',
  '../../supabase/migrations/20260611000004_production_automation_realtime.sql',
  '../../supabase/migrations/20260611000005_compliance_care_release_ops.sql',
  '../../supabase/migrations/20260611000006_integrations_observability_grandchild.sql',
  '../../supabase/migrations/20260611000007_grandchild_unique_fix.sql',
  '../../supabase/migrations/20260611000008_phase3_safety_community_legacy.sql',
  '../../supabase/migrations/20260611000009_hardening_idempotency_integration_status.sql',
  '../../supabase/migrations/20260613000010_edge_authz_hardening.sql',
  '../../supabase/migrations/20260613000011_voice_interactions_self_write.sql',
  '../../supabase/migrations/20260613000012_data_lifecycle_expansion.sql',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

const exportSql = readFileSync(new URL('../../supabase/migrations/20260613000012_data_lifecycle_expansion.sql', import.meta.url), 'utf8');
const erasureCode = readFileSync(new URL('../../supabase/functions/fn-right-to-erasure/index.ts', import.meta.url), 'utf8');
const storageSql = readFileSync(new URL('../../supabase/migrations/20260611000002_storage_rpc_security.sql', import.meta.url), 'utf8');
const storageAudit = readFileSync(new URL('../../docs/implementation/STORAGE_BLOB_LIFECYCLE_AUDIT.md', import.meta.url), 'utf8');

const linkedTables = new Set();
for (const match of allSql.matchAll(/create table\s+(\w+)\s*\((.*?)\n\);/gis)) {
  const table = match[1];
  const body = match[2];
  const columns = body
    .split('\n')
    .map((line) => line.trim().replace(/,$/, ''))
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0]);
  if (['neighbourhood_connections'].includes(table) || columns.some((col) => ['elder_id', 'profile_id', 'family_member_id', 'carer_member_id'].includes(col))) {
    linkedTables.add(table);
  }
}

const exportedTables = new Set([...exportSql.matchAll(/from\s+(\w+)\s+\w+/g)].map((m) => m[1]));
const erasureTables = new Set([...erasureCode.matchAll(/from\("(\w+)"\)/g)].map((m) => m[1]));
for (const blockName of ['softDeleteTables', 'SOFT_DELETE_TABLES', 'DIRECT_DELETE_TABLES']) {
  const block = erasureCode.match(new RegExp(`const ${blockName} = \\[(.*?)\\];`, 's'))?.[1] ?? '';
  for (const match of block.matchAll(/"(\w+)"/g)) erasureTables.add(match[1]);
}
const exportExcluded = new Set(['idempotency_keys']);
const erasureExcluded = new Set(['audit_log', 'deletion_requests', 'carer_visit_logs', 'incidents', 'medication_reminders', 'medications', 'vital_signs', 'fall_events']);

const missingExport = [...linkedTables].filter((table) => !exportExcluded.has(table) && !exportedTables.has(table)).sort();
const missingErasure = [...linkedTables].filter((table) => !erasureExcluded.has(table) && !erasureTables.has(table)).sort();

assert.deepEqual(missingExport, [], `Export coverage missing linked tables: ${missingExport.join(', ')}`);
assert.deepEqual(missingErasure, [], `Erasure coverage missing linked tables: ${missingErasure.join(', ')}`);

const expectedBuckets = ['voice-notes', 'life-story-audio', 'life-story-photos', 'profile-photos', 'document-vault', 'ocr-inbox', 'tts-cache'];
for (const bucket of expectedBuckets) {
  assert.ok(storageSql.includes(`('${bucket}', '${bucket}'`), `storage migration should define bucket ${bucket}`);
  assert.ok(storageAudit.includes(`\`${bucket}\``), `storage audit should document bucket ${bucket}`);
  assert.ok(erasureCode.includes(`"${bucket}"`), `right-to-erasure should clean bucket ${bucket}`);
}

assert.ok(storageAudit.includes('legacy_secret_store_cleanup_required: true'), 'storage audit should document the legacy secret-store cleanup gap');
console.log('data lifecycle diff audit passed');
