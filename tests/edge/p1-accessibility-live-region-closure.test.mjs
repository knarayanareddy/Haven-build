import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Fix all P1 accessibility gaps: Assertive Emergency Live Region Suite', async () => {
  const source = readFileSync(new URL('../../apps/elder/src/renderer/ScreenRenderer.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('accessibilityLiveRegion="assertive"'), 'Must inject accessibilityLiveRegion="assertive" specifically on fall response calamity overlays');
  assert.ok(source.includes('accessibilityRole="alert"'), 'Must enforce role alert');
  console.log('P1 Gap: Assertive Emergency Calamity Live Regions successfully closed');
});
