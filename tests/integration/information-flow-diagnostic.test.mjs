// Diagnostic acceptance tests. These intentionally fail while the reported defects exist.
// They execute production handlers; PGlite enforces the extracted PostgreSQL enum/CHECK at
// the two writes shown below. All other persistence and auth are test doubles, NOT live Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { call, createMockDb, loadAppModule, loadEdgeFunction, request } from '../edge/support/edge-function-harness.mjs';

const ELDER = '11111111-1111-4111-8111-111111111111';
const FAMILY = '22222222-2222-4222-8222-222222222222';
const REMINDER = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const INTERNAL_KEY = 'test-internal-key-that-is-at-least-32-chars';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

async function schema() {
  const db = new PGlite();
  const fall = read('supabase/migrations/20260614000000_vnext_wellrounded_patch.sql');
  const createEnum = fall.match(/create type fall_status as enum\s*\([^;]+;/i)?.[0];
  assert.ok(createEnum, 'fall_status must be extractable from the migration');
  await db.exec(createEnum);
  // Include later ALTER TYPE statements if migrations add values in future.
  for (const name of readdirSync(new URL('../../supabase/migrations/', import.meta.url)).sort()) {
    const sql = read(`supabase/migrations/${name}`);
    for (const alteration of sql.matchAll(/alter\s+type\s+(?:public\.)?fall_status\s+add\s+value[^;]+;/gi)) {
      await db.exec(alteration[0]);
    }
  }
  const base = read('supabase/migrations/20260611000001_haven_v121_production_schema.sql');
  const check = base.match(/message_type\s+text\s+not null\s+check\s*\(message_type\s+in\s*\(([^)]+)\)\)/i)?.[1];
  assert.ok(check, 'family_messages.message_type CHECK must be extractable');
  await db.exec(`create table check_message (message_type text not null check (message_type in (${check})));`);
  return db;
}

// Wrap only the exact mutation boundary: execute the database's real constraint first and
// return errors like supabase-js does. Other calls use the repository's behavioural double.
function withConstraintChecks(mock, pg, diagnostics) {
  return {
    ...mock,
    from(table) {
      const builder = mock.from(table);
      if (table === 'fall_events') {
        const update = builder.update;
        builder.update = (values, opts) => {
          update(values, opts);
          const maybeSingle = builder.maybeSingle;
          builder.maybeSingle = async () => {
            try { await pg.query('select $1::fall_status', [values.status]); }
            catch (error) { diagnostics.push({ table, code: error.code, value: values.status }); return { data: null, error }; }
            return maybeSingle();
          };
          return builder;
        };
      }
      if (table === 'family_messages') {
        const insert = builder.insert;
        builder.insert = (values) => {
          const select = builder.select;
          builder.select = (...args) => {
            const selected = select(...args);
            const single = selected.single;
            selected.single = async () => {
              try { await pg.query('insert into check_message(message_type) values ($1)', [values.message_type]); }
              catch (error) { diagnostics.push({ table, code: error.code, value: values.message_type }); return { data: null, error }; }
              insert(values);
              return single();
            };
            return selected;
          };
          return builder;
        };
      }
      return builder;
    },
  };
}

function baseDb(locale = 'nl-NL') {
  return createMockDb({ tables: {
    profiles: [{ id: ELDER, locale }, { id: FAMILY, locale: 'en-GB' }],
    family_relationships: [{ elder_id: ELDER, family_member_id: FAMILY, elder_consented: true, is_active: true, can_view_messages: true, notify_on_crisis: true }],
    medication_reminders: [{ id: REMINDER, elder_id: ELDER, medication_id: OTHER, status: 'gepland' }],
    pending_confirmations: [], voice_interactions: [], fall_events: [], family_messages: [], grandchild_profiles: [],
    notifications: [], push_tokens: [], audit_log: [], security_violations: [], perf_metrics: [],
  } });
}

