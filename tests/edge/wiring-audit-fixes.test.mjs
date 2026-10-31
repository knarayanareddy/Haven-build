// Wiring tests for the October 2026 audit fixes.
//
// Every defect in that audit was the same shape: a perfectly good module that no entry point
// reached. `pushRegistration.ts` existed and was never called; the offline queue was written
// and never read; `realtime.ts` described subscriptions nothing opened. Unit-testing those
// modules in isolation was already green and stayed green while the product did not work.
//
// So each test here starts at the entry point — the component the app actually mounts, the
// hook the screen actually calls, the edge function the client actually posts to — and asserts
// that the effect reaches the outside world. The modules under test are transpiled and
// executed for real; only their collaborators (react, the network client, the store) are
// stubbed, and every stub records what it was asked to do.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadAppModule, loadEdgeFunction, createMockDb, call, request } from './support/edge-function-harness.mjs';

const require = createRequire(new URL('../../apps/elder/package.json', import.meta.url));
const REACT_ENTRY = require.resolve('react');

/**
 * A react stub whose effects run as soon as the component is invoked and whose refs behave.
 *
 * Rendering a React Native tree in Node is not the goal; running the entry point's effect is.
 * `runEffects()` is called by each test once the component has been invoked, in place of
 * React's commit phase.
 */
const EFFECT_REACT = `
  export const refs = [];
  export const useRef = (initial) => { const ref = { current: initial }; refs.push(ref); return ref; };
  export const useEffect = (fn) => { globalThis.__pendingEffects.push(fn); };
  export const useCallback = (fn) => fn;
  export const useMemo = (fn) => fn();
  export const useState = (initial) => [typeof initial === 'function' ? initial() : initial, () => {}];
  export default { useRef, useEffect, useCallback, useMemo, useState };
`;

// The real helper is exercised in its own test below; the component tests stub it because a
// workspace package cannot be resolved from the transpile directory.
const SESSION_STUB = `
  export const profileIdFromSession = (session) => session?.user?.id ?? session?.sub ?? null;
`;

const HAVEN_TOKENS = `
  export const colors = new Proxy({}, { get: (_t, key) => String(key) });
  export const touch = { minimum: 72, button: 80 };
  export default { colors, touch };
`;

function installEffectsHarness() {
  globalThis.__pendingEffects = [];
}

