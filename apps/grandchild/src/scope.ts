import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Which older adult this child may write to.
 *
 * The old screen made the child type an elder id and a `family_member_id`. Both are facts of
 * the signed-in person's relationships, not of what they can remember, and letting a client
 * name them is how a "send hello" ends up aimed at another family's elder. The relationship
 * row is read under RLS as the caller, so the answer is whatever they are actually entitled to.
 */

export interface GrandchildScope {
  elderId: string;
  elderName: string;
  /** The caller's own profile id — never typed, taken from the verified session. */
  familyMemberId: string;
}

interface RelationshipRow {
  elder_id: string;
  elder_consented: boolean | null;
  is_active: boolean | null;
  profiles?: { preferred_name?: string | null } | null;
}

export async function resolveGrandchildScope(
  client: SupabaseClient,
  userId: string
): Promise<GrandchildScope | null> {
  const { data, error } = await client
    .from('family_relationships')
    .select('elder_id, elder_consented, is_active, profiles:elder_id(preferred_name)')
    .eq('family_member_id', userId)
    .eq('elder_consented', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as RelationshipRow;

  return {
    elderId: row.elder_id,
    elderName: row.profiles?.preferred_name ?? 'Oma of opa',
    familyMemberId: userId,
  };
}
