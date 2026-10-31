// Which dose does "I took it" actually record?
//
// The pills screen shows one row per `medication_reminder`, each with a "taken" button that
// sends `TAKE:<reminder id>` through `fn-voice-pipeline`. The pipeline's repeat-back created its
// pending confirmation against the *earliest open* reminder, whatever was tapped. An older adult
// with an 08:00 and a 20:00 dose who taps the evening row at 20:00 confirmed the 08:00 row — and
// after that confirmation resolved, the MAR said the morning dose was taken twice and the
// evening dose never.
//
// The same button family had a second problem: "Snooze" was delivered as the sentence "I did not
// take it", which the English classifier matches on `took` — so snoozing created a prompt asking
// whether the dose had just been taken. Snooze now carries the reminder id in its own field,
// before any classification runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  call,
  createMockDb,
  loadEdgeFunction,
  request,
} from './support/edge-function-harness.mjs';

const ELDER = '66666666-6666-4666-8666-666666666666';
const MORNING = 'aaaa1111-1111-4111-8111-111111111111';
const EVENING = 'bbbb2222-2222-4222-8222-222222222222';
const MEDICATION = 'cccc3333-3333-4333-8333-333333333333';

function seed() {
  const now = Date.now();
  return createMockDb({
    tables: {
      profiles: [{ id: ELDER, locale: 'nl-NL', role: 'elder' }],
      medication_reminders: [
        {
          id: MORNING,
          medication_id: MEDICATION,
          elder_id: ELDER,
          status: 'gepland',
          scheduled_time: new Date(now - 11 * 3600_000).toISOString(),
          confirmed_at: null,
        },
        {
          id: EVENING,
          medication_id: MEDICATION,
          elder_id: ELDER,
          status: 'gepland',
          scheduled_time: new Date(now).toISOString(),
          confirmed_at: null,
        },
      ],
      medications: [{ id: MEDICATION, elder_id: ELDER, name_nl: 'Furosemide' }],
      pending_confirmations: [],
      voice_interactions: [],
      audit_log: [],
      perf_metrics: [],
      idempotency_keys: [],
      family_relationships: [],
      push_tokens: [],
      notifications: [],
    },
  });
}

async function speak(db, body) {
  const harness = await loadEdgeFunction('fn-voice-pipeline', { db, env: {} });
  const response = await call(harness.handler, request('fn-voice-pipeline', {
    body: { elder_id: ELDER, screen_id: 'PILLS', ...body },
    headers: { authorization: `Bearer test-user:${ELDER}` },
  }));
  await harness.settle();
  return response;
}

test('tapping the evening dose asks about the evening dose', async () => {
  const db = seed();
  // The elder profile is nl-NL, and the pipeline classifies in the elder's language.
  const response = await speak(db, { transcript_text: 'Ik heb het ingenomen', medication_reminder_id: EVENING });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.action_taken, 'AWAIT_REPEAT_BACK');

  const confirmation = db.store.pending_confirmations[0];
  assert.ok(confirmation, 'the repeat-back prompt is created');
  assert.equal(confirmation.payload.medication_reminder_id, EVENING,
    'the confirmation must name the reminder that was tapped, not the earliest open one');
  assert.equal(db.store.medication_reminders[0].status, 'gepland',
    'and nothing is written to the MAR before the elder confirms');
});

test('a spoken sentence with no target still uses the earliest open dose', async () => {
  const db = seed();
  const response = await speak(db, { transcript_text: 'Ik heb mijn pillen ingenomen' });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(db.store.pending_confirmations[0].payload.medication_reminder_id, MORNING,
    'an untargeted statement confirms the dose most overdue');
});

test('a reminder that is already taken is not the target of a new confirmation', async () => {
  const db = seed();
  db.store.medication_reminders[0].status = 'ingenomen'; // the morning dose is done

  const response = await speak(db, { transcript_text: 'Ik heb het ingenomen', medication_reminder_id: MORNING });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(db.store.pending_confirmations[0].payload.medication_reminder_id, EVENING,
    'a closed dose cannot be confirmed again; the open one is the honest fallback');
});

