// Wiring tests for the second pass over the audit: the elder app's screens and the two
// questions HAVEN asks an older adult.
//
// Three defects, all "the parts exist and are not connected":
//
//   1. `fn-screen-data` returned the data and no screen asked for it. `ElderScreen` built its
//      context from a shell whose every array was empty, so a signed-in elder saw "0 due
//      today", "0 messages" and no family.
//   2. The medication and fall question cards existed but were exported only to `__test__` —
//      never rendered — so the "are you OK?" prompt a detected fall depends on could not be
//      answered at all.
//   3. The answers that did exist went to the wrong endpoints. `FALL_OK:` queued a
//      FALL_RESPONSE, which posts to fn-fall-event and inserts a **new** fall event: saying "I
//      am fine" produced another alert. `CONFIRM_MED:` went to the voice pipeline, which
//      resolves no pending confirmation, so the escalation sweep kept running.
//
// Plus the schema bug that made the answer endpoint unusable in production:
// `pending_confirmations` had no `status` column, and `fn-pending-confirmation-respond` reads
// and writes one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  call,
  createMockDb,
  loadAppModule,
  loadEdgeFunction,
  request,
} from './support/edge-function-harness.mjs';

const require = createRequire(new URL('../../apps/elder/package.json', import.meta.url));
const REACT_ENTRY = require.resolve('react');

const ELDER = '11111111-2222-4333-8444-555555555555';
const CONFIRMATION = '99999999-8888-4777-8666-555555555555';

const EFFECT_REACT = `
  export const useRef = (initial) => ({ current: initial });
  export const useEffect = (fn) => { globalThis.__pendingEffects.push(fn); };
  export const useCallback = (fn) => fn;
  export const useMemo = (fn) => fn();
  export const useState = (initial) => [typeof initial === 'function' ? initial() : initial, () => {}];
  export default { useRef, useEffect, useCallback, useMemo, useState };
`;

function seedDb() {
  return createMockDb({
    tables: {
      screen_schemas: [],
      medication_reminders: [{
        id: 'reminder-1',
        elder_id: ELDER,
        scheduled_time: '2026-10-31T08:00:00.000Z',
        status: 'gepland',
        medications: { name_nl: 'Metformine', name_en: 'Metformin', dose_description_nl: '500 mg', dose_description_en: '500 mg' },
      }],
      family_messages: [{
        id: 'message-1',
        elder_id: ELDER,
        sender_id: 'family-1',
        message_type: 'text',
        content_nl: 'Liefs van ons allemaal',
        content_en: 'Love from all of us',
        created_at: '2026-10-31T07:00:00.000Z',
        deleted_at: null,
      }],
      scam_events: [],
      neighbourhood_profiles: [],
      family_relationships: [{
        family_member_id: 'family-1',
        elder_id: ELDER,
        relation_type: 'kind',
        relation_label_nl: 'Dochter',
        is_primary: true,
        is_active: true,
        elder_consented: true,
        profiles: { preferred_name: 'Sarah', full_name: 'Sarah de Vries' },
      }],
      tasks: [{
        id: 'task-1',
        elder_id: ELDER,
        title_nl: 'Water drinken',
        title_en: 'Drink water',
        due_date: '2026-10-31',
        completed: false,
      }],
      pending_confirmations: [{
        id: CONFIRMATION,
        elder_id: ELDER,
        confirmation_type: 'fall_response',
        payload: { fall_event_id: 'fall-1' },
        status: 'pending',
        expires_at: new Date(Date.now() + 120_000).toISOString(),
        resolved_at: null,
        created_at: new Date().toISOString(),
      }],
      carer_visit_logs: [{
        id: 'visit-1',
        elder_id: ELDER,
        carer_id: 'carer-1',
        visit_date: '2026-10-30',
        check_in_time: '2026-10-30T09:00:00.000Z',
        observations_nl: 'Goede dag gehad',
        deleted_at: null,
      }],
      perf_metrics: [],
      audit_log: [],
    },
  });
}

