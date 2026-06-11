import { admin } from './core.ts';

export async function getJwtUserId(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing bearer token');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid bearer token');
  return data.user.id;
}

export async function assertElderOrFamilyCan(userId: string, elderId: string, permission: string) {
  if (userId === elderId) return true;
  const { data } = await admin()
    .from('family_relationships')
    .select('*')
    .eq('elder_id', elderId)
    .eq('family_member_id', userId)
    .eq('elder_consented', true)
    .eq('is_active', true)
    .maybeSingle();
  if (!data) throw new Error('No active elder consent');
  const field = {
    medications: 'can_view_medications',
    messages: 'can_view_messages',
    location: 'can_view_location_events',
    alerts: 'can_view_alerts',
    stories: 'can_view_stories',
    financials: 'can_view_financials',
  }[permission] ?? permission;
  if (!data[field]) throw new Error(`Missing permission: ${permission}`);
  return true;
}

export async function assertCarerCan(userId: string, elderId: string) {
  const { data } = await admin()
    .from('carer_relationships')
    .select('id')
    .eq('elder_id', elderId)
    .eq('carer_member_id', userId)
    .eq('elder_consented', true)
    .eq('is_active', true)
    .maybeSingle();
  if (!data) throw new Error('No active carer consent');
  return true;
}
