// The device-side queue, and what happens when it drains into an erased record.
//
// Replaces two static suites:
//   tests/edge/sqlite-offline-queue-closure.test.mjs   (re-implemented the queue in JS)
//   tests/edge/post-erasure-injection-r6-closure.test.mjs (a Map pretending to be a DB)
//
// Together these cover one real scenario: a carer writes a handover note underground,
// it sits in the device queue, and by the time the phone reconnects the older adult has
// exercised their right to erasure. The note must be refused, not written — and the
// queue itself must not lose or duplicate the entry while it waits.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  call,
  createMockDb,
  loadAppModule,
  loadEdgeFunction,
  request,
} from './support/edge-function-harness.mjs';
import { __resetAllDatabases } from './support/expo-sqlite-node.mjs';

const ELDER = 'eeee0000-0000-4000-8000-0000000000e1';
const CARER = 'ffff0000-0000-4000-8000-0000000000c1';

// ─── the device queue (apps/elder/src/services/sqliteOfflineQueue.ts) ────────

let queue;
beforeEach(async () => {
  __resetAllDatabases();
  queue = await loadAppModule('apps/elder/src/services/sqliteOfflineQueue.ts');
  queue.initOfflineQueueDb();
});

test('an action enqueued offline is listed back with its payload intact', () => {
  const action = queue.enqueueOfflineAction('CONFIRM_MEDICATION', { reminderId: 'r-1', taken: true });
  const listed = queue.listOfflineActions();

  assert.equal(listed.length, 1);
  assert.equal(listed[0].idempotencyKey, action.idempotencyKey);
  assert.deepEqual(listed[0].payload, { reminderId: 'r-1', taken: true });
  assert.equal(listed[0].status, 'queued');
  assert.equal(listed[0].retryCount, 0);
});

test('claiming an action leases it so a second worker cannot take it', () => {
  // Two drain workers can run at once (a foreground retry and a background task). The
  // lease is what stops the same confirmation being sent twice.
  queue.enqueueOfflineAction('CONFIRM_MEDICATION', { reminderId: 'r-1' });

  const first = queue.claimNextOfflineAction();
  assert.equal(first.status, 'processing');

  const second = queue.claimNextOfflineAction();
  assert.equal(second, null, 'a leased action must not be handed to a second worker');

  assert.equal(queue.listOfflineActions()[0].status, 'processing');
});

test('a lease abandoned by a crash is recovered after two minutes', () => {
  queue.enqueueOfflineAction('CONFIRM_MEDICATION', { reminderId: 'r-1' });
  const leased = queue.claimNextOfflineAction();
  assert.equal(leased.status, 'processing');

  // The worker died holding the lease. Age it past the two-minute staleness cutoff, which
  // is what the wall clock would do while the phone sat in a locker.
  const stale = new Date(Date.now() - 130_000).toISOString();
  queue.__sqlite.openDatabaseSync('haven-offline.db')
    .runSync('update offline_actions set last_attempt_at = ? where idempotency_key = ?',
      stale, leased.idempotencyKey);

  const reclaimed = queue.claimNextOfflineAction();
  assert.ok(reclaimed, 'a stale lease must be reclaimable, or a crashed drain strands the action forever');
  assert.equal(reclaimed.idempotencyKey, leased.idempotencyKey);
});

test('a lease inside the window is not stolen', () => {
  queue.enqueueOfflineAction('CONFIRM_MEDICATION', { reminderId: 'r-1' });
  const leased = queue.claimNextOfflineAction();
  queue.__sqlite.openDatabaseSync('haven-offline.db')
    .runSync('update offline_actions set last_attempt_at = ? where idempotency_key = ?',
      new Date(Date.now() - 30_000).toISOString(), leased.idempotencyKey);

  assert.equal(queue.claimNextOfflineAction(), null,
    'a worker that is merely slow must keep its lease');
});

test('a completed action leaves the queue', () => {
  const action = queue.enqueueOfflineAction('SEND_MESSAGE', { text: 'hallo' });
  queue.claimNextOfflineAction();
  queue.completeOfflineAction(action.idempotencyKey);

  assert.equal(queue.listOfflineActions().length, 0);
});

test('a repeatedly failing action is retried, then parked as failed', () => {
  const action = queue.enqueueOfflineAction('CONFIRM_MEDICATION', { reminderId: 'r-1' });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    queue.claimNextOfflineAction();
    queue.markOfflineActionFailed(action.idempotencyKey);
    const entry = queue.listOfflineActions()[0];
    assert.equal(entry.status, 'queued', `after ${attempt} failures the action is still retryable`);
    assert.equal(entry.retryCount, attempt);
  }

  queue.claimNextOfflineAction();
  queue.markOfflineActionFailed(action.idempotencyKey);
  const parked = queue.listOfflineActions()[0];
  assert.equal(parked.status, 'failed', 'after five failures the action must stop being retried');
  assert.equal(parked.retryCount, 5);
  assert.equal(queue.claimNextOfflineAction(), null, 'a parked action must not be claimed again');
});

// ─── draining into an erased record (fn-carer-handover-note) ─────────────────

function handoverSeed({ elderStatus = 'active' } = {}) {
  return createMockDb({
    tables: {
      profiles: [{ id: ELDER, role: 'elder', status: elderStatus }],
      carer_relationships: [{
        id: 'rel-1',
        elder_id: ELDER,
        carer_member_id: CARER,
        elder_consented: true,
        is_active: true,
      }],
      carer_handover_notes: [],
      medications: [],
      audit_log: [],
      perf_metrics: [],
      notifications: [],
      device_health_events: [],
    },
  });
}

async function submitNote(db) {
  const harness = await loadEdgeFunction('fn-carer-handover-note', { db, env: {} });
  const response = await call(harness.handler, request('fn-carer-handover-note', {
    body: {
      elder_id: ELDER,
      appetite: 3,
      mood: 4,
      notes_nl: 'Mevrouw heeft slecht gegeten vandaag.',
      // A UUID, not a random float: the BSN guard scans every string field and a
      // long digit run trips it (correctly — it cannot tell a float from a BSN).
      idempotency_key: crypto.randomUUID(),
    },
    headers: { authorization: `Bearer test-user:${CARER}` },
  }));
  await harness.settle();
  return response;
}

test('a queued note drains normally for an active older adult', async () => {
  const db = handoverSeed();
  const result = await submitNote(db);

  assert.equal(result.status, 200, JSON.stringify(result.body).slice(0, 200));
  assert.ok(db.store.carer_handover_notes.length >= 1, 'the note must be written');
});

test('a queued note for an erased older adult is refused and never written', async () => {
  // The offline capture happened before the erasure. Replaying it afterwards would
  // recreate personal data the person asked to have removed.
  const db = handoverSeed({ elderStatus: 'erased' });
  const result = await submitNote(db);

  assert.equal(result.status, 403, JSON.stringify(result.body).slice(0, 200));
  assert.equal(db.store.carer_handover_notes.length, 0, 'no row may be written for an erased record');

  const rejection = db.store.audit_log.find((row) => row.action === 'POST_ERASURE_WRITE_REJECTION');
  assert.ok(rejection, 'the refusal must be audited');
  assert.equal(rejection.elder_id, ELDER);
  assert.equal(rejection.extra.profile_status, 'erased');
});

test('a carer without an active relationship cannot write at all', async () => {
  const db = handoverSeed();
  db.store.carer_relationships = [];
  const result = await submitNote(db);

  assert.ok(result.status >= 400, `expected a refusal, got ${result.status}`);
  assert.equal(db.store.carer_handover_notes.length, 0);
});
