// Uploading one file into a private Supabase Storage bucket from a React Native handset.
//
// Both new features need it: a carer attaching a photo to a handover note, and an older adult
// photographing a medicine box so the label can be read. Supabase's own client builds the
// multipart body for a Blob, but a React Native `fetch` cannot send a Blob — it sends the
// platform file object `{ uri, name, type }`. This helper is the explicit version of that
// contract, so the request it makes can be asserted in a test instead of inferred from a
// library's internals.
//
// It is deliberately storage-only: it does not decide who may read the object (that is the
// bucket's row-level security) and it does not retry (that is the caller's offline queue).

/** The shape React Native's FormData accepts for a file part. */
export interface NativeFilePart {
  uri: string;
  name: string;
  type: string;
}

export type UploadableFile = Blob | NativeFilePart;

export interface StorageUploadRequest {
  supabaseUrl: string;
  accessToken: string;
  bucket: string;
  path: string;
  file: UploadableFile;
  /** Seconds the object stays readable by a signed URL; 0 keeps the bucket's default. */
  cacheControl?: string;
}

export class StorageUploadError extends Error {
  readonly status: number;
  readonly code = 'STORAGE_UPLOAD_FAILED';
  constructor(message: string, status: number) {
    super(message);
    this.name = 'StorageUploadError';
    this.status = status;
  }
}

/** The path shape every bucket in this project uses: `<owner>/<subject>/<name>`. */
export function storageObjectPath(...segments: string[]): string {
  return segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0)
    .join('/');
}

/**
 * Rejects a path that would escape its folder.
 *
 * Storage paths are used as object keys, and `../` in one is a traversal attempt, not a
 * filename. The server enforces this too; both sides check because the client is the side that
 * produces the key.
 */
export function isSafeStoragePath(path: string): boolean {
  if (path.length === 0 || path.length > 512) return false;
  if (path.includes('..') || path.includes('\\') || path.includes('//')) return false;
  return /^[A-Za-z0-9._\-/]+$/.test(path);
}

/**
 * POSTs the file to `<supabaseUrl>/storage/v1/object/<bucket>/<path>`.
 *
 * The content type header is deliberately absent: `fetch` sets it from the multipart boundary,
 * and overriding it makes the request unparseable on the storage side.
 */
export async function uploadStorageObject(
  request: StorageUploadRequest,
  deps: { fetchImpl?: typeof fetch; formDataFactory?: () => FormData } = {},
): Promise<{ bucket: string; path: string }> {
  const { bucket, path, file } = request;
  if (!isSafeStoragePath(path)) {
    throw new StorageUploadError(`Unsafe storage path: ${path}`, 400);
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const form = deps.formDataFactory ? deps.formDataFactory() : new FormData();
  form.append('file', file as unknown as Blob);

  const response = await fetchImpl(`${request.supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${request.accessToken}`,
      // The bucket is private; a re-upload of the same key is a bug, not an update.
      'x-upsert': 'false',
      ...(request.cacheControl ? { 'cache-control': request.cacheControl } : {}),
    },
    body: form,
  });

  if (!response.ok) {
    let message = `Storage upload failed (${response.status})`;
    try {
      const body = await response.json() as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // A storage error with no JSON body still has its status.
    }
    throw new StorageUploadError(message, response.status);
  }

  return { bucket, path };
}
