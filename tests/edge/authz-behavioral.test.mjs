// Behavioural (not marker) tests for the Edge Function authz helpers.
//
// Loads `supabase/functions/_shared/authz.ts` with a Deno shim and a
// controllable mock Supabase client. Verifies the real assert* functions
// actually throw / pass for each scenario.
//
// These tests do not require a real Supabase project. They pin the authz
// contract that callers (fn-voice-pipeline, fn-storage-signed-url,
// fn-transaction-intercept, …) rely on.
//
// Run with: `node tests/edge/authz-behavioral.test.mjs`
// Requires: typescript installed at /tmp/haven-test-deps (the test compiles
// the authz.ts source via TypeScript's transpileModule to strip Deno types).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// ---------- Deno shim ----------
// authz.ts calls admin() from core.ts which calls Deno.env.get.
globalThis.Deno = {
  env: {
    get(name) {
      if (name === 'SUPABASE_URL') return 'http://localhost:54321';
      if (name === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-test-key';
      if (name === 'SUPABASE_ANON_KEY') return 'anon-test-key';
      return undefined;
    },
  },
};

// ---------- Supabase mock loader ----------
// Intercept require('@supabase/supabase-js') by patching Module._resolveFilename.
const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
const stubDir = mkdtempSync(join(tmpdir(), 'haven-authz-'));
const stubPath = join(stubDir, 'supabase-stub.cjs');
writeFileSync(stubPath, `module.exports.createClient = function() { return globalThis.__HAVEN_SUPABASE_MOCK__; };\n`);
// Also write an ESM version (because the rewritten core.mjs imports './supabase-stub.mjs').
writeFileSync(join(stubDir, 'supabase-stub.mjs'), `export function createClient() { return globalThis.__HAVEN_SUPABASE_MOCK__; }\n`);
Module._resolveFilename = function patchedResolve(request, parent, ...rest) {
  if (request === '@supabase/supabase-js') return stubPath;
  return originalResolve.call(this, request, parent, ...rest);
};

// ---------- Fixture model ----------
const ELDER_ID = '00000000-0000-0000-0000-000000000001';
const FAMILY_WITH_CONSENT = '00000000-0000-0000-0000-000000000002';
const FAMILY_NO_CONSENT = '00000000-0000-0000-0000-000000000003';
const FAMILY_PENDING = '00000000-0000-0000-0000-000000000006';
const CARER_ACTIVE = '00000000-0000-0000-0000-000000000004';
const ADMIN = '00000000-0000-0000-0000-000000000005';

function fam(memberId, overrides = {}) {
  return {
    id: `rel-${memberId}`,
    elder_id: ELDER_ID,
    family_member_id: memberId,
    elder_consented: true,
    elder_consented_at: '2026-06-10T00:00:00Z',
    is_active: true,
    deleted_at: null,
    can_view_medications: true,
    can_view_messages: true,
    can_view_location_events: true,
    can_view_alerts: true,
    can_view_stories: true,
    can_view_financials: false,
    ...overrides,
  };
}

function carer(overrides = {}) {
  return {
    id: 'rel-carer',
    elder_id: ELDER_ID,
    carer_member_id: CARER_ACTIVE,
    elder_consented: true,
    elder_consented_at: '2026-06-10T00:00:00Z',
    is_active: true,
    deleted_at: null,
    can_view_medications: true,
    can_view_visit_logs: true,
    can_create_visit_logs: true,
    can_file_incidents: true,
    ...overrides,
  };
}

function profile(userId, role) {
  return { id: userId, role };
}

let familyRows = [fam(FAMILY_WITH_CONSENT, { can_view_financials: true })];
let carerRows = [carer()];
const profileRows = new Map([
  [ADMIN, profile(ADMIN, 'admin')],
  [CARER_ACTIVE, profile(CARER_ACTIVE, 'carer')],
  [ELDER_ID, profile(ELDER_ID, 'elder')],
  [FAMILY_WITH_CONSENT, profile(FAMILY_WITH_CONSENT, 'family')],
  [FAMILY_NO_CONSENT, profile(FAMILY_NO_CONSENT, 'family')],
  [FAMILY_PENDING, profile(FAMILY_PENDING, 'family')],
]);

function resetFixtures() {
  familyRows = [fam(FAMILY_WITH_CONSENT, { can_view_financials: true })];
  carerRows = [carer()];
}

// ---------- Mock Supabase client ----------
function chainable(query, final) {
  const obj = {};
  ['select', 'eq', 'in', 'or', 'is', 'gte', 'lte', 'order', 'limit'].forEach((m) => {
    obj[m] = (...args) => {
      query[m] = query[m] ?? [];
      query[m].push(args);
      return chainable(query, final);
    };
  });
  obj.maybeSingle = () => final(query, 'maybeSingle');
  obj.single = () => final(query, 'single');
  obj.then = (resolve) => resolve(final(query));
  obj.insert = () => Promise.resolve({ data: null, error: null });
  return obj;
}

const mock = {
  __supabaseMock: true,
  auth: {
    getUser(token) {
      const m = /^test-user:(.+)$/.exec(token ?? '');
      if (!m) return Promise.resolve({ data: { user: null }, error: { message: 'invalid' } });
      return Promise.resolve({ data: { user: { id: m[1] } }, error: null });
    },
  },
  from(table) {
    const query = { table };
    const final = (q, mode = 'single') => {
      // Apply ALL .eq filters as a conjunction, then simulate SQL RLS by also
      // filtering out soft-deleted rows (deleted_at IS NULL). This mirrors what
      // the Postgres RLS policies do in production.
      const matchesEq = (row, eqs) => eqs.every(([col, val]) => row[col] === val);
      const notSoftDeleted = (row) => row.deleted_at === null || row.deleted_at === undefined;

      if (q.table === 'family_relationships') {
        const eqs = q.eq ?? [];
        const row = familyRows.find((r) => matchesEq(r, eqs) && notSoftDeleted(r)) ?? null;
        return { data: row, error: row ? null : (mode === 'maybeSingle' ? null : { code: 'PGRST116', message: 'not found' }) };
      }
      if (q.table === 'carer_relationships') {
        const eqs = q.eq ?? [];
        const row = carerRows.find((r) => matchesEq(r, eqs) && notSoftDeleted(r)) ?? null;
        return { data: row, error: row ? null : (mode === 'maybeSingle' ? null : { code: 'PGRST116', message: 'not found' }) };
      }
      if (q.table === 'profiles') {
        const eqs = q.eq ?? [];
        const row = Array.from(profileRows.values()).find((r) => matchesEq(r, eqs) && notSoftDeleted(r)) ?? null;
        return { data: row, error: row ? null : (mode === 'maybeSingle' ? null : { code: 'PGRST116', message: 'not found' }) };
      }
      if (q.table === 'audit_log') {
        return { data: null, error: null };
      }
      return { data: null, error: { message: `mock has no table ${q.table}` } };
    };
    return chainable(query, final);
  },
  storage: { from: () => ({ createSignedUrl: () => ({ data: { signedUrl: 'mock' }, error: null }), createSignedUploadUrl: () => ({ data: { signedUrl: 'mock' }, error: null }) }) },
  rpc: () => Promise.resolve({ data: null, error: null }),
};

globalThis.__HAVEN_SUPABASE_MOCK__ = mock;

// ---------- Strip-types loader (TypeScript transpileModule) ----------
const sharedDir = fileURLToPath(new URL('../../supabase/functions/_shared/', import.meta.url));
async function loadAuthzModule() {
  const tsPath = 'typescript';
  let ts;
  try {
    ts = (await import(tsPath)).default ?? (await import(tsPath));
  } catch (error) {
    throw new Error(`Unable to import TypeScript at ${tsPath}: ${error.message ?? error}. Install with: npm install --prefix /tmp/haven-test-deps typescript`, { cause: error });
  }

  function transpile(relPath, outName) {
    const src = readFileSync(join(sharedDir, relPath), 'utf8');
    const result = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        removeComments: true,
      },
      fileName: relPath,
    });
    if (result.diagnostics && result.diagnostics.length > 0) {
      const messages = result.diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      throw new Error(`TypeScript transpile of ${relPath} failed:\n${messages.join('\n')}`);
    }
    const compiledPath = join(stubDir, outName);
    writeFileSync(compiledPath, result.outputText);
    return compiledPath;
  }

  // Order matters: core must exist before authz imports it.
  const coreSrc = readFileSync(join(sharedDir, 'core.ts'), 'utf8');
  const coreResult = ts.transpileModule(coreSrc, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      removeComments: true,
    },
    fileName: 'core.ts',
  });
  if (coreResult.diagnostics && coreResult.diagnostics.length > 0) {
    const messages = coreResult.diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    throw new Error(`TypeScript transpile of core.ts failed:\n${messages.join('\n')}`);
  }
  // Rewrite both the esm.sh import and the relative scam-engine import.
  const coreRewritten = coreResult.outputText
    .replace(/from\s+['"]https:\/\/esm\.sh\/@supabase\/supabase-js@2['"]/g, `from './supabase-stub.mjs'`)
    .replace(/from\s+['"]\.\.\/\.\.\/\.\.\/packages\/scam-engine\/src\/catalog\.mjs['"]/g, `from './catalog-stub.mjs'`);
  writeFileSync(join(stubDir, 'core.mjs'), coreRewritten);

  // Provide a stub for catalog.mjs so core.ts can import it without hitting the network.
  writeFileSync(join(stubDir, 'catalog-stub.mjs'), `
export function alertLevelFromScore(score) {
  if (score >= 90) return 'zwart';
  if (score >= 70) return 'rood';
  if (score >= 40) return 'amber';
  return 'none';
}
export function scoreScamText(input) {
  return { score: 0, level: 'none', hits: [] };
}
`);
  // Rewrite the relative .ts imports in authz.ts to .mjs after transpile.
  const authzSrc = readFileSync(join(sharedDir, 'authz.ts'), 'utf8');
  const authzResult = ts.transpileModule(authzSrc, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      removeComments: true,
    },
    fileName: 'authz.ts',
  });
  if (authzResult.diagnostics && authzResult.diagnostics.length > 0) {
    const messages = authzResult.diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    throw new Error(`TypeScript transpile of authz.ts failed:\n${messages.join('\n')}`);
  }
  const rewritten = authzResult.outputText.replace(/from\s+['"]\.\/core\.ts['"]/g, `from './core.mjs'`);
  const authzCompiledPath = join(stubDir, 'authz.mjs');
  writeFileSync(authzCompiledPath, rewritten);
  return import(authzCompiledPath);
}

const authz = await loadAuthzModule();

// ---------- Tests ----------

test('assertSelf: passes when userId equals claimedId', () => {
  assert.equal(authz.assertSelf(ELDER_ID, ELDER_ID, 'elder'), true);
});

test('assertSelf: throws when userId differs from claimedId', () => {
  assert.throws(() => authz.assertSelf(FAMILY_WITH_CONSENT, ELDER_ID, 'elder'), /not allowed/);
});

test('assertActorMatches: passes when claimedId is undefined', () => {
  assert.equal(authz.assertActorMatches(ELDER_ID, undefined, 'elder_id'), true);
});

test('assertActorMatches: passes when claimedId equals userId', () => {
  assert.equal(authz.assertActorMatches(ELDER_ID, ELDER_ID, 'elder_id'), true);
});

test('assertActorMatches: throws when claimedId differs from userId', () => {
  assert.throws(() => authz.assertActorMatches(ELDER_ID, FAMILY_WITH_CONSENT, 'elder_id'), /must match/);
});

test('assertElderOrFamilyCan: elder self is allowed', async () => {
  resetFixtures();
  assert.equal(await authz.assertElderOrFamilyCan(ELDER_ID, ELDER_ID, 'medications'), true);
});

test('assertElderOrFamilyCan: family with consent + permission is allowed', async () => {
  resetFixtures();
  assert.equal(await authz.assertElderOrFamilyCan(FAMILY_WITH_CONSENT, ELDER_ID, 'medications'), true);
});

test('assertElderOrFamilyCan: family with consent but missing permission throws', async () => {
  resetFixtures();
  familyRows = [fam(FAMILY_WITH_CONSENT, { can_view_financials: false })];
  await assert.rejects(authz.assertElderOrFamilyCan(FAMILY_WITH_CONSENT, ELDER_ID, 'financials'), /Missing specific required RBAC capability: financials/);
});

test('assertElderOrFamilyCan: family without consent throws', async () => {
  resetFixtures();
  familyRows = [fam(FAMILY_NO_CONSENT, { elder_consented: false, is_active: false })];
  await assert.rejects(authz.assertElderOrFamilyCan(FAMILY_NO_CONSENT, ELDER_ID, 'medications'), /No active verified older adult consent/);
});

test('assertElderOrFamilyCan: pending family (consented=false, active=true) throws', async () => {
  resetFixtures();
  familyRows = [fam(FAMILY_PENDING, { elder_consented: false })];
  await assert.rejects(authz.assertElderOrFamilyCan(FAMILY_PENDING, ELDER_ID, 'medications'), /No active verified older adult consent/);
});

test('assertElderOrFamilyCan: soft-deleted relationship throws', async () => {
  resetFixtures();
  familyRows = [fam(FAMILY_WITH_CONSENT, { deleted_at: '2026-06-10T00:00:00Z' })];
  await assert.rejects(authz.assertElderOrFamilyCan(FAMILY_WITH_CONSENT, ELDER_ID, 'medications'), /No active verified older adult consent/);
});

test('assertElderOrFamilyCan: carer does not inherit family permissions', async () => {
  resetFixtures();
  await assert.rejects(authz.assertElderOrFamilyCan(CARER_ACTIVE, ELDER_ID, 'medications'), /No active verified older adult consent/);
});

test('assertElderOrFamilyCan: unrelated user throws', async () => {
  resetFixtures();
  await assert.rejects(authz.assertElderOrFamilyCan('00000000-0000-0000-0000-000000000099', ELDER_ID, 'medications'), /No active verified older adult consent/);
});

test('assertCarerCan: active carer is allowed', async () => {
  resetFixtures();
  assert.equal(await authz.assertCarerCan(CARER_ACTIVE, ELDER_ID), true);
});

test('assertCarerCan: elder is not a carer', async () => {
  resetFixtures();
  await assert.rejects(authz.assertCarerCan(ELDER_ID, ELDER_ID), /No active professional carer relationship/);
});

test('assertCarerCan: family is not a carer', async () => {
  resetFixtures();
  await assert.rejects(authz.assertCarerCan(FAMILY_WITH_CONSENT, ELDER_ID), /No active professional carer relationship/);
});

test('assertCarerCan: inactive carer relationship throws', async () => {
  resetFixtures();
  carerRows = [carer({ is_active: false })];
  await assert.rejects(authz.assertCarerCan(CARER_ACTIVE, ELDER_ID), /No active professional carer relationship/);
});

test('assertCarerPermission: carer with create_visit_logs is allowed', async () => {
  resetFixtures();
  assert.equal(await authz.assertCarerPermission(CARER_ACTIVE, ELDER_ID, 'create_visit_logs'), true);
});

test('assertCarerPermission: carer without specific permission throws', async () => {
  resetFixtures();
  carerRows = [carer({ can_file_incidents: false })];
  await assert.rejects(authz.assertCarerPermission(CARER_ACTIVE, ELDER_ID, 'incidents'), /Missing specific required professional carer capability: incidents/);
});

test('getProfileRole: returns role for known user', async () => {
  resetFixtures();
  assert.equal(await authz.getProfileRole(ADMIN), 'admin');
  assert.equal(await authz.getProfileRole(CARER_ACTIVE), 'carer');
});

test('getProfileRole: throws for unknown user', async () => {
  resetFixtures();
  await assert.rejects(authz.getProfileRole('00000000-0000-0000-0000-000000000099'), /Could not determine caller role/);
});

test('getJwtUserId: extracts user id from Bearer token', async () => {
  const request = { headers: { get: (k) => (k.toLowerCase() === 'authorization' ? `Bearer test-user:${ELDER_ID}` : null) } };
  assert.equal(await authz.getJwtUserId(request), ELDER_ID);
});

test('getJwtUserId: throws when no Authorization header', async () => {
  const request = { headers: { get: () => null } };
  await assert.rejects(authz.getJwtUserId(request), /Missing bearer token/);
});

test('getJwtUserId: throws when token cannot resolve a user', async () => {
  const request = { headers: { get: (k) => (k.toLowerCase() === 'authorization' ? 'Bearer not-a-jwt' : null) } };
  await assert.rejects(authz.getJwtUserId(request), /Invalid bearer token/);
});

test('assertSelfOrAdmin: self is allowed', async () => {
  resetFixtures();
  assert.equal(await authz.assertSelfOrAdmin(ELDER_ID, ELDER_ID), true);
});

test('assertSelfOrAdmin: admin is allowed even when not self', async () => {
  resetFixtures();
  assert.equal(await authz.assertSelfOrAdmin(ADMIN, ELDER_ID), true);
});

test('assertSelfOrAdmin: family (non-admin) is rejected', async () => {
  resetFixtures();
  await assert.rejects(authz.assertSelfOrAdmin(FAMILY_WITH_CONSENT, ELDER_ID), /not allowed/);
});
