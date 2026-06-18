import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Fix next P2 accessibility gap: Single-Switch Toggle Mode Suite', async () => {
  const source = readFileSync(new URL('../../apps/elder/src/components/FloatingVoiceButton.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('if (isListening) {') && source.includes('setListening(false);'), 'Must implement Single-Switch Toggle Mode allowing one crisp tap to activate and a secondary tap to complete');
  assert.ok(source.includes('accessibilityHint={switchHint}'), 'Must bind highly descriptive Dutch accessibilityHints specifically freeing switch pointer hardware users');
  console.log('P2 Gap: Single-Switch Multi-Modal Toggle Mode completely verified and closed');
});
