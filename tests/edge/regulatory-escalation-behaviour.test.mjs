// Behavioural tests for _shared/regulatory_escalation.ts.
//
// Replaces tests/edge/regulatory-escalation-r9-closure.test.mjs, which ran a simulated
// engine and asserted the simulation. The module is plain TypeScript with no Deno API
// beyond env and DNS, so it loads directly — the "SSRF strings appear in the file"
// assertions were never necessary.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMockDb,
  loadSharedModule,
} from './support/edge-function-harness.mjs';

const ELDER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const INCIDENT = 'incident-1';
const ADMIN = '11111111-2222-4333-8444-555555555555';

const { assertPublicHttpsUrl, executeRegulatoryEscalation } = await loadSharedModule('regulatory_escalation', {
  env: {
    REGULATORY_ESCALATION_WEBHOOK_URL: 'https://igj.example.org/escalate',
    REGULATORY_ESCALATION_HMAC_SECRET: 'regulatory-hmac-secret',
  },
});

beforeEach(() => {
  delete globalThis.__HAVEN_DNS_STUB__;
});

test('the SSRF guard rejects every non-public destination', () => {
  const rejected = [
    ['http://example.org/hook', 'SCHEME_NOT_HTTPS'],
    ['file:///etc/passwd', 'SCHEME_NOT_HTTPS'],
    ['gopher://example.org', 'SCHEME_NOT_HTTPS'],
    ['https://user:pass@example.org', 'EMBEDDED_CREDENTIALS'],
    ['https://localhost/hook', 'PSEUDO_TLD'],
    ['https://LOCALHOST./hook', 'PSEUDO_TLD'],
    ['https://api.localhost', 'PSEUDO_TLD'],
    ['https://metadata.internal', 'PSEUDO_TLD'],
    ['https://127.0.0.1/hook', 'PRIVATE_IPV4'],
    ['https://10.0.0.5/hook', 'PRIVATE_IPV4'],
    ['https://192.168.1.1/hook', 'PRIVATE_IPV4'],
    ['https://172.16.0.1/hook', 'PRIVATE_IPV4'],
    ['https://172.31.255.255/hook', 'PRIVATE_IPV4'],
    ['https://169.254.169.254/latest/meta-data', 'PRIVATE_IPV4'],
    ['https://100.64.0.1/hook', 'PRIVATE_IPV4'],
    ['https://[::1]/hook', 'PRIVATE_IPV6'],
    ['https://[fd00::1]/hook', 'PRIVATE_IPV6'],
    ['https://[::ffff:127.0.0.1]/hook', 'PRIVATE_IPV4_MAPPED'],
    ['https://[::ffff:7f00:1]/hook', 'PRIVATE_IPV4_MAPPED'],
    ['not a url', 'URL_PARSE_BLOCKED'],
  ];

  for (const [url, reason] of rejected) {
    let thrown = null;
    try {
      assertPublicHttpsUrl(url);
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, `${url} must be rejected`);
    assert.equal(thrown.status, 403, `${url} must be a 403`);
    assert.equal(thrown.ssrfReason, reason, `${url} rejected for ${thrown.ssrfReason}, expected ${reason}`);
  }
});

test('the SSRF guard accepts ordinary public HTTPS destinations', () => {
  // 172.15 and 172.32 are outside 172.16/12 — rejecting them would break real vendors.
  for (const url of [
    'https://igj.example.org/escalate',
    'https://api.vendor.example.com:8443/hook?x=1',
    'https://172.15.0.1/hook',
    'https://172.32.0.1/hook',
    'https://8.8.8.8/hook',
  ]) {
    assert.doesNotThrow(() => assertPublicHttpsUrl(url), `${url} must be allowed`);
  }
});

function seed({ connections, admins = [ADMIN] } = {}) {
  return createMockDb({
    tables: {
      integration_connections: connections ?? [{
        integration_key: 'igj_escalation',
        legal_gate: 'https://igj.example.org/escalate',
        secret_names: ['REGULATORY_ESCALATION_HMAC_SECRET'],
      }],
      profiles: admins.map((id) => ({ id, role: 'admin', locale: 'nl-NL' })),
      audit_log: [],
      notifications: [],
      push_tokens: admins.map((id) => ({ profile_id: id, token: `token-${id}`, is_active: true })),
      perf_metrics: [],
      security_violations: [],
    },
  });
}

