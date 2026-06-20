#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const trackedFiles = spawnSync('git', ['ls-files'], { encoding: 'utf8' }).stdout
  .split('\n')
  .filter(Boolean)
  .filter((file) => /(^|\/)(eas\.json|\.env[^/]*|.*\.env)$/.test(file));

const localFiles = [
  '.env.staging',
  'apps/elder/.env.production',
  'apps/family/.env.production.local',
  'supabase/functions/.env.production',
].filter((file) => existsSync(file));

function jwtRole(value) {
  if (!value || value.split('.').length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function scanFile(file, tracked) {
  const text = readFileSync(file, 'utf8');
  const findings = [];

  const pairs = [];
  if (file.endsWith('.json')) {
    try {
      const json = JSON.parse(text);
      const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (typeof child === 'string' && /(?:KEY|TOKEN|SECRET|JWT)/.test(key)) {
            pairs.push([key, child]);
          } else {
            visit(child);
          }
        }
      };
      visit(json);
    } catch {
      // Fall back to line-based parsing below.
    }
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const envMatch = trimmed.match(/^([A-Z0-9_]*(?:KEY|TOKEN|SECRET|JWT)[A-Z0-9_]*)\s*=\s*(.*)$/);
    const jsonMatch = trimmed.match(/^["']([A-Z0-9_]*(?:KEY|TOKEN|SECRET|JWT)[A-Z0-9_]*)["']\s*:\s*["']?(.*?)["']?,?$/);
    const match = envMatch ?? jsonMatch;
    if (match) pairs.push([match[1], match[2]]);
  }

  for (const match of pairs) {
    const key = match[0];
    const value = String(match[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
    if (!value || value.startsWith('REPLACE_WITH_') || value.startsWith('<')) continue;
    const role = jwtRole(value);
    const isPublic = key.startsWith('EXPO_PUBLIC_') || key.startsWith('NEXT_PUBLIC_');
    const isConcreteSecret = /(SECRET|SERVICE_ROLE|ACCESS_TOKEN|API_KEY|PRIVATE|JWT)$/i.test(key) && !isPublic;
    const isJwt = value.split('.').length === 3 && role;
    if (tracked && (isConcreteSecret || isJwt)) {
      findings.push({ severity: role === 'service_role' || /SERVICE_ROLE/.test(key) ? 'critical' : 'warning', key, role });
    } else if (!tracked && (isConcreteSecret || isJwt || role)) {
      findings.push({ severity: 'local-only', key, role });
    }
  }
  return findings;
}

const trackedFindings = trackedFiles.flatMap((file) => scanFile(file, true).map((finding) => ({ file, ...finding })));
const localFindings = localFiles.flatMap((file) => scanFile(file, false).map((finding) => ({ file, ...finding })));

console.log('# HAVEN env hygiene audit');
console.log('');
console.log(`Tracked env/EAS files scanned: ${trackedFiles.length}`);
console.log(`Local ignored env files scanned: ${localFiles.length}`);
console.log('');

if (trackedFindings.length === 0) {
  console.log('Tracked findings: none');
} else {
  console.log('Tracked findings:');
  for (const finding of trackedFindings) {
    console.log(`- ${finding.severity}: ${finding.file} ${finding.key}${finding.role ? ` jwt_role=${finding.role}` : ''}`);
  }
}

console.log('');
if (localFindings.length === 0) {
  console.log('Local ignored findings: none');
} else {
  console.log('Local ignored findings, values redacted:');
  for (const finding of localFindings) {
    console.log(`- ${finding.file} ${finding.key}${finding.role ? ` jwt_role=${finding.role}` : ''}`);
  }
}

if (trackedFindings.some((finding) => finding.severity === 'critical')) {
  process.exitCode = 1;
}
