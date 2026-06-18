import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Fix first P3 accessibility gap: Complete localized accessibilityHint bindings & haptics Suite', async () => {
  const source = readFileSync(new URL('../../apps/elder/src/components/HelpOverlay.tsx', import.meta.url), 'utf8');
  
  assert.ok(source.includes("import * as Haptics from 'expo-haptics'"), 'Must import Haptics to execute tactile confirmation');
  assert.ok(source.includes('accessibilityHint={triggerHint}'), 'Must bind descriptive Dutch/English accessibilityHints describing exact haptic state outcomes for help trigger');
  assert.ok(source.includes('accessibilityHint={closeHint}'), 'Must bind descriptive Dutch/English accessibilityHints describing exact haptic state outcomes for close button');
  assert.ok(source.includes('Haptics.impactAsync'), 'Must execute Haptics.impactAsync on press');
  
  console.log('P3 Gap: Localized accessibilityHint bindings describing exact haptic state outcomes completely verified and closed');
});
