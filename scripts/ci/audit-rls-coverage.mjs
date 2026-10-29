#!/usr/bin/env node
/**
 * RLS coverage auditor.
 *
 * Replaces the previous substring-grep audit (`tests/rls/rls-policy-audit.mjs`),
 * which could not fail when a new table shipped without row level security.
 *
 * What it enforces, per table created in the migrations:
 *   1. `alter table <t> enable row level security` must exist      (hard fail)
 *   2. `alter table <t> force row level security` must exist       (hard fail)
 *   3. The table must have at least one `create policy` OR be listed
 *      in SERVICE_ROLE_ONLY below with a written reason            (hard fail)
 *   4. `anon` must not retain table privileges on a table that has
 *      no policies (defence in depth)                              (hard fail)
 *
 * Service-role-only is a deliberate, reviewable posture: RLS enabled, zero
 * policies, and privileges revoked from anon/authenticated. Every entry needs a
 * reason so the exception can never be inherited by accident.
 *
 * Usage:
 *   node scripts/ci/audit-rls-coverage.mjs [--migrations <dir>] [--json] [--quiet]
 *
 * Exported: auditRlsCoverage({ migrationsDir }) -> report
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tables that are intentionally reachable only with the service-role key.
 * Keep alphabetical. A reason is mandatory.
 */
export const SERVICE_ROLE_ONLY = {
  clinical_record_corrections: 'Append-only clinical ledger read via effective_carer_handover_notes view; admin-only direct access.',
  device_telemetry_nonces: 'Replay-defence ledger: client-writable nonces would defeat device telemetry attestation.',
  dpo_pii_incident_review: 'DPO forensics; admin select only.',
  domain_reputation_cache: 'Scam-detection input: client tampering would whitelist phishing domains.',
  fhir_medication_staging: 'Clinical staging rows; read policies exist, writes are service-role only.',
  gdpr_pii_fields: 'Erasure registry: writable by a client role would silently disable redaction.',
  perf_metrics: 'SLO/telemetry ledger written with the service-role key; no client reads.',
  phone_reputation_cache: 'Scam-detection input: client tampering would whitelist scam numbers.',
  profiles_snapshot: 'Internal FK anchor for historical accountability; no client reads needed.',
  psd2_webhook_ingress_buffer: 'Raw bank payload buffer; never exposed to clients.',
  rate_limit_counters: 'Rate-limit state; written only by consume_rate_limit() as the definer.',
};

/** Tables that legitimately have policies and are therefore not in the map above. */
const REQUIRED_POLICY_TABLES = [
  'consent_packs',
  'location_events_partitioned',
  'security_violations',
];

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

function normaliseIdentifier(raw) {
  return raw
    .trim()
    .replace(/"/g, '')
    .split('.')
    .pop()
    .toLowerCase();
}

const IDENT = String.raw`(?:"?[a-zA-Z_][a-zA-Z0-9_]*"?\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?`;

export function readMigrations(migrationsDir) {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: stripSqlComments(readFileSync(join(migrationsDir, name), 'utf8')) }));
}

/**
 * Default migration directory. Exported so callers (e.g. the legacy
 * tests/rls/rls-policy-audit.mjs entry point) do not have to hardcode a relative path.
 */
export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

