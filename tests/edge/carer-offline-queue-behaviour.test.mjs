// Driver for apps/carer/src/services/offlineQueue.ts against a real IndexedDB implementation.
//
// Replaces tests/edge/carer-indexeddb-queue-closure.test.mjs, which built a hand-rolled
// `idb` object in the test and asserted against that object — so it proved the assertions,
// not the queue. fake-indexeddb supplies real key ordering, real structured clone and real
// IndexedDBKeyRange semantics; the composite `['carerId','elderId']` partitioning only means
// something against that.
//
// The behaviours here are the ones the static suite claimed: a device shared by two carers
// must not leak one carer's captures to the other, ordering must survive the round trip,
// duplicate submissions must dedupe, and the 413 quota guard must fire before the write.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IDBFactory, IDBKeyRange, indexedDB as sharedFactory } from 'fake-indexeddb';

import { loadAppModule } from './support/edge-function-harness.mjs';

// Every test gets a fresh IDBFactory, so the fixed database name is not a shared global.
function freshIndexedDb() {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
}

const ANNA = 'carer-anna';
const BEATRIX = 'carer-beatrix';
const ELDER_A = '11111111-1111-4111-8111-111111111111';
const ELDER_B = '22222222-2222-4222-8222-222222222222';

async function loadQueue() {
  return loadAppModule('apps/carer/src/services/offlineQueue.ts');
}

const note = (text) => ({ notes_nl: text });

test('two carers sharing a device never see each other’s captures', async () => {
  freshIndexedDb();
  const queue = await loadQueue();

  await queue.enqueueOfflineAction(ANNA, ELDER_A, 'handover_note', note('Anna: mevrouw at goed'));
  await queue.enqueueOfflineAction(ANNA, ELDER_A, 'visit_log', note('Anna: wandeling gemaakt'));
  await queue.enqueueOfflineAction(BEATRIX, ELDER_A, 'incident_report', note('Beatrix: gevallen'));

  const anna = await queue.listOfflineActions(ANNA, ELDER_A);
  const beatrix = await queue.listOfflineActions(BEATRIX, ELDER_A);

  assert.equal(anna.length, 2);
  assert.deepEqual(anna.map((item) => item.carerId), [ANNA, ANNA]);
  assert.equal(beatrix.length, 1);
  assert.equal(beatrix[0].carerId, BEATRIX);
  assert.equal(beatrix[0].payload.notes_nl, 'Beatrix: gevallen');
});

test('a carer’s queue on the same device is partitioned per elder as well', async () => {
  freshIndexedDb();
  const queue = await loadQueue();

  await queue.enqueueOfflineAction(ANNA, ELDER_A, 'handover_note', note('for A'));
  await queue.enqueueOfflineAction(ANNA, ELDER_B, 'handover_note', note('for B'));

  const forA = await queue.listOfflineActions(ANNA, ELDER_A);
  const forB = await queue.listOfflineActions(ANNA, ELDER_B);
  assert.equal(forA.length, 1);
  assert.equal(forB.length, 1);
  assert.equal(forA[0].payload.notes_nl, 'for A');
  assert.equal(forB[0].payload.notes_nl, 'for B');
});

test('a repeated idempotency key dedupes instead of queueing the same capture twice', async () => {
  freshIndexedDb();
  const queue = await loadQueue();

  const key = '3f9a4c1e-0000-4000-8000-00000000c0de';
  await queue.enqueueOfflineAction(ANNA, ELDER_A, 'handover_note', note('first'), key);
  await queue.enqueueOfflineAction(ANNA, ELDER_A, 'handover_note', note('retry of the same'), key);

  const items = await queue.listOfflineActions(ANNA, ELDER_A);
  assert.equal(items.length, 1, 'the store must key on idempotencyKey, not append');
  assert.equal(items[0].payload.notes_nl, 'retry of the same', 'the later attempt wins');
});

