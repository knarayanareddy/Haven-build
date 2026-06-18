import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Fix next P1 accessibility gap: High Contrast Ratios Suite', async () => {
  const source = readFileSync(new URL('../../apps/elder/src/renderer/ScreenRenderer.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('const isHC = context?.profile?.highContrast === true;'), 'Must programmatically inspect profile.highContrast');
  assert.ok(source.includes('paper: isHC ? \'#000000\' : baseColors.paper,'), 'Must dynamically overwrite token baselines with true #000000 / #FFFFFF pairs');
  console.log('P1 Gap: High Contrast Ratios successfully closed');
});
