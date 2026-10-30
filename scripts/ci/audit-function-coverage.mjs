#!/usr/bin/env node
/**
 * Every Edge Function is either rate-limited or explicitly exempt.
 *
 * Before this audit, 52 of 81 functions called no limiter — including
 * fn-medication-ocr, fn-document-analyse, fn-storage-signed-url, fn-consent-update
 * and fn-audit-query — while SECURITY_FIXES_IMPLEMENTED.md claimed coverage "for
 * all functions". Nothing noticed a new function shipping uncovered.
 *
 * Rules (all hard failures):
 *   • a function without `rateLimit(` must be listed in
 *     scripts/ci/function-coverage-allowlist.json with a non-empty reason;
 *   • an allowlist entry with no corresponding function is stale;
 *   • an allowlisted function that DOES call rateLimit is stale;
 *   • an allowlist reason shorter than 20 characters is not a reason.
 *
 * Usage:
 *   node scripts/ci/audit-function-coverage.mjs [--json]
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url);
const FUNCTIONS_DIR = new URL('supabase/functions/', ROOT);
const ALLOWLIST = new URL('scripts/ci/function-coverage-allowlist.json', ROOT);

/** Normalises a string path or file: URL to a string path. */
function toPath(dir) {
  return dir instanceof URL ? dir.pathname : dir;
}

export function readFunctionNames(functionsDir = FUNCTIONS_DIR) {
  return readdirSync(toPath(functionsDir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('fn-'))
    .map((entry) => entry.name)
    .sort();
}

export function readAllowlist(path = ALLOWLIST) {
  const parsed = JSON.parse(readFileSync(toPath(path), 'utf8'));
  return parsed.exempt ?? {};
}

/**
 * @returns {{ functions: string[], limited: string[], exempt: string[], violations: string[] }}
 */
export function auditFunctionCoverage({ functionsDir = FUNCTIONS_DIR, allowlistPath = ALLOWLIST } = {}) {
  const names = readFunctionNames(functionsDir);
  const exempt = readAllowlist(allowlistPath);

  const limited = [];
  const violations = [];

  for (const name of names) {
    const source = readFileSync(join(toPath(functionsDir), name, 'index.ts'), 'utf8');
    const hasLimiter = /\brateLimit\s*\(/.test(source);
    if (hasLimiter) {
      limited.push(name);
      if (Object.hasOwn(exempt, name)) {
        violations.push(`${name}: listed as exempt but calls rateLimit() — remove the stale allowlist entry`);
      }
    } else if (!Object.hasOwn(exempt, name)) {
      violations.push(`${name}: no rateLimit() call and no documented exemption`);
    }
  }

  for (const [name, reason] of Object.entries(exempt)) {
    if (!names.includes(name)) {
      violations.push(`${name}: allowlist entry has no matching function — remove it`);
    }
    if (typeof reason !== 'string' || reason.trim().length < 20) {
      violations.push(`${name}: exemption needs a reason a reviewer can check (>=20 chars)`);
    }
  }

  return {
    functions: names,
    limited,
    exempt: Object.keys(exempt).sort(),
    violations,
  };
}

function main() {
  const result = auditFunctionCoverage();

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.violations.length === 0 ? 0 : 1);
  }

  const unaccounted = result.functions.length - result.limited.length - result.exempt.length;
  console.log(
    `Functions: ${result.functions.length} | rate-limited: ${result.limited.length} | exempt: ${result.exempt.length} | unaccounted: ${unaccounted}`,
  );

  if (result.violations.length > 0) {
    console.error(`\n${result.violations.length} violation(s):`);
    for (const violation of result.violations) console.error(`  ✗ ${violation}`);
    process.exit(1);
  }

  console.log('No violations.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
