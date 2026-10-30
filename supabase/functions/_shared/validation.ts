export type FieldSpec = 'string' | 'number' | 'boolean' | 'uuid' | 'array' | 'object';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateBody(body: Record<string, unknown>, spec: Record<string, FieldSpec>, options: { allowUnknown?: boolean } = {}) {
  const errors: string[] = [];
  for (const [key, type] of Object.entries(spec)) {
    const value = body[key];
    if (value === undefined || value === null || value === '') {
      errors.push(`${key} is required`);
      continue;
    }
    if (type === 'uuid' && (typeof value !== 'string' || !uuidRegex.test(value))) errors.push(`${key} must be a uuid`);
    if (type === 'string' && typeof value !== 'string') errors.push(`${key} must be a string`);
    if (type === 'number' && typeof value !== 'number') errors.push(`${key} must be a number`);
    if (type === 'boolean' && typeof value !== 'boolean') errors.push(`${key} must be a boolean`);
    if (type === 'array' && !Array.isArray(value)) errors.push(`${key} must be an array`);
    if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) errors.push(`${key} must be an object`);
  }
  if (!options.allowUnknown) {
    const known = new Set(Object.keys(spec));
    for (const key of Object.keys(body)) if (!known.has(key)) errors.push(`${key} is not allowed`);
  }
  if (errors.length) throw new Error(`Invalid request: ${errors.join('; ')}`);
  return body;
}

// P0-3 FIX: enhance BSN detection with more robust patterns
export function assertNoBsnText(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  // Dutch BSN: exactly 9 digits, often written with dots or spaces
  if (/\b\d{9}\b/.test(text.replace(/[.\-\s]/g, '')) && /\d{9}/.test(text.replace(/[.\-\s]/g, ''))) {
    throw bsnError('BSN-like content is not accepted by HAVEN');
  }
  if (/burgerservicenummer|burgerservice.?nummer|\bbsn\b/i.test(text)) {
    throw bsnError('BSN-like content is not accepted by HAVEN');
  }
}

/** BSN rejection is a policy decision (422), not a malformed request (400). */
function bsnError(message: string) {
  const error = new Error(message) as Error & { status: number; code: string; isBsnViolation: boolean };
  error.status = 422;
  error.code = 'UNPROCESSABLE_ENTITY';
  error.isBsnViolation = true;
  return error;
}

// P1-3 FIX: String length cap for user-provided text fields
export const MAX_STRING_FIELD = 10_000;
export const MAX_AUDIO_BASE64 = 10 * 1024 * 1024; // ~10 MB for base64 audio (~7.5 MB raw)

export function assertMaxLength(value: unknown, maxLen: number, fieldName: string) {
  const str = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  if (str.length > maxLen) {
    const error = new Error(`${fieldName} exceeds maximum length of ${maxLen} characters`) as Error & { status: number; code: string };
    error.status = 413;
    error.code = 'PAYLOAD_TOO_LARGE';
    throw error;
  }
}
