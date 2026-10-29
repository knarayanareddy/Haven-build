import { admin, sha256 } from './core.ts';
import { settleQuery } from './settle.ts';

/**
 * Atomic idempotency via INSERT … ON CONFLICT DO NOTHING.
 *
 * October 2026 fixes
 * ──────────────────
 * 1. `.insert(values).onConflict('key_hash').ignore()` does not exist — `onConflict`
 *    and `ignoreDuplicates` are *options* of `insert()`. The chained form threw
 *    `TypeError: ….onConflict is not a function`, so every request that carried an
 *    Idempotency-Key failed before its handler ran (19 call sites).
 * 2. The request-hash comparison happened *after* the "already completed" branch,
 *    so reusing a key with a different body returned the previous request's
 *    response body. Two different operations could therefore observe each other's
 *    results. The hash is now checked first and rejected with 409.
 * 3. The 30s claim TTL was shorter than several handlers (voice pipeline, LLM
 *    scoring), so concurrent requests "took over" a live claim and both executed.
 *    TTL is now 120s and a takeover is guarded by the exact claimed_at value.
 * 4. The decision logic is extracted into a pure function (`classifyExisting`) so
 *    it is unit-tested without a database.
 */

/** How long a claim may live before another request may take it over. */
export const CLAIM_TTL_MS = 120_000;

/** How long a request waits for a concurrent in-flight claim before giving up. */
export const CONCURRENT_WAIT_MS = 500;

export type IdempotencyAction =
  | { action: 'execute' } // we own the claim (fresh insert, or stale takeover)
  | { action: 'replay'; status: number; body: unknown }
  | { action: 'wait' }
  | { action: 'conflict'; reason: 'body-mismatch' | 'previously-errored' | 'in-progress' | 'inconsistent'; message: string };

export interface IdempotencyRow {
  status?: string | null;
  request_hash?: string | null;
  claimed_at?: string | null;
  completed_at?: string | null;
  status_code?: number | null;
  response_body?: unknown;
  error_message?: string | null;
}

/**
 * Decides what to do when an idempotency key already exists.
 * Pure: no I/O, no clock — `nowMs` is passed in for determinism.
 *
 * Order matters: a mismatched request hash must win over a replay, otherwise a
 * caller that reuses a key for a *different* operation receives the first
 * operation's response.
 */
export function classifyExisting(
  existing: IdempotencyRow | null,
  requestHash: string,
  nowMs: number,
): IdempotencyAction {
  if (!existing) {
    return { action: 'conflict', reason: 'inconsistent', message: 'Idempotency key state is inconsistent; please retry' };
  }

  if (existing.request_hash && existing.request_hash !== requestHash) {
    return {
      action: 'conflict',
      reason: 'body-mismatch',
      message: 'Idempotency key was reused with a different request body',
    };
  }

  if (existing.status === 'completed' && existing.completed_at) {
    return { action: 'replay', status: existing.status_code ?? 200, body: existing.response_body };
  }

  if (existing.status === 'errored') {
    return {
      action: 'conflict',
      reason: 'previously-errored',
      message: `Previous attempt failed: ${existing.error_message ?? 'unknown'}. Retry with a new key.`,
    };
  }

  if (existing.status === 'claimed') {
    const claimedAt = existing.claimed_at ? new Date(existing.claimed_at).getTime() : 0;
    const ageMs = Number.isFinite(claimedAt) ? Math.max(0, nowMs - claimedAt) : Number.POSITIVE_INFINITY;
    if (ageMs > CLAIM_TTL_MS) return { action: 'execute' };
    return { action: 'wait' };
  }

  return { action: 'conflict', reason: 'inconsistent', message: 'Unexpected idempotency key state' };
}

export interface IdempotencyResult<T> {
  status?: number;
  body: T;
}

/** Accepts anything and returns a usable id, or null. Callers hand us raw body
 *  fields, so a non-string must never become the string "[object Object]". */
