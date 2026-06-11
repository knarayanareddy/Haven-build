import type { AlertLevel } from '@haven/contracts/src/haven';

export interface RuleHit {
  id: string;
  label: string;
  score: number;
}

const rules = [
  { id: 'NL_BANK_01', label: 'Bank impersonation wording', score: 18, phrases: ['bank', 'bankpas', 'pin', 'pincode', 'betaalpas'] },
  { id: 'NL_URGENCY_01', label: 'Time pressure wording', score: 14, phrases: ['meteen', 'spoed', 'nu direct', 'urgent', 'laatste kans'] },
  { id: 'NL_ISOLATION_01', label: 'Secrecy instruction', score: 24, phrases: ['vertel niemand', 'niet ophangen', 'geheim', 'niet met familie bespreken'] },
  { id: 'NL_REMOTE_01', label: 'Remote support tooling', score: 28, phrases: ['anydesk', 'teamviewer', 'remote support', 'scherm delen'] },
  { id: 'NL_PAYMENT_01', label: 'Unusual payment method', score: 28, phrases: ['cadeaukaart', 'gift card', 'crypto', 'bitcoin', 'western union'] },
];

export function scoreSignal(input: string): { score: number; level: AlertLevel; hits: RuleHit[] } {
  const text = input.toLowerCase();
  const hits = rules
    .filter((rule) => rule.phrases.some((phrase) => text.includes(phrase)))
    .map(({ id, label, score }) => ({ id, label, score }));
  const score = Math.min(100, hits.reduce((sum, hit) => sum + hit.score, 0));
  const level: AlertLevel = score >= 90 ? 'zwart' : score >= 70 ? 'rood' : score >= 40 ? 'amber' : 'none';
  return { score, level, hits };
}
