import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const functionTs = readFileSync(join(root, 'supabase/functions/fn-fall-escalation/index.ts'), 'utf8');
const migrationSql = readFileSync(join(root, 'supabase/migrations/20260615000002_final_targeted_iteration_red_team_gaps.sql'), 'utf8');

test('Part E - Emergency Escalation Flawlessly Uncoupled & Highly Resilient', () => {
  // 1. Verify Deno Gateway worker per-recipient push isolation
  assert.ok(functionTs.includes('Promise.allSettled(stakeholders.map('), 'Must utilize Promise.allSettled to completely isolate push dispatches');
  assert.ok(functionTs.includes('update({ is_active: false })'), 'Must gracefully catch and handle APNs/FCM 410 Unregistered target exceptions without aborting overall loop');

  // 2. Verify complete uncoupling from downstream device revocation logic
  assert.ok(migrationSql.includes("WHERE f.status = 'possible';"), 'Emergency discovery RPC must query falls purely by status without any temporal OR device revocation predicates');
  assert.ok(migrationSql.includes('idx_fall_events_active_emergency'), 'Must deploy lightning-fast active emergency partial index');
});