export function auditRlsCoverage({
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  // Overridable so tests can simulate postures without editing the repo.
  serviceRoleOnly = SERVICE_ROLE_ONLY,
  requiredPolicyTables = REQUIRED_POLICY_TABLES,
} = {}) {
  const files = readMigrations(migrationsDir);
  const tables = new Map();

  const ensure = (name) => {
    if (!tables.has(name)) {
      tables.set(name, { table: name, created: [], rlsEnabled: [], rlsForced: [], policies: [], revokedFromAnon: [] });
    }
    return tables.get(name);
  };

  for (const { name: file, sql } of files) {
    for (const m of sql.matchAll(new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${IDENT}\s*\(`, 'gi'))) {
      ensure(normaliseIdentifier(m[1])).created.push(file);
    }
    for (const m of sql.matchAll(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}\s+enable\s+row\s+level\s+security`, 'gi'))) {
      ensure(normaliseIdentifier(m[1])).rlsEnabled.push(file);
    }
    for (const m of sql.matchAll(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}\s+force\s+row\s+level\s+security`, 'gi'))) {
      ensure(normaliseIdentifier(m[1])).rlsForced.push(file);
    }
    for (const m of sql.matchAll(new RegExp(String.raw`create\s+policy\s+"?[a-zA-Z0-9_]+"?\s+on\s+${IDENT}`, 'gi'))) {
      ensure(normaliseIdentifier(m[1])).policies.push(file);
    }
    for (const m of sql.matchAll(new RegExp(String.raw`revoke\s+[a-z,\s]+on\s+(?:table\s+)?${IDENT}\s+from[^;]*\banon\b`, 'gi'))) {
      ensure(normaliseIdentifier(m[1])).revokedFromAnon.push(file);
    }
  }

  // Dynamic partition children (location_events_p_*) are created at runtime by
  // execute_postgis_partition_retention(); they cannot appear in migrations.
  for (const key of [...tables.keys()]) {
    if (/^location_events_p_/.test(key)) tables.delete(key);
  }

  const violations = [];
  let serviceRoleOnlyCount = 0;

  for (const table of tables.values()) {
    const name = table.table;
    // Tables owned outside the migrations (storage.objects, auth.users, …) only
    // receive policies here; their DDL is Supabase's, so they are out of scope.
    if (table.created.length === 0) continue;
    const exempt = Object.hasOwn(serviceRoleOnly, name);
    const needsPolicy = requiredPolicyTables.includes(name);

    if (table.rlsEnabled.length === 0) {
      violations.push({
        table: name,
        rule: 'missing-enable-rls',
        message: `${name} is created (${table.created[0]}) but never gets "enable row level security"`,
      });
      continue;
    }
    if (table.rlsForced.length === 0) {
      violations.push({
        table: name,
        rule: 'missing-force-rls',
        message: `${name} enables RLS but never forces it, so the table owner bypasses every policy`,
      });
    }
    if (table.policies.length === 0 && !exempt) {
      violations.push({
        table: name,
        rule: 'missing-policy',
        message: `${name} has RLS but no policies and is not in SERVICE_ROLE_ONLY (add a policy or document the exemption)`,
      });
    }
    if (needsPolicy && table.policies.length === 0) {
      violations.push({
        table: name,
        rule: 'expected-policy-missing',
        message: `${name} is a consent-scoped table and must have at least one policy`,
      });
    }
    if (exempt && table.revokedFromAnon.length === 0 && table.policies.length === 0) {
      violations.push({
        table: name,
        rule: 'service-role-only-not-revoked',
        message: `${name} is service-role-only but "anon" privileges were never revoked`,
      });
    }
    if (exempt) serviceRoleOnlyCount += 1;
  }

  // Detect stale exemptions: a table listed as service-role-only that no longer
  // exists (renamed/dropped) should be cleaned up rather than silently rot.
  for (const name of Object.keys(serviceRoleOnly)) {
    if (!tables.has(name)) {
      violations.push({
        table: name,
        rule: 'stale-exemption',
        message: `${name} is listed in SERVICE_ROLE_ONLY but no migration creates it`,
      });
    }
  }

  const owned = [...tables.values()].filter((t) => t.created.length > 0);
  const total = owned.length;
  const protectedTables = owned.filter((t) => t.rlsEnabled.length && t.rlsForced.length).length;

  return {
    ok: violations.length === 0,
    migrations: files.length,
    tables: total,
    protected: protectedTables,
    serviceRoleOnly: serviceRoleOnlyCount,
    violations,
  };
}

function main(argv) {
  const args = argv.slice(2);
  const dirIndex = args.indexOf('--migrations');
  const migrationsDir = dirIndex === -1 ? DEFAULT_MIGRATIONS_DIR : resolve(args[dirIndex + 1]);
  const report = auditRlsCoverage({ migrationsDir });

  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!args.includes('--quiet')) {
    console.log(`RLS coverage: ${report.protected}/${report.tables} tables (RLS enabled + forced)`);
    console.log(`Service-role-only (documented): ${report.serviceRoleOnly}`);
    console.log(`Migrations scanned: ${report.migrations}`);
    if (report.violations.length) {
      console.error(`\n${report.violations.length} violation(s):`);
      for (const v of report.violations) console.error(`  [${v.rule}] ${v.message}`);
    } else {
      console.log('No violations.');
    }
  }

  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv);
}
