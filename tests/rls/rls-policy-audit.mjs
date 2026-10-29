#!/usr/bin/env node
/**
 * RLS policy audit — historical entry point.
 *
 * This file used to grep 11 of 41 migration files for substrings such as
 * `alter table medications enable row level security`. It could not fail for any
 * table introduced after migration 11, could not see a policy dropped in a later
 * migration, and its own name (`assert.ok(migrations.includes(...))`) hid that it was
 * a text search rather than a policy evaluation.
 *
 * It now runs the real auditor (scripts/ci/audit-rls-coverage.mjs), which reads every
 * migration, tracks create-table / enable / force / policy per table, and fails on:
 *   • a table with no RLS, or RLS not forced;
 *   • a table with no policy and no documented service-role-only exemption;
 *   • an exemption that no longer matches a table.
 *
 * Kept at this path because several documents reference it; new work should call
 * `node scripts/ci/audit-rls-coverage.mjs` (or `pnpm run audit:rls`) directly.
 */

import { auditRlsCoverage } from '../../scripts/ci/audit-rls-coverage.mjs';

const result = auditRlsCoverage();

if (result.violations.length > 0) {
  console.error(`rls-policy audit FAILED — ${result.violations.length} violation(s):`);
  for (const violation of result.violations) console.error(`  ✗ ${violation}`);
  process.exit(1);
}

console.log(
  `rls-policy audit passed — ${result.tables} tables, ${result.serviceRoleOnly} documented service-role-only`,
);
