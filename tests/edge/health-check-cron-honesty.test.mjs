// Behavioural tests for fn-health-check's pg_cron sweeper check.
//
// Why this file exists
// ────────────────────
// The check claimed to verify "Critical pg_cron Jobs Last Run Time" for the
// retention sweeper, but it read `public.perf_metrics` — a table written by
// `recordMetric()` on every request and by no cron job whatsoever. On top of
// that, `maybeSingle()` reports failures in `{ error }` instead of throwing, so
// an empty or failing query fell through to
// `new Date(Date.now() - 3600000)` with `status: "healthy"`. A dead sweeper
// therefore reported healthy, and the sweeper's job is enforcing the GDPR
// retention windows. The check also did not participate in the overall health
// status, so even a failed cron check returned HTTP 200.
//
// These tests drive the real handler and assert the four observable states:
// missing, stale, failed, fresh — plus `not_applicable` when pg_cron is absent.
//
// Run with: `node tests/edge/health-check-cron-honesty.test.mjs`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { linkSharedModules, transpileModuleFile } from './support/shared-loader.mjs';

const SOURCE = new URL('../../supabase/functions/fn-health-check/index.ts', import.meta.url);
const INTERNAL_KEY = 'test-internal-key-0123456789abcdef'; // >= 32 chars, as required

