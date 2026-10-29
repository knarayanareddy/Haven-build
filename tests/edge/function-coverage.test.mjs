// Every Edge Function is rate-limited or explicitly, durably exempt.
//
// Regression target: 52 of 81 functions shipped with no limiter while the security
// doc claimed complete coverage, and nothing flagged a newly added function.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { auditFunctionCoverage } from '../../scripts/ci/audit-function-coverage.mjs';

test('the real repository has no unaccounted Edge Function', () => {
  const result = auditFunctionCoverage();
  assert.deepEqual(result.violations, []);
  assert.equal(result.functions.length, result.limited.length + result.exempt.length);
  assert.ok(result.functions.length >= 81, 'expected the full function set to be scanned');
  assert.ok(result.limited.length >= 65, `expected most functions to be rate-limited (got ${result.limited.length})`);
});

test('a new function without a limiter fails the audit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haven-fn-audit-'));
  mkdirSync(join(dir, 'fn-ok'));
  writeFileSync(join(dir, 'fn-ok', 'index.ts'), 'await rateLimit(req, "fn-ok");\n');
  mkdirSync(join(dir, 'fn-uncovered'));
  writeFileSync(join(dir, 'fn-uncovered', 'index.ts'), 'Deno.serve(async () => new Response("hi"));\n');

  const allowlist = join(dir, 'allowlist.json');
  writeFileSync(allowlist, JSON.stringify({ exempt: {} }));

  const result = auditFunctionCoverage({ functionsDir: dir, allowlistPath: allowlist });
  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0], /fn-uncovered: no rateLimit\(\) call and no documented exemption/);
});

test('a documented exemption is accepted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haven-fn-audit-'));
  mkdirSync(join(dir, 'fn-cron'));
  writeFileSync(join(dir, 'fn-cron', 'index.ts'), 'Deno.serve(async () => new Response("hi"));\n');

  const allowlist = join(dir, 'allowlist.json');
  writeFileSync(
    allowlist,
    JSON.stringify({ exempt: { 'fn-cron': 'pg_cron scheduler; throttling would skip a scheduled job.' } }),
  );

  assert.deepEqual(auditFunctionCoverage({ functionsDir: dir, allowlistPath: allowlist }).violations, []);
});

test('a stale exemption (function gone) fails the audit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haven-fn-audit-'));
  const allowlist = join(dir, 'allowlist.json');
  writeFileSync(allowlist, JSON.stringify({ exempt: { 'fn-ghost': 'was removed two releases ago but nobody cleaned up.' } }));

  const result = auditFunctionCoverage({ functionsDir: dir, allowlistPath: allowlist });
  assert.ok(result.violations.some((v) => /fn-ghost: allowlist entry has no matching function/.test(v)));
});

test('a stale exemption for a now-rate-limited function fails the audit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haven-fn-audit-'));
  mkdirSync(join(dir, 'fn-fixed'));
  writeFileSync(join(dir, 'fn-fixed', 'index.ts'), 'await rateLimit(req, "fn-fixed");\n');

  const allowlist = join(dir, 'allowlist.json');
  writeFileSync(allowlist, JSON.stringify({ exempt: { 'fn-fixed': 'somebody added a limiter but left this entry behind.' } }));

  const result = auditFunctionCoverage({ functionsDir: dir, allowlistPath: allowlist });
  assert.ok(result.violations.some((v) => /listed as exempt but calls rateLimit/.test(v)));
});

test('an exemption without a real reason fails the audit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haven-fn-audit-'));
  mkdirSync(join(dir, 'fn-cron'));
  writeFileSync(join(dir, 'fn-cron', 'index.ts'), 'Deno.serve(async () => new Response("hi"));\n');

  const allowlist = join(dir, 'allowlist.json');
  writeFileSync(allowlist, JSON.stringify({ exempt: { 'fn-cron': 'cron' } }));

  const result = auditFunctionCoverage({ functionsDir: dir, allowlistPath: allowlist });
  assert.ok(result.violations.some((v) => /needs a reason a reviewer can check/.test(v)));
});
