// Executable RLS coverage audit (replaces the substring grep in tests/rls/*).
//
// The old audit asserted that certain strings appear in 11 of 41 migration files.
// It could not fail when a NEW table shipped without row level security, which is
// exactly how 12 tables ended up exposed in the first place.
//
// This suite therefore tests the auditor itself — including negative cases — so a
// future refactor cannot quietly turn it back into a no-op.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditRlsCoverage,
  SERVICE_ROLE_ONLY,
} from '../../scripts/ci/audit-rls-coverage.mjs';

const repoMigrations = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'haven-rls-'));
  mkdirSync(dir, { recursive: true });
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

test('every table created in supabase/migrations is RLS protected and has a documented posture', () => {
  const report = auditRlsCoverage({ migrationsDir: repoMigrations });

  assert.deepEqual(report.violations, [], `RLS violations:\n${report.violations.map((v) => `- [${v.rule}] ${v.message}`).join('\n')}`);
  assert.ok(report.tables >= 100, `expected >= 100 owned tables, saw ${report.tables}`);
  assert.equal(report.protected, report.tables, 'every table must have RLS enabled AND forced');
  assert.ok(report.serviceRoleOnly >= 10, 'service-role-only postures must be documented, not implicit');
});

test('the 12 tables from the October 2026 finding all have an explicit posture', () => {
  // Regression guard for the specific exposure this migration closed.
  const previouslyUnprotected = [
    'clinical_record_corrections',
    'consent_packs',
    'device_telemetry_nonces',
    'domain_reputation_cache',
    'dpo_pii_incident_review',
    'fhir_medication_staging',
    'gdpr_pii_fields',
    'location_events_partitioned',
    'phone_reputation_cache',
    'profiles_snapshot',
    'psd2_webhook_ingress_buffer',
    'security_violations',
  ];

  const report = auditRlsCoverage({ migrationsDir: repoMigrations });
  const failed = new Set(report.violations.map((v) => v.table));

  for (const table of previouslyUnprotected) {
    assert.ok(!failed.has(table), `${table} regressed into an unprotected posture`);
  }

  // Each one is either a documented service-role-only table or carries policies.
  const documented = previouslyUnprotected.filter((t) => Object.hasOwn(SERVICE_ROLE_ONLY, t));
  assert.ok(documented.length >= 8, 'service-role-only decisions must stay documented next to the audit');
});

test('negative case: a table created without RLS is reported', () => {
  const dir = fixture({
    '20260101000000_bad.sql': 'create table public.leaky (id uuid primary key, elder_id uuid not null);',
  });
  const report = auditRlsCoverage({ migrationsDir: dir, serviceRoleOnly: {}, requiredPolicyTables: [] });
  assert.equal(report.ok, false);
  assert.ok(report.violations.some((v) => v.rule === 'missing-enable-rls' && v.table === 'leaky'));
});

test('negative case: RLS enabled but not forced is reported', () => {
  const dir = fixture({
    '20260101000000_bad.sql': [
      'create table public.half (id uuid primary key);',
      'alter table public.half enable row level security;',
      'create policy half_read on public.half for select using (true);',
    ].join('\n'),
  });
  const report = auditRlsCoverage({ migrationsDir: dir, serviceRoleOnly: {}, requiredPolicyTables: [] });
  assert.ok(report.violations.some((v) => v.rule === 'missing-force-rls' && v.table === 'half'));
});

test('negative case: RLS without policies and without a documented exemption is reported', () => {
  const dir = fixture({
    '20260101000000_bad.sql': [
      'create table public.silent (id uuid primary key);',
      'alter table public.silent enable row level security;',
      'alter table public.silent force row level security;',
    ].join('\n'),
  });
  const report = auditRlsCoverage({ migrationsDir: dir, serviceRoleOnly: {}, requiredPolicyTables: [] });
  assert.ok(report.violations.some((v) => v.rule === 'missing-policy' && v.table === 'silent'));
});

test('negative case: an undocumented service-role-only table must have anon privileges revoked', () => {
  const withRevoke = fixture({
    '20260101000000_ok.sql': [
      'create table public.secret (id uuid primary key);',
      'alter table public.secret enable row level security;',
      'alter table public.secret force row level security;',
      'revoke all on public.secret from anon, authenticated;',
    ].join('\n'),
  });
  const okReport = auditRlsCoverage({
    migrationsDir: withRevoke,
    serviceRoleOnly: { secret: 'internal only' },
    requiredPolicyTables: [],
  });
  assert.deepEqual(okReport.violations, []);

  const withoutRevoke = fixture({
    '20260101000000_bad.sql': [
      'create table public.secret2 (id uuid primary key);',
      'alter table public.secret2 enable row level security;',
      'alter table public.secret2 force row level security;',
    ].join('\n'),
  });
  const badReport = auditRlsCoverage({
    migrationsDir: withoutRevoke,
    serviceRoleOnly: { secret2: 'internal only' },
    requiredPolicyTables: [],
  });
  assert.ok(badReport.violations.some((v) => v.rule === 'service-role-only-not-revoked'));
});

test('negative case: stale exemptions are reported so the allowlist cannot rot', () => {
  const dir = fixture({
    '20260101000000_ok.sql': [
      'create table public.real (id uuid primary key);',
      'alter table public.real enable row level security;',
      'alter table public.real force row level security;',
      'revoke all on public.real from anon;',
    ].join('\n'),
  });
  const report = auditRlsCoverage({
    migrationsDir: dir,
    serviceRoleOnly: { real: 'ok', ghost_table: 'was renamed in 2024' },
    requiredPolicyTables: [],
  });
  assert.ok(report.violations.some((v) => v.rule === 'stale-exemption' && v.table === 'ghost_table'));
});

test('dynamic partition creation cannot masquerade as a table definition', () => {
  // `create table if not exists %I partition of …` inside plpgsql must not be
  // parsed as a table called "if".
  const dir = fixture({
    '20260101000000_dyn.sql': [
      'create table public.parent (id uuid primary key, created_at timestamptz not null);',
      'alter table public.parent enable row level security;',
      'alter table public.parent force row level security;',
      'create policy parent_read on public.parent for select using (true);',
      'do $$ begin execute format(\'create table if not exists %I partition of parent for values from (1) to (2)\', \'p1\'); end $$;',
    ].join('\n'),
  });
  const report = auditRlsCoverage({ migrationsDir: dir, serviceRoleOnly: {}, requiredPolicyTables: [] });
  assert.ok(!report.violations.some((v) => v.table === 'if'), 'dynamic partition DDL must not create a phantom "if" table');
});
