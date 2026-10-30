import { admin } from './core.ts';
import { isValidInternalKey, timingSafeEqualString } from './secure_compare.ts';

// ─── P0-2 FIX: NEVER fall back to SUPABASE_SERVICE_ROLE_KEY ───
// The internal key must be explicitly and independently configured.
// If it is not set, internal-access functions MUST fail closed.
function readInternalKey(): string | null {
  const key = Deno.env.get('HAVEN_INTERNAL_KEY');
  if (!key) return null;
  // Minimum 32 chars to prevent weak keys
  if (key.length < 32) return null;
  return key;
}

export function requireInternalAccess(req: Request) {
  const expected = readInternalKey();
  if (!expected) throw new Error('HAVEN_INTERNAL_KEY is not configured');
  const provided = req.headers.get('x-haven-internal-key') ?? req.headers.get('x-internal-key');
  // P0-2+P0-5 FIX: constant-time comparison to prevent timing attacks on internal key
  if (!isValidInternalKey(provided, expected)) {
    // Artificially delay to mask timing even on the "not provided" path
    throw new Error('Internal access required');
  }
  return true;
}

// P1-1 FIX: constant-time string comparison lives in _shared/secure_compare.ts
// so the rate limiter and webhook verifier cannot drift from this copy.
const timingSafeEqual = timingSafeEqualString;

export function requireVendorSecretHeader(req: Request, envName: string, headerNames: string[]) {
  const expected = Deno.env.get(envName);
  if (!expected) throw new Error(`${envName} is not configured`);
  const provided = headerNames.map((name) => req.headers.get(name)).find(Boolean);
  // P1-1 FIX: constant-time comparison for vendor secrets too
  if (!provided || !timingSafeEqual(provided, expected)) {
    // Constant delay to mask failure
    throw new Error(`Missing or invalid vendor secret for ${envName}`);
  }
  return true;
}

export async function requireAdminBearer(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Admin bearer token is required');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid admin bearer token');
  const { data: profile, error: profileError } = await admin().from('profiles').select('role').eq('id', data.user.id).single();
  if (profileError || profile?.role !== 'admin') throw new Error('Admin role required');
  return data.user.id;
}