async function runVoice(locale, reminderId = REMINDER) {
  const db = baseDb(locale);
  const edge = await loadEdgeFunction('fn-voice-pipeline', { db });
  globalThis.__diagnosticVoice = async (body) => {
    const result = await call(edge.handler, request('fn-voice-pipeline', { headers: { authorization: `Bearer user:${ELDER}` }, body }));
    if (result.status >= 400) throw Object.assign(new Error(JSON.stringify(result.body)), { status: result.status });
    return result.body;
  };
  globalThis.__diagnosticAlerts = [];
  const hook = await loadAppModule('apps/elder/src/hooks/useHavenActions.ts', { stubs: {
    react: 'export const useCallback = (fn) => fn;',
    '@haven/i18n': 'export const useTranslation = () => ({ t: (key) => key });',
    '../auth/AuthProvider': `export const useAuth = () => ({session: {access_token:'token', user:{id:'${ELDER}'}}});`,
    '../services/havenClient': 'export class HavenClient { voice(body) { return globalThis.__diagnosticVoice(body); } }',
    'react-native': 'export const Alert = {alert: (...args) => globalThis.__diagnosticAlerts.push(args)}; export const Linking = {openURL: async () => {}};',
    '../services/sqliteOfflineQueue': 'export function enqueueOfflineAction() { throw new Error("unexpected queue"); }',
    '../state/networkResilience': 'export function classifyNetworkError() { return "other"; }',
    '../services/errorMapper': 'export function translateElderError(e) { return String(e); }',
  } });
  await hook.useHavenActions('PILLS').handlePrimaryAction(`TAKE:${reminderId}`);
  await edge.settle();
  return db;
}

test('a Dutch elder tapping a dose gets a confirmation for that dose', async () => {
  const db = await runVoice('nl-NL');
  assert.equal(db.store.pending_confirmations.length, 1, 'a successful tap must ask for confirmation, not silently become a companion reply');
  assert.equal(db.store.pending_confirmations[0].payload.medication_reminder_id, REMINDER);
});

test('an English elder tapping a dose gets a confirmation for that dose', async () => {
  const db = await runVoice('en-GB');
  assert.equal(db.store.pending_confirmations.length, 1);
  assert.equal(db.store.pending_confirmations[0].payload.medication_reminder_id, REMINDER);
});

test('the app does not claim a dose is recorded while repeat-back is still pending', async () => {
  const db = await runVoice('en-GB');
  assert.equal(db.store.pending_confirmations.length, 1, 'the server is waiting for an answer');
  assert.equal(globalThis.__diagnosticAlerts.some((args) => args[1] === 'actions.take_success.alert'), false, 'the app reports success before the confirmation is answered');
});

test('a stale or foreign reminder ID never targets a different dose', async () => {
  const db = await runVoice('en-GB', OTHER);
  assert.equal(db.store.pending_confirmations.length, 0, 'unknown target must be rejected, not redirected to the earliest open reminder');
});

test('a fall escalation can claim a real-schema fall and submit to a mocked push provider', async () => {
  const pg = await schema();
  try {
    const now = new Date().toISOString();
    const fall = { fall_id: 'fall-1', elder_id: ELDER, detection_source: 'manual', confidence: 0.9, status: 'possible', detected_at: now, device_label: null, device_platform: null };
    const mock = baseDb();
    mock.store.fall_events.push({ id: fall.fall_id, elder_id: ELDER, status: 'possible' });
    mock.store.push_tokens.push({ profile_id: FAMILY, token: 'test-token', is_active: true });
    const originalRpc = mock.rpc;
    mock.rpc = (name, args) => name === 'get_active_emergency_falls' ? Promise.resolve({ data: [fall], error: null }) : originalRpc(name, args);
    const diagnostics = [];
    const edge = await loadEdgeFunction('fn-fall-escalation', { db: withConstraintChecks(mock, pg, diagnostics) });
    const result = await call(edge.handler, request('fn-fall-escalation', { headers: { 'x-haven-internal-key': INTERNAL_KEY } }));
    await edge.settle();
    assert.equal(result.status, 200);
    assert.equal(result.body.events_processed, 1, `fall must be processed; database rejected ${JSON.stringify(diagnostics)}`);
    assert.equal(mock.store.notifications.length, 1, 'family must receive a notification record');
  } finally { await pg.close(); }
});

test('grandchild hello reaches family_messages under the real CHECK constraint', async () => {
  const pg = await schema();
  try {
    const app = read('apps/grandchild/App.tsx');
    const sentType = app.match(/message_type:\s*['"]([^'"]+)['"]/)?.[1];
    assert.ok(sentType, 'could not extract the hello message type from the app');
    const mock = baseDb();
    const diagnostics = [];
    const edge = await loadEdgeFunction('fn-grandchild-message-send', { db: withConstraintChecks(mock, pg, diagnostics) });
    const result = await call(edge.handler, request('fn-grandchild-message-send', {
      headers: { authorization: `Bearer user:${FAMILY}` },
      body: { elder_id: ELDER, family_member_id: FAMILY, display_name: 'Kleinkind', message_type: sentType, content_nl: 'Groet' },
    }));
    await edge.settle();
    assert.equal(result.status, 200, `hello must be accepted; database rejected ${JSON.stringify(diagnostics)}; response ${JSON.stringify(result.body)}`);
    assert.equal(mock.store.family_messages.length, 1);
  } finally { await pg.close(); }
});