async function runPendingEffects() {
  const pending = globalThis.__pendingEffects ?? [];
  globalThis.__pendingEffects = [];
  for (const fn of pending) fn();
  // Effects start async work with `void promise`; let those jobs finish before asserting.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

// ─── 1 + 3 (elder): the app's session effects register push and drain the queue ──────

test('item 1: the elder app registers this device for push on a signed-in session', async () => {
  installEffectsHarness();
  const profileId = '11111111-2222-4333-8444-555555555555';

  const calls = { push: [], voice: [], claims: 0 };

  const module = await loadAppModule('apps/elder/src/components/SessionEffects.tsx', {
    stubs: {
      react: EFFECT_REACT,
      '@haven/contracts/src/session': SESSION_STUB,
      '../auth/AuthProvider': `
        export const useAuth = () => ({ session: { access_token: globalThis.__token, user: { id: globalThis.__profileId } } });
      `,
      '../services/pushRegistration': `
        export async function registerPushToken(client, id) { globalThis.__pushCalls.push(id); return { ok: true }; }
      `,
      '../services/havenClient': `
        export class HavenClient {
          constructor(config) { this.config = config; }
          async voice(input) { globalThis.__voiceCalls.push(input); return {}; }
          async healthLog(input) { globalThis.__healthCalls.push(input); return {}; }
          async sendFamilyMessage(input) { return {}; }
          async invoke(fn, body) { globalThis.__invokes.push({ fn, body }); return {}; }
        }
      `,
      '../services/sqliteOfflineQueue': `
        export function claimNextOfflineAction() { return globalThis.__nextAction(); }
        export function completeOfflineAction(key) { globalThis.__completed.push(key); }
        export function markOfflineActionFailed(key) { globalThis.__failed.push(key); }
        export function quarantineOfflineAction(key, reason) { globalThis.__quarantined.push({ key, reason }); }
      `,
    },
  });

  globalThis.__profileId = profileId;
  globalThis.__token = 'header.payload.signature';
  globalThis.__pushCalls = calls.push;
  globalThis.__voiceCalls = calls.voice;
  globalThis.__invokes = [];
  globalThis.__completed = [];
  globalThis.__failed = [];
  globalThis.__quarantined = [];
  globalThis.__healthCalls = [];

  // One queued medication confirmation, as `useHavenActions` would have written it offline.
  let served = false;
  globalThis.__nextAction = () => {
    if (served) return null;
    served = true;
    const now = new Date().toISOString();
    return {
      idempotencyKey: 'idem-1',
      type: 'CONFIRM_MEDICATION',
      payload: { elder_id: profileId, medication_id: 'med-1', status: 'medication_taken' },
      createdAt: now,
      retryCount: 0,
      status: 'queued',
    };
  };

  // The entry point: the component App.tsx mounts inside AuthProvider.
  module.SessionEffects();
  await runPendingEffects();

  assert.deepEqual(calls.push, [profileId], 'registerPushToken must run once, for the signed-in profile');
  assert.equal(calls.voice.length, 1, 'the queued medication confirmation must be sent through the voice pipeline');
  assert.equal(calls.voice[0].elder_id, profileId, 'the send must carry the elder it belongs to');
  assert.deepEqual(globalThis.__completed, ['idem-1'], 'a delivered capture leaves the queue');
});

test('item 3: a queued capture with no endpoint is quarantined, never silently dropped', async () => {
  installEffectsHarness();
  const module = await loadAppModule('apps/elder/src/components/SessionEffects.tsx', {
    stubs: {
      react: EFFECT_REACT,
      '@haven/contracts/src/session': SESSION_STUB,
      '../auth/AuthProvider': `
        export const useAuth = () => ({ session: { access_token: 'a.b.c', user: { id: globalThis.__profileId } } });
      `,
      '../services/pushRegistration': `export async function registerPushToken() { return {}; }`,
      '../services/havenClient': `
        export class HavenClient {
          async voice() { throw new Error('must not be called'); }
          async healthLog() { throw new Error('must not be called'); }
          async sendFamilyMessage() { throw new Error('must not be called'); }
          async invoke() { throw new Error('must not be called'); }
        }
      `,
      '../services/sqliteOfflineQueue': `
        export function claimNextOfflineAction() { return globalThis.__nextAction(); }
        export function completeOfflineAction(key) { globalThis.__completed.push(key); }
        export function markOfflineActionFailed(key) { globalThis.__failed.push(key); }
        export function quarantineOfflineAction(key, reason) { globalThis.__quarantined.push({ key, reason }); }
      `,
    },
  });

  globalThis.__profileId = 'profile-elder';
  globalThis.__completed = [];
  globalThis.__failed = [];
  globalThis.__quarantined = [];

  let served = false;
  globalThis.__nextAction = () => {
    if (served) return null;
    served = true;
    return {
      idempotencyKey: 'idem-calendar',
      type: 'SYNC_CALENDAR',
      payload: {},
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'queued',
    };
  };

  module.SessionEffects();
  await runPendingEffects();

  assert.equal(globalThis.__completed.length, 0, 'an undeliverable capture must not be marked sent');
  assert.equal(globalThis.__failed.length, 0, 'it must not be retried to the ceiling either');
  assert.equal(globalThis.__quarantined.length, 1, 'it leaves the queue exactly once');
  assert.match(globalThis.__quarantined[0].reason, /SYNC_CALENDAR/, 'the reason names the action type');
});

// ─── 2 (family): the dashboard actually subscribes ───────────────────────────

test('item 2: the family dashboard opens one realtime channel per permitted table and refreshes', async () => {
  installEffectsHarness();
  const opened = [];

  const module = await loadAppModule('apps/family/src/components/DashboardRealtime.tsx', {
    stubs: {
      react: EFFECT_REACT,
      'next/navigation': `
        export const useRouter = () => ({ refresh: () => { globalThis.__refreshes += 1; } });
      `,
      '../lib/supabase-browser': `
        export function createSupabaseBrowserClient() {
          return {
            channel(name) {
              const record = { name, table: null, filter: null, subscribed: false };
              globalThis.__channels.push(record);
              const builder = {
                on(_event, config, cb) { record.table = config.table; record.filter = config.filter; record.callback = cb; return builder; },
                subscribe() { record.subscribed = true; return record; },
              };
              return builder;
            },
            removeChannel() { return Promise.resolve(); },
          };
        }
      `,
    },
  });

  globalThis.__channels = opened;
  globalThis.__refreshes = 0;

  module.DashboardRealtime({
    elderId: 'elder-777',
    profileId: 'family-999',
    permissions: { alerts: true, medications: true, messages: false, location: false },
  });
  await runPendingEffects();

  const tables = opened.map((c) => c.table).sort();
  assert.deepEqual(
    tables,
    ['medication_reminders', 'notifications', 'scam_events'],
    'alerts, medications and own notifications are subscribed; messages and location are not permitted'
  );
  assert.ok(opened.every((c) => c.subscribed), 'every channel must actually be subscribed, not just built');
  const scam = opened.find((c) => c.table === 'scam_events');
  assert.equal(scam.filter, 'elder_id=eq.elder-777', 'the alert channel is scoped to this dashboard\u2019s elder');
  const notifications = opened.find((c) => c.table === 'notifications');
  assert.equal(notifications.filter, 'recipient_id=eq.family-999', 'own notifications are scoped to the viewer');

  // A fall alert arrives: the server render must be re-fetched, not left stale.
  scam.callback({});
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.equal(globalThis.__refreshes, 1, 'one change triggers one router.refresh()');
});

// ─── 3 (carer): the queue is drained under the signed-in carer ───────────────

test('item 3: the carer app sends queued handover notes under the signed-in carer', async () => {
  installEffectsHarness();
  const carerId = 'carer-abc';
  const delivered = [];

  const module = await loadAppModule('apps/carer/src/hooks/useQueueDrain.ts', {
    stubs: {
      react: EFFECT_REACT,
      '@haven/contracts/src/session': SESSION_STUB,
      '../auth/AuthProvider': `
        export const useAuth = () => ({ session: { access_token: 'a.b.c', user: { id: globalThis.__carerId } } });
      `,
      '../services/havenClient': `
        export class CarerClient {
          async handoverNote(input) { globalThis.__delivered.push({ fn: 'handoverNote', input }); return { handover_id: 'h1' }; }
          async visitLog(input) { globalThis.__delivered.push({ fn: 'visitLog', input }); return { success: true }; }
          async incidentReport(input) { globalThis.__delivered.push({ fn: 'incidentReport', input }); return { success: true }; }
        }
      `,
      '../services/offlineQueue': `
        export async function listOfflineActionsForCarer(id) { globalThis.__listed = id; return globalThis.__items; }
        export async function completeOfflineAction(key) { globalThis.__done.push(key); }
        export async function quarantineCorruptEntry(key, reason) { globalThis.__quarantined.push({ key, reason }); }
        export async function recordOfflineAttempt(key) { globalThis.__attempts.push(key); }
        export async function refreshOfflineQueueSize(id) { globalThis.__badge = id; return globalThis.__items.length; }
      `,
    },
  });

  globalThis.__carerId = carerId;
  globalThis.__delivered = delivered;
  globalThis.__done = [];
  globalThis.__quarantined = [];
  globalThis.__attempts = [];
  globalThis.__items = [{
    idempotencyKey: 'carer-idem-1',
    carerId,
    elderId: 'elder-1',
    action: 'handover_note',
    payload: { elder_id: 'elder-1', appetite: 2, mood: 4, mobility: 'walked', concerns: 'Duizelig', notes: 'Liet water staan' },
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'queued',
  }];

  module.useQueueDrain();
  await runPendingEffects();

  assert.equal(globalThis.__listed, carerId, 'the drain reads this carer\u2019s partition, not the whole device');
  assert.equal(delivered.length, 1, 'the queued note must be delivered');
  assert.equal(delivered[0].fn, 'handoverNote', 'a handover note goes to fn-carer-handover-note');
  assert.equal(delivered[0].input.carer_id ?? carerId, carerId);
  assert.equal(delivered[0].input.concerns_nl, 'Duizelig', 'free text is mapped to the field the function reads');
  assert.equal(delivered[0].input.notes_nl, 'Liet water staan', 'notes are not dropped by a key mismatch');
  assert.deepEqual(globalThis.__done, ['carer-idem-1'], 'the capture leaves the queue only after acceptance');
  assert.equal(globalThis.__badge, carerId, 'the badge re-reads the same partition the write used');
});

test('item 3: a refused capture is quarantined; a transient failure stays queued', async () => {
  installEffectsHarness();
  const module = await loadAppModule('apps/carer/src/hooks/useQueueDrain.ts', {
    stubs: {
      react: EFFECT_REACT,
      '@haven/contracts/src/session': SESSION_STUB,
      '../auth/AuthProvider': `
        export const useAuth = () => ({ session: { access_token: 'a.b.c', user: { id: globalThis.__carerId } } });
      `,
      '../services/havenClient': `
        export class CarerClient {
          async handoverNote(input) { return globalThis.__deliver(input); }
          async visitLog(input) { return globalThis.__deliver(input); }
          async incidentReport(input) { return globalThis.__deliver(input); }
        }
      `,
      '../services/offlineQueue': `
        export async function listOfflineActionsForCarer() { return globalThis.__items; }
        export async function completeOfflineAction(key) { globalThis.__done.push(key); }
        export async function quarantineCorruptEntry(key, reason) { globalThis.__quarantined.push({ key, reason }); }
        export async function recordOfflineAttempt(key) { globalThis.__attempts.push(key); }
        export async function refreshOfflineQueueSize() { return 0; }
      `,
    },
  });

  globalThis.__carerId = 'carer-abc';
  globalThis.__done = [];
  globalThis.__quarantined = [];
  globalThis.__attempts = [];
  globalThis.__items = [{
    idempotencyKey: 'bad-1', carerId: 'carer-abc', elderId: 'elder-1', action: 'handover_note',
    payload: { appetite: 3, mood: 3 }, createdAt: new Date().toISOString(), attempts: 0, status: 'queued',
  }];
  globalThis.__deliver = async () => {
    const error = new Error('403: not your elder');
    error.status = 403;
    throw error;
  };

  module.useQueueDrain();
  await runPendingEffects();

  assert.deepEqual(globalThis.__done, [], 'a refused capture is not marked delivered');
  assert.equal(globalThis.__quarantined.length, 1, 'a 4xx is permanent and leaves the queue once');
  assert.match(globalThis.__quarantined[0].reason, /403/, 'the reason carries what the server said');

  // Now a network blip: the capture must stay queued for the next launch.
  globalThis.__quarantined = [];
  globalThis.__attempts = [];
  globalThis.__deliver = async () => { throw new Error('Network request failed'); };
  module.useQueueDrain();
  await runPendingEffects();

  assert.equal(globalThis.__quarantined.length, 0, 'a network failure must not quarantine the note');
  assert.deepEqual(globalThis.__attempts, ['bad-1'], 'the attempt is recorded so the retry ceiling still applies');
});

// ─── 4 (carer): captures are filed under the person who wrote them ───────────

test('item 4: a queued capture carries the signed-in carer, and a placeholder is refused', async () => {
  // The store falls back to an in-memory map when IndexedDB is absent, which is the path this
  // test takes; the partition logic is the same one the browser uses.
  const module = await loadAppModule('apps/carer/src/services/offlineQueue.ts');

  const carerA = 'carer-a-uuid';
  const carerB = 'carer-b-uuid';
  await module.enqueueOffline(carerA, 'handover_note', { elder_id: 'elder-1', appetite: 4, mood: 4, notes: 'A' });
  await module.enqueueOffline(carerB, 'handover_note', { elder_id: 'elder-1', appetite: 2, mood: 2, notes: 'B' });

  const forA = await module.listOfflineActionsForCarer(carerA);
  const forB = await module.listOfflineActionsForCarer(carerB);
  assert.equal(forA.length, 1, 'carer A sees her own capture');
  assert.equal(forB.length, 1, 'carer B sees only hers');
  assert.equal(forA[0].carerId, carerA, 'the capture is attributed to the carer who wrote it');
  assert.equal(forA[0].payload.notes, 'A', 'and holds her text, not her colleague\'s');

  // The badge and the write must be the same partition: this is what made the badge read 0.
  const badge = await module.refreshOfflineQueueSize(carerA);
  assert.equal(badge, 1, 'the carer\'s own count matches the capture she wrote');

  await assert.rejects(
    () => module.enqueueOffline('offline-carer', 'handover_note', { elder_id: 'elder-1' }),
    /signed-in carer id is required/,
    'the old placeholder id must be unusable',
  );
  await assert.rejects(
    () => module.enqueueOffline('', 'handover_note', { elder_id: 'elder-1' }),
    /signed-in carer id is required/,
  );
  await assert.rejects(
    () => module.enqueueOffline(carerA, 'handover_note', {}),
    /elder_id is required/,
    'a capture with no elder cannot be filed against anyone',
  );
});

test('item 4: the id both screens queue under comes from the session, not from the payload', async () => {
  const { profileIdFromSession } = await loadAppModule('packages/contracts/src/session.ts');
  const payload = Buffer.from(JSON.stringify({ sub: 'profile-from-jwt', role: 'carer' })).toString('base64url');
  const session = { access_token: `header.${payload}.signature` };

  assert.equal(profileIdFromSession(session), 'profile-from-jwt', 'a restored session resolves to its subject');
  assert.equal(profileIdFromSession({ access_token: 'x.y.z' }), null, 'a token with no subject resolves to nothing');
  assert.equal(profileIdFromSession(null), null);
});

// ─── 5 (video): the gate is the video-call consent pack ─────────────────────

const ELDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FAMILY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function videoDb({ packs = [], flag = true } = {}) {
  return createMockDb({
    tables: {
      feature_flags: [{ flag_key: 'video_call_enabled', enabled: flag }],
      consent_pack_status: packs.map((pack) => ({ elder_id: ELDER_ID, pack_key: pack, status: 'accepted' })),
      family_relationships: [{
        family_member_id: FAMILY_ID,
        elder_id: ELDER_ID,
        elder_consented: true,
        is_active: true,
        can_view_messages: true,
        can_view_alerts: true,
        can_view_medications: true,
        can_view_location_events: true,
      }],
      video_call_sessions: [],
      notifications: [],
      push_tokens: [],
      audit_log: [],
      idempotency_keys: [],
    },
  });
}

const VIDEO_ENV = { ALLOW_MOCK_VIDEO_PROVIDER: 'true', VIDEO_JOIN_TOKEN_SECRET: 'test-secret-that-is-long-enough-1234' };

test('item 5: scam-coaching consent does not authorise a video call', async () => {
  const db = videoDb({ packs: ['shield_scam_coaching'] });
  const harness = await loadEdgeFunction('fn-video-call-create', { db, env: VIDEO_ENV });

  const response = await call(harness.handler, request('fn-video-call-create', {
    headers: { authorization: `Bearer test-user:${FAMILY_ID}` },
    body: { elder_id: ELDER_ID, provider: 'mock' },
  }));

  assert.notEqual(response.status, 200, 'the wrong consent pack must not open a video call');
  assert.equal(db.store.video_call_sessions.length, 0, 'no session may be created');
});

test('item 5: the dedicated video-call pack does authorise it', async () => {
  const db = videoDb({ packs: ['core_video_call'] });
  const harness = await loadEdgeFunction('fn-video-call-create', { db, env: VIDEO_ENV });

  const response = await call(harness.handler, request('fn-video-call-create', {
    headers: { authorization: `Bearer test-user:${FAMILY_ID}` },
    body: { elder_id: ELDER_ID, provider: 'mock' },
  }));

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(db.store.video_call_sessions.length, 1, 'the session is created once consent is real');
  assert.equal(response.body.media, 'none', 'the mock provider is labelled as carrying no media');
});

test('item 5: the flag still fails closed, and an unconfigured provider cannot create a call', async () => {
  const disabled = await loadEdgeFunction('fn-video-call-create', { db: videoDb({ packs: ['core_video_call'], flag: false }), env: VIDEO_ENV });
  const blocked = await call(disabled.handler, request('fn-video-call-create', {
    headers: { authorization: `Bearer test-user:${FAMILY_ID}` },
    body: { elder_id: ELDER_ID, provider: 'mock' },
  }));
  assert.notEqual(blocked.status, 200, 'a disabled flag must block the call');

  const unconfigured = await loadEdgeFunction('fn-video-call-create', { db: videoDb({ packs: ['core_video_call'] }), env: { VIDEO_JOIN_TOKEN_SECRET: 'test-secret-that-is-long-enough-1234' } });
  const missing = await call(unconfigured.handler, request('fn-video-call-create', {
    headers: { authorization: `Bearer test-user:${FAMILY_ID}` },
    body: { elder_id: ELDER_ID },
  }));
  assert.equal(missing.status, 503, 'no configured media provider means no call, not a fake room');
});

// ─── 6 (video): the join token is signed, stored, single-use and accepted ────

async function issueToken(db, userId = FAMILY_ID) {
  const harness = await loadEdgeFunction('fn-video-call-join-token', { db, env: VIDEO_ENV });
  const response = await call(harness.handler, request('fn-video-call-join-token', {
    headers: { authorization: `Bearer test-user:${userId}` },
    body: { video_call_session_id: db.store.video_call_sessions[0].id },
  }));
  return { response, harness };
}

test('item 6: a join token is signed and stored as a digest, not a bare UUID', async () => {
  const db = videoDb({ packs: ['core_video_call'] });
  db.store.video_call_sessions.push({
    id: '33333333-4444-4555-8666-777777777777',
    elder_id: ELDER_ID,
    initiator_id: FAMILY_ID,
    provider: 'mock',
    provider_room_id: 'room-1',
    status: 'created',
  });

  const { response } = await issueToken(db);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const token = response.body.token;

  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'the token is payload.signature, not a random UUID');
  assert.notEqual(token, db.store.video_call_sessions[0].join_token_hash, 'the stored value is not the token');
  assert.equal(db.store.video_call_sessions[0].join_token_hash.length, 64, 'the row keeps a SHA-256 digest');
  assert.ok(db.store.video_call_sessions[0].join_token_expires_at, 'and the expiry it was issued with');
  assert.equal(db.store.video_call_sessions[0].status, 'ringing', 'holding a token is not joining: status stays unjoined');
});

