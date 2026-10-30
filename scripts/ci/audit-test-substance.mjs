#!/usr/bin/env node
/**
 * Test-substance audit.
 *
 * Why this exists
 * ───────────────
 * Roughly half of `tests/edge` asserted on *source text* rather than behaviour:
 *
 *     const src = readFileSync('supabase/functions/fn-x/index.ts', 'utf8');
 *     assert.ok(src.includes('assertSelf'));
 *
 * Those tests pass for code that is broken. Worse, several of the worst ones
 * (auth-sharding-lag-s4, dns-rebinding, bsn-guard) went further and *copied* the
 * production logic into the test file, so they asserted that the copy worked and
 * never touched `supabase/functions/` at all. Two production defects found in
 * October 2026 — a confirmation marked resolved before its clinical write, and a
 * health check that fabricated a healthy timestamp — sat behind suites that were
 * green the whole time.
 *
 * Rewriting ~40 files at once would be one unreviewable change, so this audit
 * makes the debt explicit and non-growing. It classifies every file in
 * `tests/edge` and fails when:
 *
 *   1. a static-only file exists that is not listed in the allowlist
 *      → new tests must exercise the code, not its text;
 *   2. an allowlisted file has become behavioural
 *      → remove it from the allowlist (the list may only shrink);
 *   3. an allowlisted file no longer exists
 *      → the allowlist must not accumulate ghosts.
 *
 * Classification is deliberately conservative: a file counts as behavioural only
 * if it *executes* the code under test (dynamic `import()` / `linkSharedModules` /
 * `transpileModuleFile`). Reading a file and matching strings is static, however
 * many assertions there are.
 *
 * Usage: node scripts/ci/audit-test-substance.mjs [--json]
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TESTS_DIR = join(ROOT, 'tests', 'edge');
const ALLOWLIST_PATH = join(ROOT, 'scripts', 'ci', 'test-substance-allowlist.json');

/** @returns {{ path: string, kind: 'behavioural' | 'static', reason: string, assertions: number }} */
export function classifyTests(dir = TESTS_DIR) {
  const files = readdirSync(dir).filter((name) => name.endsWith('.test.mjs')).sort();
  return files.map((name) => {
    const file = join(dir, name);
    const source = readFileSync(file, 'utf8');
    return { path: relative(ROOT, file).replaceAll('\\', '/'), ...classify(source) };
  });
}

/**
 * Classifies one test source. Exported so it can be unit-tested.
 *
 * The question is "does this file's verdict depend on something other than the
 * characters in a source file?". Three ways to qualify:
 *
 *   executed   — it imports and drives a production module (dynamic import of
 *                `supabase/`, `apps/` or `packages/`, directly or through
 *                `linkSharedModules`/`transpileModuleFile`), or drives a process;
 *   modelled   — it asks `support/sql-model.mjs` or `support/ast-model.mjs` a
 *                question (which policies exist, what a function's body does),
 *                so the assertion is about the deployed schema, not a substring;
 *   none       — anything that only reads files and matches strings is static.
 *
 * A file may *also* read a migration to check an index while driving the real
 * limiter; the execution is what makes it behavioural, so a `readFileSync` alone
 * no longer disqualifies it. `sourceReads` is reported either way so a reviewer
 * can see how much of a behavioural suite is still text matching.
 */
