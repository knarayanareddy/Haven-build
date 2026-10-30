// Lifecycle coverage: every table that holds a person's data is reachable by both the
// export and the erasure path, and the write path does not depend on the read path.
//
// Replaces two static suites:
//   tests/edge/data-lifecycle-diff.test.mjs            (set-difference over readFileSync)
//   tests/edge/deadlock-elimination-load-perf.test.mjs (a simulated timer loop claiming
//     0 deadlocks and p95 < 10 ms under 15k/min — a number a simulation cannot measure)
//
// The coverage question is the valuable half of the first file and is answerable exactly:
// ask the schema which tables carry an `elder_id`, then ask the two functions which of
// them they touch. The throughput claim in the second file is not replaced with a weaker
// claim; it is dropped, and the schema changes that motivated it are asserted instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from './support/sql-model.mjs';

const model = buildModel();
const exportBody = model.fn('export_elder_data').body;
const purgeBody = model.fn('soft_purge_profile').body;

/** Tables that hold a row per older adult. */
const elderOwned = [...model.tables.values()]
  .filter((table) => (table.columns ?? []).some((column) => column.name === 'elder_id'))
  .map((table) => table.name)
  .sort();

const mentions = (body, table) => new RegExp(`\\b${table}\\b`).test(body);

test('the schema model finds the elder-owned tables at all', () => {
  // If this ever returns zero the assertions below would pass vacuously.
  assert.ok(elderOwned.length > 20, `expected many elder-owned tables, found ${elderOwned.length}`);
  for (const expected of ['companion_memory', 'vital_signs', 'fall_events', 'documents']) {
    assert.ok(elderOwned.includes(expected), `${expected} must be recognised as elder-owned`);
  }
});

test('every elder-owned table is reachable by the export', () => {
  const missing = elderOwned.filter((table) => !mentions(exportBody, table));
  assert.deepEqual(missing, [],
    `these tables hold a person's data but the export never reads them: ${missing.join(', ')}`);
});

// Erasure is a redaction, not a delete: the profile loses its identity and free text, and
// structured clinical facts survive because a care provider must keep them (Wkkgz, 20 years).
// That is a lawful design, but every table has to be an explicit decision rather than an
// oversight. TABLES RETAINED ON PURPOSE is that decision list; a new elder-owned table that
// appears in neither it nor the purge will fail the test below.
const RETAINED_ON_PURPOSE = {
  medications: 'name and dose are the clinical record; free text is cleared above',
  medication_reminders: 'operational schedule rows, no free text, cascade with the medication',
  webhook_receipts: 'delivery ledger keyed by body hash; no payload is stored',
  fhir_import_jobs: 'vendor job ledger; the staged resources themselves are exported and deleted',
};

test('every elder-owned table is redacted by erasure or retained on a written basis', () => {
  const handler = readFileSync(
    new URL('../../supabase/functions/fn-right-to-erasure/index.ts', import.meta.url),
    'utf8',
  );
  const unexplained = elderOwned.filter((table) =>
    !mentions(purgeBody, table)
    && !handler.includes(`"${table}"`)
    && !Object.hasOwn(RETAINED_ON_PURPOSE, table));
  assert.deepEqual(unexplained, [],
    `after erasure these tables keep a person's data with no stated basis: ${unexplained.join(', ')}`);
});

test('the narrative columns the purge used to leave behind are redacted', () => {
  // Specifically the four tables the coverage test above found unredacted: a visit log, an
  // incident report and a fall's resolution note all carry sentences about the person.
  for (const statement of [
    /carer_visit_logs SET activities_nl = '\[ERASED\]', observations_nl = '\[ERASED\]', concerns_nl = '\[ERASED\]'/,
    /incidents SET description_nl = '\[ERASED\]'/,
    /fall_events SET resolution_notes = '\[ERASED\]'/,
  ]) {
    assert.match(purgeBody, statement, `erasure must redact ${statement}`);
  }
});

test('the export names every table it withholds instead of dropping it silently', () => {
  // export_elder_data() carries an ``internal_records_excluded`` array for the tables it will
  // not hand over. That is the auditable half of a data-subject-access answer: a table that
  // is absent both as a data section and from that list is an omission nobody can see.
  const excluded = [...exportBody.matchAll(/jsonb_build_array\(([\s\S]*?)\)/g)]
    .map((match) => [...match[1].matchAll(/'([a-z0-9_]+)'/g)].map((entry) => entry[1]))
    .flat();
  assert.ok(excluded.length >= 4, `expected an explicit exclusion list, found ${excluded.length}`);

  // The section key is not always the table name (profiles becomes 'elder_profile'), so the
  // test asks whether the body reads the table at all rather than matching a key shape.
  const silent = elderOwned.filter(
    (table) => !mentions(exportBody, table) && !excluded.includes(table),
  );
  assert.deepEqual(silent, [],
    `these tables are neither exported nor named as withheld: ${silent.join(', ')}`);
});

test('the erasure writes an audit row before it claims completion', () => {
  const auditAt = purgeBody.search(/GDPR_ERASURE_PURGE/);
  const completionAt = purgeBody.search(/deletion_requests\s+SET\s+status\s*=\s*'completed'/i);
  assert.ok(auditAt > 0 && completionAt > 0, 'both statements must exist');
  assert.ok(auditAt < completionAt,
    'the audit entry must be written before the request is marked completed');
});

// ─── the schema changes that the write path depends on ───────────────────────
//
// These were the real content of the deadlock suite: review rows must reference a stable
// snapshot rather than the mutable live row, so a reviewer reading while an import writes
// cannot block it, and the PSD2 ingress must land in an unindexed buffer before it is
// merged. Both are schema facts and can be asserted as such.

test('review rows point at a snapshot, not at the mutable live row', () => {
  for (const [table, column] of [
    ['medication_ocr_reviews', 'reviewer_snapshot_id'],
    ['medication_interaction_alerts', 'dismissed_snapshot_id'],
  ]) {
    const names = (model.table(table)?.columns ?? []).map((entry) => entry.name);
    assert.ok(names.includes(column),
      `${table}.${column} is what decouples review writes from ingestion; it is missing`);
  }
});

test('the PSD2 ingress buffer keeps its hot path free of unique indexes', () => {
  const buffer = model.table('psd2_webhook_ingress_buffer');
  assert.ok(buffer, 'psd2_webhook_ingress_buffer must exist');
  const indexes = model.indexesFor('psd2_webhook_ingress_buffer');
  assert.deepEqual(indexes.filter((index) => index.unique).map((index) => index.name), [],
    'a unique index on the scratch buffer turns every webhook into a contended write');
  // A plain index on the arrival time is fine: the sweeper needs it, and it does not make
  // concurrent inserts wait on each other.
  assert.deepEqual(indexes.map((index) => index.name).sort(), ['idx_psd2_buffer_received_at']);
});

test('the rate-limit plan has the composite index it needs', () => {
  // ratelimit_check/consume_rate_limit query perf_metrics by (fn_name, status, recorded_at);
  // without this index every request scans the table it is trying to protect.
  const index = model.indexes.find((entry) => entry.name === 'idx_perf_ratelimit');
  assert.ok(index, 'idx_perf_ratelimit must exist');
  assert.equal(index.table, 'perf_metrics');
  assert.deepEqual(index.columns, ['fn_name', 'status', 'recorded_at']);
});