test('item 6: redeeming the token joins the call; a replay is refused', async () => {
  const db = videoDb({ packs: ['core_video_call'] });
  db.store.video_call_sessions.push({
    id: '33333333-4444-4555-8666-777777777777',
    elder_id: ELDER_ID,
    initiator_id: FAMILY_ID,
    provider: 'mock',
    provider_room_id: 'room-1',
    status: 'created',
  });
  const { response: issued } = await issueToken(db);
  const token = issued.body.token;

  const redeem = await loadEdgeFunction('fn-video-call-redeem', { db, env: VIDEO_ENV });
  const joined = await call(redeem.handler, request('fn-video-call-redeem', {
    headers: { authorization: `Bearer test-user:${FAMILY_ID}` },
    body: { video_call_session_id: db.store.video_call_sessions[0].id, token },
  }));

  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  assert.equal(joined.body.status, 'joined');
  assert.equal(db.store.video_call_sessions[0].status, 'joined', 'the row becomes joined only on redemption');
  assert.ok(db.store.video_call_sessions[0].join_token_used_at, 'and the token is marked used');

  const replay = await call(redeem.handler, request('fn-video-call-redeem', {
    headers: { authorization: `Bearer test-user:${FAMILY_ID}` },
    body: { video_call_session_id: db.store.video_call_sessions[0].id, token },
  }));
  assert.equal(replay.status, 409, 'a used token cannot open a second join');
});