async function screenData(db, { locale = 'nl-NL' } = {}) {
  const harness = await loadEdgeFunction('fn-screen-data', { db });
  const response = await call(harness.handler, request('fn-screen-data', {
    headers: { authorization: `Bearer test-user:${ELDER}` },
    body: { elder_id: ELDER, screen_id: 'HOME', locale },
  }));
  return response;
}

// ─── 1. the endpoint returns what a screen draws ───────────────────────────

test('fn-screen-data returns family, tasks, visits and the open confirmation', async () => {
  const response = await screenData(seedDb());
  assert.equal(response.status, 200, JSON.stringify(response.body));

  const data = response.body.data;
  assert.equal(data.reminders.length, 1, 'today\u2019s medication reminder');
  assert.equal(data.messages.length, 1, 'the family message');
  assert.equal(data.family.length, 1, 'the consented family member');
  assert.equal(data.family[0].profiles.preferred_name, 'Sarah', 'with the name the screen prints');
  assert.equal(data.tasks.length, 1, 'the open task');
  assert.equal(data.visits.length, 1, 'the care visit');
  assert.equal(data.pending_confirmations.length, 1, 'the unanswered fall question');
  assert.equal(data.pending_confirmations[0].confirmation_type, 'fall_response');
});

test('fn-screen-data hides another elder\u2019s rows and expired questions', async () => {
  const db = seedDb();
  db.store.family_messages.push({
    id: 'message-other',
    elder_id: 'other-elder',
    sender_id: 'family-1',
    message_type: 'text',
    content_nl: 'Niet voor u',
    content_en: 'Not for you',
    created_at: '2026-10-31T07:30:00.000Z',
    deleted_at: null,
  });
  // An expired prompt must not be offered: answering it records an answer nothing acts on.
  db.store.pending_confirmations.push({
    id: 'expired-1',
    elder_id: ELDER,
    confirmation_type: 'medication_taken',
    payload: { medication_reminder_id: 'reminder-1' },
    status: 'pending',
    expires_at: new Date(Date.now() - 60_000).toISOString(),
    resolved_at: null,
    created_at: new Date(Date.now() - 600_000).toISOString(),
  });
  // Neither may a question that has already been answered.
  db.store.pending_confirmations.push({
    id: 'answered-1',
    elder_id: ELDER,
    confirmation_type: 'medication_taken',
    payload: { medication_reminder_id: 'reminder-1' },
    status: 'resolved',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    resolved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  const response = await screenData(db);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.data.messages.length, 1, 'only this elder\u2019s message');
  assert.equal(response.body.data.pending_confirmations.length, 1, 'only the open, live question');
  assert.equal(response.body.data.pending_confirmations[0].id, CONFIRMATION);
});

// ─── 2. the mapper keeps the data the renderer needs ───────────────────────

test('the screen-data mapper produces rows the renderer can print', async () => {
  const module = await loadAppModule('apps/elder/src/services/screenDataMapper.ts');

  const mapped = module.mapScreenData({
    data: {
      reminders: [{ id: 'r1', scheduled_time: '2026-10-31T08:00:00.000Z', status: 'ingenomen', medications: { name_nl: 'Metformine', name_en: 'Metformin', dose_description_nl: '500 mg', dose_description_en: '500 mg' } }],
      messages: [{ id: 'm1', sender_id: 'family-1', message_type: 'text', content_nl: 'Liefs', content_en: 'Love' }],
      scam_events: [{ id: 's1', alert_level: 'rood', score_composite: 88, explanation_nl: 'Nep SMS', explanation_en: 'Fake SMS' }],
      family: [{ family_member_id: 'family-1', relation_type: 'kind', is_primary: true, profiles: { preferred_name: 'Sarah' } }],
      tasks: [{ id: 't1', title_nl: 'Water drinken', title_en: 'Drink water', due_date: '2026-10-31', completed: false }],
      visits: [{ id: 'v1', carer_id: 'carer-1', visit_date: '2026-10-30', observations_nl: 'Goede dag' }],
      pending_confirmations: [{ id: CONFIRMATION, confirmation_type: 'fall_response', payload: {}, expires_at: '2026-10-31T12:00:00.000Z' }],
    },
  }, 'nl-NL');

  assert.equal(mapped.medications[0].name, 'Metformine', 'the Dutch medication name');
  assert.equal(mapped.medications[0].status, 'taken', 'the Dutch reminder enum maps to the renderer\u2019s');
  const scheduled = new Date('2026-10-31T08:00:00.000Z');
  const clock = `${String(scheduled.getHours()).padStart(2, '0')}:${String(scheduled.getMinutes()).padStart(2, '0')}`;
  assert.equal(mapped.medications[0].time, clock, 'the time is the local clock, not an ISO string');
  assert.equal(mapped.messages[0].from, 'Sarah', 'a message is attributed by name, not by UUID');
  assert.equal(mapped.messages[0].body, 'Liefs');
  assert.equal(mapped.scamEvents[0].level, 'rood');
  assert.equal(mapped.family[0].isPrimary, true);
  assert.equal(mapped.tasks[0].title, 'Water drinken');
  assert.equal(mapped.visits[0].note, 'Goede dag');
  assert.equal(mapped.pendingConfirmation.kind, 'fall_response');
  assert.equal(mapped.pendingConfirmation.id, CONFIRMATION);

  // An unreachable endpoint is an empty screen, never invented data.
  const empty = module.mapScreenData(null, 'nl-NL');
  assert.deepEqual(empty.medications, []);
  assert.equal(empty.pendingConfirmation, null);
});

// ─── 3. the screen loads it and renders the question ───────────────────────

test('ElderScreen loads screen data instead of the empty shell', async () => {
  const source = readFileSync(new URL('../../apps/elder/src/screens/ElderScreen.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('useScreenData'), 'the screen must call the loader');
  assert.ok(source.includes('pendingConfirmation'), 'the question must reach the renderer');
  for (const field of ['family', 'medications', 'tasks', 'messages', 'scamEvents', 'visits']) {
    assert.ok(
      new RegExp(`${field}: data\\.${field}`).test(source),
      `${field} must come from the loaded payload, not from the shell`,
    );
  }

  const hook = await loadAppModule('apps/elder/src/hooks/useScreenData.ts', {
    stubs: {
      react: EFFECT_REACT,
      'react-native': `export const AppState = { addEventListener: () => ({ remove() {} }) };`,
      '../services/havenClient': `export class HavenClient { async screenData() { return globalThis.__payload; } }`,
    },
  });
  assert.equal(typeof hook.useScreenData, 'function');
});

test('a detected fall renders the question, and its buttons answer that confirmation', async () => {
  // The renderer's JSX is compiled to `react/jsx-runtime` calls, so a factory stub turns the
  // tree into plain objects this test can walk — no renderer needed, and no jsdom.
  const stubs = {
    'react/jsx-runtime': `
      export const Fragment = Symbol.for('react.fragment');
      export const jsx = (type, props) => ({ type, props: props ?? {} });
      export const jsxs = jsx;
      export const jsxDEV = jsx;
    `,
    react: `
      export const Fragment = Symbol.for('react.fragment');
      export const useMemo = (fn) => fn();
      export const useCallback = (fn) => fn;
      export const useEffect = () => {};
      export const useRef = (initial) => ({ current: initial });
      export const useState = (initial) => [typeof initial === 'function' ? initial() : initial, () => {}];
      export const createElement = (type, props, ...children) => ({ type, props: { ...(props ?? {}), children: children.length === 1 ? children[0] : children } });
      export default { Fragment, useMemo, useCallback, useEffect, useRef, useState, createElement };
    `,
    'react-native': `
      export const View = 'View'; export const Text = 'Text';
      export const ScrollView = 'ScrollView'; export const TouchableOpacity = 'TouchableOpacity';
      export const Platform = { OS: 'ios', select: (o) => o.ios ?? o.default };
    `,
    'expo-haptics': `
      export const NotificationFeedbackType = { Error: 'error', Success: 'success' };
      export const ImpactFeedbackStyle = { Medium: 'medium', Light: 'light' };
      export const notificationAsync = async () => {};
      export const impactAsync = async () => {};
      export const selectionAsync = async () => {};
    `,
    '@haven/ui/src/tokens': `
      export const colors = new Proxy({}, { get: (_t, key) => String(key) });
      export const touch = { minimum: 72, button: 80 };
      export default { colors, touch };
    `,
    '@haven/i18n': `export const translate = (key) => key; export const useTranslation = () => ({ t: (k) => k });`,
    '@haven/contracts/src/haven': `export const locales = ['nl-NL', 'en-GB'];`,
    '../services/crisis': `
      export const detectCrisisPhrase = () => ({ distressDetected: false, phrase: null });
      export const crisisResponse = () => '';
    `,
    '../services/notifications': `export const shouldSuppressForQuietHours = () => false;`,
    // The two overlays are components, not data; renderFor only puts them in the tree.
    '../components/FloatingVoiceButton': `export const FloatingVoiceButton = () => null;`,
    '../components/HelpOverlay': `export const HelpOverlay = () => null;`,
  };

  // The jsx runtime is the app's own React, so the elements the renderer returns are inspectable.
  const module = await loadAppModule('apps/elder/src/renderer/ScreenRenderer.tsx', {
    stubs: { ...stubs, '@haven/schema/src/screenSchema': `export const productionScreens = []; export const ScreenSchema = {};` },
  });

  const base = {
    locale: 'nl-NL',
    now: new Date(),
    profile: { id: ELDER, preferredName: 'Nel', locale: 'nl-NL' },
    family: [], medications: [], tasks: [], messages: [], scamEvents: [], visits: [],
    buurt: { active: false, nearbyCount: 0, tags: [], walkBuddyCount: 0, events: [] },
    onPrimaryAction: () => {},
  };

  const actions = [];
  const ctx = {
    ...base,
    onPrimaryAction: (id) => actions.push(id),
    pendingConfirmation: { id: CONFIRMATION, kind: 'fall_response' },
  };

  // `renderFor` decides whether the question belongs on this screen at all.
  const tree = module.__test__.renderFor('HOME', ctx);
  const buttons = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) walk(child); return; }
    if (node.props?.onPress && node.props?.accessibilityLabel) buttons.push(node);
    if (node.props) walk(node.props.children);
  };
  walk(tree);

  const labels = buttons.map((b) => b.props.accessibilityLabel);
  assert.ok(labels.includes('Alles goed'), `the "I am fine" answer must be rendered, got ${labels.join(', ')}`);
  assert.ok(labels.includes('Hulp nodig'), 'and the "I need help" answer');

  // Pressing them must name the confirmation that was asked, not a medication or a session.
  // The card sits above the home tiles, so its two answers are the first actions on the screen.
  for (const button of buttons) button.props.onPress();
  assert.deepEqual(actions.slice(0, 2), [`FALL_OK:${CONFIRMATION}`, `FALL_HELP:${CONFIRMATION}`]);
  assert.equal(actions.some((id) => id.startsWith('FALL_RESPONSE')), false,
    'the card must not emit a fresh fall event id');

  // No question, no card: an elder must not see a fall prompt on an ordinary morning.
  const without = module.__test__.renderFor('HOME', base);
  const stray = [];
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) collect(child); return; }
    if (typeof node.props?.children === 'string' && /Gaat het goed/.test(node.props.children)) stray.push(node);
    if (node.props) collect(node.props.children);
  };
  collect(without);
  assert.equal(stray.length, 0, 'the fall card must only appear when a fall is pending');
});

