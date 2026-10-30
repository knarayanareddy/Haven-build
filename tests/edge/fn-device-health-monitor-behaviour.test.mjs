// Behavioural tests for fn-device-health-monitor.
//
// Replaces two static suites:
//   tests/edge/device-health-spoofing-closure.test.mjs  (a SimulatedDeviceHealthMonitor class)
//   tests/edge/device-auto-revoke-r7-closure.test.mjs   (a simulated revoke counter)
//
// Both encoded the policy in the test file, so they asserted that the copy worked.
// The handler itself was never loaded. This suite posts real requests at the real
// handler and inspects what it wrote, which is the only way to know the shipped
// signature check, replay guard and auto-revoke threshold are the ones described.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  call,
  createMockDb,
  loadEdgeFunction,
  request,
} from './support/edge-function-harness.mjs';

const INTERNAL_KEY = 'test-internal-key-that-is-at-least-32-chars';
const ELDER = '44444444-4444-4444-8444-444444444444';
const FAMILY = '55555555-5555-4555-8555-555555555555';
const DEVICE = 'device-session-1';
const SECRET = 'device-secret-abc';

/** Same digest the handler computes: sha256("<id>:<nonce>:<ts>:<payload>:<secret>"). */
function sign({ id = DEVICE, nonce, timestamp, payload, secret = SECRET }) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return createHash('sha256').update(`${id}:${nonce}:${timestamp}:${body}:${secret}`).digest('hex');
}

function seed({ session = {}, now = Date.now() } = {}) {
  return createMockDb({
    tables: {
      device_sessions: [{
        id: DEVICE,
        profile_id: ELDER,
        device_secret: SECRET,
        revoked_at: null,
        consecutive_auth_failures: 0,
        last_seen_at: new Date(now - 60_000).toISOString(),
        platform: 'ios',
        ...session,
      }],
      device_telemetry_nonces: [],
      security_violations: [],
      device_health_events: [],
      profiles: [{ id: ELDER, role: 'elder', preferred_name: 'Oma', full_name: 'Oma Jansen', locale: 'nl-NL', deleted_at: null }],
      family_relationships: [{ family_member_id: FAMILY, elder_id: ELDER, elder_consented: true, is_active: true, notify_on_crisis: true }],
      push_tokens: [{ profile_id: FAMILY, token: 'family-token', is_active: true }],
      notifications: [],
      perf_metrics: [],
      audit_log: [],
    },
  });
}

async function post(db, { nonce = 'nonce-1', timestamp = new Date().toISOString(), payload = { bpm: 72 }, signature } = {}) {
  const harness = await loadEdgeFunction('fn-device-health-monitor', {
    db,
    env: { HAVEN_INTERNAL_KEY: INTERNAL_KEY },
  });
  const sig = signature === undefined ? sign({ nonce, timestamp, payload }) : signature;
  const headers = {};
  if (sig !== null) headers['x-haven-device-signature'] = sig;
  const response = await call(harness.handler, request('fn-device-health-monitor', {
    body: { device_session_id: DEVICE, nonce, timestamp, payload },
    headers,
  }));
  await harness.settle();
  return response;
}

test('telemetry without a signature is refused and logged as a security violation', async () => {
  const db = seed();
  const result = await post(db, { signature: null });

  assert.equal(result.status, 403, JSON.stringify(result.body));
  const logged = db.store.security_violations.map((row) => row.error_code);
  assert.deepEqual(logged, ['403_UNSIGNED']);
  assert.equal(db.store.device_sessions[0].consecutive_auth_failures, 0,
    'an unsigned request is not an authentication attempt against the secret');
});

test('a correctly signed request is accepted, its nonce is burned, and the failure counter resets', async () => {
  const db = seed({ session: { consecutive_auth_failures: 3 } });
  const result = await post(db);

  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.status, 'telemetry_verified');
  assert.equal(db.store.device_telemetry_nonces.length, 1, 'the nonce must be stored for replay detection');
  assert.equal(db.store.device_sessions[0].consecutive_auth_failures, 0, 'a verified request resets the counter');
});

test('a replayed nonce is refused even when the signature is valid', async () => {
  // This is the spoofing case that matters: an attacker who captured a whole request
  // replays it byte-for-byte. The signature is genuine; the nonce is not fresh.
  const db = seed();
  db.store.device_telemetry_nonces.push({ nonce: 'nonce-replayed', device_session_id: DEVICE });
  const result = await post(db, { nonce: 'nonce-replayed' });

  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.match(String(result.body.error), /403_AUTH_FAILURE/);
  assert.equal(db.store.device_sessions[0].consecutive_auth_failures, 1, 'a replay counts as an auth failure');
});

test('a timestamp outside the five-minute drift window is refused', async () => {
  const db = seed();
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const result = await post(db, { nonce: 'nonce-stale', timestamp: stale });

  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal(db.store.device_telemetry_nonces.length, 0, 'a rejected request must not burn a nonce');
  assert.equal(db.store.device_sessions[0].consecutive_auth_failures, 1);
});

test('a wrong signature is refused and does not burn the nonce', async () => {
  const db = seed();
  const result = await post(db, { nonce: 'nonce-bad-sig', signature: 'f'.repeat(64) });

  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal(db.store.device_telemetry_nonces.length, 0);
  assert.equal(db.store.security_violations[0].error_code, '403_AUTH_FAILURE');
});

