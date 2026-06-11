import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../apps/iphone-suite/index.html', import.meta.url), 'utf8');
for (const label of ['SCHILD', 'STEM', 'KOMPAS', 'WACHT', 'De Buurtverbinder']) {
  assert.ok(html.includes(label), `${label} should be visible in the iPhone suite`);
}
assert.ok(html.includes("toggleLang"), 'language switching should be implemented');
assert.ok(html.includes("confirmMedication"), 'medication confirmation should be implemented');
assert.ok(html.includes("scamSignal"), 'scam simulation should be implemented');
console.log('iphone-suite smoke test passed');