test('asking for help after a fall records a family notification attempt', async () => {
  const db = baseDb();
  db.store.fall_events.push({ id: OTHER, elder_id: ELDER, status: 'possible' });
  db.store.pending_confirmations.push({ id: REMINDER, elder_id: ELDER, confirmation_type: 'fall_response', payload: { fall_event_id: OTHER }, status: 'pending', resolved_at: null, expires_at: new Date(Date.now() + 120_000).toISOString() });
  const edge = await loadEdgeFunction('fn-pending-confirmation-respond', { db });
  const result = await call(edge.handler, request('fn-pending-confirmation-respond', { headers: { authorization: `Bearer user:${ELDER}` }, body: { confirmation_id: REMINDER, resolution: false } }));
  await edge.settle();
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.ok(db.store.notifications.some((n) => n.recipient_id === FAMILY), 'the response endpoint does not send the family alert that the app promises');
});

test('unread family message remains unread after mapping to the elder screen', async () => {
  const mapper = await loadAppModule('apps/elder/src/services/screenDataMapper.ts');
  const mapped = mapper.mapScreenData({ data: { messages: [{ id: 'message-1', sender_id: FAMILY, message_type: 'tekst', content_nl: 'Hallo', read_by_elder: false }] } }, 'nl-NL');
  assert.equal(mapped.messages[0].unread, true, 'a new message must not be rendered as already read');
});

test('ticking a task issues a write rather than reporting a read as completed', async () => {
  globalThis.__diagnosticWrites = [];
  globalThis.__diagnosticAlerts = [];
  const hook = await loadAppModule('apps/elder/src/hooks/useHavenActions.ts', { stubs: {
    react: 'export const useCallback = (fn) => fn;',
    '@haven/i18n': 'export const useTranslation = () => ({ t: (key) => key });',
    '../auth/AuthProvider': `export const useAuth = () => ({session: {access_token:'token', user:{id:'${ELDER}'}}});`,
    '../services/havenClient': 'export class HavenClient { async screenData() {} async completeTask(id) { globalThis.__diagnosticWrites.push(id); } }',
    'react-native': 'export const Alert = {alert: (...args) => globalThis.__diagnosticAlerts.push(args)}; export const Linking = {openURL: async () => {}};',
    '../services/sqliteOfflineQueue': 'export function enqueueOfflineAction(type, payload) { globalThis.__diagnosticWrites.push({type, payload}); }',
    '../state/networkResilience': 'export function classifyNetworkError() { return "other"; }',
    '../services/errorMapper': 'export function translateElderError(e) { return String(e); }',
  } });
  await hook.useHavenActions('TODAY').handlePrimaryAction(`TOGGLE_TASK:${REMINDER}`);
  assert.notEqual(globalThis.__diagnosticWrites.length, 0, 'no mutation or queue entry was made');
});

test('declining a call sends the session ID in the endpoint contract', async () => {
  const db = baseDb();
  db.store.video_call_sessions = [{ id: REMINDER, elder_id: ELDER, initiator_id: FAMILY, status: 'created' }];
  let apiStatus;
  const edge = await loadEdgeFunction('fn-video-call-end', { db, fetchImpl: async (_url, init) => {
    const response = await edge.handler(new Request('https://example.test/fn-video-call-end', init));
    apiStatus = response.status;
    return response;
  } });
  globalThis.__diagnosticAlerts = [];
  const hook = await loadAppModule('apps/elder/src/hooks/useHavenActions.ts', { stubs: {
    react: 'export const useCallback = (fn) => fn;',
    '@haven/i18n': 'export const useTranslation = () => ({ t: (key) => key });',
    '../auth/AuthProvider': `export const useAuth = () => ({session: {access_token:'user:${ELDER}', user:{id:'${ELDER}'}}});`,
    '../services/havenClient': 'export class HavenClient {}',
    'react-native': 'export const Alert = {alert: (...args) => globalThis.__diagnosticAlerts.push(args)}; export const Linking = {openURL: async () => {}};',
    '../services/sqliteOfflineQueue': 'export function enqueueOfflineAction() {}',
    '../state/networkResilience': 'export function classifyNetworkError() { return "other"; }',
    '../services/errorMapper': 'export function translateElderError(e) { return String(e); }',
  } });
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.test';
  try { await hook.useHavenActions('HOME').handlePrimaryAction(`CALL_DECLINE:${REMINDER}`); }
  finally { if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL; else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl; }
  await edge.settle();
  assert.ok(edge.calls.some((c) => c.url.endsWith('/fn-video-call-end')), 'the app must actually send an end request');
  assert.equal(db.store.video_call_sessions[0].status, 'ended', `decline must end the server session; endpoint returned HTTP ${apiStatus}`);
});

