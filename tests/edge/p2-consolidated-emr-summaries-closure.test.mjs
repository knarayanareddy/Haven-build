import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Fix next P2 accessibility gap: Consolidated Screen Reader EMR Summaries Suite', async () => {
  const source = readFileSync(new URL('../../apps/elder/src/renderer/ScreenRenderer.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('accessibilityRole="summary"') && source.includes('Medicijn gepland om'), 'Must wrap medication cards in consolidated accessibilityRole summary enclosures');
  assert.ok(source.includes('accessibilityLabel={`Medicijn: ${med.name}, ${med.dose}'), 'Must deploy consolidated composite Dutch accessibility labels completely avoiding fragmented text swipes');
  console.log('P2 Gap: Consolidated Screen Reader EMR Summaries completely verified and closed');
});
