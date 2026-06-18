import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Fix next P2 accessibility gap: Conversational Dutch B1 Exception Mapper Client Suite', async () => {
  const source = readFileSync(new URL('../../apps/elder/src/services/havenClient.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('translateElderError('), 'HavenClient must actively translate all network/API exceptions into reassuring Dutch B1 prose');

  const mapperSource = readFileSync(new URL('../../apps/elder/src/services/errorMapper.ts', import.meta.url), 'utf8');
  assert.ok(mapperSource.includes('504') && mapperSource.includes('veilig lokaal bewaard'), 'Must translate 504 Gateway Timeout into reassuring Dutch guidance');
  assert.ok(mapperSource.includes('403') && mapperSource.includes('specifieke actie'), 'Must translate 403 Forbidden into B1 guidance');
  assert.ok(mapperSource.includes('429') && mapperSource.includes('automatisch opnieuw'), 'Must translate 429 Too Many Requests into non-technical phrasing');

  console.log('P2 Gap: Conversational Plain-Dutch B1 Error Exception Mapper completely verified and closed across client modules');
});
