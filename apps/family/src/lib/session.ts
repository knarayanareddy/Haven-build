import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from './supabase-server';

/**
 * Consent-scoped family session.
 *
 * The dashboard used to render every section and *describe* the permission in the
 * card subtitle ("alleen zichtbaar met can_view_medications") while showing the
 * section unconditionally. Permissions are now resolved from
 * `family_relationships` for the signed-in user and the UI renders only what that
 * relationship actually allows; the same row is what RLS checks, so the UI cannot
 * drift from the database.
 */

export interface FamilyPermissions {
  medications: boolean;
  messages: boolean;
  location: boolean;
  alerts: boolean;
  stories: boolean;
  finances: boolean;
  visits: boolean;
}

export interface FamilySession {
  userId: string;
  email: string | null;
  elderId: string;
  elderName: string;
  permissions: FamilyPermissions;
}

export const NO_PERMISSIONS: FamilyPermissions = {
  medications: false,
  messages: false,
  location: false,
  alerts: false,
  stories: false,
  finances: false,
  visits: false,
};

const SELECT = [
  'elder_id',
  'elder_consented',
  'is_active',
  'can_view_medications',
  'can_view_messages',
  'can_view_location_events',
  'can_view_alerts',
  'can_view_stories',
  'can_view_financials',
].join(',');

interface RelationshipRow {
  elder_id: string;
  elder_consented: boolean | null;
  is_active: boolean | null;
  can_view_medications: boolean | null;
  can_view_messages: boolean | null;
  can_view_location_events: boolean | null;
  can_view_alerts: boolean | null;
  can_view_stories: boolean | null;
  can_view_financials: boolean | null;
}

export type SessionResult =
  | { kind: 'unconfigured' }
  | { kind: 'anonymous' }
  | { kind: 'no-consent'; elderIds: string[] }
  | { kind: 'ready'; session: FamilySession };

/**
 * Resolves the caller's family scope. Returns a discriminated result rather than
 * redirecting, so both the page and tests can reason about each branch.
 */
export async function resolveFamilySession(requestedElderId?: string | null): Promise<SessionResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { kind: 'unconfigured' };

  // getUser() validates the JWT with Supabase Auth; getSession() only decodes the
  // cookie and must not be used for authorisation decisions.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return { kind: 'anonymous' };

  const { data, error } = await supabase.from('family_relationships').select(SELECT).eq('family_member_id', user.id);

  if (error) {
    // RLS refusing the read is an authorisation outcome, not an error to surface.
    return { kind: 'anonymous' };
  }

  const rows = (data ?? []) as unknown as RelationshipRow[];
  const consented = rows.filter((row) => row.elder_consented === true && row.is_active === true);

  if (consented.length === 0) {
    return { kind: 'no-consent', elderIds: rows.map((row) => row.elder_id) };
  }

  const chosen = consented.find((row) => row.elder_id === requestedElderId) ?? consented[0];

  return {
    kind: 'ready',
    session: {
      userId: user.id,
      email: user.email ?? null,
      elderId: chosen.elder_id,
      elderName: (user.user_metadata?.full_name as string | undefined) ?? '',
      permissions: {
        medications: chosen.can_view_medications === true,
        messages: chosen.can_view_messages === true,
        location: chosen.can_view_location_events === true,
        alerts: chosen.can_view_alerts === true,
        stories: chosen.can_view_stories === true,
        finances: chosen.can_view_financials === true,
        // Visit logs follow the care-note permission; there is no separate column.
        visits: chosen.can_view_messages === true,
      },
    },
  };
}

/** Page-level guard: redirects anonymous callers to the sign-in page. */
export async function requireFamilySession(): Promise<FamilySession | null> {
  const result = await resolveFamilySession();
  if (result.kind === 'anonymous') redirect('/inloggen?next=/dashboard');
  if (result.kind === 'ready') return result.session;
  return null;
}
