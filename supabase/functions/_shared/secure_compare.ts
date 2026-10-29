/**
 * Constant-time comparison for secrets.
 *
 * Three copies of this logic existed (internal.ts, webhook.ts, ratelimit.ts).
 * Duplicated security primitives drift: one copy is hardened, the others are not.
 * This module is pure (no Deno/Node APIs) so it can be unit-tested directly.
 */

/** Length-safe, constant-time string comparison. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    // Indexing past the end yields NaN, which converts to 0 under bitwise OR,
    // so the loop cost does not reveal the secret's length.
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

/**
 * Hex digest comparison used by HMAC verification. Accepts an optional
 * `sha256=` prefix on the provided value, matching common webhook dialects.
 */
export function timingSafeEqualHex(expectedHex: string, providedHex: string): boolean {
  return timingSafeEqualString(expectedHex.toLowerCase(), providedHex.replace(/^sha256=/, '').toLowerCase());
}

export const MIN_INTERNAL_KEY_LENGTH = 32;

/**
 * Validates a caller-supplied internal key against the configured one.
 * Fails closed when the configured key is missing or shorter than 32 characters.
 */
export function isValidInternalKey(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  if (expected.length < MIN_INTERNAL_KEY_LENGTH) return false;
  return timingSafeEqualString(provided, expected);
}
