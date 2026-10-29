// ─── HAVEN rate limiter (rewritten October 2026) ───
//
// What changed and why:
//   • The previous implementation called `admin().auth.getUser(token)` on EVERY
//     request to resolve the caller — a Supabase Auth round trip on the hot path,
//     for a header the request already carries.
//   • Identity also trusted `x-real-ip` / `x-forwarded-for` as the only key, so a
//     caller could mint a fresh bucket per request by rotating the header.
//   • The Supabase backend wrote a hash into `perf_metrics.status`, whose CHECK
//     constraint only allowed ('success','error','fallback'). Every DB-backed check
//     raised, `supabaseRateLimit()` returned 'error', and the module set
//     `useSupabaseRL = false` permanently — the multi-isolate limiter was dead in
//     production while the per-isolate Map did the work.
//   • The Map was unbounded (memory growth under attack).
//
// Current model — two buckets are consumed for every request:
//   1. identity bucket: `user:<jwt sub>` when the request carries a decodable JWT
//      subject, otherwise `ip:<ip>` / `anon`.
//   2. network bucket: `ip:<ip>` / `anon`, with a wider budget (×4 by default).
// Rotating the identity claim therefore cannot escape the network bucket, and
// rotating the IP header cannot escape a real signed-in identity. Because
// Supabase's gateway verifies the signature before the function runs when
// `verify_jwt = true`, the `sub` claim is authentic for those functions; for
// `verify_jwt = false` endpoints the network bucket is the backstop (those
// endpoints are additionally gated by an internal key or an HMAC signature).
//
// The pure helpers are exported so the contract tests exercise THIS module rather
// than a reimplementation (tests/edge/rate-limit-contract.test.mjs).

import { readEnv } from './env.ts';
import { isValidInternalKey } from './secure_compare.ts';

export class RateLimitBreachError extends Error {
  readonly status = 429;
  readonly code = 'TOO_MANY_REQUESTS';
  constructor(message: string, public readonly retryAfterSeconds: number) {
    super(message);
    this.name = 'RateLimitBreachError';
  }
}

export const DEFAULT_MAX_REQUESTS = 30;
export const DEFAULT_WINDOW_SECONDS = 60;
export const MAX_BUCKETS = 10_000;
export const BACKEND_COOLDOWN_MS = 60_000;
/** The network bucket is wider so shared NAT does not double-penalise users. */
export const NETWORK_BUDGET_MULTIPLIER = 4;

export type IdentityKind = 'user' | 'internal' | 'ip' | 'anon';

export interface Identity {
  kind: IdentityKind;
  subject: string;
}

/** Decodes the `sub` claim of a JWT without verifying it. Verification is the
 *  gateway's job (`verify_jwt = true`); this is only used as a bucket discriminator. */
export function decodeJwtSubject(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof json.sub === 'string' && json.sub.length > 0 ? json.sub : null;
  } catch {
    return null;
  }
}

/**
 * Pure identity resolution.
 * Trust rules: verified internal key → network identity `internal`; a JWT subject
 * (gateway-verified upstream) → `user`; otherwise the proxy IP, and finally one
 * shared `anon` bucket rather than a 400 (a missing proxy header used to turn into
 * a hard failure for legitimate clients).
 */
export function resolveIdentity(input: {
  jwtSub?: string | null;
  internalKeyValid?: boolean;
  forwardedFor?: string | null;
  realIp?: string | null;
}): Identity {
  if (input.jwtSub) return { kind: 'user', subject: input.jwtSub };
  if (input.internalKeyValid) return { kind: 'internal', subject: 'internal' };
  const rawIp = (input.realIp ?? input.forwardedFor ?? '').split(',')[0].trim();
  if (rawIp) return { kind: 'ip', subject: rawIp };
  return { kind: 'anon', subject: 'anon' };
}

/** Network identity: what the request looks like on the wire, independent of auth. */
export function resolveNetworkIdentity(input: {
  internalKeyValid?: boolean;
  forwardedFor?: string | null;
  realIp?: string | null;
}): Identity {
  if (input.internalKeyValid) return { kind: 'internal', subject: 'internal' };
  const rawIp = (input.realIp ?? input.forwardedFor ?? '').split(',')[0].trim();
  if (rawIp) return { kind: 'ip', subject: rawIp };
  return { kind: 'anon', subject: 'anon' };
}

export function buildRateLimitKey(fnName: string, identity: Identity, bucket = 'identity') {
  return `${fnName}:${bucket}:${identity.kind}:${identity.subject}`;
}

export interface MemoryBucket {
  count: number;
  resetAt: number;
}

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  source: 'memory' | 'database';
}

/** Fixed-window counter in a bounded Map (FIFO eviction by insertion order). */
export function consumeInMemory(
  store: Map<string, MemoryBucket>,
  key: string,
  options: { maxRequests?: number; windowSeconds?: number; now?: number; maxBuckets?: number } = {},
): ConsumeResult {
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const now = options.now ?? Date.now();
  const maxBuckets = options.maxBuckets ?? MAX_BUCKETS;
  const windowMs = windowSeconds * 1000;

  let entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  while (store.size > maxBuckets) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }

  entry.count += 1;
  const allowed = entry.count <= maxRequests;
  return {
    allowed,
    remaining: Math.max(maxRequests - entry.count, 0),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    source: 'memory',
  };
}

