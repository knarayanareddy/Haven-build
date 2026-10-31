// ─── Production IndexedDB Carer Offline Queue (Finding #8 Complete Acceptance) ───
// Fully replaces legacy localStorage string queuing with high-performance IndexedDB.
// Impartitions by carer_id and elder_id, preserves ordering, and dedupes by idempotency_key.

export interface CarerOfflineItem {
  idempotencyKey: string;
  carerId: string;
  elderId: string;
  action: 'handover_note' | 'visit_log' | 'incident_report';
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  status: 'queued' | 'processing' | 'quarantined' | 'done';
  quarantineReason?: string;
}

const DB_NAME = 'haven_carer_offline_idb_v1';
const STORE_NAME = 'offline_actions';
const LEGACY_STORAGE_KEY = 'haven.carer.offline.queue.v1';
const memoryQueue = new Map<string, CarerOfflineItem>();

// The visit list renders "N captures waiting to send" from a synchronous getQueueSize() on a
// five-second interval. IndexedDB can only be read asynchronously, and the previous version
// counted `memoryQueue` — which the browser path never writes to — so the badge always read
// zero. Everything below keeps this mirror current after each mutation.
let pendingCount = 0;

function isPending(item: CarerOfflineItem): boolean {
  return item.status === 'queued' || item.status === 'processing';
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB is not available in this runtime'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'idempotencyKey' });
        // Composite index for multi-tenant Carer & Elder data partitioning
        store.createIndex('carer_elder', ['carerId', 'elderId'], { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function countInStore(db: IDBDatabase, carerId?: string): Promise<number> {
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const request = transaction.objectStore(STORE_NAME).getAll();
  const all = await new Promise<CarerOfflineItem[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as CarerOfflineItem[] | undefined) ?? []);
    request.onerror = () => reject(request.error);
  });
  return all.filter((item) => isPending(item) && (carerId === undefined || item.carerId === carerId)).length;
}

async function recount(db: IDBDatabase, carerId?: string): Promise<number> {
  const count = await countInStore(db, carerId);
  if (carerId === undefined) pendingCount = count;
  return count;
}

function countInMemory(carerId?: string): number {
  return [...memoryQueue.values()]
    .filter((item) => isPending(item) && (carerId === undefined || item.carerId === carerId)).length;
}

