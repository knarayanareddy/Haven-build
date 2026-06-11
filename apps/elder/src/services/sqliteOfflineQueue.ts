import * as SQLite from 'expo-sqlite';
import type { OfflineAction, OfflineActionType } from './offlineQueue';

const db = SQLite.openDatabaseSync('haven-offline.db');

export function initOfflineQueueDb() {
  db.execSync('create table if not exists offline_actions (idempotency_key text primary key not null, type text not null, payload text not null, created_at text not null, retry_count integer not null default 0)');
}

export function enqueueOfflineAction(type: OfflineActionType, payload: Record<string, unknown>) {
  initOfflineQueueDb();
  const action: OfflineAction = { idempotencyKey: crypto.randomUUID(), type, payload, createdAt: new Date().toISOString(), retryCount: 0 };
  db.runSync('insert into offline_actions (idempotency_key, type, payload, created_at, retry_count) values (?, ?, ?, ?, ?)', action.idempotencyKey, action.type, JSON.stringify(action.payload), action.createdAt, action.retryCount);
  return action;
}

export function listOfflineActions(): OfflineAction[] {
  initOfflineQueueDb();
  return db.getAllSync<{ idempotency_key: string; type: OfflineActionType; payload: string; created_at: string; retry_count: number }>('select * from offline_actions order by created_at asc').map((row) => ({ idempotencyKey: row.idempotency_key, type: row.type, payload: JSON.parse(row.payload), createdAt: row.created_at, retryCount: row.retry_count }));
}

export function completeOfflineAction(idempotencyKey: string) {
  db.runSync('delete from offline_actions where idempotency_key = ?', idempotencyKey);
}

export function incrementOfflineRetry(idempotencyKey: string) {
  db.runSync('update offline_actions set retry_count = retry_count + 1 where idempotency_key = ?', idempotencyKey);
}
