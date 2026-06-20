#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const envFileArg = process.argv.find((arg) => arg.startsWith('--env-file='));
const envFile = envFileArg ? envFileArg.split('=').slice(1).join('=') : '.env.staging';
const shouldWrite = args.has('--write');

function cleanValue(value) {
  return String(value ?? '').replace(/^[\s.-]+/, '').replace(/\s+$/, '');
}

function parseEnvFile(path) {
  const text = readFileSync(path, 'utf8');
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = cleanValue(line.slice(idx + 1));
    values[key] = value;
  }
  return { text, values };
}

function projectRef(values) {
  const fromId = values.STAGING_PROJECT_ID?.match(/[a-z0-9]{20}/)?.[0];
  if (fromId) return fromId;
  const fromUrl = values.STAGING_SUPABASE_URL?.match(/https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
  if (fromUrl) return fromUrl;
  throw new Error('Could not determine STAGING_PROJECT_ID project ref');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function upsertEnvText(text, entries) {
  let next = text;
  for (const [key, value] of Object.entries(entries)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(next)) next = next.replace(pattern, line);
    else next = `${next.replace(/\s*$/, '')}\n${line}\n`;
  }
  return next.endsWith('\n') ? next : `${next}\n`;
}

async function checkedFetch(label, url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function createUser({ label, role, baseUrl, anonKey, serviceRoleKey, stamp }) {
  const email = `codex-${label}-${stamp}@haven.test`;
  const password = `HavenStage-${crypto.randomUUID()}-Aa1!`;
  const create = await checkedFetch(`create ${label} user`, `${baseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, staging_test_user: true },
    }),
  });
  const user = await create.json();
  const login = await checkedFetch(`login ${label} user`, `${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const session = await login.json();
  if (!user.id || !session.access_token) throw new Error(`Missing hosted Auth result for ${label}`);
  return { id: user.id, token: session.access_token };
}

async function servicePost({ baseUrl, serviceRoleKey, path, body }) {
  await checkedFetch(`seed ${path}`, `${baseUrl}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body),
  });
}

const { text, values } = parseEnvFile(envFile);
const ref = projectRef(values);
const baseUrl = `https://${ref}.supabase.co`;
const anonKey = values.STAGING_SUPABASE_ANON_KEY;
const serviceRoleKey = values.STAGING_SERVICE_ROLE_KEY;

for (const [name, value] of Object.entries({ STAGING_SUPABASE_ANON_KEY: anonKey, STAGING_SERVICE_ROLE_KEY: serviceRoleKey })) {
  if (!value) throw new Error(`${name} is required in ${envFile}`);
}

const stamp = Date.now();
const elder = await createUser({ label: 'elder', role: 'elder', baseUrl, anonKey, serviceRoleKey, stamp });
const family = await createUser({ label: 'family', role: 'family', baseUrl, anonKey, serviceRoleKey, stamp });
const unrelated = await createUser({ label: 'unrelated', role: 'family', baseUrl, anonKey, serviceRoleKey, stamp });

await servicePost({
  baseUrl,
  serviceRoleKey,
  path: 'profiles?on_conflict=id',
  body: [
    { id: elder.id, role: 'elder', full_name: 'Codex Staging Elder', preferred_name: 'Staging Elder', locale: 'nl-NL', timezone: 'Europe/Amsterdam', country_code: 'NL', onboarding_complete: true },
    { id: family.id, role: 'family', full_name: 'Codex Staging Family', preferred_name: 'Staging Family', locale: 'nl-NL', timezone: 'Europe/Amsterdam', country_code: 'NL', onboarding_complete: true },
    { id: unrelated.id, role: 'family', full_name: 'Codex Staging Unrelated', preferred_name: 'Unrelated', locale: 'nl-NL', timezone: 'Europe/Amsterdam', country_code: 'NL', onboarding_complete: true },
  ],
});

await servicePost({
  baseUrl,
  serviceRoleKey,
  path: 'family_relationships?on_conflict=id',
  body: [{
    id: crypto.randomUUID(),
    elder_id: elder.id,
    family_member_id: family.id,
    relation_label_nl: 'Staging family',
    relation_type: 'kind',
    is_primary: true,
    elder_consented: true,
    elder_consented_at: new Date().toISOString(),
    is_active: true,
    can_view_medications: true,
    can_view_messages: true,
    can_view_location_events: true,
    can_view_alerts: true,
    can_view_stories: true,
    can_view_financials: false,
    notify_on_scam_amber: true,
    notify_on_scam_rood: true,
    notify_on_scam_zwart: true,
    notify_on_missed_meds: true,
    notify_on_safe_zone_exit: true,
    notify_on_crisis: true,
  }],
});

const entries = {
  STAGING_ELDER_JWT: elder.token,
  STAGING_FAMILY_JWT: family.token,
  STAGING_UNRELATED_JWT: unrelated.token,
  STAGING_ELDER_ID: elder.id,
};

if (shouldWrite) {
  writeFileSync(envFile, upsertEnvText(text, entries));
  console.log(`Updated ${envFile} with fresh staging JWTs and elder id.`);
} else {
  for (const [key, value] of Object.entries(entries)) {
    console.log(`export ${key}=${shellQuote(value)}`);
  }
}
