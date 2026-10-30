// Behavioural tests for fn-vital-threshold-check.
//
// Replaces tests/edge/vital-threshold-s2-closure.test.mjs, which ran a simulated
// engine with a copy of the recipient-selection rule. The rule that actually matters
// — notify consented family and professional carers who opted in to crisis alerts,
// and nobody else — lives in the handler's queries, so this suite drives the handler.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  call,
  createMockDb,
  loadEdgeFunction,
  request,
} from './support/edge-function-harness.mjs';

const INTERNAL_KEY = 'test-internal-key-that-is-at-least-32-chars';
const ELDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FAMILY_OPTED_IN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FAMILY_OPTED_OUT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FAMILY_NOT_CONSENTED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CARER_OPTED_IN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function seed({ vitals } = {}) {
  return createMockDb({
    tables: {
      vital_signs: vitals ?? [{
        id: 'vital-1',
        elder_id: ELDER,
        vital_type: 'heart_rate',
        value: 148,
        unit: 'bpm',
        threshold_flag: true,
        family_notified_at: null,
        recorded_at: new Date().toISOString(),
      }],
      family_relationships: [
        { family_member_id: FAMILY_OPTED_IN, elder_id: ELDER, elder_consented: true, is_active: true, notify_on_crisis: true },
        { family_member_id: FAMILY_OPTED_OUT, elder_id: ELDER, elder_consented: true, is_active: true, notify_on_crisis: false },
        { family_member_id: FAMILY_NOT_CONSENTED, elder_id: ELDER, elder_consented: false, is_active: true, notify_on_crisis: true },
      ],
      carer_relationships: [
        { carer_member_id: CARER_OPTED_IN, elder_id: ELDER, is_active: true, notify_on_crisis: true },
      ],
      profiles: [
        { id: FAMILY_OPTED_IN, locale: 'nl-NL' },
        { id: CARER_OPTED_IN, locale: 'nl-NL' },
      ],
      push_tokens: [
        { profile_id: FAMILY_OPTED_IN, token: 'family-token', is_active: true },
        { profile_id: CARER_OPTED_IN, token: 'carer-token', is_active: true },
      ],
      notifications: [],
      device_health_events: [],
      perf_metrics: [],
      audit_log: [],
    },
  });
}

async function run(db, { key = INTERNAL_KEY, method = 'POST' } = {}) {
  const harness = await loadEdgeFunction('fn-vital-threshold-check', {
    db,
    env: { HAVEN_INTERNAL_KEY: INTERNAL_KEY },
  });
  const response = await call(harness.handler, request('fn-vital-threshold-check', {
    method,
    headers: { 'x-haven-internal-key': key },
  }));
  await harness.settle();
  return response;
}

test('only consented, opted-in family and carers are notified', async () => {
  const db = seed();
  const result = await run(db);

  assert.equal(result.status, 200, JSON.stringify(result.body));
  const recipients = db.store.notifications.map((row) => row.recipient_id).sort();
  assert.deepEqual(recipients, [FAMILY_OPTED_IN, CARER_OPTED_IN].sort(),
    `notified ${recipients.join(', ')}`);

  assert.equal(db.store.notifications.some((row) => row.recipient_id === FAMILY_OPTED_OUT), false,
    'a delegate who opted out of crisis alerts must not be woken up');
  assert.equal(db.store.notifications.some((row) => row.recipient_id === FAMILY_NOT_CONSENTED), false,
    'a delegate the elder has not consented to must never be told anything');
});

test('the vital is marked notified so the next sweep does not repeat it', async () => {
  const db = seed();
  const first = await run(db);
  assert.equal(first.body.notified, 1);
  assert.ok(db.store.vital_signs[0].family_notified_at, 'family_notified_at must be written');

  // Second run in the same database: the row no longer matches the sweep's filter.
  const second = await run(db);
  assert.equal(second.body.vitals_processed, 0, 'an already-notified vital must not be processed again');
  assert.equal(db.store.notifications.length, 2, 'and must not produce another round of notifications');
});

test('a vital with no stakeholders is still marked as handled', async () => {
  // Nobody to tell is a legitimate outcome (the elder has no consented delegates),
  // but leaving the row unnotified would make it re-scan forever.
  const db = seed();
  db.store.family_relationships = [];
  db.store.carer_relationships = [];
  const result = await run(db);

  assert.equal(result.status, 200);
  assert.equal(result.body.notified, 1);
  assert.equal(db.store.notifications.length, 0);
  assert.ok(db.store.vital_signs[0].family_notified_at);
});

test('one failing notification does not stop the others or the timestamp', async () => {
  // The push provider rejects the carer's device. The family member must still be
  // notified, and the vital must still be stamped — otherwise the failure turns into
  // an infinite retry loop that re-notifies everyone who did succeed.
  const db = seed();
  const harness = await loadEdgeFunction('fn-vital-threshold-check', {
    db,
    env: { HAVEN_INTERNAL_KEY: INTERNAL_KEY },
    fetchImpl: (url, init) => {
      if (url.startsWith('https://exp.host')) {
        const payload = JSON.parse(init.body);
        if (payload[0]?.to === 'carer-token') {
          return new Response(JSON.stringify({ error: 'DeviceNotRegistered' }), { status: 410 });
        }
        return new Response(JSON.stringify({ data: [{ status: 'ok' }] }), { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const result = await call(harness.handler, request('fn-vital-threshold-check', {
    method: 'POST',
    headers: { 'x-haven-internal-key': INTERNAL_KEY },
  }));
  await harness.settle();

  assert.equal(result.status, 200, JSON.stringify(result.body));
  const byRecipient = Object.fromEntries(db.store.notifications.map((row) => [row.recipient_id, row]));
  assert.equal(db.store.notifications.length, 2, 'both recipients should have been attempted');
  assert.equal(byRecipient[FAMILY_OPTED_IN].send_error ?? null, null, 'the healthy recipient must be delivered');
  assert.ok(byRecipient[CARER_OPTED_IN].send_error, 'the rejected recipient must record why it failed');
  assert.ok(db.store.vital_signs[0].family_notified_at);
});

test('the check is not runnable without the internal key', async () => {
  const db = seed();
  const result = await run(db, { key: 'wrong' });

  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal(db.store.notifications.length, 0);
  assert.equal(db.store.vital_signs[0].family_notified_at, null);
});
