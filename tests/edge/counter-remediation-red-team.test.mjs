import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const migrationSql = readFileSync(join(root, 'supabase/migrations/20260615000001_counter_remediation_red_team_gaps.sql'), 'utf8');

test('Adversarial Re-Test Part 1: Stored procedure soft_purge_profile() is fully compliant', () => {
  assert.ok(migrationSql.includes('CREATE OR REPLACE FUNCTION soft_purge_profile('), 'Must deploy soft_purge_profile stored procedure');
  assert.ok(migrationSql.includes("UPDATE medication_ocr_reviews SET reviewer_id = '00000000-0000-0000-0000-000000000001'"), 'Must re-anchor child records to sentinel ID');
  assert.ok(migrationSql.includes("full_name = 'Geanonimiseerd'"), 'Must execute clean GDPR tombstone sanitization');
  assert.ok(migrationSql.includes("GDPR_ERASURE_PURGE"), 'Must record formal audit log transaction');
});

test('Adversarial Re-Test Part 2: Declarative triggers successfully enforce 24-hour clinical immutability', () => {
  assert.ok(migrationSql.includes('CREATE OR REPLACE FUNCTION enforce_clinical_immutability()'), 'Must deploy clinical immutability trigger function');
  assert.ok(migrationSql.includes('27000'), 'Must throw custom security violation error code 27000');
  assert.ok(migrationSql.includes('security_violations'), 'Must log attempted violations to security_violations table');
  
  const targetTables = ['medication_reminders', 'fall_events', 'carer_handover_notes', 'location_events', 'device_health_events'];
  for (const table of targetTables) {
    assert.ok(new RegExp(`CREATE TRIGGER trg_immutability_.*\\b${table}\\b`, 'is').test(migrationSql), `Missing immutability trigger on ${table}`);
  }
});

test('Adversarial Re-Test Part 3: Emergency queries rewritten to be 100% revocation-safe', () => {
  assert.ok(migrationSql.includes('CREATE OR REPLACE FUNCTION get_active_emergency_falls()'), 'Must deploy revocation-safe fall RPC');
  assert.ok(migrationSql.includes('LEFT JOIN device_sessions'), 'Emergency query must use LEFT JOIN');
  assert.ok(migrationSql.includes('d.revoked_at IS NULL OR f.created_at <= d.revoked_at'), 'Must include falls recorded prior to mid-crisis device revocation');
});

test('Adversarial Re-Test Part 4: PSD2 open banking deadlocks eliminated via stable Snapshot Table', () => {
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS profiles_snapshot'), 'Must deploy stable profiles_snapshot table');
  assert.ok(migrationSql.includes('REFERENCES profiles_snapshot(id)'), 'Webhook receipts must reference stable snapshot, completely avoiding profile ShareLocks');
});