test('emergency button offers a real way to place an emergency call', async () => {
  globalThis.__diagnosticAlerts = [];
  globalThis.__diagnosticDialled = [];
  const hook = await loadAppModule('apps/elder/src/hooks/useHavenActions.ts', { stubs: {
    react: 'export const useCallback = (fn) => fn;',
    '@haven/i18n': 'export const useTranslation = () => ({ t: (key) => key });',
    '../auth/AuthProvider': `export const useAuth = () => ({session: {access_token:'token', user:{id:'${ELDER}'}}});`,
    '../services/havenClient': 'export class HavenClient {}',
    'react-native': 'export const Alert = {alert: (...args) => globalThis.__diagnosticAlerts.push(args)}; export const Linking = {openURL: (...args) => globalThis.__diagnosticDialled.push(args)};',
    '../services/sqliteOfflineQueue': 'export function enqueueOfflineAction() {}',
    '../state/networkResilience': 'export function classifyNetworkError() { return "other"; }',
    '../services/errorMapper': 'export function translateElderError(e) { return String(e); }',
  } });
  await hook.useHavenActions('HOME').handlePrimaryAction('EMERGENCY');
  const hasAction = globalThis.__diagnosticDialled.length > 0 || globalThis.__diagnosticAlerts.some((args) => Array.isArray(args[2]) && args[2].some((button) => typeof button.onPress === 'function'));
  assert.ok(hasAction, 'an informational alert alone cannot place a call');
});

