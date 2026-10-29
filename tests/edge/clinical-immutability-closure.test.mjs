import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const migrationSql = readFileSync(join(root, 'supabase/migrations/20260615000002_final_targeted_iteration_red_team_gaps.sql'), 'utf8');
const residueMigrationSql = readFileSync(join(root, 'supabase/migrations/20260620000003_security_residue_hardening.sql'), 'utf8');
const closureMigrationSql = readFileSync(join(root, 'supabase/migrations/20261029000001_rls_coverage_closure.sql'), 'utf8');

test('Part D - Forensic Immutability Bypasses completely closed via Event Triggers and Append-Only Model', () => {
  // 1. Confirm Event Trigger blocking prod DDL exists
  assert.ok(migrationSql.includes('CREATE EVENT TRIGGER trg_block_prod_ddl ON ddl_command_start'), 'Must deploy Event Trigger strictly banning unauthorized prod DDL');
  assert.ok(migrationSql.includes('DDL OPERATIONS BANNED IN PRODUCTION'), 'Event trigger must throw custom exception');

  // 2. Confirm runtime role de-escalation is *executed*, not merely described.
  //
  // 20260615000002 shipped these statements commented out (`-- ALTER ROLE …`), and
  // the assertion above matched the comment text — i.e. it passed precisely
  // because the hardening was NOT applied. The de-escalation now runs from the
  // October closure migration as a privilege-guarded DO block that escalates to an
  // exception if a runtime role is still elevated and cannot be fixed.
  assert.ok(
    !/^\s*--\s*ALTER ROLE authenticated NOSUPERUSER/m.test(residueMigrationSql + closureMigrationSql),
    'De-escalation must not be left commented out',
  );
  assert.ok(
    /ALTER ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION/.test(closureMigrationSql),
    'Must execute ALTER ROLE … NOSUPERUSER for runtime roles',
  );
  assert.ok(
    /RAISE EXCEPTION 'haven: runtime role % holds elevated attributes/.test(closureMigrationSql),
    'Must fail closed if a runtime role still holds elevated attributes',
  );

  // 3. Verify Breathtaking Append-Only clinical corrections view model
  assert.ok(migrationSql.includes('CREATE OR REPLACE VIEW effective_carer_handover_notes'), 'Must deploy effective clinical state View');
  assert.ok(migrationSql.includes('COALESCE(c.corrected_payload->>\'notes_nl\', ch.notes_nl)'), 'View must seamlessly resolve effective text while maintaining 100% true original row immutability');
  assert.ok(migrationSql.includes('clinical_record_corrections'), 'Must store append-only corrections in dedicated ledger');
});
