// Schema-level contract for GDPR erasure and audit immutability.
//
// Consolidates four suites that asserted on migration text or on a simulated
// re-implementation of soft_purge_profile():
//   tests/edge/pgvector-embedding-s1-closure.test.mjs   (a Map pretending to be Postgres)
//   tests/edge/gdpr-erasure-deep-redaction.test.mjs     (readFileSync + regex over SQL)
//   tests/edge/minimal-closure.test.mjs                 (a simulated FK engine)
//   tests/edge/pre-pentest-round5-database-closure.test.mjs (ddl.includes(...))
//
// Every assertion here is answered by the parsed schema model: the final definition of
// each function, the triggers that exist, and the privileges that were granted or
// revoked. "The last migration that touched it says X" is the question that matters for
// a deployed database, and it is the question a substring search over one file cannot
// answer — 20260615000003 defines redact_sensitive_text_v2 and drops it again later in
// the same file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from './support/sql-model.mjs';

const model = buildModel();
const purge = model.fn('soft_purge_profile');

test('erasure is idempotent: an already-erased profile is a no-op, not a second purge', () => {
  assert.ok(purge, 'soft_purge_profile() must exist');
  assert.match(purge.body, /status = 'erased'/, 'it must detect the erased marker');
  assert.match(purge.body, /RETURN/, 'and return before touching anything else');
  // Slice to the first *statement* (two-space indent), not the string "UPDATE":
  // the lock clause contains "FOR UPDATE", which is not a write.
  const firstStatement = purge.body.search(/\n {2}UPDATE /);
  assert.ok(firstStatement > 0, 'the purge must contain statements');
  const guard = purge.body.slice(0, firstStatement);
  assert.match(guard, /IF[\s\S]*RETURN/, 'the guard must run before the first UPDATE');
});

test('the purge takes a row lock before reading the status it acts on', () => {
  // Without FOR UPDATE two concurrent erasures can both pass the guard and the second
  // one overwrites the first one's completed status.
  const lockBlock = purge.body.slice(0, purge.body.indexOf('FOR UPDATE'));
  assert.ok(lockBlock.includes('FROM public.profiles'), 'the lock must be on the profile row');
  assert.match(purge.body, /FOR UPDATE/);
});

test('vectors are nulled, not merely flagged', () => {
  // A retained pgvector embedding is reconstructable personal data; setting a flag and
  // keeping the vector is not erasure.
  assert.match(purge.body, /UPDATE public\.companion_memory SET embedding = NULL/,
    'companion_memory.embedding must be set to NULL');
  assert.match(purge.body, /content_nl = '\[ERASED\]'/, 'and the plain-text copy wiped');
});

test('free text is overwritten rather than left to a best-effort redactor', () => {
  // The strongest available statement: transcripts, handover notes and summaries are
  // replaced wholesale, so a name that the redactor's patterns do not recognise cannot
  // survive erasure.
  for (const table of ['carer_handover_notes', 'life_stories', 'companion_memory', 'financial_transactions', 'voice_interactions']) {
    assert.ok(purge.body.includes(`UPDATE public.${table}`), `${table} must be erased`);
  }
  assert.match(purge.body, /SET notes_nl = '\[ERASED\]'/, 'handover notes must be cleared');
  assert.match(purge.body, /SET transcript_nl = NULL/, 'voice transcripts must be removed');
});

test('every erasure statement is scoped to the one person', () => {
  // An unbounded UPDATE inside an erasure function would wipe every elder's data.
  const statements = purge.body.split(';').filter((statement) => /^\s*UPDATE /i.test(statement.trim()));
  assert.ok(statements.length >= 10, `expected the purge to cover many tables, found ${statements.length}`);
  for (const statement of statements) {
    const table = /UPDATE\s+(?:public\.)?([a-z0-9_]+)/i.exec(statement)?.[1];
    assert.match(statement, /WHERE\b/i, `the UPDATE of ${table} has no WHERE clause`);
    assert.ok(/elder_id = p_target_id|profile_id = p_target_id|id = p_target_id/.test(statement),
      `the UPDATE of ${table} is not scoped to the erased person`);
  }
});

test('the purge is audited and marks the request complete', () => {
  assert.match(purge.body, /GDPR_ERASURE_PURGE/, 'the purge must write its audit row');
  assert.match(purge.body, /deletion_requests SET status = 'completed'/,
    'the deletion request must be closed out');
});

test('erasure never deletes a clinical record', () => {
  // Erasing the account must not remove the MAR history that clinical governance and
  // the medication-interaction checks depend on; it redacts the identifiers instead.
  assert.equal(/DELETE\s+FROM/i.test(purge.body), false,
    'soft_purge_profile() must not DELETE rows');
});

test('audit_log cannot be truncated, even by the service role', () => {
  // TRUNCATE bypasses the row-level immutability trigger, so the trigger alone is not
  // enough — the privilege has to be gone too.
  const revokes = model.table('audit_log').revokes ?? [];
  const truncate = revokes.filter((entry) => entry.privileges.includes('TRUNCATE'));
  assert.ok(truncate.length >= 2, 'TRUNCATE must be revoked explicitly');
  const roles = new Set(truncate.flatMap((entry) => entry.roles));
  for (const role of ['public', 'authenticated', 'service_role']) {
    assert.ok(roles.has(role), `TRUNCATE must be revoked from ${role}`);
  }
});

test('the audit immutability trigger is ENABLE ALWAYS, not merely enabled', () => {
  // A normal trigger does not fire under session_replication_role = replica, which is
  // how a migration or a replication connection would otherwise edit history.
  const trigger = model.triggersFor('audit_log').find((entry) => entry.name === 'trg_audit_log_immutable');
  assert.ok(trigger, 'audit_log must carry its immutability trigger');
  assert.equal(trigger.always, true, 'it must be created with ENABLE ALWAYS');
  assert.ok(trigger.events.includes('UPDATE') && trigger.events.includes('DELETE'),
    'it must guard both UPDATE and DELETE');
});

test('the free-text redactor covers the identifiers that survive partial erasure', () => {
  const redact = model.fn('redact_sensitive_text');
  assert.ok(redact, 'redact_sensitive_text() must exist');
  assert.match(redact.body, /REDACTED_EMAIL/, 'email addresses must be redacted');
  assert.match(redact.body, /REDACTED_PHONE/, 'phone numbers must be redacted');
  assert.match(redact.body, /REDACTED_BSN/, 'BSN-like values must be redacted');
  assert.match(redact.body, /is_valid_dutch_bsn/, 'the BSN decision must use the validated 11-proef, not a shape match');
});

test('the DDL guard is an installed event trigger, not merely a function', () => {
  // block_prod_ddl() is a defence against a migration being pointed at production.
  // Defining it is not enough: it only runs if an EVENT TRIGGER is attached to
  // ddl_command_start. An orphaned function would look identical in a code search.
  assert.ok(model.fn('block_prod_ddl'), 'block_prod_ddl() must exist');
  const attached = model.eventTriggers.filter((entry) => entry.func === 'block_prod_ddl');
  assert.ok(attached.length > 0, 'block_prod_ddl() must be attached to an event trigger');
  assert.equal(attached.at(-1).event, 'ddl_command_start', 'it must fire before DDL runs');
});