test('another elder\u2019s reminder cannot be named as the target', async () => {
  const db = seed();
  db.store.medication_reminders[1].elder_id = 'other-elder';

  const response = await speak(db, { transcript_text: 'Ik heb het ingenomen', medication_reminder_id: EVENING });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(db.store.pending_confirmations[0].payload.medication_reminder_id, MORNING,
    'the foreign reminder is ignored, not confirmed');
});

test('snoozing moves that reminder instead of asking whether it was taken', async () => {
  const db = seed();
  const before = new Date(db.store.medication_reminders[1].scheduled_time).getTime();

  const response = await speak(db, {
    // The old app sent this sentence with the snooze tap. It must not matter any more.
    transcript_text: 'I did not take it',
    snooze_reminder_id: EVENING,
    snooze_minutes: 15,
  });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.action_taken, 'SNOOZED');
  assert.equal(db.store.pending_confirmations.length, 0,
    'a snooze must not create a "did you take it?" prompt');

  const evening = db.store.medication_reminders[1];
  assert.equal(evening.status, 'gesnoozed_1', 'the reminder is snoozed, not confirmed');
  const moved = new Date(evening.scheduled_time).getTime();
  assert.ok(moved > before, 'and its time moves forward');
  assert.ok(moved - Date.now() >= 14 * 60_000, `expected ~15 minutes, got ${Math.round((moved - Date.now()) / 60000)}`);
  assert.equal(db.store.medication_reminders[0].status, 'gepland', 'the other dose is untouched');
});

test('a snooze for a reminder this elder does not have is refused', async () => {
  const db = seed();
  const response = await speak(db, { snooze_reminder_id: 'dddd4444-4444-4444-8444-444444444444', snooze_minutes: 15 });

  assert.equal(response.status, 404, JSON.stringify(response.body));
  assert.equal(db.store.pending_confirmations.length, 0);
});

test('the app sends the reminder it tapped, and a snooze as a snooze', async () => {
  const { readFileSync } = await import('node:fs');

  const actions = readFileSync(new URL('../../apps/elder/src/hooks/useHavenActions.ts', import.meta.url), 'utf8');
  assert.match(actions, /medication_reminder_id: medicationId/, 'the taken button names its reminder');
  assert.match(actions, /snooze_reminder_id: reminderId/, 'the snooze button names its reminder');
  // Online snooze calls the pipeline; the queue is only the offline fallback.
  assert.match(actions, /client\.voice\(\{ elder_id: elderId, screen_id: 'PILLS', snooze_reminder_id: reminderId/,
    'the snooze button must reach the pipeline when there is a connection');

  const { loadAppModule } = await import('./support/edge-function-harness.mjs');
  const dispatch = await loadAppModule('apps/elder/src/services/offlineDispatch.ts');

  const sent = [];
  const client = { voice: async (input) => { sent.push(input); return {}; }, invoke: async () => ({}) };

  const take = dispatch.planOfflineDispatch({
    idempotencyKey: 'take-1',
    type: 'CONFIRM_MEDICATION',
    payload: { elder_id: ELDER, medication_id: EVENING, screen_id: 'PILLS' },
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
  await take.plan(client);
  assert.equal(sent[0].medication_reminder_id, EVENING, 'a queued tap carries its target too');

  const snooze = dispatch.planOfflineDispatch({
    idempotencyKey: 'snooze-1',
    type: 'SNOOZE_MEDICATION',
    payload: { elder_id: ELDER, medication_id: EVENING, delay_minutes: 15 },
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
  await snooze.plan(client);
  assert.equal(sent[1].snooze_reminder_id, EVENING);
  assert.equal(sent[1].transcript_text, undefined,
    'snooze must not be sent as speech that a classifier could read as "taken"');

  // DENY_MEDICATION was a queue type nothing could produce. It is gone, and the switch must not
  // route it: a denial is answered through fn-pending-confirmation-respond.
  const denial = dispatch.planOfflineDispatch({
    idempotencyKey: 'deny-1',
    type: 'DENY_MEDICATION',
    payload: { elder_id: ELDER, medication_id: EVENING },
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
  assert.equal(dispatch.isPlan(denial), false, 'an unreachable queue type must not be routed');
});
