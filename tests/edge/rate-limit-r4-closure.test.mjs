// Behavioural tests for inbound-endpoint rate limiting (Finding R4).
//
// What this file replaced
// ───────────────────────
// The previous version defined `class RateLimitBreachError` and its own in-memory
// bucket map inside the test, wired them into a `SimulatedS3ApiGateway`, and
// asserted that the simulation returned 429 — while
// `supabase/functions/_shared/ratelimit.ts` was never imported. The assertions
// would pass with the real limiter deleted.
//
// These tests drive the real limiter and the real error mapper.
//
// Run with: `node tests/edge/rate-limit-r4-closure.test.mjs`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDenoShim, linkSharedModules } from './support/shared-loader.mjs';

installDenoShim({ HAVEN_RATELIMIT_BACKEND: 'memory', HAVEN_INTERNAL_KEY: 'k'.repeat(40) });
process.env.HAVEN_RATELIMIT_BACKEND = 'memory';

const shared = await linkSharedModules();
const { rateLimit, resetRateLimitState } = await import(`${shared}/ratelimit.mjs`);
const { errorResponse } = await import(`${shared}/core.mjs`);

const requestFor = (ip) => new Request('https://haven.test/fn-wearable-event', {
  method: 'POST',
  headers: { 'x-real-ip': ip },
});

/** Runs the real limiter `times` times, returning the first breach (or null). */
async function consume(ip, fnName, times, options) {
  let breach = null;
  for (let i = 0; i < times && !breach; i += 1) {
    try {
      await rateLimit(requestFor(ip), fnName, options);
    } catch (err) {
      breach = err;
    }
  }
  return breach;
}

test.beforeEach(() => {
  resetRateLimitState();
});

test('a burst past the budget is rejected by the real limiter', async () => {
  const ip = '203.0.113.10';
  assert.equal(await consume(ip, 'fn-wearable-event', 30, { maxRequests: 30, windowSeconds: 60 }), null);

  const breach = await consume(ip, 'fn-wearable-event', 1, { maxRequests: 30, windowSeconds: 60 });
  assert.ok(breach, 'the 31st request must be rejected');
  assert.equal(breach.name, 'RateLimitBreachError');
  assert.equal(breach.status, 429);
  assert.ok(breach.retryAfterSeconds >= 1, 'the caller must be told when to retry');
  assert.match(breach.message, /Rate limit exceeded for fn-wearable-event/);
});

test('the 429 reaches the client with a Retry-After header and the canonical body', async () => {
  const ip = '203.0.113.11';
  await consume(ip, 'fn-wearable-event', 3, { maxRequests: 2, windowSeconds: 60 });
  const breach = await consume(ip, 'fn-wearable-event', 1, { maxRequests: 2, windowSeconds: 60 });

  const response = errorResponse(breach, requestFor(ip));
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('Retry-After')) >= 1);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');

  const body = await response.json();
  assert.equal(body.error_code, 'TOO_MANY_REQUESTS');
  assert.match(body.error, /Too many requests/i);
});

test('a life-safety cron is not affected by an inbound device flood', async () => {
  // Different function name → different bucket. This is the property the old
  // simulation was trying to demonstrate; it is a property of buildRateLimitKey().
  const floodIp = '203.0.113.12';
  await consume(floodIp, 'fn-wearable-event', 40, { maxRequests: 30, windowSeconds: 60 });

  await assert.doesNotReject(
    () => rateLimit(requestFor('203.0.113.12'), 'fn-fall-escalation', { maxRequests: 100, windowSeconds: 60 }),
    'an unrelated function must keep its own budget',
  );
});

test('an in-flight bucket resets once the window passes', async () => {
  const ip = '203.0.113.13';
  const breach = await consume(ip, 'fn-medication-log', 3, { maxRequests: 2, windowSeconds: 1 });
  assert.ok(breach, 'budget exhausted');

  await new Promise((resolve) => setTimeout(resolve, 1100));
  await assert.doesNotReject(
    () => rateLimit(requestFor(ip), 'fn-medication-log', { maxRequests: 2, windowSeconds: 1 }),
    'the window must reopen',
  );
});
