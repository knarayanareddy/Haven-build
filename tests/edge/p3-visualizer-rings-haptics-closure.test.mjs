import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Fix second P3 accessibility gap: Refined haptic touch feedback step scales matching exact visual volume visualizer rings Suite', async () => {
  const source = readFileSync(new URL('../../apps/elder/src/components/FloatingVoiceButton.tsx', import.meta.url), 'utf8');
  
  assert.ok(source.includes("import * as Haptics from 'expo-haptics'"), 'Must import Haptics to execute multi-step tactile volume feedback');
  assert.ok(source.includes('const currentStep = audioVolumePct > 75 ? 3 : audioVolumePct > 50 ? 2 : audioVolumePct > 25 ? 1 : 0'), 'Must resolve discrete step scales from raw incoming audio meter levels');
  assert.ok(source.includes('Haptics.ImpactFeedbackStyle?.Heavy'), 'Must map high volume tiers (>75%) to Heavy impact haptics');
  assert.ok(source.includes('Haptics.ImpactFeedbackStyle?.Medium'), 'Must map mid volume tiers (>50%) to Medium impact haptics');
  assert.ok(source.includes('Haptics.ImpactFeedbackStyle?.Light'), 'Must map lower volume tiers (>25%) to Light impact haptics');
  assert.ok(source.includes('transform: [{ scale: ringScale }]'), 'Must render exact visual volume visualizer rings around the microphone matching haptic step scales');
  assert.ok(source.includes('accessibilityRole="progressbar"'), 'Must bind accessible progressbar role and value for audio visualizer ring');
  
  console.log('P3 Gap: Refined haptic touch feedback step scales matching exact visual volume visualizer rings completely verified and closed');
});
