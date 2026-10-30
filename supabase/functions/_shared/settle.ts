/**
 * Awaiting Supabase queries that are allowed to fail.
 *
 * Why this module exists
 * ──────────────────────
 * `postgrest-js` builders extend `PostgrestBuilder`, which declares
 * `implements PromiseLike<…>` — it has `then()` and **no `catch()`**. Writing a
 * builder chain followed by `.catch(...)` therefore throws
 * `TypeError: ….catch is not a function` at runtime: the insert is never sent and
 * the TypeError replaces whatever the code was trying to swallow. Every
 * authorisation-denial audit trail in the repo did this.
 *
 * Those same calls also swallowed failures entirely, so a broken audit pipeline
 * was invisible. settleQuery() reports the failure (Sentry + console) and returns
 * `null`, which is what the original `catch(() => undefined)` intended.
 */

import { captureException } from './sentry.ts';

type MaybeResult = { error?: { message?: string; code?: string } | null } | null | undefined;

/**
 * Awaits a query builder or promise with a `{ error }` result shape.
 *
 * @param query      the builder (PromiseLike) or a real Promise
 * @param operation  what was attempted, e.g. `"audit_log.insert:deny"`
 */
export async function settleQuery<T>(query: PromiseLike<T> | Promise<T>, operation: string): Promise<T | null> {
  try {
    const result = await query;
    const failure = (result as MaybeResult)?.error;
    if (failure) {
      await report(new Error(`${operation} failed: ${failure.message ?? 'unknown error'}`), operation, failure.code);
      return null;
    }
    return result as T;
  } catch (error) {
    await report(error, operation);
    return null;
  }
}

async function report(error: unknown, operation: string, code?: string) {
  console.error(`[settle] ${operation}`, (error as Error)?.message ?? error);
  await captureException(error, { fn: 'settle', operation, error_code: code ?? 'INTERNAL' }).catch(() => undefined);
}

/**
 * Fire-and-forget variant for call sites that must not add latency to the
 * response path (audit trails written after the decision is already made).
 * The promise is still tracked so unhandled rejections never surface.
 */
export function settleInBackground(query: PromiseLike<unknown>, operation: string): void {
  void settleQuery(query, operation).catch(() => undefined);
}
