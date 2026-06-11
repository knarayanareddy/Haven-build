import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = JSON.parse(readFileSync(new URL('../../ml/heuristics/rules.json', import.meta.url), 'utf8'));

function score(text) {
  const lower = text.toLowerCase();
  const hits = rules.filter((rule) => rule.phrases.some((phrase) => lower.includes(phrase)));
  const total = Math.min(100, hits.reduce((sum, hit) => sum + hit.score, 0));
  const level = total >= 90 ? 'zwart' : total >= 70 ? 'rood' : total >= 40 ? 'amber' : 'none';
  return { total, level, hits };
}

const bankScam = score('Dit is de bank. Deel uw pincode nu direct en vertel niemand iets. Installeer AnyDesk.');
assert.equal(bankScam.level, 'rood');
assert.ok(bankScam.hits.length >= 3);

const benign = score('Uw afspraak bij de huisarts is donderdag om 10 uur. Bel ons op het bekende nummer als u vragen heeft.');
assert.equal(benign.level, 'none');

console.log('scam-engine tests passed');
