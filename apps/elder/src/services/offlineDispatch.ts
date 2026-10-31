// Sending a queued capture to the function that can actually accept it.
//
// `OfflineSyncMachine` sent every unrecognised action type to `client.screenData()` — a read
// endpoint — so a queued fall response, daily check-in or consent decision was "delivered" as a
// screen-data request and then deleted from the queue. It also confirmed medication with
// `client.voice({ transcript_text: 'I took it' })`, which works only while the voice pipeline's
// intent classifier still recognises that exact sentence.
//
// This module replaces the fallback with an explicit table, and — more importantly — with an
// explicit *failure*. An action whose payload is missing the fields the endpoint needs, or
// whose type has no endpoint, is reported as `permanent` and quarantined by the drain. A
// capture that can never succeed must not be retried five times and then dropped silently.

import type { OfflineAction, OfflineActionType } from './offlineQueue';

/** The calls a queued action may need. Kept structural so a test can supply a stub. */
export interface OfflineDispatchClient {
  voice(input: object): Promise<unknown>;
  invoke(fn: string, body?: object): Promise<unknown>;
}

/** Either a call to make, or the reason this capture can never be delivered. */
export type DispatchPlan =
  | { plan: (client: OfflineDispatchClient) => Promise<unknown> }
  | { plan: null; reason: string };

const permanent = (reason: string): DispatchPlan => ({ plan: null, reason });

function requireFields(payload: Record<string, unknown>, fields: string[]): string | null {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');
  return missing.length > 0 ? `missing ${missing.join(', ')}` : null;
}

/**
 * Every action type the app can queue.
 *
 * `never` at the end means a new OfflineActionType cannot be added without deciding where it
 * goes — the compiler catches it instead of the fallback silently reading screen data.
 */
export function planOfflineDispatch(action: OfflineAction): DispatchPlan {
  const payload = action.payload ?? {};

  const route = (fields: string[], call: (client: OfflineDispatchClient) => Promise<unknown>): DispatchPlan => {
    const missing = requireFields(payload, fields);
    if (missing) return permanent(`${action.type} ${missing}`);
    return { plan: call };
  };

  const type: OfflineActionType = action.type;
  switch (type) {
    case 'CONFIRM_MEDICATION':
      // The online path for a medication tap is the voice pipeline with the reminder named
      // (`useHavenActions.ts`), so the queued path sends the same thing. Naming the reminder
      // matters: the pipeline otherwise picks the earliest open dose, so a queued tap on the
      // evening pill could confirm the morning one.
      return route(['elder_id', 'medication_id'], (client) => client.voice({
        elder_id: payload.elder_id,
        screen_id: payload.screen_id ?? 'PILLS',
        locale: payload.locale ?? 'nl-NL',
        transcript_text: 'I took it',
        medication_reminder_id: payload.medication_id,
      }));

    case 'SNOOZE_MEDICATION':
      // Not a sentence: an explicit snooze, so it cannot be classified as "I took it".
      return route(['elder_id', 'medication_id'], (client) => client.voice({
        elder_id: payload.elder_id,
        screen_id: payload.screen_id ?? 'PILLS',
        locale: payload.locale ?? 'nl-NL',
        snooze_reminder_id: payload.medication_id,
        snooze_minutes: typeof payload.delay_minutes === 'number' ? payload.delay_minutes : 15,
      }));

    case 'DAILY_CHECKIN':
    case 'WELLNESS_CHECKIN':
      // Not fn-health-log: that function accepts only hydration, nutrition and vitals, so a
      // check-in sent there is rejected on every attempt and the elder's answer is quarantined.
      // fn-wellness-checkin is the endpoint the live check-in screen uses.
      return route(['elder_id'], (client) => client.invoke('fn-wellness-checkin', { ...payload }));

    case 'CONFIRMATION_RESPOND':
      return route(['elder_id', 'confirmation_id', 'resolution'], (client) => client.invoke('fn-pending-confirmation-respond', {
        confirmation_id: payload.confirmation_id,
        resolution: payload.resolution,
      }));

    case 'CONSENT_PACK_DECIDE':
      return route(['elder_id', 'pack_key'], (client) => client.invoke('fn-consent-pack-decide', { ...payload }));

    default: {
      // A new OfflineActionType must be routed deliberately; `never` makes that a compile
      // error rather than a silent trip to the wrong endpoint.
      const exhaustive: never = type;
      return permanent(`unknown action type ${String(exhaustive)}`);
    }
  }
}

export function isPlan(outcome: DispatchPlan): outcome is { plan: (client: OfflineDispatchClient) => Promise<unknown> } {
  return outcome.plan !== null;
}
