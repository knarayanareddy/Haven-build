// Behavioural tests for the "soft fail" contract of the authorisation helpers:
// when the storage subsystem is unavailable or the answer is ambiguous, deny —
// and leave an audit trail that says why.
//
// What this file replaced
// ───────────────────────
// The previous version defined `class HardenedAuthzEngine`, a hand-written copy of
// `assertElderOrFamilyCan` and `logDenyAudit` inside the test file, and asserted
// the copy denied. `supabase/functions/_shared/authz.ts` was never imported, so the
// suite was green whether or not the real helpers denied, and whether or not the
// real code wrote an audit row.
//
// Run with: `node tests/edge/authz-soft-fail-closure.test.mjs`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { installDenoShim, linkSharedModules } from './support/shared-loader.mjs';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
const stubDir = mkdtempSync(join(tmpdir(), 'haven-softfail-'));
const stubCjs = join(stubDir, 'supabase-stub.cjs');
writeFileSync(stubCjs, `module.exports.createClient = function () { return globalThis.__HAVEN_SUPABASE_MOCK__; };\n`);
writeFileSync(join(stubDir, 'supabase-stub.mjs'), `export function createClient() { return globalThis.__HAVEN_SUPABASE_MOCK__; }\n`);
Module._resolveFilename = function patched(request, parent, ...rest) {
  if (request === '@supabase/supabase-js') return stubCjs;
  return originalResolve.call(this, request, parent, ...rest);
};

const ELDER_ID = '00000000-0000-0000-0000-000000000001';
const DELEGATE_ID = '00000000-0000-0000-0000-000000000002';

let relationship;
let familyError;
let auditRows;
let auditError;

function reset() {
  relationship = {
    id: 'rel-1',
    elder_id: ELDER_ID,
    family_member_id: DELEGATE_ID,
    elder_consented: true,
    is_active: true,
    deleted_at: null,
    can_view_messages: true,
    can_view_alerts: true,
    can_view_location_events: false,
  };
  familyError = null;
  auditRows = [];
  auditError = null;
}

reset();

function builder(table) {
  const filters = [];
  const proxy = {
    select: () => proxy,
    in: () => proxy,
    is: () => proxy,
    eq(col, value) { filters.push([col, value]); return proxy; },
    insert(values) {
      if (table === 'audit_log') {
        auditRows.push(values);
        return Promise.resolve({ data: null, error: auditError });
      }
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle: () => Promise.resolve(resolve()),
    single: () => Promise.resolve(resolve()),
    then: (onFulfilled, onRejected) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
  };
  const resolve = () => {
    if (table !== 'family_relationships') return { data: null, error: null };
    if (familyError) return { data: null, error: familyError };
    const row = filters.every(([col, value]) => relationship[col] === value) ? relationship : null;
    return { data: row, error: null };
  };
  return proxy;
}

globalThis.__HAVEN_SUPABASE_MOCK__ = {
  __supabaseMock: true,
  auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  from(table) { return builder(table); },
  storage: { from: () => ({}) },
  rpc: () => Promise.resolve({ data: null, error: null }),
};

installDenoShim();
const shared = await linkSharedModules();
const authz = await import(`${shared}/authz.mjs`);

const readAudit = () => auditRows.filter((row) => row.action === 'AUTHZ_DENY_GATE');

test('a storage subsystem error denies with SYSTEM_UNCERTAINTY', async () => {
  reset();
  familyError = { message: 'connection reset by peer', code: '08006' };

  await assert.rejects(
    () => authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages'),
    (err) => err.status === 403 && err.reasonCode === 'SYSTEM_UNCERTAINTY',
  );
});

test('a denied request leaves an audit row with the reason code', async () => {
  reset();
  familyError = { message: 'timeout', code: '57014' };

  await assert.rejects(() => authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages'));

  const denied = readAudit();
  assert.equal(denied.length, 1, 'a denial must be auditable');
  assert.equal(denied[0].actor_id, DELEGATE_ID);
  assert.equal(denied[0].table_name, 'messages');
  assert.equal(denied[0].extra.reason_code, 'SYSTEM_UNCERTAINTY');
  assert.ok(denied[0].extra.timestamp, 'the row must carry a timestamp');
});

test('a missing relationship denies with UNAUTHORIZED_DELEGATE', async () => {
  reset();
  relationship.family_member_id = '00000000-0000-0000-0000-0000000000ff';

  await assert.rejects(
    () => authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages'),
    (err) => err.status === 403 && err.reasonCode === 'UNAUTHORIZED_DELEGATE',
  );
  assert.equal(readAudit()[0]?.extra.reason_code, 'UNAUTHORIZED_DELEGATE');
});

test('a missing permission denies with MISSING_PERMISSION', async () => {
  reset();

  await assert.rejects(
    () => authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'location'),
    (err) => err.status === 403 && err.reasonCode === 'MISSING_PERMISSION',
  );
  assert.equal(readAudit()[0]?.extra.reason_code, 'MISSING_PERMISSION');
});

test('a failing audit write cannot turn a deny into an allow', async () => {
  reset();
  relationship.family_member_id = '00000000-0000-0000-0000-0000000000ff';
  auditError = { message: 'audit_log is read-only' };

  await assert.rejects(
    () => authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages'),
    (err) => err.status === 403,
    'the decision stands even when the audit trail cannot be written',
  );
});

test('the denial is uniform: no reason detail leaks to the caller', async () => {
  reset();
  familyError = { message: 'pg_relation "family_relationships" permission denied for service_role', code: '42501' };

  await assert.rejects(
    () => authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages'),
    (err) => {
      assert.equal(err.status, 403);
      assert.doesNotMatch(err.message, /pg_relation|service_role|permission denied/i);
      return true;
    },
  );
});
