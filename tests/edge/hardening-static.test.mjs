import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scam = readFileSync(new URL('../../supabase/functions/fn-scam-pipeline/index.ts', import.meta.url), 'utf8');
assert.ok(scam.includes('validateBody'), 'scam pipeline should use strict validation');
assert.ok(scam.includes('withIdempotency'), 'scam pipeline should use idempotency');
assert.ok(scam.includes('assertElderOrFamilyCan'), 'scam pipeline should enforce authorization');
assert.ok(scam.includes('captureException'), 'scam pipeline should report errors');

const tx = readFileSync(new URL('../../supabase/functions/fn-transaction-intercept/index.ts', import.meta.url), 'utf8');
assert.ok(tx.includes('verifyHmacSha256'), 'transaction intercept should verify HMAC when configured');
assert.ok(tx.includes('webhook_receipts'), 'transaction intercept should record webhook receipts');

const protectedFns = {
  'fn-data-export': ['getJwtUserId', 'assertSelf', 'userClient'],
  'fn-audit-query': ['getJwtUserId', 'assertSelfOrAdmin'],
  'fn-storage-signed-url': ['getJwtUserId', 'assertPathAccess', 'userClient'],
  'fn-right-to-erasure': ['getJwtUserId', 'assertSelf'],
  'fn-companion-memory': ['getJwtUserId', 'assertSelf', 'userClient', 'assertNoBsnText'],
  'fn-location-ingest': ['getJwtUserId', 'assertSelf'],
  'fn-family-message-send': ['getJwtUserId', 'assertElderOrFamilyCan', 'userClient'],
  'fn-emergency-profile': ['getJwtUserId', 'assertSelf', 'userClient'],
  'fn-feature-flags': ['getJwtUserId', 'assertSelf', 'userClient'],
  'fn-screen-data': ['getJwtUserId', 'assertSelf', 'userClient'],
  'fn-push-token-register': ['getJwtUserId', 'assertSelf', 'userClient'],
  'fn-health-log': ['getJwtUserId', 'assertSelf', 'userClient'],
  'fn-consent-update': ['getJwtUserId', 'assertSelf', 'userClient'],
  'fn-grandchild-message-send': ['getJwtUserId', 'assertElderOrFamilyCan', 'userClient'],
  'fn-document-analyse': ['getJwtUserId', 'assertSelf', 'assertOwnedStoragePath', 'userClient'],
  'fn-medication-ocr': ['getJwtUserId', 'assertActorMatches', 'assertElderOrFamilyCan'],
  'fn-voice-pipeline': ['getJwtUserId', 'assertSelf', 'userClient'],
  'fn-device-session': ['getJwtUserId', 'assertSelf', 'userClient'],
  'fn-notification-preferences': ['getJwtUserId', 'assertSelf', 'userClient'],
  'fn-life-story-process': ['getJwtUserId', 'assertSelf', 'assertOwnedRecordingPath', 'userClient'],
  'fn-driving-event': ['getJwtUserId', 'assertSelf', 'userClient'],
  'fn-browser-shield': ['getJwtUserId', 'assertSelf'],
  'fn-call-reputation': ['getJwtUserId'],
  'fn-buurt-discover': ['getJwtUserId', 'assertSelf'],
  'fn-buurt-match': ['getJwtUserId', 'assertSelf'],
  'fn-buurt-optout': ['getJwtUserId', 'assertSelf'],
  'fn-care-plan': ['getJwtUserId', 'assertActorMatches', 'assertCarerCan', 'userClient'],
  'fn-care-visit-log': ['getJwtUserId', 'assertActorMatches', 'assertCarerPermission', 'userClient'],
  'fn-incident-report': ['getJwtUserId', 'assertActorMatches', 'assertCarerPermission', 'userClient'],
  'fn-telehealth-transport': ['getJwtUserId'],
  'fn-wearable-event': ['getJwtUserId', 'assertSelf'],
  'fn-bereavement-support': ['getJwtUserId'],
  'fn-skill-exchange': ['getJwtUserId', 'assertSelf'],
  'fn-legacy-vault': ['getJwtUserId', 'assertSelf', 'userClient'],
};

for (const [fn, markers] of Object.entries(protectedFns)) {
  const code = readFileSync(new URL(`../../supabase/functions/${fn}/index.ts`, import.meta.url), 'utf8');
  for (const marker of markers) assert.ok(code.includes(marker), `${fn} should include ${marker}`);
}

