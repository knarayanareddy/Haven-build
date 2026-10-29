// Behavioural tests for fn-pending-confirmation-respond.
//
// Why this file exists
// ────────────────────
// A medication confirmation is a clinical record. The handler used to mark the
// `pending_confirmations` row as `resolved` *before* writing the MAR update, and
// neither write inspected `{ error }` (supabase-js reports database failures in
// the result object rather than throwing). A rejected MAR update therefore left
// the elder's app saying "confirmed" while no dose existed in
// `medication_reminders` — and the elder was never asked again, because the
// confirmation was already resolved.
//
// The ordering guarantee is not observable from the source text alone (nor from
// the static `.includes()` assertions in the older closure tests, which pass for
// either ordering), so the handler is loaded under a mock Supabase client here
// and the resulting row state is asserted directly.
//
// Run with: `node tests/edge/pending-confirmation-ordering.test.mjs`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { linkSharedModules, transpileModuleFile } from './support/shared-loader.mjs';

const SOURCE = new URL('../../supabase/functions/fn-pending-confirmation-respond/index.ts', import.meta.url);

const ELDER_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_ID = '00000000-0000-0000-0000-000000000002';
const CONFIRMATION_ID = '11111111-1111-4111-8111-111111111111';
const REMINDER_ID = '22222222-2222-4222-8222-222222222222';
const FALL_EVENT_ID = '33333333-3333-4333-8333-333333333333';

/**
 * Transpiles the function entry point into the directory that already holds the
 * transpiled `_shared/*.mjs` modules, rewriting `../_shared/x.ts` → `./x.mjs`.
 */
