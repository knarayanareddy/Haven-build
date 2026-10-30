/**
 * Single error contract for every Edge Function.
 *
 * Before this module there were three disagreeing behaviours:
 *   • handler.ts   returned HTTP 400 for every failure (403 and 429 collapsed);
 *   • async_wrapper.ts re-derived the status by substring-matching the *sanitised*
 *     message, so the same error produced different statuses in different functions;
 *   • core.json() flipped any response to 429 when the body text contained "429".
 * Meanwhile safeErrorMessage() mapped "429 Too Many Requests: Rate limit exceeded…"
 * to "Request too large" (its `limit` rule fired first), so a throttled client was
 * told its payload was too big and had no reason to back off.
 *
 * This module is pure (no Deno/Node APIs) so it is directly unit-tested.
 * See tests/edge/error-contract.test.mjs.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNPROCESSABLE_ENTITY'
  | 'TOO_MANY_REQUESTS'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

export interface HttpError {
  status: number;
  code: ErrorCode;
  message: string;
  retryAfterSeconds?: number;
}

/** Client-facing copy per code. Deliberately generic: no internals. */
const MESSAGE_BY_CODE: Record<ErrorCode, string> = {
  BAD_REQUEST: 'The request could not be processed',
  UNAUTHORIZED: 'Authentication failed',
  FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'Resource already exists',
  PAYLOAD_TOO_LARGE: 'Request too large',
  UNPROCESSABLE_ENTITY: 'The request was rejected by a safety policy',
  TOO_MANY_REQUESTS: 'Too many requests',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
  INTERNAL: 'An unexpected error occurred',
};

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

/** Authorisation denials: lost their Error subclass (cross-realm, rethrown as
 *  Error) but must still map to 403 rather than 400. */
const FORBIDDEN_MESSAGES = [
  /^Caller .* is not allowed to act for this/,
  /^Caller is not allowed to access this older adult record$/,
  /^No active verified older adult consent delegate credentials\.$/,
  /^No active professional carer relationship or consent\.$/,
  /^Missing specific required RBAC capability: [a-z_]+$/,
  /^Missing specific required professional carer capability: [a-z_]+$/,
  /^Document vault access is restricted absolutely to the older adult owner$/,
  /^OCR setup inbox access is restricted absolutely to the older adult owner$/,
  /^Uploads are restricted exclusively to caller-owned directory structures$/,
  /^Requested bucket is banned$/,
  /^Internal access required$/,
  /^Missing or invalid vendor secret for [A-Z0-9_]+$/,
  /^Admin role required$/,
];

/** Validation-shaped errors thrown by validateBody/requireFields/assertMaxLength. */
const VALIDATION_MESSAGES = [
  /^Missing required field\(s\): [A-Za-z0-9_, .]+$/,
  /^Invalid request: /,
  /^Invalid JSON in request body$/,
  /^[A-Za-z_]+ is not allowed$/,
  /^[A-Za-z_]+ is required$/,
  /^[A-Za-z_]+ must be (a )?(uuid|string|number|boolean|array|object)$/,
  /^operation must be read or upload$/,
  /^Unsupported sender role$/,
  /^Content-Type must be application\/json, text\/plain, or multipart\/form-data$/,
];

/**
 * Messages this codebase authors deliberately and may return verbatim.
 * Anything else is replaced with the generic copy for its status — that is the
 * only reliable way to stop Postgres/SDK internals leaking through.
 */
const AUTHORS_PUBLIC_MESSAGE = [
  /^Missing required field\(s\): [A-Za-z0-9_, .]+$/,
  /^Invalid request: /,
  /^Invalid JSON in request body$/,
  /^Content-Type must be application\/json, text\/plain, or multipart\/form-data$/,
  /^Request body exceeds maximum size limit$/,
  /^BSN-like content is not accepted by HAVEN$/,
  /^Prohibited Dutch Citizen Service Number \(BSN\) detected/,
  /^[A-Za-z_]+ exceeds maximum length of \d+ characters$/,
  /^[A-Za-z_]+ must be (a )?(uuid|string|number|boolean|array|object)$/,
  /^[A-Za-z_]+ is not allowed$/,
  /^[A-Za-z_]+ is required$/,
  /^operation must be read or upload$/,
  /^Caller .* is not allowed to act for this/,
  /^Caller is not allowed to access this older adult record$/,
  /^No active verified older adult consent delegate credentials\.$/,
  /^No active professional carer relationship or consent\.$/,
  /^Missing specific required RBAC capability: [a-z_]+$/,
  /^Missing specific required professional carer capability: [a-z_]+$/,
  /^Unsupported sender role$/,
  /^Directory traversal or malformed characters detected$/,
  /^First path segment must be a valid owner UUID$/,
  /^Uploads are restricted exclusively to caller-owned directory structures$/,
  /^Document vault access is restricted absolutely to the older adult owner$/,
  /^OCR setup inbox access is restricted absolutely to the older adult owner$/,
  /^Requested bucket is banned$/,
  /^Internal access required$/,
];

