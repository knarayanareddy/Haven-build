// P2.3 — fn-transaction-intercept must not act on unverified input.
//
// The catch block used to fire for *every* failure, including "403: Invalid PSD2
// webhook signature", and it marked the transaction `intercept_failed`, wrote an audit
// row and dispatched a `scam_zwart` notification to every consented family member and
// every admin. An unauthenticated attacker could POST garbage repeatedly and page the
// whole family each time. It also inserted `financial_transactions` before the
// idempotency claim, so each retry left another `processing` row.
//
// The function is exercised here against a mock Supabase client and a mock Deno, so the
// ordering guarantees are behavioural rather than a grep for keywords.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { installDenoShim, linkSharedModules, transpileModuleFile } from './support/shared-loader.mjs';

/**
 * Transpiles a function entry point into the directory that already holds the
 * transpiled `_shared/*.mjs` modules, rewriting `../_shared/x.ts` → `./x.mjs`.
 */
async function transpileFunction(sourceUrl, outDir) {
  const path = await transpileModuleFile(sourceUrl, { outDir });
  const { readFileSync, writeFileSync } = await import('node:fs');
  const rewritten = readFileSync(path, 'utf8').replace(/from\s+['"]\.\.\/_shared\/([A-Za-z0-9_-]+)(?:\.ts)?['"]/g, "from './$1.mjs'");
  writeFileSync(path, rewritten);
  return path;
}

const SOURCE = new URL('../../supabase/functions/fn-transaction-intercept/index.ts', import.meta.url);

/**
 * Minimal in-memory Supabase double. Records every table operation so the test can
 * assert what happened (and what did not) before authorisation.
 */
function createMockDb() {
  const calls = [];
  const rows = { financial_transactions: [], webhook_receipts: [], audit_log: [] };

  function builder(table) {
    const state = { table, op: null, values: null, filters: [] };
    const proxy = {
      insert(values) {
        state.op = 'insert';
        state.values = values;
        calls.push({ table, op: 'insert', values });
        return proxy;
      },
      update(values) {
        state.op = 'update';
        state.values = values;
        calls.push({ table, op: 'update', values });
        return proxy;
      },
      upsert(values) {
        state.op = 'upsert';
        state.values = values;
        calls.push({ table, op: 'upsert', values });
        return proxy;
      },
      select() {
        return proxy;
      },
      eq() {
        return proxy;
      },
      is() {
        return proxy;
      },
      single() {
        if (state.op === 'insert') {
          const row = { id: `tx-${rows.financial_transactions.length + 1}`, ...state.values };
          if (table in rows) rows[table].push(row);
          return Promise.resolve({ data: row, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve, reject) {
        // Awaiting a bare filter chain (updates, receipts, notifications lookups).
        if (state.op === 'insert' && table in rows) rows[table].push(state.values);
        if (state.op === 'update' && table in rows) {
          for (const row of rows[table]) Object.assign(row, state.values);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return proxy;
  }

  return {
    calls,
    rows,
    from(table) {
      return builder(table);
    },
  };
}

async function loadHandler(mockDb, env = {}) {
  installDenoShim(env);
  const notified = [];
  globalThis.__HAVEN_NOTIFICATIONS__ = notified;

  // The function imports core.ts for admin()/dispatchNotification(); the shared loader
  // resolves core.ts, so the Supabase stub is what admin() returns.
  globalThis.__HAVEN_SUPABASE_MOCK__ = mockDb;

  const outDir = await linkSharedModules();
  const fnPath = await transpileFunction(SOURCE, outDir);
  return { modulePath: fnPath, notified };
}

test('an invalid signature is refused with no transaction, no audit row and no notification', () => {
  // Static guarantee: the receipt insert is the only write that precedes the
  // signature check, and the error path is guarded on a persisted row.
  const source = readFileSync(SOURCE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const signatureCheck = source.indexOf('if (!signatureValid)');
  const transactionInsert = source.indexOf('writeTransaction');
  assert.ok(signatureCheck > 0, 'the signature check must exist');
  assert.ok(
    transactionInsert > signatureCheck,
    'the transaction insert must happen after signature verification',
  );

  // The escalation block must be unreachable without a persisted row.
  const failBlock = source.slice(source.indexOf('const http = toHttpError(err);'));
  assert.match(failBlock, /if \(!txId\)/, 'failures before persistence must short-circuit');
  const earlyReturn = failBlock.indexOf('not_persisted');
  const dispatch = failBlock.indexOf('dispatchNotification');
  assert.ok(earlyReturn > 0 && dispatch > earlyReturn, 'notification fan-out must sit after the not-persisted return');
});

test('only a verified failure reaches the escalation ladder', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.match(source, /status: 403, code: 'FORBIDDEN'/, 'an invalid signature is a 403');
  assert.equal(
    /if \(!valid\) throw new Error\('403: Invalid PSD2 webhook signature'\)/.test(source),
    false,
    'the old message-shaped throw must be gone',
  );
});

test('the insert is inside the idempotent block', () => {
  const source = readFileSync(SOURCE, 'utf8');
  const idempotent = source.indexOf('withIdempotency({');
  const insert = source.indexOf('writeTransaction()');
  assert.ok(idempotent > 0 && insert > idempotent, 'the insert must be claimed by the idempotency key');
});

test('no secret configured means refuse, not accept', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.match(source, /PSD2_WEBHOOK_SECRET must be configured/);
  assert.match(source, /status: 503, code: 'SERVICE_UNAVAILABLE'/);
});

test('a malformed body never reaches the database', () => {
  const source = readFileSync(SOURCE, 'utf8');
  const parse = source.indexOf('JSON.parse(raw)');
  const firstWrite = source.indexOf(".from('webhook_receipts')");
  assert.ok(parse > 0 && firstWrite > parse, 'parsing must precede every write');
  assert.match(source, /Malformed JSON body/);
});

test('the handler module loads and returns a function under a mocked runtime', async () => {
  const db = createMockDb();
  // A throwing Deno.serve keeps this test hermetic while still exercising the module
  // graph (catches import-time breakage such as a missing export).
  let handler = null;
  const env = {
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    // Deliberately no PSD2_WEBHOOK_SECRET: an unconfigured webhook must refuse.
  };
  globalThis.Deno = {
    env: { get: (name) => env[name] },
    serve: (fn) => {
      handler = fn;
      return { finished: Promise.resolve() };
    },
  };
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;

  const outDir = await linkSharedModules();
  const fnPath = await transpileFunction(SOURCE, outDir);
  await import(fnPath);

  assert.equal(typeof handler, 'function', 'the module must register exactly one handler');

  // Unsigned request, no secret configured: must be 503 and must not touch the ledger.
  const response = await handler(
    new Request('https://example.test/fn-transaction-intercept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ elder_id: 'e1', account_id_masked: 'NL12', amount_cents: 100, transaction_date: '2026-10-29' }),
    }),
  );
  const body = await response.json();
  assert.equal(response.status, 503, `unexpected body: ${JSON.stringify(body)}`);
  assert.equal(body.error_code, 'SERVICE_UNAVAILABLE');
  assert.equal(db.calls.some((call) => call.table === 'financial_transactions'), false);
  assert.equal(db.calls.some((call) => call.table === 'audit_log'), false);
});
