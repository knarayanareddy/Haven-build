// P3.3 — docs must not drift from the code.
//
// Documentation in this repository made checkable claims that were false:
//   • SECURITY_FIXES_IMPLEMENTED.md implied rate limiting covered every function
//     (it covered 29 of 81);
//   • the PR workflow summary advertised "31 Domain Test Suites" while the runner
//     chained 48 of 66 files.
// Both survived review because nothing compared prose to reality.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

test('no documented claim is stale', () => {
  const output = execFileSync('node', ['scripts/ci/audit-docs-truth.mjs'], {
    cwd: new URL('../../', import.meta.url).pathname,
    encoding: 'utf8',
  });
  assert.match(output, /No stale claims\./);
});

test('the security report no longer implies complete rate-limit coverage', () => {
  const report = read('SECURITY_FIXES_IMPLEMENTED.md');
  assert.equal(
    /Applied to all sensitive endpoints[^\n]*available via `havenHandler\(\)` wrapper for all functions\./.test(report),
    false,
    'the original unqualified coverage claim must be replaced with the measured numbers',
  );
  assert.match(report, /Correction \(2026-10-29\)/, 'the correction must be visible where the claim was made');
  assert.match(report, /audit-function-coverage\.mjs/, 'the correction must point at the enforcement mechanism');
});

test('the README states current counts instead of historical ones', () => {
  const readme = read('README.md');
  assert.match(readme, /currently\s+\*\*81 Edge Functions\*\*/i);
  assert.match(readme, /43 migrations applied in order/);
  assert.equal(
    /12 migrations \+ 55 Edge Functions \|/i.test(readme),
    false,
    'the historical layer row must be labelled as historical, not read as current',
  );
});

test('CONTRIBUTING documents the real verification commands', () => {
  const contributing = read('CONTRIBUTING.md');
  for (const command of ['pnpm run typecheck', 'pnpm run lint']) {
    assert.match(contributing, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `must document ${command}`);
  }
});