test('items come back oldest-first even when they were written out of order', async () => {
  freshIndexedDb();
  const queue = await loadQueue();

  // Enqueue in reverse chronological order by supplying fixed creation stamps.
  await queue.enqueueOfflineAction(ANNA, ELDER_A, 'visit_log', { notes_nl: 'third' }, 'key-3');
  await queue.enqueueOfflineAction(ANNA, ELDER_A, 'visit_log', { notes_nl: 'second' }, 'key-2');
  await queue.enqueueOfflineAction(ANNA, ELDER_A, 'visit_log', { notes_nl: 'first' }, 'key-1');

  // createdAt is stamped by the service; force a deterministic spread through the store.
  const db = await queue.openIndexedDb();
  const tx = db.transaction('offline_actions', 'readwrite');
  const store = tx.objectStore('offline_actions');
  const stamps = { 'key-1': '2026-10-30T08:00:00.000Z', 'key-2': '2026-10-30T09:00:00.000Z', 'key-3': '2026-10-30T10:00:00.000Z' };
  await new Promise((resolve, reject) => {
    for (const [key, createdAt] of Object.entries(stamps)) {
      const get = store.get(key);
      get.onsuccess = () => store.put({ ...get.result, createdAt });
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  const items = await queue.listOfflineActions(ANNA, ELDER_A);
  assert.deepEqual(items.map((item) => item.payload.notes_nl), ['first', 'second', 'third']);
});

test('a payload over the 15MB limit is refused and never reaches the store', async () => {
  freshIndexedDb();
  const queue = await loadQueue();

  const oversized = { notes_nl: 'x'.repeat(15_500_000) };
  await assert.rejects(
    () => queue.enqueueOfflineAction(ANNA, ELDER_A, 'handover_note', oversized),
    /413 Quota Exceeded/,
  );

  assert.deepEqual(await queue.listOfflineActions(ANNA, ELDER_A), [],
    'the rejected capture must not be left half-written');
});

test('a 14MB capture is accepted — the guard is a ceiling, not a small-payload filter', async () => {
  freshIndexedDb();
  const queue = await loadQueue();

  const large = { notes_nl: 'y'.repeat(14_000_000) };
  const item = await queue.enqueueOfflineAction(ANNA, ELDER_A, 'handover_note', large);
  const items = await queue.listOfflineActions(ANNA, ELDER_A);
  assert.equal(items.length, 1);
  assert.equal(items[0].payload.notes_nl.length, 14_000_000);
  assert.equal(item.status, 'queued');
});

test('captures written by the previous localStorage queue migrate once and survive', async () => {
  freshIndexedDb();
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  store.set('haven.carer.offline.queue.v1', JSON.stringify([
    { id: 'legacy-1', action: 'handover_note', payload: { elder_id: ELDER_A, notes_nl: 'from before the upgrade' }, createdAt: '2026-10-29T10:00:00.000Z' },
    { id: 'legacy-2', action: 'visit_log', payload: { elder_id: ELDER_A, notes_nl: 'also from before' }, createdAt: '2026-10-29T11:00:00.000Z' },
  ]));

  try {
    const queue = await loadQueue();
    const migrated = await queue.migrateLocalStorageToIndexedDb(ANNA);
    assert.equal(migrated, 2);
    assert.equal(store.has('haven.carer.offline.queue.v1'), false, 'the old key must be cleared');

    const items = await queue.listOfflineActions(ANNA, ELDER_A);
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((item) => item.payload.notes_nl), ['from before the upgrade', 'also from before'],
      'the migrated entries keep the carer’s order and are attributed to her');

    assert.equal(await queue.migrateLocalStorageToIndexedDb(ANNA), 0, 'a second run finds nothing to do');
    assert.equal((await queue.listOfflineActions(ANNA, ELDER_A)).length, 2, 'and duplicates nothing');
  } finally {
    delete globalThis.localStorage;
  }
});

test('a quarantined capture leaves the queue and keeps the reason', async () => {
  freshIndexedDb();
  const queue = await loadQueue();

  const item = await queue.enqueueOfflineAction(ANNA, ELDER_A, 'incident_report', note('corrupt'));
  await queue.quarantineCorruptEntry(item.idempotencyKey, 'schema_mismatch');

  assert.deepEqual(await queue.listOfflineActions(ANNA, ELDER_A), [],
    'a quarantined entry must not be retried');

  const db = await queue.openIndexedDb();
  const tx = db.transaction('offline_actions', 'readonly');
  const stored = await new Promise((resolve, reject) => {
    const request = tx.objectStore('offline_actions').get(item.idempotencyKey);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(stored.status, 'quarantined');
  assert.equal(stored.quarantineReason, 'schema_mismatch');
});

test('a completed capture is deleted from the store, not merely listed elsewhere', async () => {
  freshIndexedDb();
  const queue = await loadQueue();

  const item = await queue.enqueueOfflineAction(ANNA, ELDER_A, 'visit_log', note('sent'));
  await queue.completeOfflineAction(item.idempotencyKey);

  const db = await queue.openIndexedDb();
  const tx = db.transaction('offline_actions', 'readonly');
  const count = await new Promise((resolve, reject) => {
    const request = tx.objectStore('offline_actions').count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(count, 0, 'the row must be gone so the capture cannot be replayed');
});

test('the pending count the visit list displays reflects the IndexedDB queue', async () => {
  // VisitList.tsx polls getQueueSize() every five seconds for the "N waiting to send" badge.
  // It read a Map that the browser path never writes to, so a carer with unsent captures saw
  // zero. The count now comes from the store.
  freshIndexedDb();
  const queue = await loadQueue();

  assert.equal(queue.getQueueSize(), 0);
  const first = await queue.enqueueOfflineAction(ANNA, ELDER_A, 'handover_note', note('one'));
  await queue.enqueueOfflineAction(ANNA, ELDER_A, 'handover_note', note('two'));
  assert.equal(queue.getQueueSize(), 2, 'the badge must count captures waiting in IndexedDB');

  await queue.completeOfflineAction(first.idempotencyKey);
  assert.equal(queue.getQueueSize(), 1, 'sending one must decrement the badge');

  const quarantined = await queue.enqueueOfflineAction(ANNA, ELDER_A, 'visit_log', note('three'));
  await queue.quarantineCorruptEntry(quarantined.idempotencyKey, 'unreadable');
  assert.equal(queue.getQueueSize(), 1, 'a quarantined capture is no longer waiting to send');
});

test('without IndexedDB the queue still accepts captures, in memory', async () => {
  // The Expo dev client and the unit runtime have no IndexedDB; dropping the capture there
  // would lose the carer's note entirely.
  const savedIndexedDb = globalThis.indexedDB;
  delete globalThis.indexedDB;
  try {
    const queue = await loadQueue();
    const item = await queue.enqueueOfflineAction(ANNA, ELDER_A, 'handover_note', note('offline fallback'));
    assert.equal(item.status, 'queued');
    const items = await queue.listOfflineActions(ANNA, ELDER_A);
    assert.deepEqual(items.map((entry) => entry.payload.notes_nl), ['offline fallback']);
    assert.equal(queue.getQueueSize(), 1);
  } finally {
    globalThis.indexedDB = savedIndexedDb;
  }
});

export { sharedFactory };
