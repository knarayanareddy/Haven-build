// The carer handover form's two fake controls, and what they cost.
//
// `HandoverForm` offered a medication picker whose three options were hardcoded UUIDs
// ('99999999-0000-0000-0000-00000000000{1,2,3}'). `carer_handover_notes.administered_medication_id`
// is a foreign key to `medications(id)`, so recording one of them either failed the whole note
// (23503) or attributed a prescription the elder does not have. It also offered a "Add photo"
// button that incremented a counter and showed "Photo added (demo). Camera will open in
// production" — nothing was captured, uploaded or stored.
//
// The fixes: a real endpoint the carer may call (fn-carer-medications), the picker rendering
// that list, the administration record surviving the offline queue, and the photo button
// removed rather than left lying.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  call,
  createMockDb,
  loadEdgeFunction,
  request,
} from './support/edge-function-harness.mjs';

const ELDER = '11111111-2222-4333-8444-555555555555';
const CARER = '33333333-4444-4555-8666-777777777777';
const OTHER_CARER = '88888888-9999-4aaa-8bbb-cccccccccccc';
const METFORMIN = 'aaaaaaa1-bbbb-4ccc-8ddd-eeeeeeeeeee1';

function carerDb({ relationship = true } = {}) {
  return createMockDb({
    tables: {
      carer_relationships: relationship ? [{
        id: 'rel-1',
        elder_id: ELDER,
        carer_member_id: CARER,
        elder_consented: true,
        is_active: true,
      }] : [],
      medications: [
        {
          id: METFORMIN,
          elder_id: ELDER,
          name_nl: 'Metformine',
          name_en: 'Metformin',
          dose_description_nl: '500 mg',
          dose_description_en: '500 mg',
          frequency: 'daily',
          schedule_times: ['08:00'],
          is_active: true,
          deleted_at: null,
        },
        {
          id: 'aaaaaaa2-bbbb-4ccc-8ddd-eeeeeeeeeee2',
          elder_id: ELDER,
          name_nl: 'Lisinopril',
          name_en: 'Lisinopril',
          dose_description_nl: '10 mg',
          dose_description_en: '10 mg',
          frequency: 'daily',
          schedule_times: ['08:00'],
          is_active: true,
          deleted_at: null,
        },
        {
          // Stopped medication: a carer must not be offered it to administer.
          id: 'aaaaaaa3-bbbb-4ccc-8ddd-eeeeeeeeeee3',
          elder_id: ELDER,
          name_nl: 'Oud medicijn',
          name_en: 'Old medicine',
          dose_description_nl: '5 mg',
          dose_description_en: '5 mg',
          frequency: 'daily',
          schedule_times: ['08:00'],
          is_active: false,
          deleted_at: null,
        },
        {
          // Another elder's prescription, with a name that would look plausible in the list.
          id: 'aaaaaaa4-bbbb-4ccc-8ddd-eeeeeeeeeee4',
          elder_id: 'other-elder',
          name_nl: 'Metformine',
          name_en: 'Metformin',
          dose_description_nl: '850 mg',
          dose_description_en: '850 mg',
          frequency: 'daily',
          schedule_times: ['08:00'],
          is_active: true,
          deleted_at: null,
        },
      ],
      perf_metrics: [],
      audit_log: [],
    },
  });
}

async function listMedications(db, caller = CARER, elderId = ELDER) {
  const harness = await loadEdgeFunction('fn-carer-medications', { db });
  return call(harness.handler, request('fn-carer-medications', {
    headers: { authorization: `Bearer test-user:${caller}` },
    body: { elder_id: elderId },
  }));
}

test('a carer gets the elder\u2019s active prescriptions with real ids', async () => {
  const response = await listMedications(carerDb());
  assert.equal(response.status, 200, JSON.stringify(response.body));

  const ids = response.body.medications.map((m) => m.id).sort();
  assert.deepEqual(ids, [METFORMIN, 'aaaaaaa2-bbbb-4ccc-8ddd-eeeeeeeeeee2'].sort(),
    'only this elder\u2019s active medication');
  const metformin = response.body.medications.find((m) => m.id === METFORMIN);
  assert.equal(metformin.name_nl, 'Metformine');
  assert.equal(metformin.dose_description_nl, '500 mg');
  assert.equal(metformin.name_en, 'Metformin', 'the English copy the carer app prints on an en-GB handset');
  assert.equal(ids.includes('aaaaaaa3-bbbb-4ccc-8ddd-eeeeeeeeeee3'), false, 'a stopped medication is not offered');
  assert.equal(ids.includes('aaaaaaa4-bbbb-4ccc-8ddd-eeeeeeeeeee4'), false, 'nor another elder\u2019s');
});