function asId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function withIdempotency<T>(params: {
  key?: unknown;
  functionName: string;
  elderId?: unknown;
  profileId?: unknown;
  requestBody: unknown;
  run: () => Promise<IdempotencyResult<T>>;
}): Promise<IdempotencyResult<T>> {
  const key = asId(params.key);
  if (!key) return params.run();

  const db = admin();
  const keyHash = await sha256(`${params.functionName}:${key}`);
  const requestHash = await sha256(JSON.stringify(params.requestBody ?? null));
  const t0 = new Date().toISOString();

  // Atomic test-and-set. `onConflict`/`ignoreDuplicates` are upsert() options —
  // insert() in postgrest-js 1.15 accepts only `{ count }`, and there are no
  // chainable .onConflict()/.ignore() methods on the builder at all.
  const { data: insertedRows, error: insertError } = await db
    .from('idempotency_keys')
    .upsert(
      {
        key_hash: keyHash,
        function_name: params.functionName,
        elder_id: asId(params.elderId),
        profile_id: asId(params.profileId),
        request_hash: requestHash,
        status: 'claimed',
        claimed_at: t0,
      },
      { onConflict: 'key_hash', ignoreDuplicates: true },
    )
    .select('*');

  if (insertError) throw insertError;

  const inserted = Array.isArray(insertedRows) ? insertedRows[0] : insertedRows;
  if (inserted) return executeAndRecord(params, db, keyHash, requestHash);

  // The key already existed. Re-read and classify.
  const { data: existing, error: readError } = await db
    .from('idempotency_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .maybeSingle();
  if (readError) throw readError;

  const decision = classifyExisting(existing as IdempotencyRow | null, requestHash, Date.now());

  if (decision.action === 'replay') {
    return { status: decision.status, body: decision.body as T };
  }

  if (decision.action === 'execute') {
    // Stale claim: take it over *only* if nobody else has touched it since.
    const guarded = await db
      .from('idempotency_keys')
      .update({ status: 'claimed', claimed_at: t0, request_hash: requestHash })
      .eq('key_hash', keyHash)
      .eq('claimed_at', (existing as IdempotencyRow).claimed_at ?? '')
      .select('key_hash');

    if (!guarded.error && Array.isArray(guarded.data) && guarded.data.length > 0) {
      return executeAndRecord(params, db, keyHash, requestHash);
    }
    // Someone else took it over first; fall through to wait-and-recheck.
  }

  if (decision.action === 'execute' || decision.action === 'wait') {
    await new Promise((resolve) => setTimeout(resolve, CONCURRENT_WAIT_MS));
    const { data: recheck } = await db.from('idempotency_keys').select('*').eq('key_hash', keyHash).maybeSingle();
    const again = classifyExisting(recheck as IdempotencyRow | null, requestHash, Date.now());
    if (again.action === 'replay') return { status: again.status, body: again.body as T };
    throw Object.assign(new Error('A request with this key is still in progress. Please wait.'), {
      status: 409,
      code: 'CONFLICT',
    });
  }

  throw Object.assign(new Error(decision.message), { status: 409, code: 'CONFLICT' });
}

async function executeAndRecord<T>(
  params: { run: () => Promise<IdempotencyResult<T>> },
  db: ReturnType<typeof admin>,
  keyHash: string,
  requestHash: string,
): Promise<IdempotencyResult<T>> {
  try {
    const result = await params.run();
    await settleQuery(
      db
        .from('idempotency_keys')
        .update({
          response_body: result.body as unknown as Record<string, unknown>,
          status_code: result.status ?? 200,
          status: 'completed',
          request_hash: requestHash,
          completed_at: new Date().toISOString(),
        })
        .eq('key_hash', keyHash),
      'idempotency_keys.complete',
    );
    return result;
  } catch (runError) {
    await settleQuery(
      db
        .from('idempotency_keys')
        .update({
          status: 'errored',
          error_message: String((runError as Error).message ?? runError).slice(0, 480),
          completed_at: new Date().toISOString(),
        })
        .eq('key_hash', keyHash),
      'idempotency_keys.error',
    );
    throw runError;
  }
}
