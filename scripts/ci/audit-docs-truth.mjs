#!/usr/bin/env node
/**
 * Docs-truth guard: claims in the docs must match the repository.
 *
 * Documentation in this repo made checkable claims that were false — the security
 * report said rate limiting covered "all functions" when 52 had none, and the PR
 * workflow summary advertised "31 Domain Test Suites" while the test chain ran 48 of
 * 66 files. Both were believed because nothing compared docs to code.
 *
 * This audit fails when a documented count drifts from reality. Add a claim to CLAIMS
 * only with a real, cheap way to compute the true value.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function countMigrationFiles() {
  return readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).length;
}

function countTestFiles() {
  return readdirSync(join(ROOT, 'tests/edge')).filter((f) => f.endsWith('.test.mjs')).length;
}

function countEdgeFunctions() {
  return readdirSync(join(ROOT, 'supabase/functions'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('fn-')).length;
}

function countWorkspaceApps() {
  return readdirSync(join(ROOT, 'apps'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && statSync(join(ROOT, 'apps', e.name)).isDirectory())
    .filter((e) => {
      try {
        return statSync(join(ROOT, 'apps', e.name, 'package.json')).isFile();
      } catch {
        return false;
      }
    }).length;
}

/**
 * Each claim: a regex with one capture group around the number, the file it lives in,
 * and how to compute the truth. `tolerance` is only for prose that legitimately rounds.
 */
// Only *present-tense* claims belong here. Historical lines ("12 migrations at the
// time of that report") are correct as written and must not be flagged, so each
// pattern is anchored on wording that asserts the current state.
const CLAIMS = [
  {
    file: 'README.md',
    label: 'current edge function count',
    pattern: /currently\s+\*\*(\d+)\s+Edge Functions\*\*/i,
    compute: countEdgeFunctions,
  },
  {
    file: 'README.md',
    label: 'current test assertion count',
    pattern: /runs\s+every\s+`tests\/edge\/\*\.test\.mjs`\s+file\s+\((\d+)\s+assertions/i,
    compute: null, // computed from the live suite run; the CI job compares the number it observed
  },
  {
    file: 'README.md',
    label: 'migration file count (repository tree)',
    pattern: /(\d+)\s+migrations\s+applied\s+in\s+order/i,
    compute: countMigrationFiles,
  },
];

function main() {
  const violations = [];
  const checked = [];

  for (const claim of CLAIMS) {
    let source;
    try {
      source = read(claim.file);
    } catch {
      continue; // file may not exist; not this audit's job
    }
    const match = source.match(claim.pattern);
    if (!match) continue;

    // Claims whose truth is only known from a live run are recorded but not asserted
    // here; the CI job that runs the suite compares the number it observed.
    if (claim.compute === null) {
      checked.push(`${claim.file}: ${claim.label} = ${match[1]} (not asserted statically)`);
      continue;
    }
    const documented = Number(match[1]);
    const actual = claim.compute();
    checked.push(`${claim.file}: ${claim.label} = ${documented}`);

    if (documented !== actual) {
      violations.push(
        `${claim.file}: claims ${documented} ${claim.label}, repository has ${actual}. Update the document or the regex in scripts/ci/audit-docs-truth.mjs.`,
      );
    }
  }

  console.log(`Documented claims checked: ${checked.length}`);
  for (const line of checked) console.log(`  · ${line}`);

  if (violations.length > 0) {
    console.error(`\n${violations.length} stale claim(s):`);
    for (const violation of violations) console.error(`  ✗ ${violation}`);
    process.exit(1);
  }

  console.log('No stale claims.');
}

main();