test('a carer with no active relationship is refused, not given an empty list', async () => {
  const response = await listMedications(carerDb({ relationship: false }));
  assert.equal(response.status, 403, JSON.stringify(response.body));
  assert.equal(response.body.medications, undefined, 'a refusal must not look like "no medication"');
});

test('one carer cannot read another elder\u2019s medication list', async () => {
  const response = await listMedications(carerDb(), OTHER_CARER);
  assert.equal(response.status, 403);
});

test('the handover form no longer ships placeholder prescriptions', async () => {
  const source = readFileSync(new URL('../../apps/carer/src/screens/HandoverForm.tsx', import.meta.url), 'utf8');

  assert.equal(/99999999-0000-0000-0000-00000000000\d/.test(source), false,
    'hardcoded medication ids must be gone');
  assert.equal(/Medformine|Metformine 500 mg|Lisinopril 10 mg/.test(source), false,
    'and the labels invented alongside them');
  assert.match(source, /client\.medications\(elder_id\)/, 'the picker must load the real list');
  assert.match(source, /handover\.med\.unavailable/, 'and say so when the list cannot be loaded');
});

test('a queued handover carries what was administered and when', async () => {
  const module = await import('../../apps/carer/src/services/queueDelivery.ts')
    .catch(async () => {
      const { loadAppModule } = await import('./support/edge-function-harness.mjs');
      return loadAppModule('apps/carer/src/services/queueDelivery.ts');
    });

  const delivered = [];
  const client = {
    handoverNote: async (input) => { delivered.push(input); return { handover_id: 'h1' }; },
  };

  const target = module.carerDeliveryFor({
    id: 'item-1',
    action: 'handover_note',
    elderId: ELDER,
    carerId: CARER,
    payload: {
      appetite: 4,
      mood: 3,
      concerns: 'Wankel op de been',
      notes: 'Thee gedronken',
      administered_medication_id: METFORMIN,
      administered_at: '2026-10-31T08:15:00.000Z',
    },
  });

  assert.ok(target, 'a handover note must always have a delivery route');
  await target.deliver(client);

  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].administered_medication_id, METFORMIN,
    'a medication given offline must still be recorded');
  assert.equal(delivered[0].administered_at, '2026-10-31T08:15:00.000Z');
  assert.equal(delivered[0].concerns_nl, 'Wankel op de been', 'and the free text still arrives');

  // A note without a medication must not gain an empty id (the FK would reject "").
  delivered.length = 0;
  await module.carerDeliveryFor({
    id: 'item-2', action: 'handover_note', elderId: ELDER, carerId: CARER, payload: { appetite: 3, mood: 3 },
  }).deliver(client);
  assert.equal('administered_medication_id' in delivered[0], false);
  assert.equal('administered_at' in delivered[0], false);
});

test('the administration record the carer sends is the one the endpoint stores', async () => {
  const db = createMockDb({
    tables: {
      profiles: [{ id: ELDER, status: 'active' }],
      carer_relationships: [{
        id: 'rel-1',
        elder_id: ELDER,
        carer_member_id: CARER,
        elder_consented: true,
        is_active: true,
      }],
      medications: [{ id: METFORMIN, elder_id: ELDER, name_nl: 'Metformine' }],
      carer_handover_notes: [],
      carer_handover_recipients: [],
      medication_interaction_alerts: [],
      perf_metrics: [],
      audit_log: [],
      idempotency_keys: [],
    },
  });

  const harness = await loadEdgeFunction('fn-carer-handover-note', { db });
  const response = await call(harness.handler, request('fn-carer-handover-note', {
    headers: { authorization: `Bearer test-user:${CARER}` },
    body: {
      elder_id: ELDER,
      appetite: 4,
      mood: 3,
      notes_nl: 'Thee gedronken',
      administered_medication_id: METFORMIN,
      administered_at: '2026-10-31T08:15:00.000Z',
    },
  }));

  assert.equal(response.status, 200, JSON.stringify(response.body));
  const note = db.store.carer_handover_notes[0];
  assert.equal(note.administered_medication_id, METFORMIN, 'the id the picker gave is the id stored');
  assert.ok(note.administered_at, 'with the time it was given');
});
