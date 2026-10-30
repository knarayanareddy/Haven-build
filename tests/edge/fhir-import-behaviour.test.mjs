// Behavioural tests for the external FHIR medication import and its approval gate.
//
// Replaces tests/edge/fhir-staging-r1-closure.test.mjs, which mixed `migration.includes`
// assertions with a simulated database. The policy it describes is real and worth
// pinning: an external provider's medication list must never become an active
// prescription without a professional's approval, and a lethal interaction must stop the
// promotion and be recorded.
//
// The two halves live in different places, so they are tested where they live:
//   the handler (fn-medmij-fhir-import) stages and never prescribes — driven here;
//   the approval (promote_fhir_medication_staging) is SQL — asked of the schema model.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  call,
  createMockDb,
  loadEdgeFunction,
  request,
} from './support/edge-function-harness.mjs';
import { buildModel } from './support/sql-model.mjs';

const ELDER = 'aaaa1111-2222-4333-8444-555555555555';
const VENDOR_SECRET = 'medmij-vendor-secret';
const model = buildModel();
const promote = model.fn('promote_fhir_medication_staging');

function importSeed() {
  return createMockDb({
    tables: {
      fhir_import_jobs: [],
      fhir_medication_staging: [],
      appointments: [],
      health_record_imports: [],
      medications: [],
      medication_interaction_alerts: [],
      audit_log: [],
      perf_metrics: [],
    },
  });
}

async function importBundle(db, resources, { headers = { 'x-medmij-secret': VENDOR_SECRET } } = {}) {
  const harness = await loadEdgeFunction('fn-medmij-fhir-import', {
    db,
    env: { MEDMIJ_IMPORT_SECRET: VENDOR_SECRET },
  });
  const response = await call(harness.handler, request('fn-medmij-fhir-import', {
    body: { elder_id: ELDER, provider: 'medmij', resources },
    headers,
  }));
  await harness.settle();
  return response;
}

const medicationRequest = {
  resourceType: 'MedicationRequest',
  id: 'med-1',
  medicationCodeableConcept: { text: 'Furosemide 40mg' },
  dosageInstruction: [{ text: '1x per dag' }],
};

test('an imported medication is staged for review, never prescribed', async () => {
  const db = importSeed();
  const response = await importBundle(db, [medicationRequest]);

  assert.equal(response.status, 200, JSON.stringify(response.body).slice(0, 200));
  assert.equal(db.store.fhir_medication_staging.length, 1, 'the medication must be staged');
  assert.equal(db.store.fhir_medication_staging[0].status, 'pending_review');
  assert.equal(db.store.fhir_medication_staging[0].extracted_name_nl, 'Furosemide 40mg');
  assert.equal(db.store.medications.length, 0,
    'an external import must never write to the active medication list');
});

test('the staging row records the raw resource so a reviewer can check the source', async () => {
  const db = importSeed();
  await importBundle(db, [medicationRequest]);

  const staged = db.store.fhir_medication_staging[0];
  assert.equal(staged.raw_resource.resourceType, 'MedicationRequest');
  assert.ok(staged.resource_id_hash, 'the row must be keyed by a hash of the source resource');
  assert.equal(staged.proposed_schedule_times[0], '08:00');
});

test('an appointment in the bundle is mapped, not staged', async () => {
  const db = importSeed();
  await importBundle(db, [{
    resourceType: 'Appointment',
    id: 'appt-1',
    description: 'Controle huisarts',
    start: new Date().toISOString(),
  }]);

  assert.equal(db.store.appointments.length, 1);
  assert.equal(db.store.appointments[0].is_medical, true);
  assert.equal(db.store.health_record_imports.length, 1, 'the mapping must be recorded for audit');
  assert.equal(db.store.fhir_medication_staging.length, 0);
});

test('an import without a valid vendor secret is refused before any staging', async () => {
  const db = importSeed();
  const response = await importBundle(db, [medicationRequest], { headers: { 'x-medmij-secret': 'wrong' } });

  assert.ok(response.status >= 400, `expected a refusal, got ${response.status}`);
  assert.equal(db.store.fhir_medication_staging.length, 0);
  assert.equal(db.store.fhir_import_jobs.length, 0, 'no job may even be opened');
});

test('an empty or malformed resource list is refused', async () => {
  const db = importSeed();
  const response = await importBundle(db, 'not-an-array');
  assert.equal(response.status, 400, JSON.stringify(response.body).slice(0, 160));
  assert.equal(db.store.fhir_import_jobs.length, 0);
});

// ─── the approval gate (SQL) ─────────────────────────────────────────────────

test('promotion requires a clinical role resolved from the session, not a parameter', () => {
  assert.ok(promote, 'promote_fhir_medication_staging() must exist');
  assert.match(promote.body, /auth\.uid\(\)/, 'the clinician must come from the JWT');
  assert.equal(/p_clinician_id/.test(promote.body), false,
    'a caller-supplied clinician id would let anyone approve their own import');
  assert.match(promote.body, /v_role NOT IN \('system', 'admin', 'carer'\)/,
    'only clinical roles may approve');
  assert.match(promote.body, /403/, 'and the refusal must be a 403');
});

test('promotion locks the staging row and refuses a resolved one', () => {
  assert.match(promote.body, /FOR UPDATE/, 'the row must be locked to prevent double approval');
  assert.match(promote.body, /status <> 'pending_review'/, 'only a pending row may be promoted');
  assert.match(promote.body, /400/, 'and a re-promotion must be a client error, not a second medication');
});

test('a lethal contraindication blocks promotion and records the alert', () => {
  assert.match(promote.body, /check_medication_interactions_sql/, 'the interaction engine must be consulted');
  assert.match(promote.body, /severity = 'critical'/, 'a critical interaction is the blocking threshold');
  assert.match(promote.body, /INSERT INTO medication_interaction_alerts/, 'the alert must be written');
  assert.match(promote.body, /SET status = 'rejected'/, 'the staging row must be rejected, not left promotable');
  assert.match(promote.body, /409 Conflict/, 'the caller must get a 409');
});

test('a successful promotion writes the medication, closes the staging row and audits both', () => {
  assert.match(promote.body, /INSERT INTO medications/, 'the medication must be created');
  assert.match(promote.body, /SET status = 'approved'/, 'the staging row must record approval');
  assert.match(promote.body, /created_medication_id = v_med_id/, 'and point at what it created');
  assert.match(promote.body, /FHIR_STAGING_PROMOTION/, 'the promotion must be audited');
});
