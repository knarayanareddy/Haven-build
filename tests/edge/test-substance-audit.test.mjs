// Guards the test-substance audit itself.
//
// The audit (scripts/ci/audit-test-substance.mjs) classifies every file in
// tests/edge as behavioural or static-only, and fails when a new static-only file
// appears or when the allowlist drifts. These tests exercise the classifier
// directly, so the guard cannot silently start passing everything.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { ROOT, auditTests, classify } from '../../scripts/ci/audit-test-substance.mjs';

test('the repository passes its own test-substance audit', () => {
  const output = execFileSync('node', ['scripts/ci/audit-test-substance.mjs'], {
    cwd: new URL('../../', import.meta.url).pathname,
    encoding: 'utf8',
  });
  assert.match(output, /No violations\./);
});

test('a file that only matches source text is classified static', () => {
  const result = classify(`
    import { readFileSync } from 'node:fs';
    const src = readFileSync('supabase/functions/fn-x/index.ts', 'utf8');
    assert.ok(src.includes('assertSelf'));
  `);
  assert.equal(result.kind, 'static');
  assert.equal(result.assertions, 1);
});

test('a file that executes the module under test is classified behavioural', () => {
  assert.equal(classify(`const mod = await import('../../supabase/functions/_shared/authz.ts');`).kind, 'behavioural');
  assert.equal(classify(`import { auditRlsCoverage } from '../../scripts/ci/audit-rls-coverage.mjs';`).kind, 'behavioural');
  assert.equal(classify(`const dir = await linkSharedModules();`).kind, 'behavioural');
});

test('a new static-only file fails the audit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haven-substance-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'new-static.test.mjs'), `
    import { readFileSync } from 'node:fs';
    const src = readFileSync('supabase/functions/fn-new/index.ts', 'utf8');
    assert.ok(src.includes('requireInternalAccess'));
  `);

  const { violations, report } = auditTests({ dir, allowlistPath: join(dir, 'missing.json') });
  assert.equal(report.staticOnly, 1);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /not allowlisted/);
});

test('an allowlist entry that has become behavioural is a violation, so the list only shrinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haven-substance-'));
  const file = join(dir, 'converted.test.mjs');
  writeFileSync(file, `const mod = await import('../../supabase/functions/_shared/authz.ts');`);
  const allowlist = join(dir, 'allowlist.json');
  writeFileSync(allowlist, JSON.stringify({
    allowlisted: { [relative(ROOT, file).replaceAll('\\', '/')]: 'was static, converted since' },
  }));

  const { violations } = auditTests({ dir, allowlistPath: allowlist });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /now exercises code/);
});