test('item 6: a tampered token and another person\'s token are rejected', async () => {
  const db = videoDb({ packs: ['core_video_call'] });
  db.store.video_call_sessions.push({
    id: '33333333-4444-4555-8666-777777777777',
    elder_id: ELDER_ID,
    initiator_id: FAMILY_ID,
    provider: 'mock',
    provider_room_id: 'room-1',
    status: 'created',
  });
  const { response: issued } = await issueToken(db);
  const token = issued.body.token;
  const [body, signature] = token.split('.');
  const tampered = `${body}.${signature.slice(0, -2)}${signature.slice(-2) === 'AA' ? 'BB' : 'AA'}`;

  const redeem = await loadEdgeFunction('fn-video-call-redeem', { db, env: VIDEO_ENV });
  const forged = await call(redeem.handler, request('fn-video-call-redeem', {
    headers: { authorization: `Bearer test-user:${FAMILY_ID}` },
    body: { video_call_session_id: db.store.video_call_sessions[0].id, token: tampered },
  }));
  assert.equal(forged.status, 403, 'an edited token does not verify');
  assert.equal(db.store.video_call_sessions[0].status, 'ringing', 'a rejected redemption joins nothing');

  // The elder was issued this token; the family member holding it must not be able to use it.
  const elderToken = await issueToken(db, ELDER_ID);
  const stolen = await call(redeem.handler, request('fn-video-call-redeem', {
    headers: { authorization: `Bearer test-user:${FAMILY_ID}` },
    body: { video_call_session_id: db.store.video_call_sessions[0].id, token: elderToken.response.body.token },
  }));
  assert.equal(stolen.status, 403, 'a token bound to someone else is useless');
});