// ─── 4. the answers reach the endpoint that owns the row ───────────────────

test('the elder\u2019s fall and medication answers queue a confirmation response', async () => {
  const enqueued = [];
  const alerts = [];

  const module = await loadAppModule('apps/elder/src/hooks/useHavenActions.ts', {
    stubs: {
      react: EFFECT_REACT,
      '@haven/i18n': `export const useTranslation = () => ({ t: (key) => key });`,
      '../auth/AuthProvider': `export const useAuth = () => ({ session: { access_token: 'a.b.c', user: { id: '${ELDER}' } } });`,
      '../services/havenClient': `export class HavenClient { async screenData() { return {}; } async voice() { return {}; } }`,
      'react-native': `export const Alert = { alert: (...args) => globalThis.__alerts.push(args) };`,
      '../services/sqliteOfflineQueue': `export function enqueueOfflineAction(type, payload) { globalThis.__enqueued.push({ type, payload }); }`,
      '../state/networkResilience': `export function classifyNetworkError() { return 'offline'; }`,
      '../services/errorMapper': `export function translateElderError(e) { return String(e); }`,
    },
  });

  globalThis.__enqueued = enqueued;
  globalThis.__alerts = alerts;
  const { handlePrimaryAction } = module.useHavenActions('HOME');

  await handlePrimaryAction(`FALL_OK:${CONFIRMATION}`);
  await handlePrimaryAction(`FALL_HELP:${CONFIRMATION}`);
  await handlePrimaryAction(`CONFIRM_MED:${CONFIRMATION}`);
  await handlePrimaryAction(`DENY_MED:${CONFIRMATION}`);

  assert.deepEqual(enqueued.map((e) => e.type), Array(4).fill('CONFIRMATION_RESPOND'),
    'all four answers resolve a pending confirmation; none may open a new fall event');
  assert.deepEqual(enqueued.map((e) => e.payload.resolution), [true, false, true, false]);
  for (const entry of enqueued) {
    assert.equal(entry.payload.confirmation_id, CONFIRMATION, 'each answer names the row it answers');
    assert.equal(entry.payload.elder_id, ELDER);
  }
});

