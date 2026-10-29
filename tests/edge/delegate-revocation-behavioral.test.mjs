// Behavioural tests for delegate access and consent revocation.
//
// What this file replaced
// ───────────────────────
// `auth-sharding-lag-s4-closure.test.mjs` defined a class called
// `SimulatedShardingAuthEngine` that *re-implemented* `assertElderOrFamilyCan`
// and `invalidateRelationshipCache` inside the test, then asserted that the
// simulation behaved like the simulation. It never imported
// `supabase/functions/_shared/authz.ts`, so it was green whatever the production
// code did — including for the cache it claimed to be verifying.
//
// What the production code actually did
// ─────────────────────────────────────
// `authz.ts` memoised the `family_relationships` lookup in a module-scoped `Map`
// with a 10 s TTL, and `fn-consent-update` called `invalidateRelationshipCache()`
// when an elder withdrew consent. A module-scoped Map lives in one isolate, so the
// invalidation only reached whichever isolate served the consent update; every
// other isolate kept serving the revoked delegate for up to 10 s. The cache could
// only ever *delay* a revocation, so it was removed (see the comment in
// `_shared/authz.ts`). These tests pin the property that matters: a withdrawal is
// effective on the very next authorisation check, with no invalidation call, no
// shared state and no clock.
//
// Run with: `node tests/edge/authz-behavioral.test.mjs`-style direct execution.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installDenoShim, linkSharedModules } from './support/shared-loader.mjs';

// ---------- Supabase mock loader ----------
const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
const stubDir = mkdtempSync(join(tmpdir(), 'haven-s4-'));
const stubCjs = join(stubDir, 'supabase-stub.cjs');
writeFileSync(stubCjs, `module.exports.createClient = function () { return globalThis.__HAVEN_SUPABASE_MOCK__; };\n`);
writeFileSync(join(stubDir, 'supabase-stub.mjs'), `export function createClient() { return globalThis.__HAVEN_SUPABASE_MOCK__; }\n`);
Module._resolveFilename = function patched(request, parent, ...rest) {
  if (request === '@supabase/supabase-js') return stubCjs;
  return originalResolve.call(this, request, parent, ...rest);
};

// ---------- Fixtures ----------
const ELDER_ID = '00000000-0000-0000-0000-000000000001';
const DELEGATE_ID = '00000000-0000-0000-0000-000000000002';

function relationship(overrides = {}) {
  return {
    id: 'rel-1',
    elder_id: ELDER_ID,
    family_member_id: DELEGATE_ID,
    elder_consented: true,
    elder_consented_at: '2026-06-10T00:00:00Z',
    is_active: true,
    deleted_at: null,
    can_view_medications: true,
    can_view_messages: true,
    can_view_location_events: false,
    can_view_alerts: true,
    can_view_financials: false,
    ...overrides,
  };
}

let rows;
let familyQueries;
let failFamilyQueries;

function resetFixtures() {
  rows = [relationship()];
  familyQueries = 0;
  failFamilyQueries = false;
}

resetFixtures();

function chainable(table, filters = []) {
  const proxy = {};
  // `.eq()` is how both the relationship lookup and the RLS-equivalent filters
  // narrow the row, so every call accumulates and the terminal resolves.
  proxy.eq = (col, value) => {
    filters.push([col, value]);
    return chainable(table, filters);
  };
  proxy.in = () => proxy;
  proxy.is = () => proxy;
  proxy.select = () => proxy;
  proxy.limit = () => proxy;
  proxy.order = () => proxy;
  proxy.insert = () => Promise.resolve({ data: null, error: null });

  const resolve = () => {
    if (table === 'family_relationships') familyQueries += 1;
    if (failFamilyQueries && table === 'family_relationships') {
      return { data: null, error: { message: 'connection reset', code: '08006' } };
    }
    const match = table === 'family_relationships'
      ? rows.find((row) => filters.every(([col, value]) => row[col] === value)
        && (row.deleted_at === null || row.deleted_at === undefined)) ?? null
      : null;
    return { data: match, error: null };
  };

  proxy.maybeSingle = () => Promise.resolve(resolve());
  proxy.single = () => Promise.resolve(resolve());
  proxy.then = (onFulfilled, onRejected) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
  return proxy;
}

globalThis.__HAVEN_SUPABASE_MOCK__ = {
  __supabaseMock: true,
  auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  from(table) { return chainable(table); },
  storage: { from: () => ({}) },
  rpc: () => Promise.resolve({ data: null, error: null }),
};

installDenoShim();
const sharedDir = await linkSharedModules();
const authz = await import(`${sharedDir}/authz.mjs`);

// ---------- Tests ----------

test('an active, consented delegate is allowed', async () => {
  resetFixtures();
  assert.equal(await authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages'), true);
});

test('a withdrawal takes effect on the very next check, with no invalidation call', async () => {
  resetFixtures();
  assert.equal(await authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages'), true);

  // What fn-consent-update writes when the elder withdraws consent.
  rows[0].elder_consented = false;
  rows[0].is_active = false;

  // No cache clear, no TTL, no sleep. A separate isolate would see this
  // immediately too, because there is no per-isolate state left to go stale.
  await assert.rejects(
    () => authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages'),
    (err) => err.status === 403 && err.reasonCode === 'UNAUTHORIZED_DELEGATE',
  );
});

test('every check reads the database — there is no cross-request cache', async () => {
  resetFixtures();
  await authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages');
  await authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages');
  await authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages');

  assert.equal(familyQueries, 3, 'three checks must produce three reads; a memo would produce one');
  assert.equal(
    Object.hasOwn(authz, 'invalidateRelationshipCache'), false,
    'the invalidation API must be gone, not merely unused',
  );
});

test('consent withdrawn but relationship still active is denied', async () => {
  resetFixtures();
  rows[0].elder_consented = false;
  await assert.rejects(
    () => authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages'),
    (err) => err.status === 403,
  );
});

test('a permission the delegate does not hold is denied', async () => {
  resetFixtures();
  await assert.rejects(
    () => authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'location'),
    (err) => err.status === 403 && err.reasonCode === 'MISSING_PERMISSION',
  );
});

test('a database error denies rather than allows', async () => {
  resetFixtures();
  failFamilyQueries = true;
  await assert.rejects(
    () => authz.assertElderOrFamilyCan(DELEGATE_ID, ELDER_ID, 'messages'),
    (err) => err.status === 403 && err.reasonCode === 'SYSTEM_UNCERTAINTY',
  );
});

test('unknown delegates are denied', async () => {
  resetFixtures();
  await assert.rejects(
    () => authz.assertElderOrFamilyCan('00000000-0000-0000-0000-0000000000ff', ELDER_ID, 'messages'),
    (err) => err.status === 403 && err.reasonCode === 'UNAUTHORIZED_DELEGATE',
  );
});

test('the elder always reaches their own record without a relationship row', async () => {
  resetFixtures();
  assert.equal(await authz.assertElderOrFamilyCan(ELDER_ID, ELDER_ID, 'financials'), true);
  assert.equal(familyQueries, 0, 'self-access must not need a relationship lookup');
});