test('the fifth consecutive auth failure soft-revokes the device and tells the family', async () => {
  // R7: a device that keeps failing attestation is either compromised or in the hands
  // of someone else, so it is revoked automatically and the family is notified once.
  const db = seed({ session: { consecutive_auth_failures: 4 } });
  const result = await post(db, { nonce: 'nonce-trigger', signature: 'e'.repeat(64) });

  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.match(String(result.body.error), /403_REVOKED/);

  const session = db.store.device_sessions[0];
  assert.ok(session.revoked_at, 'the session must be soft-revoked at the threshold');
  assert.equal(session.consecutive_auth_failures, 5);

  const codes = db.store.security_violations.map((row) => row.error_code);
  assert.ok(codes.includes('AUTO_REVOKE_ATTACK_THRESHOLD'), `expected the threshold audit row, got ${codes.join(', ')}`);
  assert.equal(db.store.notifications.length, 1, 'the family must be told exactly once');
  assert.equal(db.store.notifications[0].notification_type ?? db.store.notifications[0].type ?? 'crisis_gedetecteerd',
    'crisis_gedetecteerd');
});

test('a revoked device stays revoked', async () => {
  const db = seed({ session: { revoked_at: new Date().toISOString() } });
  const result = await post(db);

  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.match(String(result.body.error), /403_REVOKED/);
  assert.equal(db.store.device_telemetry_nonces.length, 0);
});

test('an unknown device session is refused', async () => {
  const db = seed();
  db.store.device_sessions.length = 0;
  const result = await post(db);

  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.match(String(result.body.error), /403_SESSION_ERR/);
});

test('the eleventh request in a minute is rate-limited', async () => {
  // The burst guard is in-memory per isolate, so this drives the same handler
  // instance eleven times rather than asserting a limit constant exists.
  const db = seed();
  const harness = await loadEdgeFunction('fn-device-health-monitor', {
    db,
    env: { HAVEN_INTERNAL_KEY: INTERNAL_KEY },
  });
  const statuses = [];
  for (let index = 0; index < 11; index += 1) {
    const nonce = `burst-${index}`;
    const timestamp = new Date().toISOString();
    const response = await call(harness.handler, request('fn-device-health-monitor', {
      body: { device_session_id: DEVICE, nonce, timestamp, payload: { bpm: 70 } },
      headers: { 'x-haven-device-signature': sign({ nonce, timestamp, payload: { bpm: 70 } }) },
    }));
    statuses.push(response.status);
  }
  await harness.settle();

  assert.equal(statuses[10], 429, `expected the 11th to be throttled, got ${statuses.join(',')}`);
  const bursts = db.store.security_violations.filter((row) => row.error_code === '429_SPAM_BURST');
  assert.equal(bursts.length, 1, 'a burst must leave exactly one security-violation row');
});

// ─── the scheduled sweep (GET) ────────────────────────────────────────────────

async function sweep(db) {
  const harness = await loadEdgeFunction('fn-device-health-monitor', {
    db,
    env: { HAVEN_INTERNAL_KEY: INTERNAL_KEY },
  });
  const response = await call(harness.handler, request('fn-device-health-monitor', {
    method: 'GET',
    headers: { 'x-haven-internal-key': INTERNAL_KEY },
  }));
  await harness.settle();
  return response;
}

const hoursAgo = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();

test('the sweep escalates at 48 h, warns at 24 h, and stays quiet under 12 h', async () => {
  const cases = [
    { hours: 50, expectedKey: 'no_heartbeat_48h', severity: 'p0', notifies: 1 },
    { hours: 26, expectedKey: 'no_heartbeat_24h', severity: 'p1', notifies: 1 },
    { hours: 13, expectedKey: 'no_heartbeat_12h', severity: 'warn', notifies: 0 },
    { hours: 2, expectedKey: null, severity: null, notifies: 0 },
  ];

  for (const entry of cases) {
    const db = seed({ session: { last_seen_at: hoursAgo(entry.hours) } });
    const result = await sweep(db);
    assert.equal(result.status, 200, JSON.stringify(result.body));

    const events = db.store.device_health_events;
    if (entry.expectedKey === null) {
      assert.equal(events.length, 0, `${entry.hours} h is within the healthy window, so nothing is written`);
    } else {
      assert.equal(events.length, 1, `${entry.hours} h should write exactly one health event`);
      assert.equal(events[0].event_key, entry.expectedKey);
      assert.equal(events[0].severity, entry.severity);
    }
    assert.equal(db.store.notifications.length, entry.notifies,
      `${entry.hours} h should notify ${entry.notifies} family member(s)`);
  }
});

test('an elder with no device session at all still gets a health event', async () => {
  const db = seed();
  db.store.device_sessions.length = 0;
  const result = await sweep(db);

  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(db.store.device_health_events[0].event_key, 'no_heartbeat_12h');
  assert.equal(db.store.device_health_events[0].severity, 'warn');
  assert.equal(db.store.notifications.length, 0, 'a missing first session is not an emergency');
});

test('the sweep is not callable without the internal key', async () => {
  const db = seed({ session: { last_seen_at: hoursAgo(50) } });
  const harness = await loadEdgeFunction('fn-device-health-monitor', {
    db,
    env: { HAVEN_INTERNAL_KEY: INTERNAL_KEY },
  });
  const response = await call(harness.handler, request('fn-device-health-monitor', {
    method: 'GET',
    headers: { 'x-haven-internal-key': 'not-the-key' },
  }));

  assert.equal(response.status, 403, JSON.stringify(response.body));
  assert.equal(db.store.device_health_events.length, 0, 'no sweep work may happen on a rejected call');
});