export function classify(source) {
  const assertions = (source.match(/\bassert\.\w+\(/g) ?? []).length;
  const readsSource = /\breadFileSync\(/.test(source);

  // Any module under tests/edge/support that loads production code counts: the
  // handler harness transpiles `supabase/functions/<fn>/index.ts` and the shared
  // loader transpiles `_shared/*.ts`, so importing either means the verdict comes
  // from running the handler, not from reading it.
  const usesSupportLoader = /from\s+['"]\.\/support\/(?:shared-loader|edge-function-harness)\.mjs['"]/.test(source)
    || /\blinkSharedModules\b|\btranspileModuleFile\b|\bloadEdgeFunction\b|\bloadSharedModule\b/.test(source)
    || /await\s+import\(\s*`\$\{?(?:shared|dir|tmp)/.test(source);
  const importsProduction = /await\s+import\(\s*['"`][^'"`]*\.\.\/\.\.\/(?:supabase|apps|packages)\//.test(source)
    || /from\s+['"](?:\.\.\/)+(?:scripts|supabase|apps|packages)\//.test(source)
    || /await\s+import\(\s*(?:new\s+URL\()?[^)]*\b(?:supabase|apps|packages)\//.test(source);
  const drivesProcess = /\b(?:spawn|spawnSync|execFile|execFileSync)\(/.test(source);

  const usesModel = /from\s+['"]\.\/support\/[a-z-]*model\.mjs['"]/.test(source);

  if (usesSupportLoader || importsProduction || drivesProcess) {
    return { kind: 'behavioural', reason: 'executes the module under test', assertions, sourceReads: readsSource };
  }
  if (usesModel) {
    return { kind: 'behavioural', reason: 'queries the parsed schema/AST model', assertions, sourceReads: readsSource };
  }
  if (readsSource) {
    return { kind: 'static', reason: 'reads source text and matches strings', assertions, sourceReads: true };
  }
  return { kind: 'static', reason: 'no executed module and no file read (nothing verifies behaviour)', assertions, sourceReads: false };
}

export function loadAllowlist(path = ALLOWLIST_PATH) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return {
      entries: parsed.allowlisted ?? {},
      note: parsed.note ?? '',
      raw: parsed,
    };
  } catch {
    return { entries: {}, note: '', raw: {} };
  }
}

/**
 * @returns {{ violations: string[], report: object }}
 */
export function auditTests({ dir = TESTS_DIR, allowlistPath = ALLOWLIST_PATH } = {}) {
  const results = classifyTests(dir);
  const { entries, note } = loadAllowlist(allowlistPath);
  const violations = [];

  const staticOnly = results.filter((r) => r.kind === 'static');
  const behavioural = results.filter((r) => r.kind === 'behavioural');

  for (const result of staticOnly) {
    if (!Object.hasOwn(entries, result.path)) {
      violations.push(
        `${result.path}: asserts on source text (${result.assertions} assertions) and is not allowlisted. `
        + 'Exercise the code under test (see tests/edge/pending-confirmation-ordering.test.mjs for the pattern).',
      );
    }
  }

  for (const [path, entry] of Object.entries(entries)) {
    const result = results.find((r) => r.path === path);
    if (!result) {
      violations.push(`${path}: allowlisted but the file no longer exists. Remove the entry.`);
      continue;
    }
    if (result.kind !== 'static') {
      violations.push(`${path}: allowlisted as static-only but now exercises code. Remove the entry (the list may only shrink).`);
    }
    if (typeof entry !== 'string' || entry.trim().length < 10) {
      violations.push(`${path}: allowlist entry must carry a reason of at least 10 characters.`);
    }
  }

  return {
    violations,
    report: {
      total: results.length,
      behavioural: behavioural.length,
      staticOnly: staticOnly.length,
      allowlisted: Object.keys(entries).length,
      note,
      staticFiles: staticOnly,
    },
  };
}

function main() {
  const asJson = process.argv.includes('--json');
  const { violations, report } = auditTests();

  if (asJson) {
    console.log(JSON.stringify({ ...report, violations }, null, 2));
  } else {
    console.log(
      `tests/edge: ${report.total} files · behavioural ${report.behavioural} · static-only ${report.staticOnly} `
      + `(allowlisted ${report.allowlisted})`,
    );
    if (report.note) console.log(`  ${report.note}`);
    if (report.staticOnly > 0) {
      console.log('  static-only files (tracked debt, may only shrink):');
      for (const file of report.staticFiles) console.log(`    · ${file.path} (${file.assertions} assertions)`);
    }
  }

  if (violations.length > 0) {
    console.error(`\n${violations.length} test-substance violation(s):`);
    for (const violation of violations) console.error(`  ✗ ${violation}`);
    process.exitCode = 1;
    return;
  }

  if (!asJson) console.log('No violations.');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