function okProvider(recorded) {
  return (url, init) => {
    recorded.push({ url, init });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

async function withFetch(impl, fn) {
  const real = globalThis.fetch;
  // Production code calls `fetch(...).finally(...)`, so the stub must be a promise.
  globalThis.fetch = (...args) => Promise.resolve(impl(...args));
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test('a critical incident posts a signed payload and records the outcome', async () => {
  const db = seed();
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  const sent = [];
  globalThis.__HAVEN_DNS_STUB__ = ['93.184.216.34'];

  await withFetch(okProvider(sent), () => executeRegulatoryEscalation(INCIDENT, 'kritiek', ELDER));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(sent.length, 1, 'exactly one webhook must be sent');
  assert.equal(sent[0].url, 'https://igj.example.org/escalate');
  const payload = JSON.parse(sent[0].init.body);
  assert.equal(payload.incident_id, INCIDENT);
  assert.equal(payload.severity, 'critical');
  assert.ok(payload.timestamp, 'the payload must carry a timestamp');
  assert.match(sent[0].init.headers['X-Haven-Regulatory-Signature'], /^[0-9a-f]{64}$/,
    'the payload must be signed with a sha256 digest');

  const audit = db.store.audit_log.find((row) => row.action === 'REGULATORY_INCIDENT_ESCALATION');
  assert.ok(audit, 'the outcome must be audited');
  assert.equal(audit.record_id, INCIDENT);
  assert.equal(audit.extra.outcome, 'success');
  assert.equal(audit.extra.http_status, 200);
});

test('a webhook that answers 500 notifies the admins and still audits', async () => {
  const db = seed();
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  globalThis.__HAVEN_DNS_STUB__ = ['93.184.216.34'];

  await withFetch(
    () => new Response('boom', { status: 500 }),
    () => executeRegulatoryEscalation(INCIDENT, 'critical', ELDER),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));

  const adminAlerts = db.store.notifications.filter((row) => row.recipient_id === ADMIN);
  assert.equal(adminAlerts.length, 1, 'a failed escalation must wake the on-call admin');
  assert.equal(adminAlerts[0].data.incident_id, INCIDENT);

  const audit = db.store.audit_log.find((row) => row.action === 'REGULATORY_INCIDENT_ESCALATION');
  assert.equal(audit.extra.outcome, 'failure');
  assert.equal(audit.extra.http_status, 500);
});

test('a configured webhook pointing inside the network is refused before any request', async () => {
  const db = seed({
    connections: [{
      integration_key: 'igj_escalation',
      legal_gate: 'https://169.254.169.254/latest/meta-data/iam',
      secret_names: ['REGULATORY_ESCALATION_HMAC_SECRET'],
    }],
  });
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  const sent = [];

  await withFetch(okProvider(sent), () => executeRegulatoryEscalation(INCIDENT, 'kritiek', ELDER));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(sent.filter((entry) => entry.url.includes('169.254.169.254')).length, 0,
    'the metadata endpoint must never be contacted');
  const rejection = db.store.audit_log.find((row) => row.action === 'REGULATORY_SSRF_REJECTION');
  assert.ok(rejection, 'the refusal must be audited');
  assert.equal(rejection.extra.reason, 'PRIVATE_IPV4');
  assert.equal(rejection.extra.attempted_url, 'https://169.254.169.254/latest/meta-data/iam');
});

test('a public hostname that resolves to an internal address is refused', async () => {
  // DNS rebinding: the URL looks fine, the answer is not. The pre-resolution guard
  // has to catch this, because the URL check alone cannot.
  const db = seed();
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  globalThis.__HAVEN_DNS_STUB__ = ['10.1.2.3'];
  const sent = [];

  await withFetch(okProvider(sent), () => executeRegulatoryEscalation(INCIDENT, 'kritiek', ELDER));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(sent.filter((entry) => entry.url.includes('igj.example.org')).length, 0,
    'the configured hostname must not be contacted once it resolves inside the network');
  const rejection = db.store.audit_log.find((row) => row.action === 'REGULATORY_SSRF_REJECTION');
  assert.ok(rejection);
  assert.equal(rejection.extra.reason, 'SSRF_DNS_RESOLVE_BLOCKED');
});

test('a non-critical incident is skipped entirely', async () => {
  const db = seed();
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  const sent = [];

  await withFetch(okProvider(sent), () => executeRegulatoryEscalation(INCIDENT, 'hoog', ELDER));
  await executeRegulatoryEscalation(INCIDENT, 'medium', ELDER);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(sent.length, 0, 'below critical there is nothing to escalate to the regulator');
  assert.equal(db.store.audit_log.length, 0, 'and nothing to audit as an escalation');
});

test('an unconfigured webhook fails closed rather than silently succeeding', async () => {
  const db = seed({ connections: [] });
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  globalThis.__HAVEN_DNS_STUB__ = ['93.184.216.34'];
  const sent = [];

  // No URL/secret in env and no integration_connections row.
  const saved = { url: Deno.env.get('REGULATORY_ESCALATION_WEBHOOK_URL'), secret: Deno.env.get('REGULATORY_ESCALATION_HMAC_SECRET') };
  Deno.env.delete('REGULATORY_ESCALATION_WEBHOOK_URL');
  Deno.env.delete('REGULATORY_ESCALATION_HMAC_SECRET');

  await withFetch(okProvider(sent), () => executeRegulatoryEscalation(INCIDENT, 'kritiek', ELDER));
  await new Promise((resolve) => setTimeout(resolve, 20));

  Deno.env.set('REGULATORY_ESCALATION_WEBHOOK_URL', saved.url ?? '');
  Deno.env.set('REGULATORY_ESCALATION_HMAC_SECRET', saved.secret ?? '');

  assert.equal(sent.filter((entry) => entry.url.includes('igj.example.org')).length, 0,
    'no webhook may be attempted without a destination');
  const audit = db.store.audit_log.find((row) => row.action === 'REGULATORY_INCIDENT_ESCALATION');
  assert.equal(audit.extra.outcome, 'failure', 'a missing configuration must be audited as a failure');
  assert.equal(db.store.notifications.filter((row) => row.recipient_id === ADMIN).length, 1,
    'and must alert the admins who can fix it');
});
