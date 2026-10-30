// Who may call each database function?
//
// Why this exists
// ───────────────
// Postgres grants EXECUTE on every new function to PUBLIC, and Supabase exposes the
// `public` schema over PostgREST. Nothing in the RLS gate looks at function
// privileges, so before migration 20261029000004 an unauthenticated caller holding
// the anon key could run
//
//     POST /rest/v1/rpc/soft_purge_profile {"p_target_id": "<uuid>"}
//
// and erase an elder's medical record — the function is SECURITY DEFINER, so it runs
// as its owner and RLS does not apply. The same was true of get_elder_screen_data_batch
// (read any elder's full screen data), insert_location_event and mark_reminder_taken.
//
// The suite replays every GRANT/REVOKE in migration order and asks the resulting
// privilege set what each role can actually reach. It is a property test: any new
// function added without an explicit grant stays unreachable, and any function added
// that is reachable by `authenticated` must re-derive identity from auth.uid().

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { buildModel } from './support/sql-model.mjs';
import { parseFile } from './support/ast-model.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const model = buildModel();
const names = [...model.functions.keys()];

const RLS_HELPERS = ['carer_can', 'family_can', 'is_haven_admin'];
const ANON_EXCEPTION = 'get_emergency_profile';

// Everything that mutates, deletes or exports personal data.
const DESTRUCTIVE = [
  'soft_purge_profile',
  'export_elder_data',
  'run_pii_backfill_scan',
  'purge_expired_telemetry_nonces',
  'purge_stale_emergency_location_objects',
  'execute_postgis_partition_retention',
  'execute_haven_database_retention_sweeps',
  'promote_fhir_medication_staging',
  'insert_location_event',
  'mark_reminder_taken',
];

test('the anonymous role cannot execute anything except the token-gated emergency lookup', () => {
  const reachable = names.filter((name) => model.executorsOf(name).includes('anon'));
  assert.deepEqual(reachable, [ANON_EXCEPTION],
    `anon can execute: ${reachable.join(', ')}`);
});

test('a signed-in session can reach only the RLS helpers and the emergency lookup', () => {
  const reachable = names.filter((name) => model.executorsOf(name).includes('authenticated')).sort();
  assert.deepEqual(reachable, [...RLS_HELPERS, ANON_EXCEPTION].sort(),
    `authenticated can execute: ${reachable.join(', ')}`);
});

test('every function reachable by a user session re-derives identity from the JWT', () => {
  for (const name of RLS_HELPERS) {
    const body = model.fn(name).body;
    assert.match(body, /auth\.uid\(\)|auth\.jwt\(\)/,
      `${name}() is callable by authenticated but trusts its arguments`);
  }
});

test('the emergency lookup is gated by a hashed, expiring, single-use token', () => {
  const body = model.fn(ANON_EXCEPTION).body;
  assert.match(body, /digest\(|sha256/i, 'the token must be hashed before lookup');
  assert.ok(!/p_token\s*=\s*[a-z_.]*token/i.test(body), 'the token must not be compared in clear text');
  assert.match(body, /expires_at|expiry/i, 'emergency tokens must expire');
  assert.match(body, /revoked|used_at|consumed/i, 'emergency tokens must be single-use');
});

test('destructive and export functions are service-role only', () => {
  for (const name of DESTRUCTIVE) {
    assert.ok(model.fn(name), `${name}() must exist`);
    assert.deepEqual(model.executorsOf(name), ['service_role'],
      `${name}() must be callable by Edge Functions only`);
  }
});

test('no function is left with the Postgres default PUBLIC grant', () => {
  // `executorsOf` replays the schema-wide REVOKE, so any survivor is one that was
  // re-granted on purpose — which the two tests above already bound.
  for (const name of names) {
    const roles = model.executorsOf(name);
    assert.ok(roles.includes('service_role'), `${name}() lost its service_role grant`);
    assert.equal(roles.includes('public'), false, `${name}() is still PUBLIC`);
  }
});

test('future functions default to no PUBLIC EXECUTE', () => {
  const rule = model.defaultPrivileges.find((entry) => entry.objects === 'FUNCTIONS'
    && entry.verb === 'REVOKE' && entry.privileges === 'EXECUTE');
  assert.ok(rule, 'ALTER DEFAULT PRIVILEGES must revoke EXECUTE on new functions');
  assert.ok(rule.roles.includes('PUBLIC'), `rule applies to ${rule.roles.join(', ')}`);
  assert.equal(rule.schema, 'public');
});

test('no migration alters a function that does not exist at that point', () => {
  // `supabase db reset` died on
  //   ERROR: function public.ratelimit_check(text, timestamptz, integer) does not
  //   exist (SQLSTATE 42883)
  // because 20261029000004 altered a function that 20261029000002 had dropped in
  // favour of consume_rate_limit(). ALTER on a missing function aborts the whole
  // migration transaction, so nothing after it ever ran — and the model said the
  // function existed, because it never processed DROP FUNCTION.
  const alive = new Set();
  const offenders = [];
  for (const event of model.functionEvents) {
    if (event.action === 'create') alive.add(event.name);
    else if (event.action === 'drop') alive.delete(event.name);
    else if (event.action === 'alter' && !alive.has(event.name)) {
      offenders.push(`${event.file}: ALTER FUNCTION ${event.name}`);
    }
  }
  assert.deepEqual(offenders, [], `ALTER FUNCTION on a missing function:\n${offenders.join('\n')}`);
});

test('every SECURITY DEFINER function pins search_path', () => {
  const offenders = [...model.functions.values()]
    .filter((fn) => fn.securityDefiner && !fn.searchPath)
    .map((fn) => fn.name);
  assert.deepEqual(offenders, [], `unpinned search_path: ${offenders.join(', ')}`);
  assert.ok([...model.functions.values()].filter((fn) => fn.securityDefiner).length >= 30,
    'the sweep must have found the whole SECURITY DEFINER surface');
});

test('the client applications never call rpc() directly', () => {
  // The lockdown is only safe while every RPC call site is an Edge Function using
  // the service-role client. This is the assertion that keeps it that way.
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (['node_modules', 'dist', 'build', '.expo', 'coverage'].includes(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(full)) files.push(full);
    }
  };
  for (const dir of ['apps', 'packages/ui']) {
    try { walk(join(ROOT, dir)); } catch { /* optional tree */ }
  }
  assert.ok(files.length > 50, `expected the client tree, saw ${files.length} files`);

  const offenders = [];
  for (const file of files) {
    for (const call of parseFile(file).calls) {
      if (call.callee === 'rpc') offenders.push(`${file.slice(ROOT.length)}: ${call.args.join(', ')}`);
    }
  }
  assert.deepEqual(offenders, [], `client code calls rpc():\n${offenders.join('\n')}`);
});
