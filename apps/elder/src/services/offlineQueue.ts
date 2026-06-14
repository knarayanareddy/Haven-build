export type OfflineActionType = 'CONFIRM_MEDICATION' | 'SNOOZE_MEDICATION' | 'CREATE_TASK' | 'SEND_MESSAGE' | 'WELLNESS_CHECKIN' | 'SYNC_CALENDAR' | 'CONSENT_PACK_DECIDE' | 'DAILY_CHECKIN' | 'DENY_MEDICATION' | 'FALL_RESPONSE';

export interface OfflineAction {
  idempotencyKey: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
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
