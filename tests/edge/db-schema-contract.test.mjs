// Schema contract for the medical core.
//
// Consolidated from six suites that asserted on migration *text*
// (`vnext-rls-audit`, `rls-erased-profile-visibility`, `soft-purge-completeness`,
// `fk-cascade-integrity`, `postgis-retention`, `transaction-intercept`,
// `rls-pool-saturation`, `s3-lifecycle`). Those greps could not see a redefinition:
// `fix_fk_cascade_integrity` converted seven constraints to RESTRICT and the suite
// passed, while every clinical table still cascaded from `profiles` — see the
// "clinical records survive a hard delete" test below.
//
// Everything here is asked of `sql-model.mjs`, which replays the 46 migrations in
// order, so the answer is the schema that ships, not the schema of the file the
// assertion was written against.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildModel } from './support/sql-model.mjs';
import { parseFile } from './support/ast-model.mjs';
import { transpileModuleFile } from './support/shared-loader.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const model = buildModel();

const VNEXT_TABLES = [
  'device_health_events', 'elder_baselines', 'fall_events', 'medication_ocr_reviews',
  'medication_interaction_alerts', 'scam_coaching_sessions', 'consent_packs',
  'consent_pack_status', 'voice_profiles', 'elder_voice_preferences',
  'video_call_sessions', 'carer_handover_notes', 'carer_handover_recipients',
  'pending_confirmations',
];

/** The SET clause of the UPDATE this function runs against `table`. */
function setClauseFor(body, table) {
  const statements = [...body.matchAll(new RegExp(`UPDATE\\s+(?:public\\.)?${table}\\s+SET([\\s\\S]*?)(?=;)`, 'gi'))];
  return statements.map((match) => match[1]).join('\n');
}

test('every vnext table exists with RLS enabled and forced', () => {
  for (const name of VNEXT_TABLES) {
    const table = model.table(name);
    assert.ok(table, `${name} must exist`);
    assert.equal(table.rlsEnabled, true, `${name} must enable RLS`);
    assert.equal(table.forceRls, true, `${name} must force RLS, or the table owner bypasses it`);
  }
});

