#!/usr/bin/env node
/**
 * Dependency advisory gate.
 *
 * Why this exists
 * ───────────────
 * `deploy.yml` gated deployment on `pnpm audit --audit-level=high`. That command
 * reported 65 high/critical advisories and had done so for so long that
 * `staging-deployment` and `production-deployment` were simply always skipped —
 * a gate that never passes is not a gate. Two things were wrong with it:
 *
 *   1. it could not distinguish a vulnerable *runtime* package from a vulnerable
 *      build tool, so 60 build-time DoS advisories in Metro and the Expo CLI
 *      masked the ones that mattered; and
 *   2. `pnpm audit` needs the whole dependency graph in memory and was repeatedly
 *      OOM-killed in small runners.
 *
 * This script asks the same registry advisory database a narrower, answerable
 * question: *which installed package versions have a high or critical advisory?*
 * It reads `pnpm-lock.yaml` directly (766 entries, fast, no OOM), posts the exact
 * name@version set to the npm bulk advisory endpoint, and fails on anything not
 * covered by an explicit, dated waiver.
 *
 * The waiver file is the same ratchet as `test-substance-allowlist.json`:
 *
 *   • an unlisted high/critical advisory fails the build;
 *   • a listed advisory that no longer applies is a failure ("remove the entry");
 *   • a listed advisory past its `expires` date is a failure — the waiver has to be
 *     renewed deliberately, by a person, with a fresh justification.
 *
 * Usage: node scripts/ci/audit-dependencies.mjs [--json] [--offline]
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LOCKFILE = join(ROOT, 'pnpm-lock.yaml');
const WAIVERS = join(ROOT, 'scripts', 'ci', 'dependency-waivers.json');
const BULK_ENDPOINT = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const SEVERITIES = new Set(['high', 'critical']);

/**
 * Every `name@version` pair named in pnpm-lock.yaml.
 *
 * Covers both the dependency sections (`  next@16.4.3:`) and the package list
 * (`  '@img/sharp-linux-x64@0.35.5':`). Peer suffixes — `(react@19.2.7)` or
 * `_@types+node@25.9.3` — are stripped; the advisory database keys on the bare
 * version.
 */
export function lockfilePackages(lockText) {
  const packages = new Map();
  for (const line of lockText.split('\n')) {
    const match = /^ {2}'?((?:@[^/\s']+\/)?[^@\s']+)@([^:'\s(]+)(?:\([^)]*\))?'?:$/u.exec(line);
    if (!match) continue;
    const [, name, version] = match;
    // Only real releases: skip `link:`, `workspace:`, git and file specs.
    if (!/^\d+\.\d+\.\d+/.test(version)) continue;
    if (!packages.has(name)) packages.set(name, new Set());
    packages.get(name).add(version);
  }
  return packages;
}

/** Queries the registry's bulk advisory endpoint in batches. */
export async function fetchAdvisories(packages, { fetchImpl = fetch, batchSize = 200 } = {}) {
  const names = [...packages.keys()].sort();
  const hits = [];
  for (let index = 0; index < names.length; index += batchSize) {
    const batch = Object.fromEntries(
      names.slice(index, index + batchSize).map((name) => [name, [...packages.get(name)]]),
    );
    const response = await fetchImpl(BULK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      throw new Error(`advisory endpoint returned ${response.status}; cannot verify dependencies`);
    }
    const payload = await response.json();
    for (const [name, advisories] of Object.entries(payload)) {
      for (const advisory of advisories) {
        hits.push({
          module: name,
          id: advisory.url?.split('/').pop() ?? String(advisory.id),
          severity: advisory.severity,
          title: advisory.title,
          vulnerable: advisory.vulnerable_versions,
          installed: [...packages.get(name)],
        });
      }
    }
  }
  // One line per advisory, not per (advisory × version) pair.
  const unique = new Map();
  for (const hit of hits) unique.set(`${hit.module}|${hit.id}`, hit);
  return [...unique.values()].sort(
    (a, b) => a.module.localeCompare(b.module) || a.id.localeCompare(b.id),
  );
}

export function loadWaivers(path = WAIVERS) {
  if (!existsSync(path)) return { entries: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @returns {{ violations: string[], report: object }}
 */
export function auditDependencies({ advisories, waivers, today = new Date() }) {
  const blocking = advisories.filter((advisory) => SEVERITIES.has(advisory.severity));
  const entries = waivers.entries ?? {};
  const violations = [];
  const iso = today.toISOString().slice(0, 10);
  const used = new Set();

  for (const advisory of blocking) {
    const key = `${advisory.module}|${advisory.id}`;
    const waiver = entries[key];
    if (!waiver) {
      violations.push(
        `${advisory.module}@${advisory.installed.join(',')}: ${advisory.severity} ${advisory.id} `
        + `(${advisory.title}) — upgrade, or add a dated waiver to scripts/ci/dependency-waivers.json`,
      );
      continue;
    }
    used.add(key);
    if (!waiver.reason || !waiver.expires) {
      violations.push(`${key}: waiver needs both "reason" and "expires"`);
      continue;
    }
    if (waiver.expires < iso) {
      violations.push(`${key}: waiver expired on ${waiver.expires} — re-justify it or fix the dependency`);
    }
  }

  for (const key of Object.keys(entries)) {
    if (!used.has(key)) {
      violations.push(`${key}: waived but no longer reported — remove the entry (the list may only shrink)`);
    }
  }

  return {
    violations,
    report: {
      checkedAt: iso,
      packages: new Set(advisories.flatMap((a) => a.installed.map((v) => `${a.module}@${v}`))).size,
      highOrCritical: blocking.length,
      waived: Object.keys(entries).length,
      bySeverity: blocking.reduce((acc, a) => ((acc[a.severity] = (acc[a.severity] ?? 0) + 1), acc), {}),
      advisories: blocking,
    },
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const packages = lockfilePackages(readFileSync(LOCKFILE, 'utf8'));
  if (packages.size === 0) {
    console.error('No packages found in pnpm-lock.yaml — run `corepack pnpm install` first.');
    process.exit(1);
  }

  const advisories = await fetchAdvisories(packages);
  const { violations, report } = auditDependencies({ advisories, waivers: loadWaivers() });

  if (args.has('--json')) {
    console.log(JSON.stringify({ ...report, violations }, null, 2));
  } else {
    console.log(
      `Dependencies checked: ${packages.size} packages · `
      + `${report.highOrCritical} high/critical advisories · ${report.waived} waived`,
    );
    for (const advisory of report.advisories) {
      const key = `${advisory.module}|${advisory.id}`;
      const waived = loadWaivers().entries?.[key];
      console.log(
        `  ${waived ? '·' : '✗'} ${advisory.severity.padEnd(8)} ${advisory.module} `
        + `${advisory.installed.join(',')} ${advisory.id}${waived ? ' (waived: ' + waived.expires + ')' : ''}`,
      );
    }
    if (violations.length > 0) {
      console.error(`\n${violations.length} violation(s):`);
      for (const violation of violations) console.error(`  ✗ ${violation}`);
    } else {
      console.log('\nNo violations.');
    }
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
