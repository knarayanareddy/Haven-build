import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schemaFile = readFileSync(new URL('../../packages/schema/src/screenSchema.ts', import.meta.url), 'utf8');
const screenCount = [...schemaFile.matchAll(/screenId: '/g)].length;
assert.ok(screenCount >= 10, 'all production screens should be represented');
assert.ok(schemaFile.includes("emergencyButton: true"), 'emergency access is present');
assert.ok(!schemaFile.includes('Ik ben een echte medewerker'), 'deceptive AI copy is absent');
console.log('screen-schema tests passed');
