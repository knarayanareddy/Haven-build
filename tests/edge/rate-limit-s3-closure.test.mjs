// Behavioural tests for the PSD2 ingress-buffer limiter and index (Finding S3).
//
// What this file replaced
// ───────────────────────
// The previous version re-implemented `rateLimit()` and a
// `SimulatedS3ApiGateway` inside the test, and concluded with a *simulated*
// `EXPLAIN` output ("must show Index Scan") — a string the test itself wrote.
// None of it touched `_shared/ratelimit.ts` or a database.
//
// What survives is testable: the real limiter separates the PSD2 ingress from the
// life-safety endpoints, and the migration really creates the index the consumer
// query depends on. The plan-shape assertion is gone rather than faked; whether
// Postgres picks the index is a `EXPLAIN` question that belongs in the live
// database job, not in a string comparison.
//
// Run with: `node tests/edge/rate-limit-s3-closure.test.mjs`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { installDenoShim, linkSharedModules } from './support/shared-loader.mjs';

installDenoShim({ HAVEN_RATELIMIT_BACKEND: 'memory', HAVEN_INTERNAL_KEY: 'k'.repeat(40) });
process.env.HAVEN_RATELIMIT_BACKEND = 'memory';

const shared = await linkSharedModules();
const { rateLimit, resetRateLimitState } = await import(`${shared}/ratelimit.mjs`);

const requestFor = (ip) => new Request('https://haven.test/fn-psd2-webhook', {
  method: 'POST',
  headers: { 'x-real-ip': ip },
});

async function exhaust(ip, fnName, budget) {
  let breach = null;
  for (let i = 0; i < budget + 1 && !breach; i += 1) {
    try {
      await rateLimit(requestFor(ip), fnName, { maxRequests: budget, windowSeconds: 60 });
    } catch (err) {
      breach = err;
    }
  }
  return breach;
}

test.beforeEach(() => {
  resetRateLimitState();
});

test('the PSD2 webhook ingress is capped per caller', async () => {
  const breach = await exhaust('198.51.100.7', 'fn-psd2-webhook', 5);
  assert.ok(breach, 'traffic past the budget must be rejected');
  assert.equal(breach.status, 429);
  assert.match(breach.message, /fn-psd2-webhook/);
});

test('a PSD2 flood cannot consume the fall-escalation budget', async () => {
  await exhaust('198.51.100.8', 'fn-psd2-webhook', 5);

  await assert.doesNotReject(
    () => rateLimit(requestFor('198.51.100.8'), 'fn-fall-escalation', { maxRequests: 100, windowSeconds: 60 }),
    'life-safety escalation must have an independent budget',
  );
});

test('the ingress-buffer migration creates the index the consumer query needs', () => {
  const sql = readFileSync(
    new URL('../../supabase/migrations/20260615000015_psd2_ingress_buffer_index_s3_fix.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /CREATE INDEX/i, 'the migration must create an index');
  assert.match(sql, /idx_psd2_buffer_received_at/, 'the index must be the one the consumer query uses');
  assert.match(sql, /received_at\s+ASC/i, 'the index order must match ORDER BY received_at ASC');
});
