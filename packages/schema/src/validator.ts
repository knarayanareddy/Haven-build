import type { ScreenSchema } from './screenSchema';

const banned = ['Ik ben een echte medewerker', 'Ik ben geen computer', 'U spreekt met een persoon'];

export function validateScreenSchema(schema: ScreenSchema) {
  const errors: string[] = [];
  if (schema.depthFromHome > 2) errors.push(`${schema.screenId}: depth exceeds 2`);
  if (schema.maxPrimaryItems > 4) errors.push(`${schema.screenId}: too many primary items`);
  if (schema.bottomActions.length > 2) errors.push(`${schema.screenId}: too many bottom actions`);
  if (!schema.emergencyButton) errors.push(`${schema.screenId}: emergency button required`);
  if (!schema.voiceFallbackEn || schema.voiceFallbackEn.split(/\s+/).length > 15) errors.push(`${schema.screenId}: English fallback invalid`);
  if (!schema.voiceFallbackNl || schema.voiceFallbackNl.split(/\s+/).length > 15) errors.push(`${schema.screenId}: Dutch fallback invalid`);
  if (schema.offlineCacheTtlSeconds < 0) errors.push(`${schema.screenId}: offline TTL invalid`);
  const text = JSON.stringify(schema);
  for (const phrase of banned) if (text.includes(phrase)) errors.push(`${schema.screenId}: banned AI copy`);
  return errors;
}

export function assertProductionSchemas(schemas: ScreenSchema[]) {
  const errors = schemas.flatMap(validateScreenSchema);
  if (errors.length) throw new Error(errors.join('\n'));
  return true;
}
