// GDPR / clinical-immutability contract, asserted against the schema model.
//
// What this file replaced
// ───────────────────────
// `clinical-immutability-closure`, `counter-remediation-red-team`,
// `gdpr-soft-purge`, `database-retention-r5-closure` and parts of
// `pre-pentest-round3/5` asserted migration *text*:
//
//     assert.ok(migrationSql.includes('CREATE OR REPLACE FUNCTION soft_purge_profile('));
//     assert.ok(migrationSql.includes('27000'));
//
// Any of those could be satisfied by a comment or by a superseded statement in the
// wrong migration, and they broke on reformatting. `tests/edge/support/sql-model.mjs`
// parses every migration into statements and builds the resulting schema, so these
// assertions are about functions, triggers and rules that exist — with their
// security attributes and bodies — rather than about characters in a file.
//
// No live database: this proves the DDL says what it must. Execution is covered by
// scripts/ci/verify-sql.sh (syntax) and the `database` job in ci.yml.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildModel } from './support/sql-model.mjs';

const model = buildModel();

const CLINICAL_TABLES = [
  'medication_reminders',
  'fall_events',
  'carer_handover_notes',
  'location_events',
  'device_health_events',
];

test('the audit log rejects UPDATE and DELETE at the database, not in application code', () => {
  const events = model.rulesFor('audit_log').map((rule) => rule.event).sort();
  assert.deepEqual(events, ['DELETE', 'UPDATE'], 'audit_log must be append-only');

  for (const rule of model.rulesFor('audit_log')) {
    assert.equal(rule.body.toUpperCase().includes('DO INSTEAD NOTHING'), true,
      `${rule.name} must be DO INSTEAD NOTHING: ${rule.body}`);
  }

  // TRUNCATE would bypass the rules entirely, so it must be revoked from everyone.
  const truncateRevokes = (model.table('audit_log')?.revokes ?? [])
    .filter((entry) => entry.privileges.includes('TRUNCATE'))
    .flatMap((entry) => entry.roles);
  for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
    assert.ok(truncateRevokes.includes(role), `TRUNCATE must be revoked from ${role}`);
  }
});

test('clinical tables are append-only by trigger', () => {
  for (const tableName of CLINICAL_TABLES) {
    const trigger = model.triggersFor(tableName)
      .find((t) => t.name.startsWith('trg_immutability') || t.name.includes('immutab'));
    assert.ok(trigger, `${tableName} has no immutability trigger`);
  }

  const fn = model.fn('enforce_clinical_immutability');
  assert.ok(fn, 'enforce_clinical_immutability() must exist');
  assert.match(fn.body, /27000/, 'violations must raise SQLSTATE 27000');
  assert.match(fn.body, /security_violations/, 'violations must be recorded');
});

test('clinical corrections are append-only overlays, never rewrites', () => {
  const view = model.view('effective_carer_handover_notes');
  assert.ok(view, 'the effective-state view must exist');
  assert.match(view.definition, /COALESCE/i, 'the view must prefer a correction when present');
  assert.match(view.definition, /corrected_payload/, 'corrections must be read from the ledger');
  assert.ok(model.table('clinical_record_corrections'), 'corrections need their own table');
});

test('soft purge tombstones the profile in place and never deletes it', () => {
  const fn = model.fn('soft_purge_profile');
  assert.ok(fn, 'soft_purge_profile() must exist');
  assert.equal(fn.securityDefiner, true, 'erasure must run with definer rights');
  assert.ok(fn.searchPath, 'definer functions must pin search_path');

  // Migration 20260620000002 supersedes the original body. The profile row is kept
  // (so foreign keys from ~30 child tables stay valid) and overwritten in place.
  assert.match(fn.body, /UPDATE (?:public\.)?profiles\b/i, 'the profile row must be updated, not deleted');
  assert.match(fn.body, /ERASED/i, 'the profile must be tombstoned with an erasure marker');
  assert.equal(/DELETE\s+FROM\s+(?:public\.)?profiles\b/i.test(fn.body), false,
    'deleting the profile would cascade-destroy the medical record');
  assert.match(fn.body, /GDPR_ERASURE_PURGE/, 'the erasure must be audited');
  assert.match(fn.body, /INSERT INTO (?:public\.)?audit_log/i,
    'the audit receipt must be written, not just named in a literal');
  assert.match(fn.body, /FOR UPDATE/, 'concurrent erasures must serialise');
  assert.match(fn.body, /device_sessions\s+SET\s+revoked_at/, 'erasure must cut live sessions');

  // Every table the erasure touches must exist. A typo here only surfaces during a
  // GDPR request, i.e. at the worst possible moment — this is the check that catches it.
  const touched = [...new Set([...fn.body.matchAll(/UPDATE\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)]
    .map((m) => m[1].toLowerCase()))];
  assert.ok(touched.length >= 8, `expected the erasure to touch many tables, saw ${touched.join(', ')}`);
  for (const tableName of touched) {
    assert.ok(model.table(tableName), `soft_purge_profile() references missing table ${tableName}`);
  }
});