async function transpileFunction(sourceUrl, outDir) {
  const path = await transpileModuleFile(sourceUrl, { outDir });
  const rewritten = readFileSync(path, 'utf8')
    .replace(/from\s+['"]\.\.\/_shared\/([A-Za-z0-9_-]+)(?:\.ts)?['"]/g, "from './$1.mjs'");
  writeFileSync(path, rewritten);
  return path;
}

/** PostgREST double: `profiles` is reachable, `cron_job_health` is scripted. */
function createMockDb(cronResult) {
  return {
    from(table) {
      const state = { table, op: 'select', filters: [] };
      const proxy = {
        select() { return proxy; },
        eq(col, val) { state.filters.push([col, val]); return proxy; },
        is() { return proxy; },
        order() { return proxy; },
        limit() { return proxy; },
        maybeSingle() {
          if (table === 'cron_job_health') {
            return Promise.resolve({ data: cronResult.row ?? null, error: cronResult.error ?? null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() { return proxy.maybeSingle(); },
        insert() { return Promise.resolve({ data: null, error: null }); },
        update() { return proxy; },
        then(onFulfilled, onRejected) {
          if (table === 'cron_job_health') {
            return Promise.resolve({ data: cronResult.row ? [cronResult.row] : [], error: cronResult.error ?? null })
              .then(onFulfilled, onRejected);
          }
          return Promise.resolve({ data: [], error: null, count: 0 }).then(onFulfilled, onRejected);
        },
      };
      return proxy;
    },
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: { message: 'n/a' } }) },
    storage: { from: () => ({}) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

async function loadHandler(db) {
  let handler = null;
  const env = {
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    SUPABASE_ANON_KEY: 'anon-test-key',
    HAVEN_INTERNAL_KEY: INTERNAL_KEY,
  };
  globalThis.Deno = {
    env: {
      get: (name) => env[name],
      set: (name, value) => { env[name] = value; },
    },
    serve: (fn) => { handler = fn; return { finished: Promise.resolve() }; },
  };
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  // No vendor keys are configured, so the Redis/OpenAI/ElevenLabs checks return
  // "missing credentials" without any network access. Nothing under test here
  // depends on them.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network disabled in test'); };

  try {
    const outDir = await linkSharedModules();
    const fnPath = await transpileFunction(SOURCE, outDir);
    await import(`${fnPath}?case=${Math.random()}`);
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(typeof handler, 'function', 'the module must register a handler');
  return handler;
}

function invoke(handler) {
  return handler(new Request('https://example.test/fn-health-check', {
    method: 'POST',
    headers: { 'x-haven-internal-key': INTERNAL_KEY },
  }));
}

const hoursAgo = (n) => new Date(Date.now() - n * 3_600_000).toISOString();

test('a scheduled but never-run sweeper is not reported healthy', async () => {
  const handler = await loadHandler(createMockDb({ row: null }));
  const response = await invoke(handler);

  assert.equal(response.status, 503, 'a missing retention sweep must degrade health');

  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.checks.pg_cron_sweeper.ok, false);
  assert.equal(body.checks.pg_cron_sweeper.status, 'missing');
  assert.equal(body.checks.pg_cron_sweeper.last_cron_sweep, null, 'no timestamp may be fabricated');
  assert.match(body.checks.pg_cron_sweeper.error, /not scheduled/);
});

test('a stale sweeper fails the check instead of passing', async () => {
  const handler = await loadHandler(createMockDb({
    row: { jobname: 'haven-database-retention-r5', status: 'succeeded', start_time: hoursAgo(50), end_time: hoursAgo(50) },
  }));
  const response = await invoke(handler);

  const body = await response.json();
  assert.equal(response.status, 503, 'a sweeper 50h late must degrade health (schedule is daily)');
  assert.equal(body.checks.pg_cron_sweeper.ok, false);
  assert.equal(body.checks.pg_cron_sweeper.status, 'stale');
  assert.ok(body.checks.pg_cron_sweeper.last_cron_sweep, 'the real (stale) run time is still reported for diagnosis');
  assert.match(body.checks.pg_cron_sweeper.error, /max 26h/);
});

test('a failed sweep run fails the check even when it ran recently', async () => {
  const handler = await loadHandler(createMockDb({
    row: {
      jobname: 'haven-database-retention-r5',
      status: 'failed',
      start_time: hoursAgo(2),
      end_time: hoursAgo(2),
      return_message: 'duplicate key value violates unique constraint "audit_log_pkey"',
    },
  }));
  const response = await invoke(handler);

  const body = await response.json();
  assert.equal(body.checks.pg_cron_sweeper.ok, false);
  assert.equal(body.checks.pg_cron_sweeper.status, 'failed');
  assert.match(body.checks.pg_cron_sweeper.error, /status failed/);
  assert.doesNotMatch(body.checks.pg_cron_sweeper.error, /audit_log_pkey.*\n/, 'reason is single-line');
});

test('a fresh successful sweep passes', async () => {
  const handler = await loadHandler(createMockDb({
    row: { jobname: 'haven-database-retention-r5', status: 'succeeded', start_time: hoursAgo(3), end_time: hoursAgo(3) },
  }));
  const response = await invoke(handler);

  const body = await response.json();
  assert.equal(body.checks.pg_cron_sweeper.ok, true);
  assert.equal(body.checks.pg_cron_sweeper.status, 'healthy');
  assert.notEqual(body.checks.pg_cron_sweeper.last_cron_sweep, null, 'the real run time must be reported');
});

test('pg_cron absent is not_applicable, not a silent pass', async () => {
  const handler = await loadHandler(createMockDb({
    error: { code: '42P01', message: 'relation "public.cron_job_health" does not exist' },
  }));
  const response = await invoke(handler);

  const body = await response.json();
  assert.equal(body.checks.pg_cron_sweeper.status, 'not_applicable');
  assert.equal(body.checks.pg_cron_sweeper.ok, true, 'not applicable must not break the endpoint');
  assert.match(body.checks.pg_cron_sweeper.error, /pg_cron not installed/);
});

test('the response reports every check the endpoint claims to perform', async () => {
  const handler = await loadHandler(createMockDb({
    row: { jobname: 'haven-database-retention-r5', status: 'succeeded', start_time: hoursAgo(3), end_time: hoursAgo(3) },
  }));
  const body = await (await invoke(handler)).json();

  // These five keys are what the old static suite asserted by grepping for the
  // comment above each check. Asserting the shape of the real response is the
  // same claim, and this one fails when a check is removed.
  assert.deepEqual(
    Object.keys(body.checks).sort(),
    ['database', 'elevenlabs', 'openai', 'pg_cron_sweeper', 'redis'],
  );
  for (const [name, check] of Object.entries(body.checks)) {
    assert.equal(typeof check.ok, 'boolean', `${name} must report a boolean health`);
  }
  assert.equal(typeof body.duration_ms, 'number');
});

test('the endpoint refuses a request without the internal key', async () => {
  const handler = await loadHandler(createMockDb({ row: null }));
  const response = await handler(new Request('https://example.test/fn-health-check', { method: 'POST' }));
  assert.equal(response.status, 403, 'health detail is internal, not public');

  const body = await response.json();
  assert.equal(body.error_code, 'FORBIDDEN');
});

test('the check reads the real cron run history, never perf_metrics', () => {
  // Comments legitimately quote the old code, so only executable text counts.
  const source = readFileSync(SOURCE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.match(source, /from\("cron_job_health"\)/, 'must read the exposed cron view');
  assert.doesNotMatch(
    source,
    /from\("perf_metrics"\)[\s\S]{0,200}last_cron_sweep/,
    'the cron check must not read request telemetry as if it were sweep history',
  );
  assert.doesNotMatch(
    source,
    /new Date\(Date\.now\(\) - 3600000\)/,
    'the fabricated fallback timestamp must be gone',
  );
});