test('family and carer reads are gated on the right consent permission', () => {
  const gate = (table, permission) => {
    const policies = model.policiesFor(table, 'SELECT').filter((p) => /family_can\(/i.test(p.using ?? ''));
    assert.ok(policies.length > 0, `${table} needs a family_can() SELECT policy`);
    assert.ok(policies.some((p) => p.using.includes(`'${permission}'`)),
      `${table} family read must require the '${permission}' permission, saw ${policies.map((p) => p.using)}`);
  };
  gate('device_health_events', 'alerts');
  gate('fall_events', 'alerts');
  gate('medication_ocr_reviews', 'medications');

  const carer = model.policiesFor('carer_handover_notes').filter((p) => /carer_can\(/i.test(p.using ?? p.withCheck ?? ''));
  assert.ok(carer.length > 0, 'carers must reach handover notes through carer_can()');
  assert.ok(carer.every((p) => /deleted_at is null/i.test(p.using ?? '')),
    'a soft-deleted handover note must drop out of every carer policy');
});

test('companion memory stays elder-only', () => {
  const policies = model.policiesFor('companion_memory');
  assert.ok(policies.length > 0, 'companion_memory must be protected');
  assert.equal(policies.some((p) => /family_can|carer_can/i.test(`${p.using ?? ''} ${p.withCheck ?? ''}`)),
    false, 'companion memory is the elder private space and must not gain family access');
});

test('an erased profile is invisible to the application', () => {
  const policies = model.policiesFor('profiles', 'SELECT');
  const guarded = policies.filter((p) => /status/.test(p.using ?? ''));
  assert.ok(guarded.length > 0, 'the runtime profiles policy must filter on status');
  assert.ok(guarded.some((p) => /status\s*=\s*'active'/.test(p.using)),
    'only active profiles may be read by ordinary users');
  // The only escape hatch is the service role, which is not a user session.
  for (const policy of guarded) {
    const elevated = /auth\.role\(\)|service_role|is_haven_admin/i.test(policy.using);
    assert.ok(elevated || /id\s*=\s*auth\.uid\(\)/.test(policy.using),
      `policy ${policy.name} hides erased profiles from their owner too: ${policy.using}`);
  }
});

test('clinical records survive a hard delete of the parent profile', () => {
  // WGBO keeps the medical record for 20 years. `profiles` is only ever tombstoned
  // by soft_purge_profile(), but `auth.users → profiles` is ON DELETE CASCADE, so an
  // admin removing a login would otherwise take the MAR and the fall history with it.
  for (const name of ['fall_events', 'medication_reminders', 'vital_signs', 'incidents',
    'carer_handover_notes', 'voice_interactions']) {
    const toProfile = model.references(name).filter((fk) => fk.references === 'profiles');
    assert.ok(toProfile.length > 0, `${name} must reference profiles`);
    for (const fk of toProfile) {
      assert.equal(fk.onDelete, 'RESTRICT',
        `${name}.${fk.column} must RESTRICT, not ${fk.onDelete}: a hard delete would erase the record`);
    }
  }

  const setNull = model.foreignKeys
    .filter((fk) => fk.onDelete === 'SET NULL')
    .filter((fk) => ['fall_events', 'medication_reminders', 'vital_signs', 'incidents'].includes(fk.table))
    .map((fk) => `${fk.table}.${fk.column}`);
  assert.deepEqual(setNull.filter((entry) => /medication|device_session/.test(entry)), [],
    `a nulled clinical link severs the audit trail: ${setNull.join(', ')}`);
});

test('audit_log is append-only even for the service role', () => {
  const events = model.rulesFor('audit_log').map((rule) => rule.event).sort();
  assert.deepEqual(events, ['DELETE', 'UPDATE']);

  const trigger = model.triggersFor('audit_log').find((t) => t.name === 'trg_audit_log_immutable');
  assert.ok(trigger, 'audit_log needs a row-level immutability trigger as well as the rules');
  assert.equal(trigger.always, true, 'the trigger must be ENABLE ALWAYS, or a role can disable it');

  const truncate = (model.table('audit_log').revokes ?? [])
    .filter((entry) => entry.privileges.includes('TRUNCATE'));
  for (const role of ['public', 'service_role']) {
    assert.ok(truncate.some((entry) => entry.roles.includes(role)), `TRUNCATE must be revoked from ${role}`);
  }
});

test('an erasure wipes every registered PII column and keeps the measurements', () => {
  const body = model.fn('soft_purge_profile').body;
  const pii = [
    ['profiles', 'full_name'],
    ['carer_handover_notes', 'notes_nl'],
    ['life_stories', 'transcript_nl'],
    ['companion_memory', 'content_nl'],
    ['companion_memory', 'embedding'],
    ['financial_transactions', 'description'],
    ['medication_ocr_reviews', 'notes'],
    ['scam_coaching_sessions', 'assistant_summary_nl'],
    ['voice_interactions', 'transcript_nl'],
    ['vital_signs', 'context_notes_nl'],
    ['documents', 'label_nl'],
  ];
  for (const [table, column] of pii) {
    const setClause = setClauseFor(body, table);
    assert.ok(setClause.length > 0, `the erasure must touch ${table}`);
    assert.match(setClause, new RegExp(`\\b${column}\\s*=`), `${table}.${column} is PII and must be overwritten`);
  }

  // WGBO: the clinical measurement survives, the free text around it does not.
  const vitals = setClauseFor(body, 'vital_signs');
  assert.doesNotMatch(vitals, /\bvalue\s*=|\bunit\s*=|\brecorded_at\s*=/,
    'vital sign values must survive the erasure');
  assert.match(body, /embedding\s*=\s*NULL/i, 'the pgvector embedding must be destroyed, not just the text');
});

test('geospatial history is partitioned and dropped, not deleted row by row', () => {
  const partitioned = model.table('location_events_partitioned');
  assert.ok(partitioned, 'location history must live in a partitioned table');

  const retention = model.fn('execute_postgis_partition_retention');
  assert.ok(retention, 'the partition retention function must exist');
  assert.match(retention.body, /EXECUTE\s+format\(/i, 'partitions must be created and dropped dynamically');
  assert.match(retention.body, /DROP TABLE IF EXISTS/i, 'retention must drop whole partitions');
  // The window is expressed as `now()::DATE - 90` against the partition suffix.
  assert.match(retention.body, /-\s*90\b/, 'the statutory window is 90 days');

  const geo = model.fn('get_recent_emergency_locations');
  assert.ok(geo, 'the emergency lookup must exist');
  assert.match(geo.body, /ST_DWithin\(/i, 'the radius filter must use the PostGIS index operator');
});

test('a stalled bank intercept is detectable', () => {
  assert.ok(model.columns('financial_transactions').includes('intercept_status'),
    'transactions need an intercept status column');
  const monitor = model.fn('check_stale_processing_transactions');
  assert.ok(monitor, 'a monitor must exist for rows stuck in processing');
  assert.match(monitor.body, /processing/i, 'the monitor must select rows left in processing');
  assert.match(monitor.body, /INTERVAL/i, 'the monitor must use a staleness window');
});

test('the batched read RPCs exist and are service-role only', () => {
  for (const name of ['get_elder_screen_data_batch', 'compute_daily_status_digests_batch',
    'compute_weekly_safety_digests_batch', 'get_stale_device_sessions_batch']) {
    assert.ok(model.fn(name), `${name}() must exist`);
    assert.deepEqual(model.executorsOf(name), ['service_role'], `${name}() must not be client-callable`);
  }
});

test('the S3 lifecycle rule matches the prefix the escalation actually uploads to', async () => {
  const lifecycle = (await import(
    new URL('../../supabase/tts_cache_s3_lifecycle.json', import.meta.url),
    { with: { type: 'json' } }
  )).default;
  const rule = lifecycle.Rules.find((entry) => entry.Status === 'Enabled' && entry.Expiration);
  assert.ok(rule, 'an enabled expiry rule must exist');
  assert.equal(rule.Expiration.Days, 1, 'precise location blobs must expire within a day');

  const escalation = parseFile(`${ROOT}supabase/functions/fn-fall-escalation/index.ts`);
  const uploads = escalation.code.match(/`([a-z-]+\/)\$\{/);
  assert.ok(uploads, 'the escalation must upload under a dynamic prefix');
  assert.equal(rule.Filter.Prefix, uploads[1],
    `the lifecycle prefix (${rule.Filter.Prefix}) must match the upload prefix (${uploads[1]})`);
  assert.ok(escalation.hasString('tts-cache'), 'the upload must target the tts-cache bucket');
});

test('every production screen is declared, and the emergency surface is not optional', async () => {
  // Was packages/schema/src/screenSchema.ts counted by `/screenId: '/` regex. Importing
  // the array instead means a screen that is commented out, or a schema whose only
  // emergency button sits behind a flag, fails here.
  const modulePath = await transpileModuleFile(`${ROOT}packages/schema/src/screenSchema.ts`);
  const { productionScreens } = await import(modulePath);

  assert.ok(Array.isArray(productionScreens), 'the schema must export an array of screens');
  assert.ok(productionScreens.length >= 10, `expected the full screen set, saw ${productionScreens.length}`);

  const ids = productionScreens.map((screen) => screen.screenId);
  assert.equal(new Set(ids).size, ids.length, 'screen ids must be unique');

  for (const screen of productionScreens) {
    assert.ok(screen.titleNl && screen.titleEn, `${screen.screenId} needs both locales`);
    assert.ok(screen.helpTextNl && screen.helpTextEn, `${screen.screenId} needs bilingual help text`);
    assert.ok(screen.voiceFallbackNl && screen.voiceFallbackEn, `${screen.screenId} needs a voice fallback`);
    // 0 means "never serve this from cache" — correct for the live call screen and
    // for the scam shield, whose verdict must never be a stale cached one.
    assert.equal(typeof screen.offlineCacheTtlSeconds, 'number', `${screen.screenId} needs a cache policy`);
    assert.ok(screen.offlineCacheTtlSeconds >= 0 && screen.offlineCacheTtlSeconds <= 86400,
      `${screen.screenId} has an implausible cache TTL: ${screen.offlineCacheTtlSeconds}`);
    assert.ok(screen.maxPrimaryItems >= 1, `${screen.screenId} must expose at least one primary action`);
  }

  // The elder can always reach help, from any screen.
  const withEmergency = productionScreens.filter((screen) => screen.emergencyButton === true);
  assert.ok(withEmergency.length >= productionScreens.length - 1,
    `only ${withEmergency.length}/${productionScreens.length} screens expose the emergency button`);
  assert.ok(productionScreens.some((screen) => screen.screenId === 'WACHT'),
    'the waiting screen must stay reachable');

  assert.ok(productionScreens.filter((screen) => screen.offlineCacheTtlSeconds > 0).length >= 10,
    'the app must stay usable offline');

  const copy = productionScreens.flatMap((screen) => [screen.helpTextNl, screen.helpTextEn, ...screen.bottomActions.flatMap((a) => [a.labelNl, a.labelEn])]);
  assert.equal(copy.some((line) => /Ik ben een echte medewerker/i.test(line)), false,
    'the interface must never claim the voice assistant is a human carer');
});
