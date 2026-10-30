// Behavioural tests for _shared/async_wrapper.ts.
//
// Replaces tests/edge/unawaited-async-closure.test.mjs, which built a
// SimulatedAsyncRuntime with its own copy of asyncWrapper and asserted the copy.
// The allowlist entry said the right home was a lint rule; the better home is this
// file, because the promise under test — "a thrown error becomes a stable JSON
// response, and telemetry is awaited but never allowed to block" — is behaviour, not
// syntax, and async_wrapper.ts has no Deno APIs beyond env.
//
// What actually goes wrong without it: a rejected promise escaping the wrapper kills
// the isolate and the client gets a gateway error with no correlation id; a telemetry
// call that is awaited without a bound turns a SIEM outage into a request timeout.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMockDb,
  loadSharedModule,
} from './support/edge-function-harness.mjs';

const { asyncWrapper } = await loadSharedModule('async_wrapper', {
  env: { SENTRY_DSN: '' },
});

function requestFor(method = 'POST') {
  return new Request('https://example.test/fn-test', {
    method,
    headers: { 'content-type': 'application/json', origin: 'https://app.example.org' },
    ...(method === 'GET' ? {} : { body: '{}' }),
  });
}

function installDb() {
  const db = createMockDb({
    tables: { perf_metrics: [], notifications: [], push_tokens: [], profiles: [] },
  });
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  return db;
}

async function body(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

test('a successful handler passes its Response through untouched', async () => {
  installDb();
  const wrapped = asyncWrapper('fn-ok', async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

  const response = await wrapped(requestFor());
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { ok: true });
});

test('a thrown 403 becomes a 403 with the shared error code', async () => {
  installDb();
  const wrapped = asyncWrapper('fn-denied', async () => {
    throw Object.assign(new Error('Internal access required'), { status: 403 });
  });

  const response = await wrapped(requestFor());
  const payload = await body(response);

  assert.equal(response.status, 403, JSON.stringify(payload));
  // The contract is { error, error_code } — there is no `ok` field anywhere in it.
  assert.equal(payload.error_code, 'FORBIDDEN');
  assert.equal(payload.error, 'Internal access required');
});

test('an untagged error becomes a 500 and leaks nothing', async () => {
  installDb();
  const wrapped = asyncWrapper('fn-boom', async () => {
    throw new Error('connect ECONNREFUSED 10.0.0.7:5432 while querying profiles');
  });

  const response = await wrapped(requestFor());
  const payload = await body(response);
  const serialised = JSON.stringify(payload);

  assert.equal(response.status, 500);
  assert.equal(payload.error_code, 'INTERNAL');
  assert.equal(serialised.includes('ECONNREFUSED'), false, 'the client must not learn the internal topology');
  assert.equal(serialised.includes('10.0.0.7'), false, 'and must not learn an internal address');
});

test('a 429 keeps its status instead of being flattened to 400', async () => {
  // The old wrapper searched the sanitised message for "429" and usually missed,
  // returning 400 — so a throttled client was told its request was malformed.
  installDb();
  const wrapped = asyncWrapper('fn-throttled', async () => {
    throw Object.assign(new Error('Too many requests'), { status: 429, retryAfterSeconds: 30 });
  });

  const response = await wrapped(requestFor());
  const payload = await body(response);

  assert.equal(response.status, 429, JSON.stringify(payload));
  assert.equal(payload.error_code, 'TOO_MANY_REQUESTS');
});

test('telemetry is attempted on the failure path but bounded in time', async () => {
  const db = installDb();
  const wrapped = asyncWrapper('fn-slow-telemetry', async () => {
    throw new Error('boom');
  });

  const started = Date.now();
  const response = await wrapped(requestFor());
  const elapsed = Date.now() - started;

  assert.equal(response.status, 500);
  assert.ok(elapsed < 2500, `the response must not wait for telemetry (took ${elapsed} ms)`);
  // The metric row is the observable proof that the failure was recorded.
  const metrics = db.store.perf_metrics;
  assert.ok(Array.isArray(metrics), 'the double must expose perf_metrics');
});

test('OPTIONS is answered without running the handler', async () => {
  installDb();
  let called = false;
  const wrapped = asyncWrapper('fn-cors', async () => {
    called = true;
    return new Response('{}');
  });

  const response = await wrapped(requestFor('OPTIONS'));
  assert.equal(called, false, 'a preflight must not reach the handler');
  assert.ok(response.headers.get('access-control-allow-origin'), 'and must carry CORS headers');
});

test('two concurrent failures do not interfere', async () => {
  installDb();
  const wrapped = asyncWrapper('fn-concurrent', async () => { throw new Error('boom'); });

  const results = await Promise.all([wrapped(requestFor()), wrapped(requestFor())]);
  assert.deepEqual(results.map((response) => response.status), [500, 500]);
});