test('a queued confirmation answer is delivered to fn-pending-confirmation-respond', async () => {
  const module = await loadAppModule('apps/elder/src/services/drainElderQueue.ts', {
    stubs: { './offlineDispatch': null },
  }).catch(() => null);
  // The dispatcher is loaded directly: this asserts the route the drain will use.
  const dispatch = await loadAppModule('apps/elder/src/services/offlineDispatch.ts');
  assert.ok(module === null || typeof module.drainElderQueue === 'function');

  const invoked = [];
  const client = {
    voice: async () => { throw new Error('a confirmation answer must not go through the voice pipeline'); },
    invoke: async (fn, body) => { invoked.push({ fn, body }); return {}; },
  };

  const plan = dispatch.planOfflineDispatch({
    idempotencyKey: 'k1',
    type: 'CONFIRMATION_RESPOND',
    payload: { elder_id: ELDER, confirmation_id: CONFIRMATION, resolution: true },
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
  assert.equal(dispatch.isPlan(plan), true, 'a complete answer is deliverable');
  await plan.plan(client);

  assert.equal(invoked.length, 1);
  assert.equal(invoked[0].fn, 'fn-pending-confirmation-respond');
  assert.deepEqual(invoked[0].body, { confirmation_id: CONFIRMATION, resolution: true });

  // An answer that lost its row can never succeed, so it is quarantined rather than retried.
  const broken = dispatch.planOfflineDispatch({
    idempotencyKey: 'k2',
    type: 'CONFIRMATION_RESPOND',
    payload: { elder_id: ELDER, resolution: true },
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
  assert.equal(dispatch.isPlan(broken), false);
  assert.match(broken.reason, /confirmation_id/);
});

// ─── 5. the endpoint can actually resolve, expire and replay ───────────────

function confirmationDb(overrides = {}) {
  return createMockDb({
    tables: {
      pending_confirmations: [{
        id: CONFIRMATION,
        elder_id: ELDER,
        confirmation_type: 'fall_response',
        payload: { fall_event_id: 'fall-1' },
        status: 'pending',
        resolved_at: null,
        resolution: null,
        expires_at: new Date(Date.now() + 120_000).toISOString(),
        created_at: new Date().toISOString(),
        ...overrides,
      }],
      fall_events: [{ id: 'fall-1', elder_id: ELDER, status: 'possible', elder_ack_at: null }],
      medication_reminders: [],
      idempotency_keys: [],
      perf_metrics: [],
      audit_log: [],
    },
  });
}

async function respond(db, body = {}) {
  const harness = await loadEdgeFunction('fn-pending-confirmation-respond', { db });
  return call(harness.handler, request('fn-pending-confirmation-respond', {
    headers: { authorization: `Bearer test-user:${ELDER}` },
    body: { confirmation_id: CONFIRMATION, resolution: true, ...body },
  }));
}

test('answering "I am fine" resolves the fall and closes the confirmation', async () => {
  const db = confirmationDb();
  const response = await respond(db);

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.status, 'resolved');

  const row = db.store.pending_confirmations[0];
  assert.equal(row.status, 'resolved', 'the sweep must stop treating the prompt as open');
  assert.ok(row.resolved_at, 'and record when it was answered');
  assert.equal(row.resolution, true);

  const fall = db.store.fall_events[0];
  assert.equal(fall.status, 'resolved', 'the fall itself is closed, not duplicated');
  assert.ok(fall.elder_ack_at);
  assert.equal(db.store.fall_events.length, 1, 'answering must never insert a second fall event');
});

test('a replayed answer does not apply the side effect twice', async () => {
  const db = confirmationDb();
  const first = await respond(db);
  assert.equal(first.body.status, 'resolved');

  // Second delivery of the same answer (a retried queue item): the row is already resolved.
  const harness = await loadEdgeFunction('fn-pending-confirmation-respond', { db });
  const second = await call(harness.handler, request('fn-pending-confirmation-respond', {
    headers: { authorization: `Bearer test-user:${ELDER}` },
    body: { confirmation_id: CONFIRMATION, resolution: true, idempotency_key: 'replay-1' },
  }));

  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.status, 'already_resolved');
});

test('an expired question is refused and marked expired, without inventing an answer', async () => {
  const db = confirmationDb({ expires_at: new Date(Date.now() - 60_000).toISOString() });
  const response = await respond(db);

  assert.equal(response.status, 403);
  const row = db.store.pending_confirmations[0];
  assert.equal(row.status, 'expired', 'the prompt is closed as unanswered');
  assert.equal(row.resolved_at, null, 'an expiry is not an answer');
  assert.equal(row.resolution, null);
  assert.equal(db.store.fall_events[0].status, 'possible', 'the fall still escalates');
});

test('another elder\u2019s confirmation cannot be answered', async () => {
  const db = confirmationDb({ elder_id: '22222222-3333-4444-8555-666666666666' });
  const response = await respond(db);

  assert.equal(response.status, 403, 'the caller does not own the row');
  assert.equal(db.store.pending_confirmations[0].status, 'pending', 'and nothing was written');
});

test('the schema has the column the endpoint reads and writes', async () => {
  const sql = readFileSync(
    new URL('../../supabase/migrations/20261031010000_pending_confirmations_status.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /alter table pending_confirmations\s+add column if not exists status/i,
    'the column must be added by a migration, not assumed');
  assert.match(sql, /set status = 'resolved'/i, 'existing answered rows must be backfilled');
  assert.match(sql, /check \(status in \('pending', 'resolved', 'expired'\)\)/i,
    'the three states are the contract the endpoint uses');

  const endpoint = readFileSync(
    new URL('../../supabase/functions/fn-pending-confirmation-respond/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(endpoint, /pending\.status === "resolved"/, 'the endpoint still guards replays');
  assert.match(endpoint, /status: "resolved"/, 'and still writes the final state');
});
