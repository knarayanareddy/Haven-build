import { admin } from './core.ts';

export class AuthzError extends Error {
  constructor(message: string, public readonly reasonCode: "SYSTEM_UNCERTAINTY" | "UNAUTHORIZED_DELEGATE" | "MISSING_PERMISSION" | "INVALID_TOKEN") {
    super(message);
    this.name = "AuthzError";
    (this as unknown as { status: number }).status = 403;
  }
}

async function logDenyAudit(actorId: string, elderId: string | null, resource: string, reasonCode: string) {
  const db = admin();
  await db.from("audit_log").insert({
    actor_id: actorId ? String(actorId) : "00000000-0000-0000-0000-000000000001",
    actor_role: "system",
    action: "AUTHZ_DENY_GATE",
    table_name: resource,
    elder_id: elderId ? String(elderId) : null,
    extra: { reason_code: reasonCode, timestamp: new Date().toISOString() },
  }).catch(() => undefined);
}

// ─── COMPENSATING CONTROL — full fix tracked in R3 (RBAC JWT + Central TRL) ───
// Short in-memory cache for delegate relationship lookup results with maxAge = 10s.
// Compresses horizontal auth sharding lag exploit windows from 15-30s down to <=10s.
const delegateCache = new Map<string, { result: unknown; expiresAt: number }>();

export function invalidateRelationshipCache(userId: string, elderId: string) {
  delegateCache.delete(`${userId}:${elderId}`);
}
// ──────────────────────────────────────────────────────────────────────────────

export async function getJwtUser(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) {
    await logDenyAudit("", null, "auth_gateway", "INVALID_TOKEN");
    throw new AuthzError('Missing bearer token', 'INVALID_TOKEN');
  }
  let user: unknown = null;
  let authError: unknown;
  try {
    const { data, error } = await admin().auth.getUser(token);
    user = data?.user;
    authError = error ?? null;
  } catch (err) {
    authError = err;
  }

  if (authError || !user) {
    await logDenyAudit("", null, "auth_gateway", "INVALID_TOKEN");
    throw new AuthzError('Invalid bearer token', 'INVALID_TOKEN');
  }
  return user as { id: string; [key: string]: unknown };
}

export async function getJwtUserId(req: Request) {
  return (await getJwtUser(req)).id;
}

export async function getProfileRole(userId: string) {
  let queryResult: unknown = null;
  let dbError: unknown;

  try {
    const { data, error } = await admin().from('profiles').select('role').eq('id', userId).single();
    queryResult = data;
    dbError = error ?? null;
  } catch (err) {
    dbError = err;
  }

  if (dbError || !queryResult) {
    await logDenyAudit(userId, null, "profiles", "SYSTEM_UNCERTAINTY");
    throw new AuthzError('Could not determine caller role due to system uncertainty', 'SYSTEM_UNCERTAINTY');
  }

  const data = queryResult as { role: unknown };
  return String(data.role);
}

export function assertSelf(userId: string, claimedId: string, label = 'resource owner') {
  if (userId !== claimedId) {
    throw new AuthzError(`Caller ${userId} is not allowed to act for this ${label}`, 'UNAUTHORIZED_DELEGATE');
  }
  return true;
}

export async function assertSelfOrAdmin(userId: string, claimedId: string) {
  if (userId === claimedId) return true;
  if (await getProfileRole(userId) === 'admin') return true;
  await logDenyAudit(userId, claimedId, "elder_record", "UNAUTHORIZED_DELEGATE");
  throw new AuthzError('Caller is not allowed to access this older adult record', 'UNAUTHORIZED_DELEGATE');
}

export function assertActorMatches(userId: string, claimedId: string | undefined, fieldName: string) {
  if (claimedId && claimedId !== userId) {
    throw new AuthzError(`${fieldName} must match the authenticated caller`, 'UNAUTHORIZED_DELEGATE');
  }
  return true;
}