// ─── Migration Shim: Move legacy localStorage entries into IndexedDB ───
export async function migrateLocalStorageToIndexedDb(currentCarerId: string): Promise<number> {
  try {
    if (!hasLocalStorage() || !hasIndexedDb()) return 0;
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return 0;

    const legacyItems = JSON.parse(raw) as Array<{ id: string; action: CarerOfflineItem['action']; payload: Record<string, unknown>; createdAt: string }>;
    if (!Array.isArray(legacyItems) || legacyItems.length === 0) return 0;

    const db = await openIndexedDb();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    let migrated = 0;
    for (const item of legacyItems) {
      const elderId = String(item.payload?.elder_id ?? '00000000-0000-0000-0000-000000000001');
      const idemKey = String(item.payload?.idempotency_key ?? item.id ?? crypto.randomUUID());

      const offlineRecord: CarerOfflineItem = {
        idempotencyKey: idemKey,
        carerId: currentCarerId,
        elderId,
        action: item.action ?? 'handover_note',
        payload: item.payload ?? {},
        createdAt: item.createdAt ?? new Date().toISOString(),
        attempts: 0,
        status: 'queued',
      };

      store.put(offlineRecord);
      migrated += 1;
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        void recount(db).catch(() => undefined);
        resolve(migrated);
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (_) {
    return 0;
  }
}

// ─── Enqueue Action (with Quota Guardrails & Deduplication) ───
export async function enqueueOfflineAction(
  carerId: string,
  elderId: string,
  action: CarerOfflineItem['action'],
  payload: Record<string, unknown>,
  customIdempotencyKey?: string
): Promise<CarerOfflineItem> {
  await migrateLocalStorageToIndexedDb(carerId);

  // Quota guardrail: Reject massive bloated individual payloads exceeding 15MB
  const payloadString = JSON.stringify(payload);
  if (payloadString.length > 15_000_000) {
    throw new Error('413 Quota Exceeded: Individual offline capture payload exceeds 15MB safety limit');
  }

  const idempotencyKey = customIdempotencyKey ?? String(payload.idempotency_key ?? crypto.randomUUID());

  const offlineItem: CarerOfflineItem = {
    idempotencyKey,
    carerId,
    elderId,
    action,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'queued',
  };

  if (!hasIndexedDb()) {
    memoryQueue.set(idempotencyKey, offlineItem);
    pendingCount = countInMemory();
    return offlineItem;
  }

  const db = await openIndexedDb();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    // put() natively dedupes existing identical idempotency_key records
    const request = store.put(offlineItem);
    request.onsuccess = async () => {
      // Await the recount so `await enqueueOfflineAction(...)` leaves the badge consistent.
      await recount(db).catch(() => undefined);
      resolve(offlineItem);
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── List Partitioned Queue (Strictly isolates two Carers on same device) ───
export async function listOfflineActions(carerId: string, elderId: string): Promise<CarerOfflineItem[]> {
  await migrateLocalStorageToIndexedDb(carerId);

  if (!hasIndexedDb()) {
    return [...memoryQueue.values()]
      .filter((item) => item.carerId === carerId && item.elderId === elderId && (item.status === 'queued' || item.status === 'processing'))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const db = await openIndexedDb();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index('carer_elder');

  // Exclusively retrieve items matching exact multi-tenant composite key
  const range = IDBKeyRange.only([carerId, elderId]);

  return new Promise((resolve, reject) => {
    const request = index.getAll(range);

    request.onsuccess = () => {
      const items = (request.result as CarerOfflineItem[] ?? []).filter(isPending);
      // Flawlessly preserve chronological ordering
      items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      void recount(db).catch(() => undefined);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── Quarantine Corrupted Entries ───
export async function quarantineCorruptEntry(idempotencyKey: string, reason: string): Promise<void> {
  if (!hasIndexedDb()) {
    const item = memoryQueue.get(idempotencyKey);
    if (item) {
      memoryQueue.set(idempotencyKey, { ...item, status: 'quarantined', quarantineReason: reason });
      pendingCount = countInMemory();
    }
    return;
  }

  const db = await openIndexedDb();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const getReq = store.get(idempotencyKey);
    getReq.onsuccess = () => {
      const item = getReq.result as CarerOfflineItem | undefined;
      if (item) {
        item.status = 'quarantined';
        item.quarantineReason = reason;
        store.put(item);
      }
    };
    transaction.oncomplete = () => {
      recount(db).then(() => resolve(), () => resolve());
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

// ─── Complete Action ───
export async function completeOfflineAction(idempotencyKey: string): Promise<void> {
  if (!hasIndexedDb()) {
    memoryQueue.delete(idempotencyKey);
    pendingCount = countInMemory();
    return;
  }

  const db = await openIndexedDb();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.delete(idempotencyKey);
    request.onsuccess = async () => {
      await recount(db).catch(() => undefined);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Queues a capture under the signed-in carer and the elder it is about.
 *
 * The carer id is a required argument rather than a payload field because it is not part of
 * what the carer typed. It used to be read from `payload.carer_id`, which no caller ever set,
 * so every capture on every handset was filed under the literal string 'offline-carer'. That
 * defeated the per-carer partition the store was built around (a shared handset showed another
 * carer's queue) and made the "N waiting" badge count zero forever, because the badge asks for
 * the signed-in carer's items and none had that id.
 *
 * Throws rather than falling back to a placeholder: a capture filed under the wrong carer is a
 * clinical record attributed to the wrong person.
 */
export async function enqueueOffline(
  carerId: string,
  action: CarerOfflineItem['action'],
  payload: Record<string, unknown>
): Promise<CarerOfflineItem> {
  if (!carerId || carerId === 'offline-carer') {
    throw new Error('enqueueOffline: a signed-in carer id is required');
  }
  const elderId = typeof payload.elder_id === 'string' ? payload.elder_id : '';
  if (!elderId) {
    throw new Error('enqueueOffline: payload.elder_id is required');
  }
  return enqueueOfflineAction(carerId, elderId, action, payload);
}

/**
 * Every pending capture belonging to one carer, across all the elders they visit.
 *
 * The drain runs on launch without knowing which elder the carer is about to open, so it cannot
 * use the (carer, elder) index. Ordered oldest first so notes reach the server in the order
 * they were written.
 */
export async function listOfflineActionsForCarer(carerId: string): Promise<CarerOfflineItem[]> {
  await migrateLocalStorageToIndexedDb(carerId);

  if (!hasIndexedDb()) {
    return [...memoryQueue.values()]
      .filter((item) => item.carerId === carerId && isPending(item))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const db = await openIndexedDb();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const request = transaction.objectStore(STORE_NAME).getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const items = ((request.result as CarerOfflineItem[] | undefined) ?? [])
        .filter((item) => item.carerId === carerId && isPending(item));
      items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      void recount(db, carerId).catch(() => undefined);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Notes that one more delivery attempt was made, without dropping the capture. */
export async function recordOfflineAttempt(idempotencyKey: string): Promise<void> {
  if (!hasIndexedDb()) {
    const item = memoryQueue.get(idempotencyKey);
    if (item) memoryQueue.set(idempotencyKey, { ...item, attempts: item.attempts + 1 });
    return;
  }
  const db = await openIndexedDb();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const get = store.get(idempotencyKey);
    get.onsuccess = () => {
      const item = get.result as CarerOfflineItem | undefined;
      if (!item) {
        resolve();
        return;
      }
      const put = store.put({ ...item, attempts: item.attempts + 1, status: 'queued' });
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

/**
 * Captures waiting to be sent, from the mirror maintained by every mutation above.
 *
 * Synchronous because the visit list renders it directly. After a cold start it reads zero
 * until the first mutation or refresh — call refreshOfflineQueueSize() to make it accurate.
 */
export function getQueueSize(): number {
  return pendingCount;
}

/**
 * Recounts from the store and returns the number of captures still waiting.
 *
 * Pass the signed-in carer's id to count only her captures: the store lives on the device,
 * and a shared carer handset holds more than one person's queue.
 */
export async function refreshOfflineQueueSize(carerId?: string): Promise<number> {
  if (!hasIndexedDb()) {
    const count = countInMemory(carerId);
    pendingCount = countInMemory();
    return count;
  }
  try {
    const db = await openIndexedDb();
    return await recount(db, carerId);
  } catch {
    return getQueueSize();
  }
}
