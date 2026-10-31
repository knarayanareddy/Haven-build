// Sending a queued carer capture to the endpoint the online path would have used.
//
// Kept as an explicit table for the same reason the elder dispatcher is: the previous sync
// machine had a catch-all that posted unknown captures to a *read* endpoint, which looked like
// a successful send and silently discarded the note. An action type with no entry here fails
// loudly instead.

import type { CarerOfflineItem } from './offlineQueue';
import type { CarerClient } from './havenClient';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export interface CarerDeliveryTarget {
  deliver: (client: CarerClient) => Promise<unknown>;
}

/**
 * The function that accepts this capture.
 *
 * `carer_id` and `elder_id` come from the stored item, not from the payload the carer typed,
 * so the destination is always attributed to whoever was signed in when it was written.
 */
export function carerDeliveryFor(item: CarerOfflineItem): CarerDeliveryTarget | null {
  const payload = item.payload;

  switch (item.action) {
    case 'visit_log':
      return {
        deliver: (client) => client.visitLog({
          elder_id: item.elderId,
          carer_id: item.carerId,
          ...(asString(payload.check_in_time) ? { check_in_time: asString(payload.check_in_time)! } : {}),
          ...(asString(payload.check_out_time) ? { check_out_time: asString(payload.check_out_time)! } : {}),
        }),
      };
    case 'handover_note':
      return {
        deliver: (client) => client.handoverNote({
          elder_id: item.elderId,
          appetite: asNumber(payload.appetite, 3),
          mood: asNumber(payload.mood, 3),
          ...(asString(payload.mobility) ? { mobility: asString(payload.mobility)! } : {}),
          // The form stores `concerns`/`notes`; the function reads the Dutch-suffixed names.
          // Sending the stored keys as-is dropped the free-text part of every note.
          ...(asString(payload.concerns) ? { concerns_nl: asString(payload.concerns)! } : {}),
          ...(asString(payload.notes) ? { notes_nl: asString(payload.notes)! } : {}),
          // The online path sends what was administered and when. The queued path used to drop
          // both, so a medication given during a visit that happened to be offline — the normal
          // case for a rural round — left no record that it had been given.
          ...(asString(payload.administered_medication_id)
            ? { administered_medication_id: asString(payload.administered_medication_id)! }
            : {}),
          ...(asString(payload.administered_at) ? { administered_at: asString(payload.administered_at)! } : {}),
        }),
      };
    case 'incident_report':
      return {
        deliver: (client) => client.incidentReport({
          elder_id: item.elderId,
          severity: asString(payload.severity) ?? 'medium',
          summary_nl: asString(payload.summary_nl) ?? asString(payload.notes) ?? '',
          ...(asString(payload.category) ? { category: asString(payload.category)! } : {}),
        }),
      };
    default: {
      const exhaustive: never = item.action;
      throw new Error(`No delivery route for queued capture type ${String(exhaustive)}`);
    }
  }
}
