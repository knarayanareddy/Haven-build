import { timingSafeEqualHex } from './secure_compare.ts';

// ─── P1-1 FIX: Timing-safe HMAC comparison ───
export async function verifyHmacSha256(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // Constant-time comparison (shared implementation in secure_compare.ts)
  return timingSafeEqualHex(expected, signature);
}
