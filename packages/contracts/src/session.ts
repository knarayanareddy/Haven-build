// Reading a session back out of the device keychain.
//
// The token is written to SecureStore as JSON when the user signs in, and read back on every
// cold start. That read used to be `JSON.parse(stored) as Session` with a TypeScript cast — a
// cast that asserts a shape nobody verified. Three things can be in the keychain that are not
// a usable session:
//
//   * truncated or corrupted JSON (an interrupted write, a restored backup, a keychain that
//     half-migrated when the bundle id changed) — JSON.parse throws inside a .then(), which
//     React cannot catch and which leaves the app on a blank screen with no way back;
//   * valid JSON of the wrong shape (`{}`, `null`, `"string"`) — the cast lies and the first
//     property access throws somewhere else entirely;
//   * a session object with an empty or missing access token, which signs the user in to a
//     state where every request fails with 401 and the app cannot tell why.
//
// All three end the same way: the stored value is discarded and the person is asked to sign in
// again. Discarding is also the privacy-preserving choice — a corrupted blob may be a stale
// token, and leaving it in the keychain means it is tried again on every launch.

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  /** Present on sessions written by supabase-js; not required. */
  user?: { id?: string } | null;
  expires_at?: number;
  [key: string]: unknown;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Returns the session held in `raw`, or null when there is not a usable one.
 *
 * Never throws: the caller is a promise chain during app start, where an exception means a
 * blank screen rather than a sign-in prompt.
 */
export function parseStoredSession(raw: string | null | undefined): StoredSession | null {
  if (!nonEmptyString(raw)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const candidate = parsed as Record<string, unknown>;
  if (!nonEmptyString(candidate.access_token)) return null;
  if (!nonEmptyString(candidate.refresh_token)) return null;
  if (candidate.user !== undefined && candidate.user !== null
    && (typeof candidate.user !== 'object' || Array.isArray(candidate.user))) {
    return null;
  }
  return candidate as StoredSession;
}
