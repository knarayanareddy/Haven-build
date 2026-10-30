// Behavioural tests for fn-data-export (the GDPR right-of-access endpoint).
//
// Replaces tests/edge/export-elder-data-closure.test.mjs, which asserted on strings in
// the handler source. The endpoint is user-facing and legally load-bearing: it is how
// a person receives a copy of their own data, so "it returns 200" is not the property
// that matters — the properties are that only the right person can ask, that the reply
// is a FHIR Bundle, that embeddings are stripped, and that an erased record is a 404
// rather than an empty document.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  call,
  createMockDb,
  loadEdgeFunction,
  request,
} from './support/edge-function-harness.mjs';

const ELDER = 'aaaa1111-1111-4111-8111-111111111111';
const STRANGER = 'bbbb2222-2222-4222-8222-222222222222';
const DELEGATE = 'cccc3333-3333-4333-8333-333333333333';
const GUARDIAN = 'dddd4444-4444-4444-8444-444444444444';

function seed({ consent = [] } = {}) {
  return createMockDb({
    tables: {
      profiles: [{ id: ELDER, locale: 'nl-NL', full_name: 'Oma Jansen', role: 'elder' }],
      consent_records: consent.map((entry) => ({
        id: `consent-${entry.delegate_id}`,
        delegate_id: entry.delegate_id,
        elder_id: ELDER,
        consent_type: entry.consent_type,
        is_active: true,
      })),
      audit_log: [],
      perf_metrics: [],
    },
    rpcResults: {
      export_elder_data: {
        profile: { id: ELDER, full_name: 'Oma Jansen' },
        fall_events: [{ id: 'fall-1' }],
        carer_visit_logs: [{ id: 'visit-1' }],
        vital_signs: [{ id: 'vital-1' }],
        documents: [{ id: 'doc-1' }],
        browser_shield_events: [{ id: 'shield-1' }],
        companion_memory: [{
          id: 'memory-1',
          elder_id: ELDER,
          embedding: [0.1, 0.2, 0.3],
          note: 'gesprek over de tuin',
          vector_embedding_omitted: 'Omitted under GDPR Art. 20: opaque vector, no human-readable content',
        }],
      },
    },
  });
}

async function exportAs(db, jwtSubject) {
  const harness = await loadEdgeFunction('fn-data-export', { db, env: {} });
  const response = await call(harness.handler, request('fn-data-export', {
    body: { elder_id: ELDER },
    headers: { authorization: `Bearer test-user:${jwtSubject}` },
  }));
  await harness.settle();
  return response;
}

test('an elder exporting their own data gets a FHIR Bundle with every domain present', async () => {
  const db = seed();
  const result = await exportAs(db, ELDER);

  assert.equal(result.status, 200, JSON.stringify(result.body).slice(0, 300));
  assert.equal(result.body.resourceType, 'Bundle');
  assert.equal(result.body.type, 'collection');

  const parameters = result.body.entry[0].resource.parameter;
  const payload = parameters.find((entry) => entry.name === 'verifiable_platform_export').valueJson;
  for (const table of ['fall_events', 'carer_visit_logs', 'vital_signs', 'documents', 'browser_shield_events']) {
    assert.ok(Array.isArray(payload[table]) && payload[table].length === 1,
      `${table} must be present in the export`);
  }
});

test('the handler forwards the RPC payload faithfully', async () => {
  // The embedding omission is enforced inside export_elder_data() — see
  // db-export-contract.test.mjs, which asserts the SQL builds companion_memory with
  // jsonb_build_object rather than to_jsonb so the vector cannot slip through. The
  // handler's job is the opposite and equally important: it must not reshape, filter
  // or reorder what the database decided to disclose, or the two would drift.
  const db = seed();
  const result = await exportAs(db, ELDER);
  const payload = result.body.entry[0].resource.parameter
    .find((entry) => entry.name === 'verifiable_platform_export').valueJson;

  assert.deepEqual(payload.fall_events, [{ id: 'fall-1' }]);
  assert.deepEqual(payload.companion_memory[0].vector_embedding_omitted,
    'Omitted under GDPR Art. 20: opaque vector, no human-readable content');
  assert.equal(payload.profile.full_name, 'Oma Jansen');
});

test('a stranger cannot export someone else\'s data', async () => {
  const db = seed();
  const result = await exportAs(db, STRANGER);

  assert.ok(result.status >= 400, `expected a refusal, got ${result.status}`);
  assert.equal(JSON.stringify(result.body).includes('fall_events'), false,
    'no part of the export may be returned to an unauthorised caller');
  const deny = db.store.audit_log.find((row) => row.action === 'AUTHZ_DENY_GATE'
    && row.extra?.reason_code === 'UNAUTHORIZED_DELEGATE');
  assert.ok(deny, 'the refusal must be audited with its reason code');
});

test('a delegate with a general consent is not a guardian', async () => {
  // Only poa / legal_guardian / full_delegate confer export rights on someone else.
  const db = seed({ consent: [{ delegate_id: DELEGATE, consent_type: 'alerts' }] });
  const result = await exportAs(db, DELEGATE);

  assert.ok(result.status >= 400, `expected a refusal, got ${result.status}`);
});

test('a verified legal guardian can export for the person they represent', async () => {
  const db = seed({ consent: [{ delegate_id: GUARDIAN, consent_type: 'legal_guardian' }] });
  const result = await exportAs(db, GUARDIAN);

  assert.equal(result.status, 200, JSON.stringify(result.body).slice(0, 200));
  assert.equal(result.body.resourceType, 'Bundle');
});

test('an erased or unknown elder is a 404, not an empty bundle', async () => {
  const db = seed();
  // The RPC raises the "non-existent or erased" error; the handler must surface 404
  // rather than 400, because "there is nothing here" is a different answer from
  // "your request was malformed".
  db.rpc = () => Promise.resolve({
    data: null,
    error: { message: '404: Targeted older adult entity non-existent or data erased', code: 'P0002' },
  });
  const result = await exportAs(db, ELDER);

  assert.equal(result.status, 404, JSON.stringify(result.body));
});
