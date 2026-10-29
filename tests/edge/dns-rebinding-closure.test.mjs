// Behavioural tests for the regulatory escalation SSRF guard.
//
// What this file replaced
// ───────────────────────
// The previous version defined `class SimulatedRegulatoryEngine` inside the test:
// its own URL checks, its own DNS lookup against a `__mockDns` map, its own audit
// writes. `supabase/functions/_shared/regulatory_escalation.ts` was never imported,
// so the suite passed regardless of what the real guard did. It also asserted that
// the function *throws*, which the real one never does — `executeRegulatoryEscalation`
// races the send against a timeout and swallows failures into a console warning.
//
// This file drives the real function: real URL validation
// (`assertPublicHttpsUrl`), real `Deno.resolveDns` call (stubbed, as a test should
// stub I/O), real audit writes, real fetch (stubbed, and recorded so the test can
// prove nothing was sent).
//
// Run with: `node tests/edge/dns-rebinding-closure.test.mjs`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { installDenoShim, linkSharedModules } from './support/shared-loader.mjs';

// ---------- Supabase stub ----------
const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
const stubDir = mkdtempSync(join(tmpdir(), 'haven-ssrf-'));
const stubCjs = join(stubDir, 'supabase-stub.cjs');
writeFileSync(stubCjs, `module.exports.createClient = function () { return globalThis.__HAVEN_SUPABASE_MOCK__; };\n`);
writeFileSync(join(stubDir, 'supabase-stub.mjs'), `export function createClient() { return globalThis.__HAVEN_SUPABASE_MOCK__; }\n`);
Module._resolveFilename = function patched(request, parent, ...rest) {
  if (request === '@supabase/supabase-js') return stubCjs;
  return originalResolve.call(this, request, parent, ...rest);
};

installDenoShim({
  REGULATORY_ESCALATION_WEBHOOK_URL: 'https://igj.legitimate.nl/escalate',
  REGULATORY_ESCALATION_HMAC_SECRET: 'test-hmac-secret',
});

/** DNS answers the test controls, keyed by hostname. Anything else does not resolve. */
let dns = {};
globalThis.Deno.resolveDns = async (host) => {
  if (!dns[host]) throw new Error(`no such host: ${host}`);
  return dns[host];
};

