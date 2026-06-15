import { corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertElderOrFamilyCan, AuthzError, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

const allowedBuckets = new Set(["voice-notes", "life-story-audio", "life-story-photos", "profile-photos", "document-vault", "ocr-inbox"]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstPathSegment(path: string) {
  if (path.includes('..') || path.includes('\\')) {
    throw new AuthzError('Directory traversal or malformed characters detected', 'UNAUTHORIZED_DELEGATE');
  }
  const segment = path.split('/').filter(Boolean)[0] ?? '';
  if (!UUID_REGEX.test(segment)) {
    throw new AuthzError('First path segment must be a valid owner UUID', 'UNAUTHORIZED_DELEGATE');
  }
  return segment;
}

async function assertPathAccess(userId: string, bucket: string, path: string, operation: string) {
  const ownerId = firstPathSegment(path);
  if (ownerId === userId) return ownerId;
  
  if (operation === 'upload') {
    throw new AuthzError('Uploads are restricted exclusively to caller-owned directory structures', 'UNAUTHORIZED_DELEGATE');
  }
  
  if (bucket === 'voice-notes') {
    await assertElderOrFamilyCan(userId, ownerId, 'messages');
    return ownerId;
  }
  if (bucket === 'life-story-audio' || bucket === 'life-story-photos') {
    await assertElderOrFamilyCan(userId, ownerId, 'stories');
    return ownerId;
  }
  if (bucket === 'document-vault') {
    throw new AuthzError('Document vault access is restricted absolutely to the older adult owner', 'UNAUTHORIZED_DELEGATE');
  }
  if (bucket === 'ocr-inbox') {
    throw new AuthzError('OCR setup inbox access is restricted absolutely to the older adult owner', 'UNAUTHORIZED_DELEGATE');
  }
  if (bucket === 'profile-photos') {
    await assertElderOrFamilyCan(userId, ownerId, 'messages');
    return ownerId;
  }
  
  throw new AuthzError('Caller is not allowed to sign tokens for this storage path', 'UNAUTHORIZED_DELEGATE');
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { bucket: 'string', path: 'string', operation: 'string' }, { allowUnknown: true });
    if (!allowedBuckets.has(String(body.bucket))) throw new AuthzError("Requested bucket is banned", "UNAUTHORIZED_DELEGATE");
    const operation = String(body.operation);
    if (!["read", "upload"].includes(operation)) throw new Error('operation must be read or upload');

    const userId = await getJwtUserId(req);
    await assertPathAccess(userId, String(body.bucket), String(body.path), operation);

    const ttl = Math.min(Number(body.ttl_seconds ?? 300), 900);
    const storage = userClient(req).storage.from(String(body.bucket));
    
    if (operation === "upload") {
      const { data, error } = await storage.createSignedUploadUrl(String(body.path));
      if (error) throw error;
      await recordMetric("fn-storage-signed-url", started, "success");
      return json({ success: true, ...data }, 200, req);
    }

    const { data, error } = await storage.createSignedUrl(String(body.path), ttl);
    if (error) throw error;

    await recordMetric("fn-storage-signed-url", started, "success");
    return json({ success: true, signed_url: data.signedUrl, expires_in: ttl }, 200, req);
  } catch (error) {
    const isAuthzErr = (error as { name?: string }).name === "AuthzError" || (error as { status?: number }).status === 403;
    const status = (error as { status?: number }).status ?? (isAuthzErr ? 403 : 400);

    await recordMetric("fn-storage-signed-url", started, "error");
    return json({ error: safeErrorMessage(error) }, status, req);
  }
});
