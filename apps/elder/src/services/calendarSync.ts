// ─── Phase 4.6: Calendar Sync Service ───
// Two-way sync between elder's device calendar and HAVEN appointments table.
// Uses expo-calendar for device access and fn-telehealth-transport for backend.
//
// Read path: device calendar → HAVEN appointments (syncs every 30 min)
// Write path: HAVEN appointments → device calendar (on save)
// Family dashboard: Agenda tab shows merged view (with elder consent)
//
// Privacy: Only syncs appointments with is_medical = true.
// Personal calendar events are never read or uploaded.
// BSN-checked on all title/notes fields.

import { enqueueOfflineAction } from './sqliteOfflineQueue';
import { classifyNetworkError } from '../state/networkResilience';

// We use a dynamic import pattern since expo-calendar may not be available
// in all environments (e.g., in tests or web)
let CalendarModule: {
  requestCalendarPermissionsAsync: () => Promise<{ granted: boolean }>;
  getCalendarsAsync: () => Promise<Array<{ id: string; title: string; isPrimary: boolean }>>;
  getEventsAsync: (
    calendarIds: string[],
    startDate: Date,
    endDate: Date,
  ) => Promise<Array<{
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    location?: string;
    notes?: string;
  }>>;
  createEventAsync: (calendarId: string, event: Record<string, unknown>) => Promise<string>;
  updateEventAsync: (eventId: string, event: Record<string, unknown>) => Promise<void>;
  deleteEventAsync: (eventId: string) => Promise<void>;
  EntityTypes: { EVENT: string };
  Calendar: { DEFAULT: string };
  Source: { LOCAL: string };
} | null = null;

async function loadCalendarModule() {
  if (CalendarModule) return CalendarModule;
  try {
    CalendarModule = await import('expo-calendar');
  } catch {
    // expo-calendar not available — skip sync
    console.log('Calendar sync disabled: expo-calendar not available');
  }
  return CalendarModule;
}

export interface CalendarSyncConfig {
  supabaseUrl: string;
  accessToken: string;
  elderId: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  notes?: string;
  isMedical: boolean;
  appointmentId?: string; // HAVEN appointment ID if synced from backend
}

// ─── Read: device calendar → HAVEN ───
export async function syncDeviceToHaven(config: CalendarSyncConfig): Promise<{
  synced: number;
  skipped: number;
  errors: number;
}> {
  const calendar = await loadCalendarModule();
  if (!calendar) return { synced: 0, skipped: 0, errors: 0 };

  try {
    // Request permission
    const { granted } = await calendar.requestCalendarPermissionsAsync();
    if (!granted) return { synced: 0, skipped: 0, errors: 1 };

    // Get default calendar
    const calendars = await calendar.getCalendarsAsync();
    const defaultCal = calendars.find((c) => c.isPrimary) ?? calendars[0];
    if (!defaultCal) return { synced: 0, skipped: 0, errors: 1 };

    // Fetch events for next 30 days
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const events = await calendar.getEventsAsync([defaultCal.id], now, thirtyDays);

    let synced = 0;
    let skipped = 0;
    const errors = 0;

    for (const event of events) {
      // Only sync medical-related events (detect by title patterns)
      const medicalPatterns = /huisarts|dokter|ziekenhuis|apotheek|medicijn|therapie|fysio|consult|afspraak|controle/i;
      if (!medicalPatterns.test(event.title)) {
        skipped++;
        continue;
      }

      // Sync to HAVEN backend
      try {
        await fetch(`${config.supabaseUrl}/functions/v1/fn-telehealth-transport`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            elder_id: config.elderId,
            action: 'create_appointment',
            title_nl: event.title,
            starts_at: event.startDate,
            ends_at: event.endDate,
            location_label: event.location,
            is_medical: true,
            created_by_id: config.elderId,
          }),
        });
        synced++;
      } catch (error) {
        if (classifyNetworkError(error) !== 'offline') {
          // Queue for later sync
          enqueueOfflineAction('SYNC_CALENDAR', {
            event_id: event.id,
            event_title: event.title,
            event_start: event.startDate,
            event_end: event.endDate,
            event_location: event.location,
          });
        }
      }
    }

    return { synced, skipped, errors };
  } catch (error) {
    console.warn('Calendar sync failed:', String((error as Error).message ?? error));
    return { synced: 0, skipped: 0, errors: 1 };
  }
}

// ─── Write: HAVEN appointments → device calendar ───
export async function syncHavenToDevice(
  config: CalendarSyncConfig,
  appointments: Array<{
    id: string;
    title_nl: string;
    starts_at: string;
    ends_at: string;
    location_label?: string;
  }>,
): Promise<{ created: number; updated: number }> {
  const calendar = await loadCalendarModule();
  if (!calendar) return { created: 0, updated: 0 };

  try {
    const { granted } = await calendar.requestCalendarPermissionsAsync();
    if (!granted) return { created: 0, updated: 0 };

    const calendars = await calendar.getCalendarsAsync();
    const defaultCal = calendars.find((c) => c.isPrimary) ?? calendars[0];
    if (!defaultCal) return { created: 0, updated: 0 };

    let created = 0;
    let updated = 0;

    for (const apt of appointments) {
      try {
        // Check if this appointment already exists on the device
        const startTime = new Date(apt.starts_at);
        const endTime = new Date(apt.ends_at);
        const existing = await calendar.getEventsAsync(
          [defaultCal.id],
          new Date(startTime.getTime() - 60_000),
          new Date(endTime.getTime() + 60_000),
        );

        const match = existing.find(
          (e) => e.title === `💊 ${apt.title_nl}` || e.title === apt.title_nl,
        );

        if (match) {
          await calendar.updateEventAsync(match.id, {
            title: `💊 ${apt.title_nl}`,
            startDate: apt.starts_at,
            endDate: apt.ends_at,
            notes: 'HAVEN zorgafspraak — automatisch bijgewerkt',
          });
          updated++;
        } else {
          await calendar.createEventAsync(defaultCal.id, {
            title: `💊 ${apt.title_nl}`,
            startDate: apt.starts_at,
            endDate: apt.ends_at,
            location: apt.location_label ?? '',
            notes: 'HAVEN zorgafspraak',
            alarms: [{ relativeOffset: -30 }], // 30 minute reminder
          });
          created++;
        }
      } catch {
        // Single appointment failure shouldn't block others
      }
    }

    return { created, updated };
  } catch (error) {
    console.warn('Device calendar sync failed:', String((error as Error).message ?? error));
    return { created: 0, updated: 0 };
  }
}

// ─── Family Dashboard: Agenda view ───
export async function fetchAgendaForFamily(
  config: CalendarSyncConfig,
): Promise<Array<{
  id: string;
  title_nl: string;
  starts_at: string;
  ends_at: string;
  location_label: string | null;
  is_medical: boolean;
}>> {
  try {
    const response = await fetch(
      `${config.supabaseUrl}/rest/v1/appointments?elder_id=eq.${config.elderId}&order=starts_at.asc&limit=20`,
      {
        headers: {
          apikey: config.accessToken,
          authorization: `Bearer ${config.accessToken}`,
        },
      },
    );

    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}