export function sweepExpired(store: Map<string, MemoryBucket>, now = Date.now()) {
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key);
  }
}

const memoryStore = new Map<string, MemoryBucket>();
let backendDisabledUntil = 0;

export function getRateLimitBuckets() {
  return memoryStore;
}

/** Test seam: reset module state between cases. */
export function resetRateLimitState() {
  memoryStore.clear();
  backendDisabledUntil = 0;
}

interface BackendResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

type Backend = (params: { bucketKey: string; maxRequests: number; windowSeconds: number }) => Promise<BackendResult | null>;

let backendOverride: Backend | null = null;

/** Test seam: inject a fake database backend. */
export function setRateLimitBackendForTests(backend: Backend | null) {
  backendOverride = backend;
}

async function databaseBackend(params: {
  bucketKey: string;
  maxRequests: number;
  windowSeconds: number;
}): Promise<BackendResult | null> {
  if (backendOverride) return backendOverride(params);

  const { admin } = await import('./core.ts');
  const { data, error } = await admin().rpc('consume_rate_limit', {
    p_bucket_key: params.bucketKey,
    p_max_requests: params.maxRequests,
    p_window_seconds: params.windowSeconds,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('consume_rate_limit returned no rows');

  return {
    allowed: row.allowed === true,
    remaining: Number(row.remaining ?? 0),
    retryAfterSeconds: Number(row.retry_after_seconds ?? 0),
  };
}

function backendConfigured(): boolean {
  // Opt out with HAVEN_RATELIMIT_BACKEND=memory (tests, single-isolate previews).
  return readEnv('HAVEN_RATELIMIT_BACKEND') !== 'memory';
}

function hasVerifiedInternalKey(req: Request): boolean {
  const provided = req.headers.get('x-haven-internal-key') ?? req.headers.get('x-internal-key');
  return isValidInternalKey(provided, readEnv('HAVEN_INTERNAL_KEY'));
}

async function consume(scope: string, key: string, maxRequests: number, windowSeconds: number): Promise<ConsumeResult> {
  const now = Date.now();
  if (backendConfigured() && now >= backendDisabledUntil) {
    try {
      const dbResult = await databaseBackend({ bucketKey: key, maxRequests, windowSeconds });
      if (dbResult) return { ...dbResult, source: 'database' };
    } catch {
      // Degrade for a bounded period, then probe again. The previous
      // implementation disabled the backend permanently.
      backendDisabledUntil = now + BACKEND_COOLDOWN_MS;
    }
  }
  return consumeInMemory(memoryStore, key, { maxRequests, windowSeconds, now });
}

export interface RateLimitOptions {
  maxRequests?: number;
  windowSeconds?: number;
  /** Extra discriminant for shared endpoints, e.g. a vendor integration key. */
  scope?: string;
}

/**
 * Throws RateLimitBreachError (429) when the caller exceeds its budget.
 * Never throws for infrastructure reasons: if the database is unreachable the
 * request falls through to the bounded in-memory limiter (fail-open on
 * availability, fail-closed on abuse).
 */
export async function rateLimit(
  req: Request,
  fnName: string,
  optionsOrMaxRequests: RateLimitOptions | number = {},
  legacyWindowSeconds = DEFAULT_WINDOW_SECONDS,
): Promise<void> {
  const options: RateLimitOptions =
    typeof optionsOrMaxRequests === 'number'
      ? { maxRequests: optionsOrMaxRequests, windowSeconds: legacyWindowSeconds }
      : optionsOrMaxRequests;

  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;

  const internalKeyValid = hasVerifiedInternalKey(req);
  const identity = resolveIdentity({
    jwtSub: decodeJwtSubject(req.headers.get('authorization')),
    internalKeyValid,
    forwardedFor: req.headers.get('x-forwarded-for'),
    realIp: req.headers.get('x-real-ip'),
  });
  const network = resolveNetworkIdentity({
    internalKeyValid,
    forwardedFor: req.headers.get('x-forwarded-for'),
    realIp: req.headers.get('x-real-ip'),
  });

  const identityKey = options.scope
    ? `${buildRateLimitKey(fnName, identity)}:${options.scope}`
    : buildRateLimitKey(fnName, identity);

  const identityResult = await consume(fnName, identityKey, maxRequests, windowSeconds);

  // The network bucket only adds value when it is a different bucket (i.e. the
  // caller's identity came from a JWT rather than from the network layer).
  let networkResult: ConsumeResult | null = null;
  if (identity.kind === 'user') {
    const networkKey = buildRateLimitKey(fnName, network, 'network');
    networkResult = await consume(fnName, networkKey, maxRequests * NETWORK_BUDGET_MULTIPLIER, windowSeconds);
  }

  const breaching = [identityResult, networkResult].filter((r): r is ConsumeResult => r !== null && !r.allowed);
  if (breaching.length > 0) {
    const retryAfter = Math.max(...breaching.map((r) => r.retryAfterSeconds));
    throw new RateLimitBreachError(`429 Too Many Requests: Rate limit exceeded for ${fnName}.`, Math.max(1, retryAfter || windowSeconds));
  }
}
