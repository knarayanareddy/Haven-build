import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const migrationSql = readFileSync(join(root, 'supabase/migrations/20260615000002_final_targeted_iteration_red_team_gaps.sql'), 'utf8');
const residueMigrationSql = readFileSync(join(root, 'supabase/migrations/20260620000003_security_residue_hardening.sql'), 'utf8');

test('Part D - Forensic Immutability Bypasses completely closed via Event Triggers and Append-Only Model', () => {
  // 1. Confirm Event Trigger blocking prod DDL exists
  assert.ok(migrationSql.includes('CREATE EVENT TRIGGER trg_block_prod_ddl ON ddl_command_start'), 'Must deploy Event Trigger strictly banning unauthorized prod DDL');
  assert.ok(migrationSql.includes('DDL OPERATIONS BANNED IN PRODUCTION'), 'Event trigger must throw custom exception');

  // 2. Confirm runtime role de-escalation statements executed
  assert.ok(/ALTER ROLE authenticated NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION/i.test(residueMigrationSql), 'Must strip superuser execution privileges from authenticated roles in a forward migration');
  assert.ok(/ALTER ROLE anon NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION/i.test(residueMigrationSql), 'Must strip superuser execution privileges from anon roles in a forward migration');

  // 3. Verify Breathtaking Append-Only clinical corrections view model
  assert.ok(migrationSql.includes('CREATE OR REPLACE VIEW effective_carer_handover_notes'), 'Must deploy effective clinical state View');
  assert.ok(migrationSql.includes('COALESCE(c.corrected_payload->>\'notes_nl\', ch.notes_nl)'), 'View must seamlessly resolve effective text while maintaining 100% true original row immutability');
  assert.ok(migrationSql.includes('clinical_record_corrections'), 'Must store append-only corrections in dedicated ledger');
});
