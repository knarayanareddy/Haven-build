// Behavioural tests for the real rate limiter (supabase/functions/_shared/ratelimit.ts).
//
// Replaces tests/edge/rate-limit-r4-closure.test.mjs and rate-limit-s3-closure.test.mjs,
// which re-implemented a simplified limiter inline and then asserted on that copy.
// A test that asserts on its own fixture cannot fail when the production module
// regresses.
//
// Run with: node --test tests/edge/rate-limit-contract.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

// The module reads Deno.env via _shared/env.ts (which also supports process.env).
process.env.HAVEN_RATELIMIT_BACKEND = 'memory';
process.env.HAVEN_INTERNAL_KEY = 'k'.repeat(40);

const rl = await import('../../supabase/functions/_shared/ratelimit.ts');

function req(headers = {}) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: { get: (name) => map.get(String(name).toLowerCase()) ?? null },
  };
}

/** Builds an unsigned JWT-shaped token whose payload carries `sub`. The limiter
 *  only decodes the claim; signature verification is the gateway's job. */
function jwtFor(sub) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub, role: 'authenticated' })}.signature`;
}

const authFor = (sub) => ({ authorization: `Bearer ${jwtFor(sub)}` });

test.beforeEach(() => {
  rl.resetRateLimitState();
});

test('jwt subject decoding', () => {
  assert.equal(rl.decodeJwtSubject(`Bearer ${jwtFor('user-1')}`), 'user-1');
  assert.equal(rl.decodeJwtSubject('Bearer not-a-jwt'), null);
  assert.equal(rl.decodeJwtSubject(null), null);
  assert.equal(rl.decodeJwtSubject('Bearer a.b'), null);
});

test('identity: a claimed device header cannot mint a fresh bucket', () => {
  const a = rl.resolveIdentity({ jwtSub: 'user-1', forwardedFor: '10.0.0.1' });
  const b = rl.resolveIdentity({ jwtSub: 'user-1', forwardedFor: '10.0.0.999' });
  assert.equal(a.kind, 'user');
  assert.equal(b.kind, 'user');
  assert.equal(rl.buildRateLimitKey('fn-x', a), rl.buildRateLimitKey('fn-x', b));
});

test('identity: verified JWT beats spoofed proxy headers', () => {
  const identity = rl.resolveIdentity({
    jwtSub: 'user-42',
    internalKeyValid: false,
    realIp: '203.0.113.7',
    forwardedFor: '198.51.100.1',
  });
  assert.deepEqual(identity, { kind: 'user', subject: 'user-42' });
});

test('identity: a valid internal key is bucketed separately from anonymous traffic', () => {
  const internal = rl.resolveIdentity({ internalKeyValid: true, realIp: '203.0.113.7' });
  const anonymous = rl.resolveIdentity({});
  assert.equal(internal.kind, 'internal');
  assert.equal(anonymous.kind, 'anon');
  assert.notEqual(rl.buildRateLimitKey('fn-x', internal), rl.buildRateLimitKey('fn-x', anonymous));
});

test('identity: missing proxy headers fall into one shared anon bucket instead of a 400', () => {
  const identity = rl.resolveIdentity({});
  assert.deepEqual(identity, { kind: 'anon', subject: 'anon' });
});

test('spoofing x-forwarded-for per request still trips the limiter', async () => {
  // 30 requests, each pretending to come from a different IP, same signed-in user.
  for (let i = 1; i <= rl.DEFAULT_MAX_REQUESTS; i++) {
    await rl.rateLimit(req({ ...authFor('user-1'), 'x-forwarded-for': `10.0.0.${i}` }), 'fn-spoof');
  }
  await assert.rejects(
    () => rl.rateLimit(req({ ...authFor('user-1'), 'x-forwarded-for': '10.0.0.250' }), 'fn-spoof'),
    (error) => {
      assert.equal(error.name, 'RateLimitBreachError');
      assert.equal(error.status, 429);
      assert.match(error.message, /Rate limit exceeded/);
      assert.ok(error.retryAfterSeconds >= 1);
      return true;
    },
    'a new header value must not reset the bucket for an authenticated caller',
  );
});

test('rotating the JWT subject cannot escape the network bucket', async () => {
  // A token whose signature is not checked by the limiter (verify_jwt = false
  // endpoint). Every request claims a different user but comes from one address.
  const perIdentity = 3;
  let lastError = null;
  for (let i = 0; i < rl.DEFAULT_MAX_REQUESTS * rl.NETWORK_BUDGET_MULTIPLIER + 5; i++) {
    try {
      await rl.rateLimit(
        req({ ...authFor(`rotating-${i}`), 'x-real-ip': '203.0.113.50' }),
        'fn-rotate',
        { maxRequests: perIdentity, windowSeconds: 60 },
      );
    } catch (error) {
      lastError = error;
      break;
    }
  }
  assert.ok(lastError, 'network bucket must eventually reject subject rotation');
  assert.equal(lastError.status, 429);
});

test('unauthenticated callers sharing the anon bucket are capped', async () => {
  for (let i = 0; i < 3; i++) {
    await rl.rateLimit(req({}), 'fn-anon', { maxRequests: 3, windowSeconds: 60 });
  }
  await assert.rejects(() => rl.rateLimit(req({}), 'fn-anon', { maxRequests: 3, windowSeconds: 60 }));
});

test('the in-memory store is bounded and evicts oldest entries first', () => {
  const store = new Map();
  for (let i = 0; i < 50; i++) {
    rl.consumeInMemory(store, `key-${i}`, { maxRequests: 5, windowSeconds: 60, maxBuckets: 10 });
  }
  assert.equal(store.size, 10, 'store must never exceed maxBuckets');
  assert.equal(store.has('key-0'), false, 'oldest keys are evicted');
  assert.equal(store.has('key-49'), true, 'newest keys are retained');
});

test('expired buckets are reclaimed', () => {
  const store = new Map();
  rl.consumeInMemory(store, 'a', { windowSeconds: 1, now: 1_000 });
  rl.sweepExpired(store, 2_000);
  assert.equal(store.size, 0);
});

test('a database backend error degrades to memory and re-probes after the cooldown', async () => {
  let calls = 0;
  const originalBackend = 'memory';
  delete process.env.HAVEN_RATELIMIT_BACKEND;
  rl.resetRateLimitState();

  rl.setRateLimitBackendForTests(async () => {
    calls += 1;
    throw new Error('connection terminated');
  });

  try {
    // First call: backend throws, request still allowed via memory fallback.
    await rl.rateLimit(req({ 'x-real-ip': '198.51.100.9' }), 'fn-degrade', { maxRequests: 5 });
    assert.equal(calls, 1);

    // During the cooldown the backend is not retried (previously it was disabled forever).
    await rl.rateLimit(req({ 'x-real-ip': '198.51.100.9' }), 'fn-degrade', { maxRequests: 5 });
    assert.equal(calls, 1, 'backend must not be hammered during the cooldown');

    // After the cooldown expires, the backend is probed again.
    const realNow = Date.now;
    Date.now = () => realNow() + rl.BACKEND_COOLDOWN_MS + 1;
    try {
      await rl.rateLimit(req({ 'x-real-ip': '198.51.100.9' }), 'fn-degrade', { maxRequests: 5 });
    } finally {
      Date.now = realNow;
    }
    assert.equal(calls, 2, 'backend must be re-probed after the cooldown, not disabled permanently');
  } finally {
    rl.setRateLimitBackendForTests(null);
    process.env.HAVEN_RATELIMIT_BACKEND = originalBackend;
  }
});

test('a healthy database backend is authoritative', async () => {
  process.env.HAVEN_RATELIMIT_BACKEND = 'supabase';
  rl.resetRateLimitState();
  const seen = [];
  rl.setRateLimitBackendForTests(async ({ bucketKey, maxRequests }) => {
    seen.push({ bucketKey, maxRequests });
    return { allowed: false, remaining: 0, retryAfterSeconds: 42 };
  });

  try {
    await assert.rejects(
      () => rl.rateLimit(req({ 'x-real-ip': '203.0.113.60' }), 'fn-db', { maxRequests: 7, scope: 'psd2' }),
      (error) => {
        assert.equal(error.status, 429);
        assert.equal(error.retryAfterSeconds, 42, 'the database computes the real reset time');
        return true;
      },
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0].maxRequests, 7);
    assert.match(seen[0].bucketKey, /^fn-db:identity:ip:203\.0\.113\.60:psd2$/);
  } finally {
    rl.setRateLimitBackendForTests(null);
    process.env.HAVEN_RATELIMIT_BACKEND = 'memory';
  }
});

test('rate limit keys never contain raw request bodies or bearer tokens', async () => {
  process.env.HAVEN_RATELIMIT_BACKEND = 'supabase';
  rl.resetRateLimitState();
  let captured = null;
  rl.setRateLimitBackendForTests(async ({ bucketKey }) => {
    captured = bucketKey;
    return { allowed: true, remaining: 1, retryAfterSeconds: 0 };
  });
  try {
    await rl.rateLimit(req({ ...authFor('secret-sub'), 'x-real-ip': '203.0.113.61' }), 'fn-privacy');
    assert.ok(captured);
    assert.equal(captured.includes('Bearer'), false);
    assert.equal(captured.includes('secret-sub'), false);
  } finally {
    rl.setRateLimitBackendForTests(null);
    process.env.HAVEN_RATELIMIT_BACKEND = 'memory';
  }
});
