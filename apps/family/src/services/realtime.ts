export interface RealtimeSubscriptionSpec {
  channel: string;
  table: string;
  filter: string;
  permission: string;
}

// Every channel is scoped to this dashboard's elder (or to the viewer's own notifications).
// `scam_events` and `location_events` used to be filtered by *content* instead — alert level and
// event type — so a family member with two consented elders would have both elders' rows arrive
// on either dashboard, each refresh triggered by the other's data. Realtime applies one filter
// string per table, and the elder is the one that must not be dropped; the level and type
// filters belong to the query, which re-runs with the server render anyway.
export const familyRealtimeSubscriptions: RealtimeSubscriptionSpec[] = [
  { channel: 'scam-alerts', table: 'scam_events', filter: 'elder_id=eq.:elderId', permission: 'can_view_alerts' },
  { channel: 'medication-status', table: 'medication_reminders', filter: 'elder_id=eq.:elderId', permission: 'can_view_medications' },
  { channel: 'family-messages', table: 'family_messages', filter: 'elder_id=eq.:elderId', permission: 'can_view_messages' },
  { channel: 'notifications', table: 'notifications', filter: 'recipient_id=eq.:profileId', permission: 'self' },
  { channel: 'location-events', table: 'location_events', filter: 'elder_id=eq.:elderId', permission: 'can_view_location_events' },
];

export function resolveRealtimeFilter(template: string, values: Record<string, string>) {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_, key) => values[key] ?? '');
}

export interface FamilyPermissionsForRealtime {
  alerts: boolean;
  medications: boolean;
  messages: boolean;
  location: boolean;
}

/**
 * The subscriptions this family member is allowed to open, with the elder id substituted in.
 *
 * Permissions are checked here rather than relied upon in RLS alone: an unpermitted channel
 * still costs a websocket and, on a phone, battery — and a rejected postgres_changes
 * subscription fails silently, so a subscriber that is not allowed to see a table would look
 * identical to one that is. `self` rows (own notifications) need no permission.
 */
export function subscriptionsFor(
  permissions: FamilyPermissionsForRealtime,
  ids: { elderId: string; profileId: string }
): RealtimeSubscriptionSpec[] {
  const allowed: Record<string, boolean> = {
    can_view_alerts: permissions.alerts,
    can_view_medications: permissions.medications,
    can_view_messages: permissions.messages,
    can_view_location_events: permissions.location,
    self: true,
  };

  return familyRealtimeSubscriptions
    .filter((spec) => allowed[spec.permission] === true)
    .map((spec) => ({ ...spec, filter: resolveRealtimeFilter(spec.filter, ids) }));
}
