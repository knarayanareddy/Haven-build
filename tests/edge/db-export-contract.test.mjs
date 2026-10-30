// Schema-level contract for the GDPR export function.
//
// The handler test (fn-data-export-behaviour.test.mjs) proves who may call the export
// and what envelope comes back. It cannot prove the export is *complete or minimal*,
// because both of those are decided inside export_elder_data(). This file asks the
// parsed schema model instead of grepping the migration text, so the assertions follow
// the function's final definition rather than whichever migration last edited it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from './support/sql-model.mjs';
import { readdirSync, readFileSync } from 'node:fs';

const model = buildModel();
const exportFn = model.fn('export_elder_data');
const body = exportFn.body;

test('the export function exists and is SECURITY DEFINER with a pinned search_path', () => {
  assert.ok(exportFn, 'export_elder_data() must exist');
  assert.equal(exportFn.securityDefiner, true, 'it reads across RLS-protected tables, so it must be definer-rights');
  assert.match(String(exportFn.searchPath), /public/, 'and it must pin search_path');
});

test('companion_memory is exported without its embedding', () => {
  // to_jsonb(cm) would serialise every column, including the pgvector embedding.
  // GDPR Art. 20 asks for a copy in a portable, intelligible form; a 1536-float
  // vector is neither, so the column is replaced by an explicit omission marker.
  assert.match(body, /'companion_memory'/, 'companion_memory must be exported');
  const memoryBlock = body.slice(body.indexOf("'companion_memory'"), body.indexOf("'neighbourhood_profiles'"));
  assert.equal(/to_jsonb\(\s*cm\s*\)/.test(memoryBlock), false,
    'companion_memory must not be exported with to_jsonb(cm), which would include the vector');
  assert.match(memoryBlock, /jsonb_build_object/, 'it must be assembled column by column');
  assert.equal(/['"]embedding['"]\s*,/.test(memoryBlock), false, 'the embedding column must not be listed');
  assert.match(memoryBlock, /vector_embedding_omitted/, 'the omission must be recorded in the payload');
});

test('an erasure marker is respected: deleted rows stay out of the export', () => {
  // Exporting soft-deleted rows would resurrect data the person asked to have erased.
  // The slice runs from a table's key in the outer jsonb_build_object to the next key,
  // so it covers that table's whole sub-select rather than a fixed character budget.
  const blockFor = (table) => {
    const start = body.indexOf(`'${table}'`);
    assert.ok(start > -1, `${table} is not in the export`);
    // Outer keys sit at four spaces; the inner jsonb_build_object keys at eight, so
    // anchoring on the outer indent is what keeps the slice to this table.
    const next = body.slice(start + 1).search(/\n {4}'[a-z0-9_]+'\s*,/);
    return next === -1 ? body.slice(start) : body.slice(start, start + 1 + next);
  };

  for (const table of ['companion_memory', 'voice_interactions', 'wandering_events', 'documents']) {
    assert.ok(blockFor(table).includes('deleted_at IS NULL'),
      `${table} must be filtered on deleted_at IS NULL`);
  }
});

test('the export is scoped to one elder by parameter, never by a session variable', () => {
  assert.match(body, /p_elder_id/, 'the function must take the elder id as a parameter');
  assert.equal(exportFn.body.includes('current_setting'), false,
    'it must not read a session setting that a caller could influence');
});

test('the function refuses anyone who is neither the elder nor service_role', () => {
  assert.match(body, /auth\.uid\(\)/, 'the guard must compare against the caller identity');
  assert.match(body, /403/, 'and must reject with a 403');
});

test('every table the export claims to include actually exists in the schema', () => {
  // A typo in a table name inside jsonb_build_object is a runtime error for the person
  // requesting their data, and nothing else would catch it.
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  const tables = new Set();
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql'))) {
    const sql = readFileSync(new URL(file, directory), 'utf8');
    for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?([a-z0-9_]+)"?/gi)) {
      tables.add(match[1]);
    }
  }

  const referenced = [...body.matchAll(/FROM\s+(?:public\.)?"?([a-z0-9_]+)"?/gi)]
    .map((match) => match[1])
    .filter((name) => name !== 'select');
  assert.ok(referenced.length > 10, `expected the export to read many tables, found ${referenced.length}`);
  for (const table of new Set(referenced)) {
    assert.ok(tables.has(table), `export_elder_data() reads ${table}, which no migration creates`);
  }
});
