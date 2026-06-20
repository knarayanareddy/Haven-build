// vNext patch — static audit of new RLS, feature flags, and edge function bodies.
// Verifies that the vnext migration lands every required table + RLS policy + flag,
// and that the new Edge Functions enforce the expected authorization patterns.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const vnextMigration = readFileSync(join(root, 'supabase/migrations/20260614000000_vnext_wellrounded_patch.sql'), 'utf8');
const securityResidueMigration = readFileSync(join(root, 'supabase/migrations/20260620000003_security_residue_hardening.sql'), 'utf8');

test('vnext: includes every required new table', () => {
  for (const table of [
    'device_health_events',
    'elder_baselines',
    'fall_events',
    'medication_ocr_reviews',
    'medication_interaction_alerts',
    'scam_coaching_sessions',
    'consent_packs',
    'consent_pack_status',
    'voice_profiles',
    'elder_voice_preferences',
    'video_call_sessions',
    'carer_handover_notes',
    'carer_handover_recipients',
    'pending_confirmations',
  ]) {
    assert.ok(new RegExp(`create table ${table}\\b`, 'i').test(vnextMigration), `Missing table ${table}`);
  }
});

test('vnext: enables + forces RLS on every new user-data table', () => {
  const tablesWithRls = [
    'device_health_events',
    'elder_baselines',
    'fall_events',
    'medication_ocr_reviews',
    'medication_interaction_alerts',
    'scam_coaching_sessions',
    'consent_pack_status',
    'voice_profiles',
    'elder_voice_preferences',
    'video_call_sessions',
    'carer_handover_notes',
    'carer_handover_recipients',
    'pending_confirmations',
  ];
  for (const table of tablesWithRls) {
    const enabled = new RegExp(`alter table ${table} enable row level security`, 'i').test(vnextMigration);
    const forced = new RegExp(`alter table ${table} force row level security`, 'i').test(vnextMigration);
    assert.ok(enabled && forced, `Missing forced RLS on ${table}`);
  }
});

test('vnext: family_can() permission gate for device_health_events family read', () => {
  assert.ok(/create policy device_health_family_read[\s\S]{0,300}public\.family_can\(.+,\s*'alerts'\)/.test(vnextMigration), 'device_health family read policy must use public.family_can(profile_id, alerts)');
});

test('vnext: fall_events elder self + family alerts + carer write', () => {
  assert.ok(/create policy fall_events_self[\s\S]{0,200}elder_id\s*=\s*auth\.uid\(\)/i.test(vnextMigration));
  assert.ok(/create policy fall_events_family_read[\s\S]{0,200}public\.family_can\(.+,\s*'alerts'\)/i.test(vnextMigration));
  assert.ok(/create policy fall_events_carer_write[\s\S]{0,300}detection_source\s*=\s*'carer'[\s\S]{0,200}public\.carer_can\(.+\)/i.test(vnextMigration));
});

test('vnext: medication_ocr_reviews family + carer', () => {
  assert.ok(/create policy ocr_reviews_family[\s\S]{0,200}public\.family_can\(.+,\s*'medications'\)/i.test(vnextMigration));
  assert.ok(/create policy ocr_reviews_carer[\s\S]{0,300}public\.carer_can\(.+\)/i.test(vnextMigration));
  assert.ok(/alter table public\.medication_ocr_reviews[\s\S]{0,120}add column if not exists deleted_at/i.test(securityResidueMigration));
  assert.ok(/create policy ocr_reviews_carer[\s\S]{0,200}public\.carer_can\(elder_id\) and deleted_at is null/i.test(securityResidueMigration));
});

test('vnext: companion_memory is still elder-only (no family access added)', () => {
  // This is checked against the original migration 0001. We re-assert by reading it.
  const m1 = readFileSync(join(root, 'supabase/migrations/20260611000001_haven_v121_production_schema.sql'), 'utf8');
  assert.ok(/create policy memory_elder_only/i.test(m1));
});

test('vnext: every required feature flag is added', () => {
  for (const flag of [
    'familiar_voice_enabled',
    'fall_detection_enabled',
    'quiet_day_enabled',
    'daily_status_digest_enabled',
    'video_calling_enabled',
    'med_ocr_review_required',
    'staged_consent_enabled',
    'device_health_monitor_enabled',
    'med_repeatback_confirmation_enabled',
    'wellness_checkin_daily_rhythm_enabled',
  ]) {
    assert.ok(new RegExp(`'${flag}'`, 'i').test(vnextMigration), `Missing flag ${flag}`);
  }
});

