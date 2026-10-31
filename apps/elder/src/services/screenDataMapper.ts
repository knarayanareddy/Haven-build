// Turning `fn-screen-data` into the shape the renderer draws.
//
// Kept pure and separate from the fetch so the mapping can be tested against the exact payload
// the endpoint returns — the boundary where an app shows an empty screen is almost always a
// key mismatch, and a mapper asserted in isolation is the only place that shows up cheaply.

import type {
  BuurtRow,
  FamilyMember,
  MedicationRow,
  MessageRow,
  PendingConfirmation,
  ScamEventRow,
  TaskRow,
  VisitLogRow,
} from '../renderer/ScreenRenderer';

export interface ScreenDataPayload {
  data?: {
    reminders?: unknown[];
    messages?: unknown[];
    scam_events?: unknown[];
    neighbourhood_profile?: unknown;
    family?: unknown[];
    tasks?: unknown[];
    pending_confirmations?: unknown[];
    visits?: unknown[];
  } | null;
}

export interface MappedScreenData {
  medications: MedicationRow[];
  messages: MessageRow[];
  scamEvents: ScamEventRow[];
  family: FamilyMember[];
  tasks: TaskRow[];
  visits: VisitLogRow[];
  buurt: BuurtRow;
  pendingConfirmation: PendingConfirmation | null;
}

type Row = Record<string, unknown>;

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' && value.length > 0 ? value : fallback);
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** The reminder enum is Dutch; the renderer only distinguishes these three states. */
function medicationStatus(status: unknown): MedicationRow['status'] {
  const value = str(status, 'gepland');
  if (value === 'ingenomen' || value === 'laat_ingenomen') return 'taken';
  if (value.startsWith('gesnoozed')) return 'snoozed';
  return 'planned';
}

function reminderTime(scheduled: unknown): string {
  const raw = str(scheduled);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function related(value: unknown): Row {
  // PostgREST embeds a to-one relationship as an object; a missing embed arrives as an array.
  if (Array.isArray(value)) return (value[0] as Row) ?? {};
  return (value as Row) ?? {};
}

const RELATIONS: FamilyMember['relation'][] = ['kind', 'partner', 'kleinkind', 'andere'];

function relationOf(value: unknown): FamilyMember['relation'] {
  const raw = str(value, 'kind');
  if (raw === 'kleinkind' || raw === 'partner' || raw === 'kind') return raw;
  return RELATIONS.includes(raw as FamilyMember['relation']) ? (raw as FamilyMember['relation']) : 'andere';
}

export function mapScreenData(payload: ScreenDataPayload | null, locale: 'nl-NL' | 'en-GB'): MappedScreenData {
  const data = payload?.data ?? {};
  const familyRows = (data.family ?? []) as Row[];

  // Message senders are named through the family list the same payload carries; an unknown
  // sender is left unnamed rather than shown as a raw UUID.
  const nameByProfile = new Map<string, string>();
  for (const row of familyRows) {
    const profile = related(row.profiles);
    const id = str(row.family_member_id);
    if (id) nameByProfile.set(id, str(profile.preferred_name) || str(profile.full_name) || '');
  }

  const medications: MedicationRow[] = ((data.reminders ?? []) as Row[]).map((row) => {
    const med = related(row.medications);
    return {
      id: str(row.id),
      name: locale === 'nl-NL'
        ? str(med.name_nl) || str(med.name_en)
        : str(med.name_en) || str(med.name_nl),
      dose: locale === 'nl-NL' ? str(med.dose_description_nl) : str(med.dose_description_en),
      descriptionNl: str(med.dose_description_nl),
      descriptionEn: str(med.dose_description_en),
      time: reminderTime(row.scheduled_time),
      status: medicationStatus(row.status),
    };
  });

  const messages: MessageRow[] = ((data.messages ?? []) as Row[]).map((row) => {
    const kind = str(row.message_type, 'text');
    const sender = nameByProfile.get(str(row.sender_id)) ?? '';
    return {
      id: str(row.id),
      from: sender,
      kind: kind === 'video' || kind === 'voice' || kind === 'heart' ? kind : 'text',
      body: locale === 'nl-NL' ? str(row.content_nl) || str(row.content_en) : str(row.content_en) || str(row.content_nl),
      // Read state lives in a separate table the screen does not need; a message is new until
      // the elder has opened the conversation, which this payload cannot see. Showing them all
      // as read is the conservative direction: no unread badge for a message already seen.
      unread: false,
    };
  });

  const scamEvents: ScamEventRow[] = ((data.scam_events ?? []) as Row[]).map((row) => {
    const level = str(row.alert_level, 'none');
    return {
      id: str(row.id),
      level: level === 'amber' || level === 'rood' || level === 'zwart' ? level : 'none',
      channel: str(row.channel),
      score: num(row.score_composite),
      explanation: locale === 'nl-NL' ? str(row.explanation_nl) : str(row.explanation_en) || str(row.explanation_nl),
      notified: false,
    };
  });

  const family: FamilyMember[] = familyRows.map((row) => {
    const profile = related(row.profiles);
    return {
      id: str(row.family_member_id),
      name: str(profile.preferred_name) || str(profile.full_name) || str(row.relation_label_nl),
      relation: relationOf(row.relation_type),
      isPrimary: row.is_primary === true,
    };
  });

  const tasks: TaskRow[] = ((data.tasks ?? []) as Row[]).map((row) => ({
    id: str(row.id),
    icon: '•',
    title: locale === 'nl-NL' ? str(row.title_nl) || str(row.title_en) : str(row.title_en) || str(row.title_nl),
    titleEn: str(row.title_en),
    subtitle: str(row.due_date),
    done: row.completed === true,
  }));

  const visits: VisitLogRow[] = ((data.visits ?? []) as Row[]).map((row) => ({
    date: str(row.visit_date) || str(row.check_in_time).slice(0, 10),
    carer: nameByProfile.get(str(row.carer_id)) ?? '',
    note: str(row.observations_nl),
  }));

  const neighbourhood = (data.neighbourhood_profile ?? null) as Row | null;

  const confirmationRows = (data.pending_confirmations ?? []) as Row[];
  const confirmation = confirmationRows[0];
  const pendingConfirmation: PendingConfirmation | null = confirmation
    ? {
      id: str(confirmation.id),
      kind: str(confirmation.confirmation_type) === 'fall_response' ? 'fall_response' : 'medication_taken',
      medicationName: str(related(confirmation.payload).medication_name_nl) || undefined,
      expiresAt: str(confirmation.expires_at),
    }
    : null;

  return {
    medications,
    messages,
    scamEvents,
    family,
    tasks,
    visits,
    buurt: {
      active: neighbourhood?.is_active === true,
      nearbyCount: 0,
      tags: [],
      walkBuddyCount: neighbourhood?.walk_buddy_seeking === true ? 1 : 0,
      events: [],
    },
    pendingConfirmation,
  };
}
