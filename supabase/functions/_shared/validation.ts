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

export function assertNoBsnText(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  if (/\b\d{9}\b/.test(text) || /burgerservicenummer|\bbsn\b/i.test(text)) {
    throw new Error('BSN-like content is not accepted by HAVEN');
  }
}