test('vnext: consent_packs is seeded with 6 base packs', () => {
  const matches = vnextMigration.match(/insert into consent_packs \(pack_key[\s\S]+?\);/);
  assert.ok(matches, 'Missing consent_packs seed insert');
  const seeds = matches[0].match(/\('([^']+)'/g) ?? [];
  assert.ok(seeds.length >= 6, `Expected >=6 consent pack seeds, got ${seeds.length}`);
});

test('vnext: pending_confirmations has retention cron', () => {
  assert.ok(/cron\.schedule\('purge-pending-confirmations'/.test(vnextMigration));
});

test('vnext: every required new Edge Function file exists and uses _shared/* primitives', () => {
  const required = [
    'fn-fall-event/index.ts',
    'fn-fall-escalation/index.ts',
    'fn-wellness-checkin/index.ts',
    'fn-scam-coaching/index.ts',
    'fn-medication-interactions-check/index.ts',
    'fn-medication-ocr-review/index.ts',
    'fn-device-health-monitor/index.ts',
    'fn-quiet-day-detector/index.ts',
    'fn-daily-status-digest/index.ts',
    'fn-pending-confirmation-respond/index.ts',
    'fn-voice-profile-create/index.ts',
    'fn-voice-profile-test/index.ts',
    'fn-video-call-create/index.ts',
    'fn-video-call-join-token/index.ts',
    'fn-video-call-end/index.ts',
    'fn-daily-checkin-scheduler/index.ts',
  ];
  for (const rel of required) {
    const src = readFileSync(join(root, `supabase/functions/${rel}`), 'utf8');
    assert.ok(src.length > 0, `Empty file: ${rel}`);
    assert.ok(src.includes('Deno.serve'), `${rel} must use Deno.serve`);
    assert.ok(/recordMetric|cors|json/.test(src), `${rel} must import _shared/core primitives`);
  }
});

test('vnext: internal-only functions require internal access (header x-haven-internal-key)', () => {
  const internalFns = [
    'fn-fall-escalation/index.ts',
    'fn-device-health-monitor/index.ts',
    'fn-quiet-day-detector/index.ts',
    'fn-daily-status-digest/index.ts',
    'fn-daily-checkin-scheduler/index.ts',
  ];
  for (const rel of internalFns) {
    const src = readFileSync(join(root, `supabase/functions/${rel}`), 'utf8');
    assert.ok(src.includes('requireInternalAccess'), `${rel} must require internal access`);
  }
});

test('vnext: user-scoped fall + wellness + scam-coaching + ocr-review + voice-profile functions use assertSelf or assertElderOrFamilyCan', () => {
  const userFns = [
    ['fn-fall-event/index.ts', /assertSelf|assertCarerCan/],
    ['fn-wellness-checkin/index.ts', /assertSelf/],
    ['fn-scam-coaching/index.ts', /assertSelf/],
    ['fn-medication-ocr-review/index.ts', /assertActorMatches|assertElderOrFamilyCan|assertSelf/],
    ['fn-voice-profile-create/index.ts', /assertSelf/],
    ['fn-voice-profile-test/index.ts', /getJwtUserId/],
    ['fn-video-call-create/index.ts', /assertElderOrFamilyCan/],
    ['fn-video-call-join-token/index.ts', /assertElderOrFamilyCan/],
    ['fn-video-call-end/index.ts', /assertElderOrFamilyCan/],
    ['fn-medication-interactions-check/index.ts', /assertSelf/],
  ];
  for (const [rel, rx] of userFns) {
    const src = readFileSync(join(root, `supabase/functions/${rel}`), 'utf8');
    assert.ok(rx.test(src), `${rel} must include authz assertion`);
  }
});

test('vnext: voice pipeline patched for repeat-back confirmation', () => {
  const src = readFileSync(join(root, 'supabase/functions/fn-voice-pipeline/index.ts'), 'utf8');
  assert.ok(src.includes('isRepeatBackEnabled'), 'voice pipeline must read repeat-back flag');
  assert.ok(src.includes('AWAIT_REPEAT_BACK'), 'voice pipeline must support AWAIT_REPEAT_BACK action');
  assert.ok(src.includes('selectVoiceConfig'), 'voice pipeline must select Familiar Voice profile');
  assert.ok(src.includes('pending_confirmations'), 'voice pipeline must write pending_confirmations on intake');
});

test('vnext: medication OCR patched to require review when flag is on', () => {
  const src = readFileSync(join(root, 'supabase/functions/fn-medication-ocr/index.ts'), 'utf8');
  assert.ok(src.includes('med_ocr_review_required'), 'OCR must respect the review-required flag');
  assert.ok(src.includes('medication_ocr_reviews'), 'OCR must write medication_ocr_reviews row when flag on');
});

test('vnext: device session patched to accept telemetry and write device_health_events', () => {
  const src = readFileSync(join(root, 'supabase/functions/fn-device-session/index.ts'), 'utf8');
  assert.ok(src.includes('device_health_events'), 'device session must write device_health_events on telemetry issues');
  assert.ok(src.includes('device_health_status'), 'device session must return device_health_status');
});

test('vnext: dispatch notification writes device_health_events on token invalid', () => {
  const src = readFileSync(join(root, 'supabase/functions/_shared/core.ts'), 'utf8');
  assert.ok(src.includes('DeviceNotRegistered'), 'dispatchNotification must handle DeviceNotRegistered');
  assert.ok(src.includes('device_health_events'), 'dispatchNotification must write device_health_events');
});

test('vnext: fn-carer-handover-note enforces carer authorization + bsn rejection', () => {
  const src = readFileSync(join(root, 'supabase/functions/fn-carer-handover-note/index.ts'), 'utf8');
  assert.ok(src.includes('assertCarerCan'), 'handover note must require assertCarerCan');
  assert.ok(src.includes('assertNoBsnText'), 'handover note must reject BSN-like text');
  assert.ok(src.includes('carer_handover_notes'), 'handover note must write to carer_handover_notes table');
  assert.ok(src.includes('carer_handover_recipients'), 'handover note must write recipients');
  assert.ok(src.includes('family_recipient_ids'), 'handover note must accept family_recipient_ids');
});

test('vnext follow-up #1: fn-consent-pack-list returns pending packs to the elder', () => {
  const src = readFileSync(join(root, 'supabase/functions/fn-consent-pack-list/index.ts'), 'utf8');
  assert.ok(src.includes('consent_packs'), 'list must read consent_packs');
  assert.ok(src.includes('consent_pack_status'), 'list must read consent_pack_status');
  assert.ok(src.includes('assertSelf'), 'list must enforce elder self');
  assert.ok(src.includes('pending_packs'), 'list must return pending_packs');
});

test('vnext follow-up #1: fn-consent-pack-decide writes status + consent_records audit', () => {
  const src = readFileSync(join(root, 'supabase/functions/fn-consent-pack-decide/index.ts'), 'utf8');
  assert.ok(src.includes('assertSelf'), 'decide must enforce elder self');
  assert.ok(src.includes('accepted|declined|deferred') || src.includes('"accepted","declined","deferred"') || /accepted.*declined.*deferred/i.test(src), 'decide must validate decision');
  assert.ok(src.includes('consent_pack_status'), 'decide must write consent_pack_status');
  assert.ok(src.includes('consent_records'), 'decide must audit declined decisions to consent_records');
  assert.ok(src.includes('withIdempotency'), 'decide must be idempotent');
});

test('vnext follow-up #3: fn-voice-profile-revoke sets status=revoked + severs elder_voice_preferences + audit', () => {
  const src = readFileSync(join(root, 'supabase/functions/fn-voice-profile-revoke/index.ts'), 'utf8');
  assert.ok(src.includes('assertSelf'), 'revoke must enforce owner self');
  assert.ok(src.includes('voice_profile_id'), 'revoke must take voice_profile_id');
  assert.ok(src.includes('"revoked"'), 'revoke must set status=revoked');
  assert.ok(src.includes('elder_voice_preferences'), 'revoke must sever elder_voice_preferences');
  assert.ok(src.includes('audit_log'), 'revoke must write audit_log row');
  assert.ok(src.includes('withIdempotency'), 'revoke must be idempotent');
});

test('vnext follow-up #1+3: elder ScreenRegistry includes ONBOARDING + INCOMING_CALL', () => {
  const src = readFileSync(join(root, 'packages/schema/src/screenSchema.ts'), 'utf8');
  assert.ok(src.includes("'ONBOARDING'"), 'ScreenId must include ONBOARDING');
  assert.ok(src.includes("'INCOMING_CALL'"), 'ScreenId must include INCOMING_CALL');
  assert.ok(/screenId:\s*'ONBOARDING'[\s\S]+?depthFromHome:\s*0/.test(src), 'ONBOARDING must be depthFromHome=0');
  assert.ok(/screenId:\s*'INCOMING_CALL'[\s\S]+?maxPrimaryItems:\s*1/.test(src), 'INCOMING_CALL must be 1 primary item (constitution)');
});

test('vnext: total edge function count is at least 70', () => {
  const fnDir = join(root, 'supabase/functions');
  const functions = readdirSync(fnDir).filter((name) => name.startsWith('fn-'));
  assert.ok(functions.length >= 75, `Expected >=65 Edge Functions, got ${functions.length}`);
});