// ─── 7 (clinical data): the rhythm button invents nothing ────────────────────

test('item 7: "start my day" records no mood, and a mood tap records the elder\'s own answer', async () => {
  const enqueued = [];
  const alerts = [];

  const module = await loadAppModule('apps/elder/src/hooks/useHavenActions.ts', {
    stubs: {
      react: EFFECT_REACT,
      '@haven/i18n': `export const useTranslation = () => ({ t: (key) => key });`,
      '../auth/AuthProvider': `
        export const useAuth = () => ({ session: { access_token: 'a.b.c', user: { id: 'elder-1' } } });
      `,
      '../services/havenClient': `
        export class HavenClient { async screenData() { return {}; } async voice() { return {}; } }
      `,
      'react-native': `
        export const Alert = { alert: (...args) => globalThis.__alerts.push(args) };
      `,
      '../services/sqliteOfflineQueue': `
        export function enqueueOfflineAction(type, payload) { globalThis.__enqueued.push({ type, payload }); }
      `,
      '../state/networkResilience': `export function classifyNetworkError() { return 'offline'; }`,
      '../services/errorMapper': `export function translateElderError(e) { return String(e); }`,
    },
  });

  globalThis.__alerts = alerts;
  globalThis.__enqueued = enqueued;

  const { handlePrimaryAction } = module.useHavenActions('TODAY');
  await handlePrimaryAction('START_DAILY_RHYTHM');
  assert.deepEqual(enqueued, [], 'starting the day must not write a check-in the elder did not give');

  await handlePrimaryAction('CHECKIN:morning:5');
  assert.equal(enqueued.length, 1, 'tapping a mood does record it');
  assert.equal(enqueued[0].type, 'DAILY_CHECKIN');
  assert.equal(enqueued[0].payload.mood_score, 5, 'the score is the one the elder pressed');
  assert.equal(enqueued[0].payload.elder_id, 'elder-1', 'and it is attributed to the elder');
});