async function transpileFunction(sourceUrl, outDir) {
  const path = await transpileModuleFile(sourceUrl, { outDir });
  const rewritten = readFileSync(path, 'utf8')
    .replace(/from\s+['"]\.\.\/_shared\/([A-Za-z0-9_-]+)(?:\.ts)?['"]/g, "from './$1.mjs'");
  writeFileSync(path, rewritten);
  return path;
}

/**
 * Minimal in-memory PostgREST double.
 *
 * Records every table operation in invocation order (`feed`), so the test can
 * assert that the MAR write happened *before* the confirmation was resolved.
 * `failOn` injects a database error for one table+operation, which is how the
 * "MAR update rejected" case is reproduced — supabase-js surfaces that as
 * `{ error }`, not a thrown exception.
 */
function createMockDb({ pending, reminder, failOn = null }) {
  const feed = [];
  const store = {
    pending_confirmations: [pending],
    medication_reminders: [reminder],
    fall_events: [{ id: FALL_EVENT_ID, status: 'active', elder_ack_at: null, resolution_notes: null }],
    idempotency_keys: [],
    perf_metrics: [],
    audit_log: [],
  };

  function builder(table) {
    const state = { table, op: null, values: null, filters: [], count: null };

    const matches = (row) => state.filters.every(({ kind, col, val }) => {
      if (kind === 'is') return (row[col] ?? null) === val;
      return row[col] === val;
    });

    const resolve = () => {
      const rows = store[table] ?? [];
      if (state.op === 'insert') {
        const row = { id: `${table}-${rows.length + 1}`, ...state.values };
        rows.push(row);
        return { data: row, error: null };
      }
      if (state.op === 'upsert') {
        rows.push(state.values);
        return { data: [state.values], error: null };
      }
      if (state.op === 'update') {
        if (failOn && failOn.table === table && failOn.op === 'update') {
          return { data: null, error: { message: failOn.message ?? 'update rejected', code: failOn.code } };
        }
        const targets = rows.filter(matches);
        for (const row of targets) Object.assign(row, state.values);
        return {
          data: state.count === 'exact' ? null : targets,
          error: null,
          ...(state.count ? { count: targets.length } : {}),
        };
      }
      // select
      const targets = rows.filter(matches);
      return { data: targets, error: null };
    };

    const proxy = {
      insert(values) {
        state.op = 'insert';
        state.values = values;
        feed.push({ table, op: 'insert', values });
        return proxy;
      },
      upsert(values) {
        state.op = 'upsert';
        state.values = values;
        feed.push({ table, op: 'upsert', values });
        return proxy;
      },
      update(values, options = {}) {
        state.op = 'update';
        state.values = values;
        state.count = options.count ?? null;
        feed.push({ table, op: 'update', values, count: options.count ?? null });
        return proxy;
      },
      select() {
        if (!state.op) state.op = 'select';
        return proxy;
      },
      eq(col, val) {
        state.filters.push({ kind: 'eq', col, val });
        return proxy;
      },
      is(col, val) {
        state.filters.push({ kind: 'is', col, val });
        return proxy;
      },
      order() { return proxy; },
      limit() { return proxy; },
      maybeSingle() {
        const out = resolve();
        if (out.error) return Promise.resolve({ data: null, error: out.error });
        const list = Array.isArray(out.data) ? out.data : out.data ? [out.data] : [];
        return Promise.resolve({ data: list[0] ?? null, error: null });
      },
      single() { return proxy.maybeSingle(); },
      then(onFulfilled, onRejected) {
        return Promise.resolve(resolve()).then(onFulfilled, onRejected);
      },
    };
    return proxy;
  }

  return {
    feed,
    store,
    from(table) { return builder(table); },
    auth: {
      getUser(token) {
        const match = /^test-user:(.+)$/.exec(token ?? '');
        if (!match) return Promise.resolve({ data: { user: null }, error: { message: 'invalid token' } });
        return Promise.resolve({ data: { user: { id: match[1] } }, error: null });
      },
    },
    storage: { from: () => ({ createSignedUrl: () => ({ data: { signedUrl: 'mock' }, error: null }) }) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

const basePending = {
  id: CONFIRMATION_ID,
  elder_id: ELDER_ID,
  status: 'pending',
  resolution: null,
  resolved_at: null,
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  confirmation_type: 'medication_taken',
  payload: { medication_reminder_id: REMINDER_ID },
};

async function loadHandler(db) {
  let handler = null;
  globalThis.Deno = {
    env: {
      get(name) {
        const env = {
          SUPABASE_URL: 'http://localhost:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
          SUPABASE_ANON_KEY: 'anon-test-key',
        };
        return env[name];
      },
    },
    serve: (fn) => { handler = fn; return { finished: Promise.resolve() }; },
  };
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;

  const outDir = await linkSharedModules();
  const fnPath = await transpileFunction(SOURCE, outDir);
  await import(`${fnPath}?case=${Math.random()}`);
  assert.equal(typeof handler, 'function', 'the module must register a handler');
  return handler;
}

function request(body, { token = ELDER_ID } = {}) {
  return new Request('https://example.test/fn-pending-confirmation-respond', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer test-user:${token}` },
    body: JSON.stringify(body),
  });
}

const confirmationUpdates = (db) => db.feed.filter(
  (call) => call.table === 'pending_confirmations' && call.op === 'update',
);

/** Writes to domain tables; the idempotency/perf bookkeeping writes are not
 *  business effects and are expected on every path. */
const businessWrites = (db) => db.feed.filter(
  (call) => call.op === 'update' || call.op === 'insert' || call.op === 'upsert',
).filter(
  (call) => !['idempotency_keys', 'perf_metrics', 'audit_log'].includes(call.table),
);

test('a rejected MAR write leaves the confirmation unresolved', async () => {
  const db = createMockDb({
    pending: { ...basePending },
    reminder: { id: REMINDER_ID, status: 'gepland', confirmed_at: null },
    // The clinical table refuses the write — exactly what a revoked grant, a
    // constraint violation or a trigger rejection looks like to supabase-js.
    failOn: { table: 'medication_reminders', op: 'update', message: 'permission denied for table medication_reminders' },
  });
  const handler = await loadHandler(db);

  const response = await handler(request({ confirmation_id: CONFIRMATION_ID, resolution: true }));

  assert.notEqual(response.status, 200, 'a failed dose write must not report success to the elder');
  assert.ok(response.status >= 400, `expected a client/server error, got ${response.status}`);

  const pending = db.store.pending_confirmations[0];
  assert.equal(pending.status, 'pending', 'the confirmation must stay open so the elder is asked again');
  assert.equal(pending.resolved_at, null, 'resolved_at must not be stamped when the dose was not recorded');

  assert.equal(
    confirmationUpdates(db).length, 0,
    'no write to pending_confirmations may be attempted before the MAR write succeeds',
  );
});

test('the MAR write happens before the confirmation is marked resolved', async () => {
  const db = createMockDb({
    pending: { ...basePending },
    reminder: { id: REMINDER_ID, status: 'gepland', confirmed_at: null },
  });
  const handler = await loadHandler(db);

  const response = await handler(request({ confirmation_id: CONFIRMATION_ID, resolution: true }));
  assert.equal(response.status, 200);

  const marIndex = db.feed.findIndex(
    (call) => call.table === 'medication_reminders' && call.op === 'update',
  );
  const resolveIndex = db.feed.findIndex(
    (call) => call.table === 'pending_confirmations' && call.op === 'update',
  );
  assert.ok(marIndex >= 0, 'the dose must be recorded');
  assert.ok(resolveIndex > marIndex, 'the confirmation may only be resolved after the dose is recorded');

  const reminder = db.store.medication_reminders[0];
  assert.equal(reminder.status, 'ingenomen');
  assert.ok(reminder.confirmed_at, 'confirmed_at must be stamped');

  const pending = db.store.pending_confirmations[0];
  assert.equal(pending.status, 'resolved');
  assert.ok(pending.resolved_at);

  const body = await response.json();
  assert.equal(body.status, 'resolved');
  assert.equal(body.confirmation_type, 'medication_taken');
});

test('a medication confirmation with no reminder link is refused instead of resolved', async () => {
  const db = createMockDb({
    pending: { ...basePending, payload: {} },
    reminder: { id: REMINDER_ID, status: 'gepland', confirmed_at: null },
  });
  const handler = await loadHandler(db);

  const response = await handler(request({ confirmation_id: CONFIRMATION_ID, resolution: true }));

  assert.equal(response.status, 409, 'a confirmation with nothing to confirm is a conflict, not a success');
  assert.equal(confirmationUpdates(db).length, 0, 'nothing may be resolved');
});

test('only the elder named on the confirmation may answer it', async () => {
  const db = createMockDb({
    pending: { ...basePending },
    reminder: { id: REMINDER_ID, status: 'gepland', confirmed_at: null },
  });
  const handler = await loadHandler(db);

  const response = await handler(
    request({ confirmation_id: CONFIRMATION_ID, resolution: true }, { token: OTHER_ID }),
  );

  assert.equal(response.status, 403, 'a different signed-in user must not resolve another elder\'s confirmation');
  assert.equal(businessWrites(db).length, 0, 'no writes may occur');
});

test('an already-resolved confirmation replays without touching the MAR record', async () => {
  const db = createMockDb({
    pending: { ...basePending, status: 'resolved', resolution: true, resolved_at: new Date().toISOString() },
    reminder: { id: REMINDER_ID, status: 'ingenomen', confirmed_at: new Date().toISOString() },
  });
  const handler = await loadHandler(db);

  const response = await handler(request({ confirmation_id: CONFIRMATION_ID, resolution: true }));
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.status, 'already_resolved');
  assert.equal(
    businessWrites(db).length, 0,
    'a replay must not write again (double-dose protection)',
  );
});

test('an expired confirmation is marked expired and not resolved', async () => {
  const db = createMockDb({
    pending: { ...basePending, expires_at: new Date(Date.now() - 60_000).toISOString() },
    reminder: { id: REMINDER_ID, status: 'gepland', confirmed_at: null },
  });
  const handler = await loadHandler(db);

  const response = await handler(request({ confirmation_id: CONFIRMATION_ID, resolution: true }));
  assert.equal(response.status, 403);

  const pending = db.store.pending_confirmations[0];
  assert.equal(pending.status, 'expired', 'expiry must be recorded');
  assert.equal(pending.resolved_at, null, 'an expired confirmation is not a resolution');
  assert.equal(
    businessWrites(db).filter((c) => c.table === 'medication_reminders').length, 0,
    'an expired token must never record a dose',
  );
});

test('a fall acknowledgement resolves the fall event before the confirmation', async () => {
  const db = createMockDb({
    pending: { ...basePending, confirmation_type: 'fall_response', payload: { fall_event_id: FALL_EVENT_ID } },
    reminder: { id: REMINDER_ID, status: 'gepland', confirmed_at: null },
  });
  const handler = await loadHandler(db);

  const response = await handler(request({ confirmation_id: CONFIRMATION_ID, resolution: true }));
  assert.equal(response.status, 200);

  const fallIndex = db.feed.findIndex((c) => c.table === 'fall_events' && c.op === 'update');
  const resolveIndex = db.feed.findIndex((c) => c.table === 'pending_confirmations' && c.op === 'update');
  assert.ok(fallIndex >= 0 && resolveIndex > fallIndex, 'the fall event must close first');
  assert.equal(db.store.fall_events[0].status, 'resolved');
  assert.ok(db.store.fall_events[0].elder_ack_at);
});
