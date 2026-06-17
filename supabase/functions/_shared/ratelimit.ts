// ─── Production-Grade Rate Limiter with Retry-After Header (Finding R4 Fix) ───
// Supports both multi-isolate Supabase DB checking and ultra-fast single-isolate in-memory counters.
// Automatically evaluates per-device or per-user requests and returns 429 with Retry-After header on breach.

export class RateLimitBreachError extends Error {
  constructor(message: string, public readonly retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitBreachError";
    (this as unknown as { status: number }).status = 429;
  }
}

const WINDOW_MS = 60_000;
const PER_WINDOW = 30;

interface BucketEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketEntry>();

// Clean expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}, 60_000);

async function resolveCallerId(req: Request): Promise<string> {
  let jwtSub = "";
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    try {
      const { getJwtUserId } = await import("./authz.ts");
      jwtSub = await getJwtUserId(req);
    } catch {
      // invalid or expired JWT
    }
  }

  const deviceHint = req.headers.get("x-haven-device-session-id") ?? req.headers.get("x-haven-device-id") ?? "";
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";

  // FIX B1: Do not use device header unless it matches JWT subject.
  // If headers don't match JWT -> use JWT sub as key only.
  // If no JWT -> use IP only (never use arbitrary header value).
  let callerId = "";
  if (jwtSub) {
    callerId = (deviceHint === jwtSub) ? deviceHint : jwtSub;
  } else {
    callerId = ip;
  }

  // FIX B2: If caller ID resolves to "unknown" (no JWT, no valid IP, no header):
  // Return HTTP 400 Bad Request immediately. Do not apply rate limit bucket to "unknown".
  if (!callerId || callerId === "unknown") {
    const err = new Error("400 Bad Request: Anonymous requests missing valid IP or Auth gateway identifiers sit blocked immediately.");
    (err as unknown as { status: number }).status = 400;
    throw err;
  }

  return callerId;
}

export function getRateLimitBuckets() {
  return buckets;
}

async function supabaseRateLimit(fnName: string, callerId: string, maxRequests: number, windowMs: number): Promise<'allowed' | 'limited' | 'error'> {
  const key = `${fnName}:${callerId}`;
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  try {
    const { admin, sha256 } = await import("./core.ts");
    const db = admin();
    const keyHash = await sha256(key);

    const { data, error } = await db.rpc("ratelimit_check", {
      p_key_hash: keyHash,
      p_window_start: windowStart,
      p_max_requests: maxRequests,
    });

    if (error) {
      return 'error';
    }
    return data === true ? 'allowed' : 'limited';
  } catch {
    return 'error';
  }
}

let useSupabaseRL = Deno.env.get("HAVEN_RATELIMIT_BACKEND") === "supabase";

export async function rateLimit(
  req: Request,
  fnName: string,
  maxRequests = 30,
  windowSeconds = 60
): Promise<void> {
  const windowMs = windowSeconds * 1000;
  const callerId = await resolveCallerId(req);

  if (useSupabaseRL) {
    try {
      const status = await supabaseRateLimit(fnName, callerId, maxRequests, windowMs);
      if (status === 'limited') {
        throw new RateLimitBreachError(`429 Too Many Requests: Rate limit exceeded for ${fnName}.`, windowSeconds);
      } else if (status === 'error') {
        useSupabaseRL = false;
      } else if (status === 'allowed') {
        return;
      }
    } catch (e) {
      if ((e as { name?: string }).name === "RateLimitBreachError") throw e;
    }
  }

  // ─── In-memory fallback (per-user / per-device sliding/fixed window) ───
  const key = `${fnName}:${callerId}`;
  const now = Date.now();

  const entry = buckets.get(key);

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    throw new RateLimitBreachError(`429 Too Many Requests: Rate limit exceeded for ${fnName}.`, Math.max(1, retryAfterSec));
  }
}