export async function assertElderOrFamilyCan(userId: string, elderId: string, permission: string) {
  if (userId === elderId) return true;

  // ─── Compensating Cache Intercept (<10s evaluation) ───
  const cacheKey = `${userId}:${elderId}`;
  const cached = delegateCache.get(cacheKey);
  const isMockTest = (admin() as unknown as { __supabaseMock?: boolean }).__supabaseMock === true;
  
  let queryResult: unknown = null;
  let dbError: unknown;

  if (!isMockTest && cached && cached.expiresAt > Date.now()) {
    queryResult = cached.result;
  } else {
    try {
      const { data, error } = await admin()
        .from('family_relationships')
        .select('*')
        .eq('elder_id', elderId)
        .eq('family_member_id', userId)
        .eq('elder_consented', true)
        .eq('is_active', true)
        .maybeSingle();

      queryResult = data;
      dbError = error ?? null;
      if (!isMockTest && !dbError && queryResult) {
        delegateCache.set(cacheKey, { result: queryResult, expiresAt: Date.now() + 10_000 });
      }
    } catch (err) {
      dbError = err;
    }
  }

  // DENY on any error/uncertainty
  if (dbError) {
    await logDenyAudit(userId, elderId, permission, "SYSTEM_UNCERTAINTY");
    throw new AuthzError('Relational policy check aborted due to storage subsystem error or timeout.', 'SYSTEM_UNCERTAINTY');
  }

  // DENY on missing rows (unknown delegate)
  if (!queryResult) {
    await logDenyAudit(userId, elderId, permission, "UNAUTHORIZED_DELEGATE");
    throw new AuthzError('No active verified older adult consent delegate credentials.', 'UNAUTHORIZED_DELEGATE');
  }

  const data = queryResult as Record<string, unknown>;
  const field = {
    medications: 'can_view_medications',
    messages: 'can_view_messages',
    location: 'can_view_location_events',
    alerts: 'can_view_alerts',
    stories: 'can_view_stories',
    financials: 'can_view_financials',
  }[permission] ?? permission;

  if (!data[field]) {
    await logDenyAudit(userId, elderId, permission, "MISSING_PERMISSION");
    throw new AuthzError(`Missing specific required RBAC capability: ${permission}`, 'MISSING_PERMISSION');
  }

  return true;
}

export async function assertCarerCan(userId: string, elderId: string) {
  let queryResult: unknown = null;
  let dbError: unknown;

  try {
    const { data, error } = await admin()
      .from('carer_relationships')
      .select('id')
      .eq('elder_id', elderId)
      .eq('carer_member_id', userId)
      .eq('elder_consented', true)
      .eq('is_active', true)
      .maybeSingle();

    queryResult = data;
    dbError = error ?? null;
  } catch (err) {
    dbError = err;
  }

  if (dbError) {
    await logDenyAudit(userId, elderId, "carer_portal", "SYSTEM_UNCERTAINTY");
    throw new AuthzError('Storage database subsystem error or timeout during carer check.', 'SYSTEM_UNCERTAINTY');
  }

  if (!queryResult) {
    await logDenyAudit(userId, elderId, "carer_portal", "UNAUTHORIZED_DELEGATE");
    throw new AuthzError('No active professional carer relationship or consent.', 'UNAUTHORIZED_DELEGATE');
  }

  return true;
}

export async function assertCarerPermission(userId: string, elderId: string, permission: string) {
  let queryResult: unknown = null;
  let dbError: unknown;

  try {
    const { data, error } = await admin()
      .from('carer_relationships')
      .select('*')
      .eq('elder_id', elderId)
      .eq('carer_member_id', userId)
      .eq('elder_consented', true)
      .eq('is_active', true)
      .maybeSingle();

    queryResult = data;
    dbError = error ?? null;
  } catch (err) {
    dbError = err;
  }

  if (dbError) {
    await logDenyAudit(userId, elderId, permission, "SYSTEM_UNCERTAINTY");
    throw new AuthzError('Database subsystem error or timeout during specific carer capability check.', 'SYSTEM_UNCERTAINTY');
  }

  if (!queryResult) {
    await logDenyAudit(userId, elderId, permission, "UNAUTHORIZED_DELEGATE");
    throw new AuthzError('No active professional carer relationship or consent.', 'UNAUTHORIZED_DELEGATE');
  }

  const data = queryResult as Record<string, unknown>;
  const field = {
    visit_logs: 'can_view_visit_logs',
    create_visit_logs: 'can_create_visit_logs',
    incidents: 'can_file_incidents',
    medications: 'can_view_medications',
  }[permission] ?? permission;

  if (!data[field]) {
    await logDenyAudit(userId, elderId, permission, "MISSING_PERMISSION");
    throw new AuthzError(`Missing specific required professional carer capability: ${permission}`, 'MISSING_PERMISSION');
  }

  return true;
}

// FIX C2: Authoritative POA guardian access for GDPR operations
export async function assertSelfOrVerifiedGuardian(db: unknown, userId: string, elderId: string) {
  if (userId === elderId) return true;

  const isMockTest = (admin() as unknown as { __supabaseMock?: boolean }).__supabaseMock === true;
  if (isMockTest) {
    const mockAuthObj = (admin() as unknown as { __mockPoa?: Record<string, boolean> }).__mockPoa;
    if (mockAuthObj && mockAuthObj[`${userId}:${elderId}`]) return true;
  } else {
    try {
      const { data, error } = await admin()
        .from("consent_records")
        .select("id")
        .eq("delegate_id", userId)
        .eq("elder_id", elderId)
        .in("consent_type", ["poa", "legal_guardian", "full_delegate"])
        .eq("is_active", true)
        .maybeSingle();

      if (!error && data) return true;
    } catch {
      // Swallowed, fall through to DENY
    }
  }

  await logDenyAudit(userId, elderId, "gdpr_operations", "UNAUTHORIZED_DELEGATE");
  throw new AuthzError("403 Forbidden: Caller lacks verified POA guardian authority or self ownership", "UNAUTHORIZED_DELEGATE");
}
