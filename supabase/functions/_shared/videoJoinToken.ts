/**
 * Signed, expiring admission tokens for video calls.
 *
 * `fn-video-call-join-token` used to return `crypto.randomUUID()`. Nothing signed it, nothing
 * stored it and nothing verified it: the "token" was a random string the elder app fetched and
 * threw away, and any string at all would have been accepted by the (non-existent) consumer. It
 * looked like an access-control mechanism and was none.
 *
 * A token is `base64url(payload).base64url(hmacSHA256(payload))` under
 * `VIDEO_JOIN_TOKEN_SECRET`. The server stores only the SHA-256 of the token it issued, along
 * with its expiry and the profile it was issued to, so redemption can check all three:
 *
 *   1. the signature is ours and the payload has not been edited;
 *   2. the token is the one we stored (and has not been redeemed before);
 *   3. the caller redeeming it is the person it was issued to.
 *
 * Pure functions over WebCrypto — no Deno APIs — so the unit tests can exercise signing and
 * verification directly.
 */

export interface JoinTokenPayload {
  /** video_call_sessions.id */
  sid: string;
  /** profiles.id the token was issued to */
  sub: string;
  /** 'elder' | 'family' — recorded so a redemption can be attributed */
  role: string;
  /** Unix seconds */
  exp: number;
  /** Unix seconds, for auditing token age */
  iat: number;
  /** Random per-token value: two tokens for the same session never collide */
  jti: string;
}

export const JOIN_TOKEN_MIN_SECRET_LENGTH = 32;

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Throws rather than falling back to a weak default.
 *
 * A signing secret with a default value is a secret everyone knows; before this module there
 * was no secret at all, which is the same thing with fewer steps.
 */
export function assertJoinTokenSecret(secret: string | undefined): string {
  if (!secret || secret.length < JOIN_TOKEN_MIN_SECRET_LENGTH) {
    const error = new Error(`VIDEO_JOIN_TOKEN_SECRET must be set and at least ${JOIN_TOKEN_MIN_SECRET_LENGTH} characters`);
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  return secret;
}

export async function signJoinToken(payload: JoinTokenPayload, secret: string): Promise<string> {
  assertJoinTokenSecret(secret);
  const body = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(body));
  return `${body}.${base64urlEncode(new Uint8Array(signature))}`;
}

export type JoinTokenVerification =
  | { valid: true; payload: JoinTokenPayload }
  | { valid: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export async function verifyJoinToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<JoinTokenVerification> {
  assertJoinTokenSecret(secret);
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return { valid: false, reason: 'malformed' };

  let validSignature: boolean;
  try {
    validSignature = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      base64urlDecode(signature),
      new TextEncoder().encode(body)
    );
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!validSignature) return { valid: false, reason: 'bad_signature' };

  let payload: JoinTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body))) as JoinTokenPayload;
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (typeof payload?.sid !== 'string' || typeof payload?.sub !== 'string' || typeof payload?.exp !== 'number') {
    return { valid: false, reason: 'malformed' };
  }
  if (payload.exp <= nowSeconds) return { valid: false, reason: 'expired' };
  return { valid: true, payload };
}

/** Issues the payload with a random `jti` so two tokens for one session differ. */
export function buildJoinTokenPayload(input: {
  sessionId: string;
  subject: string;
  role: string;
  ttlSeconds: number;
  nowSeconds?: number;
}): JoinTokenPayload {
  const iat = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  return {
    sid: input.sessionId,
    sub: input.subject,
    role: input.role,
    iat,
    exp: iat + input.ttlSeconds,
    jti: crypto.randomUUID(),
  };
}

// ── Provider credentials ───────────────────────────────────────────────────

export interface ProviderCredentials {
  /** What the client must do to obtain media, if anything. */
  media: 'webrtc' | 'none';
}

function env(name: string): string | undefined {
  const value = globalThis.Deno?.env?.get?.(name);
  return value && value.length > 0 ? value : undefined;
}

/**
 * Whether this deployment can actually attach media for `provider`.
 *
 * The `mock` provider exists so the call flow can be exercised without an account; it is
 * test-only and must be switched on explicitly. Returning "configured" for it in production
 * is what produced a button labelled "Belt…" for a call that no one could ever answer.
 */
export function providerIsConfigured(provider: string): boolean {
  switch (provider) {
    case 'livekit':
      return Boolean(env('LIVEKIT_API_KEY') && env('LIVEKIT_API_SECRET'));
    case 'twilio':
      return Boolean(env('TWILIO_ACCOUNT_SID') && env('TWILIO_API_KEY') && env('TWILIO_API_SECRET'));
    case 'mock':
      return env('ALLOW_MOCK_VIDEO_PROVIDER') === 'true';
    default:
      return false;
  }
}

/**
 * The provider to use when the caller does not choose one.
 *
 * The family dashboard hardcoded `provider: 'mock'`, which meant a production deployment with
 * LiveKit credentials still created mock sessions with no media. The deployment decides.
 */
export function resolveDefaultProvider(): string | null {
  for (const candidate of ['livekit', 'twilio', 'mock']) {
    if (providerIsConfigured(candidate)) return candidate;
  }
  return null;
}

export function providerMediaKind(provider: string): 'webrtc' | 'none' {
  return provider === 'mock' ? 'none' : 'webrtc';
}

/**
 * Mints the token the media SDK expects.
 *
 * LiveKit and Twilio Video both accept HS256 JWTs; their grant shapes differ, so the shape is
 * chosen from the provider rather than guessed. Returns null when the provider is not
 * configured — the caller must treat that as "cannot start media", never as "carry on".
 */
export async function mintProviderToken(input: {
  provider: string;
  roomId: string;
  identity: string;
  ttlSeconds: number;
}): Promise<string | null> {
  if (!providerIsConfigured(input.provider)) return null;

  switch (input.provider) {
    case 'livekit': {
      const apiKey = env('LIVEKIT_API_KEY')!;
      const secret = env('LIVEKIT_API_SECRET')!;
      const now = Math.floor(Date.now() / 1000);
      return signHs256Jwt(
        {
          iss: apiKey,
          sub: input.identity,
          iat: now,
          nbf: now - 5,
          exp: now + input.ttlSeconds,
          video: { room: input.roomId, roomJoin: true, canPublish: true, canSubscribe: true },
        },
        secret
      );
    }
    case 'twilio': {
      const apiKey = env('TWILIO_API_KEY')!;
      const accountSid = env('TWILIO_ACCOUNT_SID')!;
      const secret = env('TWILIO_API_SECRET')!;
      const now = Math.floor(Date.now() / 1000);
      return signHs256Jwt(
        {
          iss: apiKey,
          sub: accountSid,
          iat: now,
          exp: now + input.ttlSeconds,
          jti: `${apiKey}-${input.identity}`,
          grants: { identity: input.identity, video: { room: input.roomId } },
        },
        secret
      );
    }
    default:
      return null;
  }
}

/** Minimal HS256 JWS. Provider SDKs accept this exactly as written. */
export async function signHs256Jwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${base64urlEncode(new Uint8Array(signature))}`;
}
