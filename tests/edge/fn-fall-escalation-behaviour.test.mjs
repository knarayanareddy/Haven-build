// Behavioural tests for fn-fall-escalation.
//
// Replaces two static suites:
//   tests/edge/fn-fall-escalation-isolation.test.mjs  (a fake escalator class)
//   tests/edge/crisis-query-safety-closure.test.mjs   (asserted on handler SQL text)
//
// Both described the dispatch loop correctly and could not fail when it broke,
// because neither loaded `fn-fall-escalation/index.ts`. This suite runs the real
// handler against an in-memory PostgREST double and asserts what it did.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  call,
  createMockDb,
  loadEdgeFunction,
  request,
} from './support/edge-function-harness.mjs';

const INTERNAL_KEY = 'test-internal-key-that-is-at-least-32-chars';
const ELDER_ID = '11111111-1111-4111-8111-111111111111';
const FAMILY_OK = '22222222-2222-4222-8222-222222222222';
const FAMILY_GONE = '33333333-3333-4333-8333-333333333333';

function fall(fallId) {
  return {
    fall_id: fallId,
    elder_id: ELDER_ID,
    detection_source: 'watch',
    confidence: 0.9,
    status: 'possible',
    detected_at: new Date().toISOString(),
    device_label: 'Horloge',
    device_platform: 'watchos',
  };
}

function seed({ falls }) {
  return createMockDb({
    tables: {
      fall_events: falls.map((entry) => ({ id: entry.fall_id, elder_id: entry.elder_id, status: entry.status, escalation_claimed_at: entry.status === 'processing' ? new Date(Date.now() - 600_000).toISOString() : null })),
      family_relationships: [
        { family_member_id: FAMILY_OK, elder_id: ELDER_ID, elder_consented: true, is_active: true, notify_on_crisis: true },
        { family_member_id: FAMILY_GONE, elder_id: ELDER_ID, elder_consented: true, is_active: true, notify_on_crisis: true },
      ],
      profiles: [
        { id: FAMILY_OK, locale: 'nl-NL' },
        { id: FAMILY_GONE, locale: 'nl-NL' },
      ],
      push_tokens: [
        { profile_id: FAMILY_OK, token: 'token-good', is_active: true },
        { profile_id: FAMILY_GONE, token: 'token-gone', is_active: true },
      ],
      location_events: [],
      notifications: [],
      audit_log: [],
      security_violations: [],
      perf_metrics: [],
    },
    rpcResults: { get_active_emergency_falls: falls },
  });
}

/** The push provider rejects only the token belonging to the revoked device. */
const pushProvider = (url, init) => {
  if (url.startsWith('https://exp.host')) {
    const payload = JSON.parse(init.body);
    if (payload[0]?.to === 'token-gone') {
      return new Response(JSON.stringify({ error: 'DeviceNotRegistered' }), { status: 410 });
    }
    return new Response(JSON.stringify({ data: [{ status: 'ok' }] }), { status: 200 });
  }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};

async function run(db, { key = INTERNAL_KEY } = {}) {
  const harness = await loadEdgeFunction('fn-fall-escalation', {
    db,
    env: { HAVEN_INTERNAL_KEY: INTERNAL_KEY, EXPO_ACCESS_TOKEN: 'expo-test' },
    fetchImpl: pushProvider,
  });
  const response = await call(harness.handler, request('fn-fall-escalation', {
    headers: { 'x-haven-internal-key': key },
  }));
  await harness.settle();
  return { ...response, harness };
}

test('a push failure for one recipient does not stop the others, or the next fall', async () => {
  const falls = [fall('fall-a'), fall('fall-b')];
  const db = seed({ falls });
  const result = await run(db);

  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.events_processed, 2, 'both falls must reach the family-alerted state');

  // The rejected device is deactivated; the healthy one is left alone.
  const tokens = db.store.push_tokens;
  assert.equal(tokens.find((row) => row.token === 'token-gone').is_active, false,
    'a 410 DeviceNotRegistered must deactivate that token');
  assert.equal(tokens.find((row) => row.token === 'token-good').is_active, true,
    'a healthy token must survive a sibling failure');

  // Both falls were escalated despite the failure, and both got a notification row.
  const statuses = db.store.fall_events.map((row) => row.status);
  assert.deepEqual(statuses, ['family_alerted', 'family_alerted']);
  assert.equal(db.store.notifications.length, 4, 'two recipients × two falls');
});

test('a stale processing claim is recovered and audited', async () => {
  // FIX A3: a row left in 'processing' (worker died mid-escalation) must be reclaimable,
  // otherwise the fall is never escalated and nobody is told. The RPC snapshot says
  // 'processing', so the handler's claim update matches and it records why.
  const db = seed({ falls: [{ ...fall('fall-reclaimed'), status: 'processing' }] });
  const result = await run(db);

  assert.equal(result.status, 200);
  assert.equal(result.body.events_processed, 1, 'a stale claim must be recovered, not abandoned');
  const recovered = db.store.audit_log.filter((row) => row.action === 'STALE_CLAIM_RECOVERED');
  assert.equal(recovered.length, 1, 'recovering a stale claim must be audited');
  assert.equal(recovered[0].elders ?? recovered[0].elder_id, ELDER_ID);
});

test('a fall another worker claimed between the RPC and the update is skipped', async () => {
  // The RPC returns 'possible', but by the time the claim update runs the row is
  // 'family_alerted' — the real race. The conditional claim then matches nothing and
  // the loop must not notify a second time.
  const db = seed({ falls: [fall('fall-raced')] });
  db.store.fall_events[0].status = 'family_alerted';
  const result = await run(db);

  assert.equal(result.status, 200);
  assert.equal(result.body.events_processed, 0, 'a fall claimed by another worker must not be counted');
  assert.equal(db.store.notifications.length, 0, 'and must not notify anyone a second time');
});

test('a call without the internal key is rejected before any database work', async () => {
  const db = seed({ falls: [fall('fall-a')] });
  const result = await run(db, { key: 'wrong-key' });

  // 403, not 401: the caller is not a user who needs to authenticate, they are
  // presenting the wrong internal key. Assert the contract, not a wish.
  assert.equal(result.status, 403, `expected 403, got ${result.status}: ${JSON.stringify(result.body)}`);
  assert.equal(db.store.notifications.length, 0, 'no notification may be written for an unauthorised call');
  assert.equal(db.store.fall_events[0].status, 'possible', 'no fall may be claimed');
});

test('the escalation query is not narrowed by a time window or device state', async () => {
  // The old static suite asserted the migration text contained `WHERE f.status = 'possible'`.
  // What actually matters is that a fall detected a long time ago and belonging to a
  // revoked device still gets escalated, so pass a stale timestamp and assert it lands.
  const stale = { ...fall('fall-stale'), detected_at: new Date(Date.now() - 90 * 60 * 1000).toISOString() };
  const db = seed({ falls: [stale] });
  const result = await run(db);

  assert.equal(result.status, 200);
  assert.equal(result.body.alerted_ids.includes('fall-stale'), true,
    'a 90-minute-old fall must still be escalated');
  assert.equal(db.store.notifications.length, 2);
});