test('read receipt SQL updates only the signed-in elder’s received messages', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.family_messages (id uuid primary key, elder_id uuid, sender_id uuid, read_by_elder boolean default false, read_at timestamptz, deleted_at timestamptz);
    `);
    await pg.exec(read('supabase/migrations/20261101030000_message_read_receipts.sql'));
    await pg.query('insert into public.family_messages (id,elder_id,sender_id) values ($1,$2,$3),($4,$3,$2),($5,$2,$2)', [REMINDER, ELDER, FAMILY, OTHER, '55555555-5555-4555-8555-555555555555']);
    await pg.exec(`set request.jwt.claim.sub = '${ELDER}'; set role authenticated;`);
    const result = await pg.query('select public.mark_family_messages_read($1::uuid[]) as changed', [[REMINDER, OTHER, '55555555-5555-4555-8555-555555555555']]);
    assert.equal(result.rows[0].changed, 1);
    await pg.exec('reset role');
    const rows = await pg.query('select id, read_by_elder from public.family_messages order by id');
    assert.equal(rows.rows.find((r) => r.id === REMINDER).read_by_elder, true);
    assert.equal(rows.rows.find((r) => r.id === OTHER).read_by_elder, false);
    assert.equal(rows.rows.find((r) => r.id === '55555555-5555-4555-8555-555555555555').read_by_elder, false);
  } finally { await pg.close(); }
});

test('PostgreSQL permits only one fresh claim and exposes stale claims for recovery', async () => {
  const pg = await schema();
  try {
    await pg.exec(`
      create table public.device_sessions (id uuid primary key, device_label text, platform text, revoked_at timestamptz);
      create table public.fall_events (id uuid primary key, elder_id uuid, detection_source text, confidence numeric, status fall_status, detected_at timestamptz, device_session_id uuid, created_at timestamptz, family_notified_at timestamptz);
    `);
    await pg.exec(read('supabase/migrations/20261101020000_fall_escalation_claims.sql'));
    await pg.query("insert into public.fall_events (id,elder_id,detection_source,confidence,status,detected_at,created_at) values ($1,$2,'manual',0.8,'possible',now(),now())", [REMINDER, ELDER]);
    const claim = "update public.fall_events set status='processing', escalation_claimed_at=now() where id=$1 and status='possible' returning id";
    const first = await pg.query(claim, [REMINDER]);
    const second = await pg.query(claim, [REMINDER]);
    assert.equal(first.rows.length, 1);
    assert.equal(second.rows.length, 0);
    assert.equal((await pg.query('select * from public.get_active_emergency_falls()')).rows.length, 0, 'an active lease must not be recovered');
    await pg.query("update public.fall_events set escalation_claimed_at=now()-interval '6 minutes' where id=$1", [REMINDER]);
    assert.equal((await pg.query('select * from public.get_active_emergency_falls()')).rows.length, 1, 'an expired lease must be recoverable');
  } finally { await pg.close(); }
});

test('a failed fall notification leaves a retryable fall and reports failure', async () => {
  const fall = { fall_id: REMINDER, elder_id: ELDER, detection_source: 'manual', confidence: 0.9, status: 'possible', detected_at: new Date().toISOString(), device_label: null, device_platform: null };
  const db = baseDb();
  db.store.fall_events.push({ id: REMINDER, elder_id: ELDER, status: 'possible' });
  const original = db.rpc;
  db.rpc = (name, args) => name === 'get_active_emergency_falls' ? Promise.resolve({ data: [fall], error: null }) : original(name, args);
  const edge = await loadEdgeFunction('fn-fall-escalation', { db });
  const result = await call(edge.handler, request('fn-fall-escalation', { headers: { 'x-haven-internal-key': INTERNAL_KEY } }));
  await edge.settle();
  assert.equal(result.status, 503);
  assert.deepEqual(result.body.failed_ids, [REMINDER]);
  assert.equal(db.store.fall_events[0].status, 'possible');
  assert.equal(db.store.notifications[0].send_error, 'no_active_token');
});

test('an incoming video session reaches the screen-data mapper without exposing another elder’s calls', async () => {
  const db = baseDb();
  db.store.video_call_sessions = [
    { id: REMINDER, elder_id: ELDER, initiator_id: FAMILY, provider: 'mock', status: 'created', created_at: new Date().toISOString() },
    { id: OTHER, elder_id: FAMILY, initiator_id: FAMILY, provider: 'mock', status: 'created', created_at: new Date().toISOString() },
  ];
  db.store.family_relationships[0].profiles = { preferred_name: 'Sam' };
  const edge = await loadEdgeFunction('fn-screen-data', { db });
  const result = await call(edge.handler, request('fn-screen-data', { headers: { authorization: `Bearer user:${ELDER}` }, body: { elder_id: ELDER, screen_id: 'HOME', locale: 'en-GB' } }));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.data.incoming_calls.length, 1);
  const mapper = await loadAppModule('apps/elder/src/services/screenDataMapper.ts');
  const mapped = mapper.mapScreenData(result.body, 'en-GB', ELDER);
  assert.equal(mapped.incomingCall.video_call_session_id, REMINDER);
  assert.equal(mapped.incomingCall.from_name, 'Sam');
  assert.equal(mapped.incomingCall.is_test, true);
  db.store.video_call_sessions[0].status = 'ended';
  const after = await call(edge.handler, request('fn-screen-data', { headers: { authorization: `Bearer user:${ELDER}` }, body: { elder_id: ELDER, screen_id: 'HOME', locale: 'en-GB' } }));
  assert.equal(mapper.mapScreenData(after.body, 'en-GB', ELDER).incomingCall, null);
});

test('an offline medication tap dispatches the exact selected reminder in Dutch', async () => {
  const db = baseDb('nl-NL');
  const edge = await loadEdgeFunction('fn-voice-pipeline', { db });
  const dispatch = await loadAppModule('apps/elder/src/services/offlineDispatch.ts');
  const plan = dispatch.planOfflineDispatch({ idempotencyKey: 'offline-1', type: 'CONFIRM_MEDICATION', payload: { elder_id: ELDER, medication_id: REMINDER }, createdAt: new Date().toISOString(), retryCount: 0 });
  assert.equal(dispatch.isPlan(plan), true);
  const result = await plan.plan({ voice: async (body) => {
    const response = await call(edge.handler, request('fn-voice-pipeline', { headers: { authorization: `Bearer user:${ELDER}` }, body }));
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body;
  } });
  assert.equal(result.action_taken, 'AWAIT_REPEAT_BACK');
  assert.equal(db.store.pending_confirmations[0].payload.medication_reminder_id, REMINDER);
});