// ─── mount checks: the entry points really render the components above ──────

/**
 * Asserts that a mounted entry point imports `name` from a real module and renders it.
 *
 * The component tests above prove the module works. This proves the app uses it — the exact
 * gap the audit found: every one of those modules worked and none was mounted. The import is
 * resolved to a file and loaded, so a rename or a moved export fails here rather than in
 * production.
 */
async function assertMounted(entryFile, name, stubs = { react: EFFECT_REACT }) {
  const { readFileSync } = await import('node:fs');
  const { dirname, resolve, posix } = await import('node:path');
  const source = readFileSync(new URL(`../../${entryFile}`, import.meta.url), 'utf8');

  const binding = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`).exec(source);
  assert.ok(binding, `${entryFile} must import ${name}`);
  assert.match(source, new RegExp(`<${name}[\\s/>]`), `${entryFile} must render <${name} />`);

  const specifier = binding[1];
  const target = posix.normalize(posix.join(posix.dirname(entryFile), specifier));
  const importPath = /\.tsx?$/.test(target) ? target : `${target}.tsx`;
  const module = await loadAppModule(importPath, { stubs });
  assert.equal(typeof module[name], 'function', `${importPath} must export ${name}`);
}

test('item 1/3: the elder app mounts the session effects', async () => {
  await assertMounted('apps/elder/App.tsx', 'SessionEffects', {
    react: EFFECT_REACT,
    '@haven/contracts/src/session': SESSION_STUB,
    '../auth/AuthProvider': `export const useAuth = () => ({ session: null });`,
    '../services/pushRegistration': `export async function registerPushToken() { return {}; }`,
    '../services/havenClient': `export class HavenClient { async invoke() { return {}; } async voice() { return {}; } async healthLog() { return {}; } async sendFamilyMessage() { return {}; } }`,
    '../services/sqliteOfflineQueue': `
      export function claimNextOfflineAction() { return null; }
      export function completeOfflineAction() {}
      export function markOfflineActionFailed() {}
      export function quarantineOfflineAction() {}
    `,
  });
});

test('item 3: the carer app mounts the queue drain', async () => {
  await assertMounted('apps/carer/App.tsx', 'QueueDrain', {
    react: EFFECT_REACT,
    '../hooks/useQueueDrain': `export function useQueueDrain() { return { pending: 0, drain: async () => {} }; }`,
  });
});

test('item 2: the family dashboard mounts the realtime subscriber', async () => {
  await assertMounted('apps/family/src/app/dashboard/page.tsx', 'DashboardRealtime', {
    react: EFFECT_REACT,
    'next/navigation': `export const useRouter = () => ({ refresh() {} });`,
    '../lib/supabase-browser': `export function createSupabaseBrowserClient() { return null; }`,
  });
});

// ─── 9: the care-system sync reports what a receiver accepted ───────────────

const INTERNAL_KEY = 'test-internal-key-that-is-at-least-32-chars';

function careSyncDb() {
  return createMockDb({
    tables: {
      // Five rows exist locally; that is the number the old code reported as "pushed".
      carer_visit_logs: [1, 2, 3].map((n) => ({ id: `visit-${n}`, elder_id: ELDER_ID, check_in_time: `2026-10-0${n}T09:00:00Z`, deleted_at: null })),
      incidents: [1, 2].map((n) => ({ id: `incident-${n}`, elder_id: ELDER_ID, occurred_at: `2026-10-0${n}T12:00:00Z` })),
      external_care_sync_jobs: [],
    },
  });
}

async function runCareSync(db, env, fetchImpl) {
  const harness = await loadEdgeFunction('fn-care-system-sync', {
    db,
    env: { HAVEN_INTERNAL_KEY: INTERNAL_KEY, ...env },
    fetchImpl,
  });
  const response = await call(harness.handler, request('fn-care-system-sync', {
    headers: { 'x-haven-internal-key': INTERNAL_KEY },
    body: { elder_id: ELDER_ID, organisation_nl: 'Zorg Thuis', system_name: 'manual' },
  }));
  await harness.settle();
  return response;
}

test('item 9: with no external endpoint the sync fails instead of reporting a push', async () => {
  const db = careSyncDb();
  const response = await runCareSync(db, {}, null);

  assert.equal(response.status, 503, 'an unconfigured integration cannot succeed');
  assert.equal(db.store.external_care_sync_jobs.filter((job) => job.status === 'completed').length, 0,
    'no job may be recorded as completed');
});

test('item 9: records_pushed is what the receiver accepted, not how many rows we have', async () => {
  const db = careSyncDb();
  let sent = null;
  const response = await runCareSync(db, { CARE_SYSTEM_ENDPOINT: 'https://care.example.test/import' }, async (url, init) => {
    sent = { url: String(url), body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({ accepted: 2 }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(sent.body.records.length, 5, 'all five local records are offered');
  assert.equal(response.body.records_pushed, 2, "the reported number is the receiver (accepted count)");
  assert.equal(db.store.external_care_sync_jobs[0].records_pushed, 2, 'and the job row says the same');

  // A receiver that says nothing accepted nothing; silence is not a success count.
  const silent = careSyncDb();
  const silentResponse = await runCareSync(silent, { CARE_SYSTEM_ENDPOINT: 'https://care.example.test/import' }, async () => new Response('{}', { status: 200 }));
  assert.equal(silentResponse.body.records_pushed, 0, 'no accepted count means zero pushed');
});

test('item 9: a refusal marks the job failed and returns an error', async () => {
  const db = careSyncDb();
  const response = await runCareSync(db, { CARE_SYSTEM_ENDPOINT: 'https://care.example.test/import' }, async () => new Response('nope', { status: 500 }));

  assert.notEqual(response.status, 200, 'a refused export is not a success');
  assert.equal(db.store.external_care_sync_jobs[0].status, 'failed', 'the job records the failure');
  assert.equal(db.store.external_care_sync_jobs[0].records_pushed, 0, 'and pushed nothing');
});

// ─── 13: the grandchild app signs in and resolves its own scope ─────────────

test('item 13: the grandchild scope comes from the session and the relationship row', async () => {
  const module = await loadAppModule('apps/grandchild/src/scope.ts');

  const calls = [];
  const client = {
    from(table) {
      calls.push(table);
      const builder = {
        select() { return builder; },
        eq(column, value) { calls.push(`${column}=${value}`); return builder; },
        limit() { return builder; },
        maybeSingle() {
          return Promise.resolve({ data: { elder_id: 'elder-1', elder_consented: true, is_active: true, profiles: { preferred_name: 'Oma Nel' } }, error: null });
        },
      };
      return builder;
    },
  };

  const scope = await module.resolveGrandchildScope(client, 'family-1');
  assert.deepEqual(scope, { elderId: 'elder-1', elderName: 'Oma Nel', familyMemberId: 'family-1' },
    'the elder and the family-member id both come from the server, not from a text field');
  assert.ok(calls.includes('family_member_id=family-1'), 'the lookup is scoped to the signed-in person');
});

test('item 13: signing in uses Supabase Auth, not a pasted token', async () => {
  const module = await loadAppModule('apps/grandchild/src/auth.ts', {
    stubs: {
      '@supabase/supabase-js': `
        export function createClient() { return globalThis.__fakeSupabase; }
      `,
    },
  });

  const calls = [];
  const client = {
    auth: {
      signInWithOtp: async (args) => { calls.push({ fn: 'signInWithOtp', args }); return { error: null }; },
      verifyOtp: async (args) => { calls.push({ fn: 'verifyOtp', args }); return { data: { user: { id: 'family-1' } }, error: null }; },
    },
  };

  await module.requestSignInCode(client, '  Kind@Example.test ');
  assert.equal(calls[0].args.email, 'kind@example.test', 'the address is normalised before it is sent');

  const userId = await module.confirmSignInCode(client, 'Kind@Example.test', ' 123456 ');
  assert.equal(userId, 'family-1', 'the verified session supplies the identity');
  assert.equal(calls[1].args.type, 'email');
  assert.equal(calls[1].args.token, '123456', 'the code is what is verified — no bearer token is typed');
});

// ─── 8, 10–12, 14: the deleted stubs stay deleted ──────────────────────────

test('the repository keeps no ghost entries for deleted modules', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const script = readFileSync(new URL('../../scripts/validate-suite.mjs', import.meta.url), 'utf8');
  const listed = [...script.matchAll(/^\s*'([^']+\.(?:ts|tsx|mjs|json|sql))',$/gm)].map((match) => match[1]);

  assert.ok(listed.length > 20, 'the suite list must not collapse to a handful of entries');
  const missing = listed.filter((rel) => !existsSync(new URL(`../../${rel}`, import.meta.url)));
  assert.deepEqual(missing, [], `validate-suite requires files that no longer exist: ${missing.join(", ")}`);
});

test('the deleted stubs are gone and nothing imports them', async () => {
  const { existsSync, readdirSync, readFileSync } = await import('node:fs');

  // 8: a carer voice button with no recorder; 10: a calendar sync nobody runs;
  // 11: a hardcoded copy of the consent text; 12: an unused BSN heuristic;
  // 14: three state machines with no consumer.
  const deleted = [
    'apps/carer/src/components/FloatingVoiceButton.tsx',
    'apps/elder/src/services/calendarSync.ts',
    'apps/elder/src/state/consentPacks.ts',
    'apps/elder/src/services/security.ts',
    'apps/elder/src/state/voiceRecordingMachine.ts',
    'apps/carer/src/state.ts',
    'apps/grandchild/src/state.ts',
    'apps/elder/src/state/offlineSyncMachine.ts',
  ];
  const present = deleted.filter((rel) => existsSync(new URL(`../../${rel}`, import.meta.url)));
  assert.deepEqual(present, [], `stubs must stay deleted: ${present.join(', ')}`);

  // A deleted file that something still imports is a build error waiting to happen; catch it
  // here rather than in a bundler. Specifiers are resolved against the importing file, so the
  // elder app's own (live) FloatingVoiceButton is not confused with the carer one.
  const appsRoot = new URL('../../apps', import.meta.url).pathname;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const source = readFileSync(full, 'utf8');
      for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const resolved = new URL(match[1], `file://${full}`).pathname.replace(appsRoot + '/', 'apps/');
        for (const suffix of ['', '.ts', '.tsx']) {
          if (deleted.includes(resolved + suffix)) offenders.push(`${full} → ${resolved}${suffix}`);
        }
      }
    }
  };
  walk(appsRoot);
  assert.deepEqual(offenders, [], `deleted modules are still imported: ${offenders.join(', ')}`);
});
