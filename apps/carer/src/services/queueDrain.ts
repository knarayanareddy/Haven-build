// Draining the carer app's offline queue.
//
// The IndexedDB queue was written, partitioned per carer and per elder, and tested — and then
// never read. `listOfflineActions` had no caller outside its own test, so a handover note taken
// in a basement stayed on the handset forever while the screen said "saved, will send when
// online". For a carer that is a note that never reaches the next shift.
//
// Three rules make this drain safe to run on every launch:
//
//   * a capture is only deleted after the server accepts it, so a crash mid-send re-sends rather
//     than loses it (the endpoints are idempotent on `idempotency_key`);
//   * a 4xx is permanent — the payload is wrong and will never be accepted — so the capture is
//     quarantined with the server's reason instead of being retried;
//   * a network failure stops the whole run, because the next item will fail the same way.

import type { CarerOfflineItem } from './offlineQueue';

export interface CarerQueueStore {
  list: (carerId: string) => Promise<CarerOfflineItem[]>;
  complete: (idempotencyKey: string) => Promise<void>;
  quarantine: (idempotencyKey: string, reason: string) => Promise<void>;
  /** Records a failed attempt so a permanently failing capture eventually stops. */
  recordAttempt: (idempotencyKey: string) => Promise<void>;
}

export interface CarerDelivery {
  (item: CarerOfflineItem): Promise<unknown>;
}

export interface CarerDrainResult {
  sent: number;
  quarantined: number;
  remaining: number;
}

export interface CarerDrainOptions {
  carerId: string;
  store: CarerQueueStore;
  deliver: CarerDelivery;
  /** Attempts after which a capture is quarantined rather than retried forever. */
  maxAttempts?: number;
  onQuarantine?: (item: CarerOfflineItem, reason: string) => void;
}

/**
 * Sends everything queued for `carerId`.
 *
 * Only that carer's captures: the store lives on the handset and a shared device holds a
 * colleague's queue too. Sending another carer's note under this session's token would be
 * rejected by `fn-carer-handover-note` anyway — it checks the caller against the carer id.
 */
export async function drainCarerQueue(options: CarerDrainOptions): Promise<CarerDrainResult> {
  const { carerId, store, deliver, maxAttempts = 5, onQuarantine } = options;
  const items = await store.list(carerId);
  const result: CarerDrainResult = { sent: 0, quarantined: 0, remaining: 0 };

  for (const item of items) {
    try {
      await deliver(item);
      await store.complete(item.idempotencyKey);
      result.sent += 1;
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      const status = Number((error as { status?: unknown })?.status ?? /^(\d{3})\b/.exec(message)?.[1] ?? 0);

      if (status >= 400 && status < 500) {
        await store.quarantine(item.idempotencyKey, `rejected: ${message}`);
        onQuarantine?.(item, message);
        result.quarantined += 1;
        continue;
      }

      await store.recordAttempt(item.idempotencyKey);
      if (item.attempts + 1 >= maxAttempts) {
        await store.quarantine(item.idempotencyKey, `gave up after ${item.attempts + 1} attempts: ${message}`);
        onQuarantine?.(item, message);
        result.quarantined += 1;
        continue;
      }

      // Still offline, or the server is unwell. Everything after this will fail the same way.
      result.remaining = items.length - result.sent - result.quarantined;
      break;
    }
  }

  if (result.remaining === 0) {
    result.remaining = Math.max(0, items.length - result.sent - result.quarantined);
  }
  return result;
}
