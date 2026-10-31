/**
 * Every action the app can queue.
 *
 * A type stays in this union only while something queues it. Four were removed with the
 * October 2026 audit: `SYNC_CALENDAR` (the module that queued it was a stub and is gone),
 * `CREATE_TASK` and `SEND_MESSAGE` (nothing ever produced them — the screens that would have
 * raise alerts instead) and `FALL_RESPONSE` (it reported a *new* detection, so answering "I am
 * fine" created a second fall event; answers are `CONFIRMATION_RESPOND` now). A queue entry
 * type nobody can create is a route nobody can test.
 */
export type OfflineActionType =
  // Tapping "taken" on a specific reminder, and snoozing one. The denial of a medication
  // prompt travels as CONFIRMATION_RESPOND: a tap on a reminder is not a denial, and nothing
  // ever queued DENY_MEDICATION.
  | 'CONFIRM_MEDICATION'
  | 'SNOOZE_MEDICATION'
  | 'DAILY_CHECKIN'
  | 'WELLNESS_CHECKIN'
  | 'CONSENT_PACK_DECIDE'
  // An answer to a pending confirmation (a detected fall, a medication prompt).
  | 'CONFIRMATION_RESPOND';

export interface OfflineAction {
  idempotencyKey: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  status?: 'queued' | 'processing' | 'done' | 'failed';
}

export class OfflineActionQueue {
  private actions: OfflineAction[] = [];

  enqueue(type: OfflineActionType, payload: Record<string, unknown>) {
    const action: OfflineAction = {
      idempotencyKey: crypto.randomUUID(),
      type,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'queued',
    };
    this.actions.push(action);
    return action;
  }

  list() { return [...this.actions]; }

  markComplete(idempotencyKey: string) {
    this.actions = this.actions.filter((action) => action.idempotencyKey !== idempotencyKey);
  }

  markRetry(idempotencyKey: string) {
    this.actions = this.actions.map((action) => action.idempotencyKey === idempotencyKey ? { ...action, retryCount: action.retryCount + 1 } : action);
  }

  async flush(handler: (action: OfflineAction) => Promise<void>) {
    for (const action of this.list()) {
      try {
        await handler(action);
        this.markComplete(action.idempotencyKey);
      } catch (_) {
        this.markRetry(action.idempotencyKey);
      }
    }
  }
}