const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
for (const fn of ['fn-companion-memory', 'fn-right-to-erasure', 'fn-data-export', 'fn-audit-query', 'fn-storage-signed-url', 'fn-location-ingest', 'fn-family-message-send', 'fn-feature-flags', 'fn-screen-data', 'fn-push-token-register', 'fn-health-log', 'fn-consent-update', 'fn-grandchild-message-send', 'fn-document-analyse', 'fn-medication-ocr', 'fn-voice-pipeline', 'fn-device-session', 'fn-notification-preferences', 'fn-life-story-process', 'fn-driving-event', 'fn-browser-shield', 'fn-call-reputation', 'fn-buurt-discover', 'fn-buurt-match', 'fn-buurt-optout', 'fn-care-plan', 'fn-care-visit-log', 'fn-incident-report', 'fn-telehealth-transport', 'fn-wearable-event', 'fn-bereavement-support', 'fn-skill-exchange', 'fn-legacy-vault']) {
  assert.ok(config.includes(`[functions.${fn}]\nverify_jwt = true`), `${fn} should require JWT verification`);
}

const falseJwtFns = [...config.matchAll(/\[functions\.(.+?)\]\nverify_jwt = false/g)].map((m) => m[1]).sort();
const approvedFalseJwtFns = [
  'fn-breach-incident',
  'fn-buurt-events-ingest',
  'fn-care-system-sync',
  'fn-community-events-ingest',
  'fn-compliance-register',
  'fn-daily-reminder-scheduler',
  'fn-emergency-profile',
  'fn-health-check',
  'fn-log-drain-config',
  'fn-medication-catalog-sync',
  'fn-medication-escalation',
  'fn-medication-refill',
  'fn-medmij-fhir-import',
  'fn-notification-dispatch',
  'fn-observability-alert',
  'fn-onboarding',
  'fn-release-check',
  'fn-slo-measure',
  'fn-transaction-intercept',
  'fn-vital-threshold-check',
  'fn-weekly-digest',
  'fn-bank-connect',          // Phase 4.5: Tink OAuth redirect (GET) needs verify_jwt=false; POST internally verifies JWT
  'fn-whatsapp-webhook',      // Phase 4.1: Meta webhook HMAC verification via x-hub-signature-256
].sort();
assert.deepEqual(falseJwtFns, approvedFalseJwtFns, 'verify_jwt = false should be limited to the approved public/internal surface');

const adminBearerFns = ['fn-breach-incident', 'fn-compliance-register', 'fn-log-drain-config', 'fn-observability-alert', 'fn-release-check', 'fn-slo-measure'];
for (const fn of adminBearerFns) {
  const code = readFileSync(new URL(`../../supabase/functions/${fn}/index.ts`, import.meta.url), 'utf8');
  assert.ok(code.includes('requireAdminBearer'), `${fn} should require an admin bearer token`);
}
const vendorOrInternalFns = ['fn-buurt-events-ingest', 'fn-community-events-ingest', 'fn-medmij-fhir-import'];
for (const fn of vendorOrInternalFns) {
  const code = readFileSync(new URL(`../../supabase/functions/${fn}/index.ts`, import.meta.url), 'utf8');
  assert.ok(code.includes('requireVendorSecretHeader'), `${fn} should support a vendor secret path`);
  assert.ok(code.includes('requireInternalAccess'), `${fn} should support an internal invocation path`);
}
for (const fn of approvedFalseJwtFns.filter((fn) => !['fn-emergency-profile', 'fn-transaction-intercept', 'fn-bank-connect', 'fn-whatsapp-webhook', ...adminBearerFns, ...vendorOrInternalFns].includes(fn))) {
  const code = readFileSync(new URL(`../../supabase/functions/${fn}/index.ts`, import.meta.url), 'utf8');
  assert.ok(code.includes('requireInternalAccess'), `${fn} should require the internal access guard`);
}
const txCode = readFileSync(new URL('../../supabase/functions/fn-transaction-intercept/index.ts', import.meta.url), 'utf8');
assert.ok(txCode.includes('PSD2_WEBHOOK_SECRET must be configured'), 'transaction intercept should fail closed when the vendor secret is missing');
assert.ok(txCode.includes('requireInternalAccess'), 'transaction intercept should allow explicit internal invocation only through the internal access guard');

const exportMigration = readFileSync(new URL('../../supabase/migrations/20260613000012_data_lifecycle_expansion.sql', import.meta.url), 'utf8');
for (const key of ['browser_shield_events', 'companion_memory', 'care_plans', 'driving_events', 'legacy_accounts']) {
  assert.ok(exportMigration.includes(`'${key}'`), `expanded export should include ${key}`);
}
const erasure = readFileSync(new URL('../../supabase/functions/fn-right-to-erasure/index.ts', import.meta.url), 'utf8');
for (const marker of ['browser_shield_events', 'care_plans', 'legacy_accounts', 'device_sessions', 'notification_preferences']) {
  assert.ok(erasure.includes(marker), `right-to-erasure should cover ${marker}`);
}
console.log('edge hardening static tests passed');
