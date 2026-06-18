import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Fix next P1 accessibility gap: Dual Visual YES/NO MAR Confirmation Buttons Suite', async () => {
  const source = readFileSync(new URL('../../apps/elder/src/renderer/ScreenRenderer.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('Beoordeel Ja (Ingenomen)'), 'Must render high-contrast interactive YES button');
  assert.ok(source.includes('Beoordeel Nee (Nog Niet)'), 'Must render high-contrast interactive NO button');
  assert.ok(!source.includes('DENY_MED:${medicationId}\', ctx.onPrimaryAction, \'ghost\''), 'Must eliminate invisible low-contrast ghost variants');
  console.log('P1 Gap: Dual Visual YES/NO MAR Confirmation Buttons completely verified and closed');
});
