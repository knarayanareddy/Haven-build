// Draining the elder app's offline queue.
//
// Nothing drained it before: `OfflineSyncMachine` existed but was never constructed, so a
// medication confirmation or check-in captured without a network stayed in SQLite forever and
// the elder was told "we will send this later" by an app that never would.
//
// The loop here is the same shape as the machine's — claim, send, complete or fail — with two
// differences that matter:
//
//   * the destination comes from `planOfflineDispatch`, not from a `screenData` fallback;
//   * a capture that can never succeed is quarantined on its first attempt instead of being
//     retried to the ceiling. Retrying a request the server will always reject burns the
//     elder's battery and hides the capture for longer.

import type { OfflineAction } from './offlineQueue';
import { isPlan, planOfflineDispatch, type OfflineDispatchClient } from './offlineDispatch';

export interface DrainQueueStore {
  claimNext: () => OfflineAction | null;
  complete: (idempotencyKey: string) => void;
  fail: (idempotencyKey: string) => void;
  /** Marks a capture as undeliverable; it leaves the queue with a reason. */
  quarantine: (idempotencyKey: string, reason: string) => void;
}

export interface DrainElderQueueResult {
  sent: number;
  failed: number;
  quarantined: number;
}

export interface DrainOptions {
  store: DrainQueueStore;
  client: OfflineDispatchClient;
  /** Stops after this many deliveries so one launch cannot run for minutes. */
  maxPerRun?: number;
  onQuarantine?: (action: OfflineAction, reason: string) => void;
}

/**
 * Drains until the queue is empty (or the per-run ceiling is reached).
 *
 * A network failure stops the run and leaves the capture queued for the next attempt; that is
 * the difference between "try again later" and "drop it". A rejected payload does not stop the
 * run — the remaining captures are still worth delivering.
 */
export async function drainElderQueue(options: DrainOptions): Promise<DrainElderQueueResult> {
  const { store, client, maxPerRun = 25, onQuarantine } = options;
  const result: DrainElderQueueResult = { sent: 0, failed: 0, quarantined: 0 };

  for (let processed = 0; processed < maxPerRun; processed += 1) {
    const action = store.claimNext();
    if (!action) break;

    const outcome = planOfflineDispatch(action);
    if (!isPlan(outcome)) {
      store.quarantine(action.idempotencyKey, outcome.reason);
      onQuarantine?.(action, outcome.reason);
      result.quarantined += 1;
      continue;
    }

    try {
      await outcome.plan(client);
      store.complete(action.idempotencyKey);
      result.sent += 1;
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      // A 4xx means the server will refuse this capture every time. 5xx and network errors
      // may succeed later, so those go back to the queue.
      const status = Number((error as { status?: unknown })?.status ?? /^(\d{3})\b/.exec(message)?.[1] ?? 0);
      if (status >= 400 && status < 500) {
        store.quarantine(action.idempotencyKey, `rejected: ${message}`);
        onQuarantine?.(action, message);
        result.quarantined += 1;
        continue;
      }
      store.fail(action.idempotencyKey);
      result.failed += 1;
      break;
    }
  }

  return result;
}
