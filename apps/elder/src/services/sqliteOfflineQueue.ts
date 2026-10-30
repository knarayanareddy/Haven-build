import * as SQLite from 'expo-sqlite';
import type { OfflineAction, OfflineActionType } from './offlineQueue';

const db = SQLite.openDatabaseSync('haven-offline.db');

export function initOfflineQueueDb() {
  db.execSync("create table if not exists offline_actions (idempotency_key text primary key not null, type text not null, payload text not null, created_at text not null, retry_count integer not null default 0, status text not null default 'queued', last_attempt_at text)");
  try {
    db.execSync("alter table offline_actions add column status text not null default 'queued'");
    db.execSync("alter table offline_actions add column last_attempt_at text");
  } catch (_) {
    // Columns already exist
  }
}

export function enqueueOfflineAction(type: OfflineActionType, payload: Record<string, unknown>): OfflineAction {
  initOfflineQueueDb();
  const action: OfflineAction = { 
    idempotencyKey: crypto.randomUUID(), 
    type, 
    payload, 
    createdAt: new Date().toISOString(), 
    retryCount: 0,
    status: 'queued',
  };
  db.runSync(
    "insert into offline_actions (idempotency_key, type, payload, created_at, retry_count, status) values (?, ?, ?, ?, ?, ?)", 
    action.idempotencyKey, action.type, JSON.stringify(action.payload), action.createdAt, action.retryCount, action.status!
  );
  return action;
}

export function listOfflineActions(): OfflineAction[] {
  initOfflineQueueDb();
  const rows = db.getAllSync("select * from offline_actions order by created_at asc") as Array<{ idempotency_key: string; type: OfflineActionType; payload: string; created_at: string; retry_count: number; status: 'queued' | 'processing' | 'done' | 'failed'; last_attempt_at?: string }>;
  return rows.map((row) => ({ 
    idempotencyKey: row.idempotency_key, 
    type: row.type, 
    payload: JSON.parse(row.payload), 
    createdAt: row.created_at, 
    retryCount: row.retry_count,
    status: row.status 
  }));
}

// ─── Atomically claim rows before processing (Rejects multi-worker race conditions) ───
export function claimNextOfflineAction(): OfflineAction | null {
  initOfflineQueueDb();
  const staleCutoff = new Date(Date.now() - 120_000).toISOString();
  
  // Find oldest queued or stale processing entry
  const row = db.getFirstSync(
    "select * from offline_actions where status = 'queued' or (status = 'processing' and coalesce(last_attempt_at, '1970') < ?) order by created_at asc limit 1", 
    staleCutoff
  ) as { idempotency_key: string; type: OfflineActionType; payload: string; created_at: string; retry_count: number; status: 'queued' | 'processing' | 'done' | 'failed' } | null;

  if (!row) return null;

  // Atomically attempt to claim it
  const now = new Date().toISOString();
  const result = db.runSync(
    "update offline_actions set status = 'processing', last_attempt_at = ? where idempotency_key = ? and (status = 'queued' or coalesce(last_attempt_at, '1970') < ?)", 
    now, row.idempotency_key, staleCutoff
  );

  if (result.changes > 0) {
    return {
      idempotencyKey: row.idempotency_key,
      type: row.type,
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
      retryCount: row.retry_count,
      status: 'processing',
    };
  }

  return null; // Claim race lost to concurrent drain worker thread
}

// ─── Complete Action ───
export function completeOfflineAction(idempotencyKey: string) {
  initOfflineQueueDb();
  db.runSync("delete from offline_actions where idempotency_key = ?", idempotencyKey);
}

// ─── Safely reset mid-processing crashes to queued / retry states ───
export function markOfflineActionFailed(idempotencyKey: string) {
  initOfflineQueueDb();
  db.runSync(
    "update offline_actions set retry_count = retry_count + 1, status = case when retry_count + 1 >= 5 then 'failed' else 'queued' end where idempotency_key = ?", 
    idempotencyKey
  );
}

// Legacy helper for compatibility
export function incrementOfflineRetry(idempotencyKey: string) {
  markOfflineActionFailed(idempotencyKey);
}