test('deep-text redaction and the 11-proef helper exist as database functions', () => {
  assert.ok(model.fn('redact_sensitive_text'), 'redact_sensitive_text() must exist');
  const bsn = model.fn('is_valid_dutch_bsn');
  assert.ok(bsn, 'is_valid_dutch_bsn() must exist');
  assert.ok(model.table('gdpr_pii_fields'), 'PII fields must be registered');

  // The BSN helper must be the modulo-11 test, not a length check.
  assert.match(bsn.body, /% 11|MOD 11/i, 'the BSN check must use the 11-proef');
});

test('the retention sweeper covers the regulated tables and is bounded', () => {
  const sweeper = model.fn('execute_haven_database_retention_sweeps');
  assert.ok(sweeper, 'the canonical retention sweeper must exist');
  const purged = [...new Set([...sweeper.body.matchAll(/DELETE FROM\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase()))];
  for (const tableName of ['perf_metrics', 'voice_interactions', 'audit_log', 'webhook_receipts', 'notifications']) {
    assert.ok(purged.includes(tableName), `the sweeper must purge ${tableName}`);
  }
  // A mistyped table name here means that data is never purged, silently.
  for (const tableName of purged) {
    assert.ok(model.table(tableName), `the sweeper deletes from missing table ${tableName}`);
  }
  assert.equal(sweeper.statementTimeout, '120s',
    'the nightly sweep must be bounded so it cannot hold locks indefinitely');
  assert.match(sweeper.body, /INTERVAL '\d+ (DAY|MONTH|YEAR)/i, 'retention windows must be explicit');
});

test('the emergency fall RPC survives a device revoked mid-crisis', () => {
  const fn = model.fn('get_active_emergency_falls');
  assert.ok(fn, 'get_active_emergency_falls() must exist');
  assert.match(fn.body, /LEFT JOIN device_sessions/i, 'a missing device must not hide a fall');
  assert.match(fn.body, /revoked_at/i, 'the query must reason about revocation');

  const index = model.indexesFor('fall_events').find((i) => i.name === 'idx_fall_events_active_emergency');
  assert.ok(index, 'the emergency query needs its partial index');
  assert.match(index.predicate ?? '', /status = 'possible'/, `unexpected index predicate: ${index.predicate}`);
});

test('webhook receipts reference a stable snapshot, not the mutable profile row', () => {
  assert.ok(model.table('profiles_snapshot'), 'profiles_snapshot must exist');
  assert.ok(model.table('webhook_receipts'), 'webhook_receipts must exist');
  const snapshotFks = model.references('webhook_receipts').filter((fk) => fk.references === 'profiles_snapshot');
  assert.ok(snapshotFks.length > 0, 'webhook_receipts must reference the snapshot to avoid profile ShareLocks');
  assert.equal(model.references('webhook_receipts').some((fk) => fk.references === 'profiles'),
    false, 'no receipt column may reference the mutable profiles row');

  assert.ok(model.columns('medication_ocr_reviews').includes('reviewer_snapshot_id'),
    'OCR reviews must point at the snapshot');
  assert.ok(model.columns('medication_interaction_alerts').includes('dismissed_snapshot_id'),
    'interaction alerts must point at the snapshot');
});

test('erased profiles are hidden from runtime policies', () => {
  const profiles = model.table('profiles');
  assert.ok(profiles, 'profiles must exist');
  assert.ok(profiles.columns.some((c) => c.name === 'status'), 'profiles.status must exist');
  assert.match(profiles.columns.find((c) => c.name === 'status').raw, /'erased'/, 'status must allow an erased state');

  const policies = model.policiesFor('profiles', 'SELECT');
  assert.ok(policies.length > 0, 'profiles must have SELECT policies');
  assert.ok(policies.some((p) => /status/.test(p.using ?? '')), 'at least one policy must filter on status');
});

test('every table in the schema has row level security', () => {
  const { total, missing } = model.rlsCoverage();
  assert.ok(total > 100, `expected the full schema, saw ${total} tables`);
  // The documented service-role-only exceptions are still tables without policies,
  // but RLS itself must be switched on for every one of them.
  assert.deepEqual(missing, [], `tables without RLS: ${missing.join(', ')}`);
});