/** Substrings that must never reach a client, whatever the status. */
const LEAK_MARKERS = [
  'select ',
  'insert into',
  'update ',
  'delete from',
  'constraint',
  'pg_',
  'relation "',
  'duplicate key',
  'stack',
  'at Object.',
  'at async ',
  'password',
  'service_role',
  'eyJ',
];

export class HavenHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ErrorCode = CODE_BY_STATUS[status] ?? 'INTERNAL',
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'HavenHttpError';
  }

  /** Message that is safe to return verbatim (author-supplied). */
  get publicMessage(): string {
    return messageIsSafe(this.message, this.code) ? this.message : MESSAGE_BY_CODE[this.code];
  }
}

function messageIsSafe(message: string, code: ErrorCode): boolean {
  if (!message || message.length > 240) return false;
  const lower = message.toLowerCase();
  if (LEAK_MARKERS.some((marker) => lower.includes(marker))) return false;
  if (AUTHORS_PUBLIC_MESSAGE.some((pattern) => pattern.test(message))) return true;
  // Only fall back to the message for client errors that carry no marker; server
  // errors always use generic copy.
  return code !== 'INTERNAL' && code !== 'SERVICE_UNAVAILABLE' && !/(exception|undefined|null)/i.test(message);
}

function statusFromUnknown(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { statusCode?: unknown }).statusCode;
  const value = Number(candidate);
  return Number.isInteger(value) && value >= 400 && value <= 599 ? value : null;
}

function codeFromStatus(status: number): ErrorCode {
  if (CODE_BY_STATUS[status]) return CODE_BY_STATUS[status];
  if (status >= 500) return status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL';
  return 'BAD_REQUEST';
}

/**
 * Normalises any thrown value into a stable, client-safe error envelope.
 *
 * Precedence:
 *   1. explicit `status` (and `code`) on the error — AuthzError sets 403,
 *      RateLimitBreachError sets 429 with retryAfterSeconds;
 *   2. known error names (belt and braces for cross-realm instances);
 *   3. message shape (BSN guard sets 422, "403: …" prefixes used by a few
 *      functions), which is preserved only for author-supplied messages;
 *   4. 400 for validation-shaped errors, 500 otherwise.
 */
export function toHttpError(error: unknown): HttpError {
  const retryAfterSeconds = Number(
    (error as { retryAfterSeconds?: unknown })?.retryAfterSeconds
    ?? (error as { retry_after_seconds?: unknown })?.retry_after_seconds,
  );
  const retryAfter = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? Math.ceil(retryAfterSeconds) : undefined;

  let status = statusFromUnknown(error);
  const name = (error as { name?: string })?.name;
  const rawMessage = String((error as Error)?.message ?? error ?? '');

  if (status === null) {
    if (name === 'AuthzError') status = 403;
    else if (name === 'RateLimitBreachError') status = 429;
    else if ((error as { isBsnViolation?: boolean })?.isBsnViolation === true) status = 422;
    else {
      // Handlers across this repository announce their status in the message
      // ("409 Conflict: …", "400: Malformed …"). This used to be a hand-written list of
      // four digits — 403, 404, 422, 429 and 401 — so `throw new Error("400: …")` became
      // a 500 and a contraindication's "409 Conflict" became a 500 too. Any leading
      // status this API actually uses is honoured now.
      const announced = /^(\d{3})\b/.exec(rawMessage);
      if (announced && CODE_BY_STATUS[Number(announced[1])]) status = Number(announced[1]);
    }
  }

  if (status === null) {
    if (FORBIDDEN_MESSAGES.some((pattern) => pattern.test(rawMessage))) status = 403;
    else if (VALIDATION_MESSAGES.some((pattern) => pattern.test(rawMessage))) status = 400;
    else status = 500; // genuinely unexpected
  }

  const code = ((error as { code?: unknown })?.code as ErrorCode | undefined) ?? codeFromStatus(status);
  const knownCode = Object.hasOwn(MESSAGE_BY_CODE, code) ? code : codeFromStatus(status);

  // Strip a leading "403: " style prefix before copy selection.
  const message = rawMessage.replace(/^(3\d\d|4\d\d|5\d\d):\s*/, '');

  const safeMessage = (() => {
    if (knownCode === 'TOO_MANY_REQUESTS') return MESSAGE_BY_CODE.TOO_MANY_REQUESTS;
    if (status === 422 && /BSN/i.test(message)) {
      return 'Prohibited Dutch Citizen Service Number (BSN) detected. Storage, transmission, and processing of BSN is strictly prohibited.';
    }
    if (messageIsSafe(message, knownCode)) return message;
    return MESSAGE_BY_CODE[knownCode];
  })();

  return {
    status,
    code: knownCode,
    message: safeMessage,
    ...(knownCode === 'TOO_MANY_REQUESTS' ? { retryAfterSeconds: retryAfter ?? 60 } : {}),
    ...(retryAfter && knownCode !== 'TOO_MANY_REQUESTS' ? { retryAfterSeconds: retryAfter } : {}),
  };
}

/** Response body shape used by every function. */
export function errorBody(error: unknown): { error: string; error_code: ErrorCode } {
  const normalised = toHttpError(error);
  return { error: normalised.message, error_code: normalised.code };
}
