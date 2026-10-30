import assert from 'node:assert/strict';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'HAVEN_TEST_ELDER_JWT', 'HAVEN_TEST_FAMILY_JWT', 'HAVEN_TEST_UNRELATED_JWT', 'HAVEN_TEST_ELDER_ID'];
const enabled = process.env.HAVEN_LIVE_RLS === '1';

if (!enabled) {
  console.log('live RLS tests skipped; set HAVEN_LIVE_RLS=1 with Supabase test JWTs to run');
  process.exit(0);
}

for (const name of required) {
  assert.ok(process.env[name], `${name} is required`);
}

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const elderId = process.env.HAVEN_TEST_ELDER_ID;
const elderJwt = process.env.HAVEN_TEST_ELDER_JWT;
const familyJwt = process.env.HAVEN_TEST_FAMILY_JWT;
const unrelatedJwt = process.env.HAVEN_TEST_UNRELATED_JWT;

async function rest(jwt, path) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: anon, authorization: `Bearer ${jwt}` },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function rpc(jwt, fn, args) {
  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: anon,
      authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

const elderMemory = await rest(elderJwt, `companion_memory?elder_id=eq.${elderId}&select=id,elder_id`);
assert.ok([200, 206].includes(elderMemory.status), 'elder can query own companion memory');

const familyMemory = await rest(familyJwt, `companion_memory?elder_id=eq.${elderId}&select=id,elder_id`);
assert.ok([200, 206].includes(familyMemory.status), 'family query should not error');
assert.equal(Array.isArray(familyMemory.body) ? familyMemory.body.length : 0, 0, 'family must not see companion memory');

const unrelatedMeds = await rest(unrelatedJwt, `medications?elder_id=eq.${elderId}&select=id,elder_id`);
assert.ok([200, 206].includes(unrelatedMeds.status), 'unrelated query should not error');
assert.equal(Array.isArray(unrelatedMeds.body) ? unrelatedMeds.body.length : 0, 0, 'unrelated user must not see elder medications');

const familyLocation = await rest(familyJwt, `family_location_events?elder_id=eq.${elderId}&select=*`);
assert.ok([200, 206].includes(familyLocation.status), 'family can query fuzzed location view if consented');
assert.ok(!JSON.stringify(familyLocation.body).includes('location_precise'), 'family location view must not expose precise location');

const elderDocuments = await rest(elderJwt, `documents?elder_id=eq.${elderId}&select=id,elder_id`);
assert.ok([200, 206].includes(elderDocuments.status), 'elder can query own documents');

const familyDocuments = await rest(familyJwt, `documents?elder_id=eq.${elderId}&select=id,elder_id`);
assert.ok([200, 206].includes(familyDocuments.status), 'family document query should not error');
assert.equal(Array.isArray(familyDocuments.body) ? familyDocuments.body.length : 0, 0, 'family must not see elder documents');

const elderPushTokens = await rest(elderJwt, `push_tokens?profile_id=eq.${elderId}&select=profile_id,token`);
assert.ok([200, 206].includes(elderPushTokens.status), 'elder can query own push tokens');

const familyPushTokens = await rest(familyJwt, `push_tokens?profile_id=eq.${elderId}&select=profile_id,token`);
assert.ok([200, 206].includes(familyPushTokens.status), 'family push-token query should not error');
assert.equal(Array.isArray(familyPushTokens.body) ? familyPushTokens.body.length : 0, 0, 'family must not see elder push tokens');

const elderPrefs = await rest(elderJwt, `notification_preferences?profile_id=eq.${elderId}&select=profile_id,notification_type`);
assert.ok([200, 206].includes(elderPrefs.status), 'elder can query own notification preferences');

const familyPrefs = await rest(familyJwt, `notification_preferences?profile_id=eq.${elderId}&select=profile_id,notification_type`);
assert.ok([200, 206].includes(familyPrefs.status), 'family preference query should not error');
assert.equal(Array.isArray(familyPrefs.body) ? familyPrefs.body.length : 0, 0, 'family must not see elder notification preferences');

const elderExport = await rpc(elderJwt, 'export_elder_data', { p_elder_id: elderId });
// Carry the PostgREST error into the message: against a live stack the interesting
// part is Postgres' own complaint, and a bare status code hides it.
assert.ok(
  [200, 206].includes(elderExport.status),
  `elder can export own data (status ${elderExport.status}: ${JSON.stringify(elderExport.body).slice(0, 400)})`,
);
assert.equal(typeof elderExport.body, 'object');
assert.equal(elderExport.body.profile?.id, elderId, 'export contains elder profile');
assert.ok(Object.prototype.hasOwnProperty.call(elderExport.body, 'documents'), 'export includes documents');
assert.ok(Object.prototype.hasOwnProperty.call(elderExport.body, 'browser_shield_events'), 'export includes browser shield events');

const familyExport = await rpc(familyJwt, 'export_elder_data', { p_elder_id: elderId });
assert.ok(familyExport.status >= 400, 'family cannot export elder-private data');

const familySummary = await rpc(familyJwt, 'family_dashboard_summary', { p_elder_id: elderId });
assert.ok([200, 206].includes(familySummary.status), 'family dashboard summary RPC should work for a consented family member');
assert.equal(familySummary.body.elder_id, elderId, 'family dashboard summary is scoped to the elder');

console.log('live RLS tests passed');