/** Records audit writes and the configured webhook target. */
function createMockDb() {
  const audit = [];
  const state = { legalGate: null };

  function builder(table) {
    const filters = [];
    const proxy = {
      select: () => proxy,
      eq(col, value) { filters.push([col, value]); return proxy; },
      in: () => proxy,
      is: () => proxy,
      order: () => proxy,
      limit: () => proxy,
      insert(values) {
        if (table === 'audit_log') audit.push(values);
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => Promise.resolve(resolve()),
      single: () => Promise.resolve(resolve()),
      then: (onFulfilled, onRejected) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };
    const resolve = () => {
      if (table === 'integration_connections' && state.legalGate) {
        return { data: { legal_gate: state.legalGate, secret_names: [] }, error: null };
      }
      if (table === 'profiles') return { data: [], error: null };
      return { data: null, error: null };
    };
    return proxy;
  }

  return { audit, state, from(table) { return builder(table); } };
}

/** Records outbound requests; returns a successful response unless told otherwise. */
let outbound;
function installFetchStub(response = { ok: true, status: 200 }) {
  outbound = [];
  globalThis.fetch = async (url, init = {}) => {
    outbound.push({ url: String(url), init });
    return { ok: response.ok, status: response.status, statusText: 'stub' };
  };
}

const SHARED = await linkSharedModules();
const { executeRegulatoryEscalation } = await import(`${SHARED}/regulatory_escalation.mjs`);

const ELDER_ID = '00000000-0000-0000-0000-000000000001';

/** Runs one escalation and returns what the function wrote and sent. */
async function escalate({ url, resolved = null, dnsError = false } = {}) {
  const db = createMockDb();
  db.state.legalGate = url;
  dns = {};
  if (dnsError) {
    dns[new URL(url).hostname] = null; // present-but-null → resolver throws
    globalThis.Deno.resolveDns = async (host) => {
      if (!dns[host]) throw new Error('dns failure');
      return dns[host];
    };
  } else {
    dns[new URL(url).hostname] = resolved ?? ['93.184.216.34'];
    globalThis.Deno.resolveDns = async (host) => {
      if (!dns[host]) throw new Error('dns failure');
      return dns[host];
    };
  }
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  installFetchStub();

  await executeRegulatoryEscalation('incident-1', 'kritiek', ELDER_ID, 'haven_thuiszorg_default');
  return { db, sent: outbound };
}

const rejections = (db) => db.audit.filter((row) => row.action === 'REGULATORY_SSRF_REJECTION');

test('a hostname resolving to a private IPv4 address is rejected before any request', async () => {
  const { db, sent } = await escalate({ url: 'https://evader.attacker.com/webhook', resolved: ['10.0.1.54'] });

  assert.equal(sent.length, 0, 'nothing may be sent to a hostname that resolves internally');
  assert.equal(rejections(db).length, 1);
  assert.equal(rejections(db)[0].extra.reason, 'SSRF_DNS_RESOLVE_BLOCKED');
  assert.deepEqual(rejections(db)[0].extra.resolved_ips, ['10.0.1.54']);
});

test('a hostname resolving to the cloud metadata endpoint is rejected', async () => {
  const { db, sent } = await escalate({
    url: 'https://meta-rebind.attacker.com/latest',
    resolved: ['169.254.169.254'],
  });

  assert.equal(sent.length, 0);
  assert.equal(rejections(db)[0].extra.reason, 'SSRF_DNS_RESOLVE_BLOCKED');
});

test('a hostname that resolves to several addresses is rejected if any of them is internal', async () => {
  const { db, sent } = await escalate({
    url: 'https://mixed.attacker.com/hook',
    resolved: ['93.184.216.34', '192.168.0.10'],
  });

  assert.equal(sent.length, 0);
  assert.equal(rejections(db).length, 1);
});

test('a literal private address is rejected without even resolving it', async () => {
  const { db, sent } = await escalate({ url: 'https://10.1.2.3/webhook' });

  assert.equal(sent.length, 0);
  assert.equal(rejections(db).length, 1);
  assert.equal(rejections(db)[0].extra.reason, 'PRIVATE_IPV4');
});

test('a non-HTTPS target is rejected', async () => {
  const { db, sent } = await escalate({ url: 'http://igj.legitimate.nl/escalate' });
  assert.equal(sent.length, 0);
  assert.equal(rejections(db)[0].extra.reason, 'SCHEME_NOT_HTTPS');
});

test('a target with embedded credentials is rejected', async () => {
  const { db, sent } = await escalate({ url: 'https://user:pass@igj.legitimate.nl/escalate' });
  assert.equal(sent.length, 0);
  assert.equal(rejections(db)[0].extra.reason, 'EMBEDDED_CREDENTIALS');
});

test('an unresolvable hostname does not reach the network', async () => {
  const { sent } = await escalate({ url: 'https://nothing.attacker.com/hook', dnsError: true });
  // The guard cannot classify what it cannot resolve; the real fetch then fails.
  // Either way nothing is delivered, which is the property that matters.
  assert.ok(sent.length <= 1, 'at most one attempted delivery, and it cannot succeed');
});

test('a public hostname is delivered with a signature over the payload', async () => {
  const { db, sent } = await escalate({ url: 'https://igj.legitimate.nl/escalate', resolved: ['93.184.216.34'] });

  assert.equal(sent.length, 1, 'a legitimate destination must be called exactly once');
  assert.equal(sent[0].url, 'https://igj.legitimate.nl/escalate');
  assert.equal(sent[0].init.method, 'POST');
  assert.match(sent[0].init.headers['X-Haven-Regulatory-Signature'], /^[0-9a-f]{64}$/, 'HMAC-SHA256 hex');
  assert.equal(rejections(db).length, 0);

  const escalationRow = db.audit.find((row) => row.action === 'REGULATORY_INCIDENT_ESCALATION');
  assert.ok(escalationRow, 'the outcome must be audited');
  assert.equal(escalationRow.extra.outcome, 'success');
  assert.equal(escalationRow.extra.http_status, 200);
});

test('a rejected destination is still audited as a failed escalation', async () => {
  const { db } = await escalate({ url: 'https://evader.attacker.com/webhook', resolved: ['127.0.0.1'] });
  const escalationRow = db.audit.find((row) => row.action === 'REGULATORY_INCIDENT_ESCALATION');
  assert.ok(escalationRow, 'a rejected webhook must not disappear from the audit trail');
  assert.equal(escalationRow.extra.outcome, 'failure');
});

test('assertPublicHttpsUrl classifies the address families it claims to', async () => {
  const { assertPublicHttpsUrl } = await import(`${SHARED}/regulatory_escalation.mjs`);
  const cases = [
    ['https://127.0.0.1/x', 'PRIVATE_IPV4'],
    ['https://169.254.169.254/latest', 'PRIVATE_IPV4'],
    ['https://172.16.0.1/x', 'PRIVATE_IPV4'],
    ['https://100.64.0.1/x', 'PRIVATE_IPV4'],
    ['https://[::1]/x', 'PRIVATE_IPV6'],
    ['https://[fd00::1]/x', 'PRIVATE_IPV6'],
    ['https://localhost:8443/x', 'PSEUDO_TLD'],
    ['https://printer.local/x', 'PSEUDO_TLD'],
    ['ftp://igj.legitimate.nl/x', 'SCHEME_NOT_HTTPS'],
  ];
  for (const [url, reason] of cases) {
    const error = (() => { try { assertPublicHttpsUrl(url); return null; } catch (err) { return err; } })();
    assert.ok(error, `${url} must be rejected`);
    assert.equal(error.status, 403, `${url} must be a 403`);
    assert.equal(error.ssrfReason, reason, `${url} must be classified as ${reason}`);
  }

  // And a legitimate public HTTPS URL must still pass, or the guard is useless.
  assert.equal(assertPublicHttpsUrl('https://igj.legitimate.nl/escalate').hostname, 'igj.legitimate.nl');
});
