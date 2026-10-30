// `expo-sqlite` on top of Node's built-in SQLite, for driving the real offline queue.
//
// apps/elder/src/services/sqliteOfflineQueue.ts is the durable store between the app and
// the network. Its behaviour — atomic claim, stale-lease recovery, retry ceiling — is
// the difference between "a medication confirmation survives a subway tunnel" and "the
// dose is confirmed twice or not at all". The suite that covered it re-implemented the
// queue in JavaScript, so it proved nothing about this file.
//
// The module only needs four calls, so this shim implements exactly those on top of
// `node:sqlite` (available since Node 22.5 without a package) and nothing else. A test
// imports the module through the harness, which rewrites the `expo-sqlite` specifier to
// this file.

import { DatabaseSync } from 'node:sqlite';

const databases = new Map();

function open(name = 'haven-offline.db') {
  if (!databases.has(name)) databases.set(name, new DatabaseSync(':memory:'));
  return databases.get(name);
}

/** The subset of the expo-sqlite API that sqliteOfflineQueue.ts uses. */
export function openDatabaseSync(name) {
  const db = open(name);
  return {
    /** Runs a statement that returns nothing (DDL, multi-statement scripts). */
    execSync(sql) {
      db.exec(sql);
      return undefined;
    },
    /** Runs a write; returns the number of rows it touched. */
    runSync(sql, ...params) {
      const statement = db.prepare(sql);
      const result = statement.run(...flatten(params));
      return { changes: Number(result.changes ?? 0), lastInsertRowId: Number(result.lastInsertRowid ?? 0) };
    },
    getAllSync(sql, ...params) {
      return db.prepare(sql).all(...flatten(params));
    },
    getFirstSync(sql, ...params) {
      return db.prepare(sql).get(...flatten(params)) ?? null;
    },
    /** Test-only: drop everything, so each case starts from an empty device. */
    closeSync() {
      databases.delete(name);
    },
  };
}

/** expo-sqlite accepts either positional arguments or a single array. */
function flatten(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

/** Resets every open database — call between cases. */
export function __resetAllDatabases() {
  databases.clear();
}

export default { openDatabaseSync };
