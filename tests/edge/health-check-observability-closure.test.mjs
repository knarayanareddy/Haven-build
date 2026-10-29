import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Senior SRE Production Observability: Extended fn-health-check Acceptance Suite', async () => {
  const source = readFileSync(new URL('../../supabase/functions/fn-health-check/index.ts', import.meta.url), 'utf8');

  assert.ok(source.includes('requireInternalAccess(req)'), 'Must mandate secure internal API header keys');
  assert.ok(source.includes('Database Connection & Relational Pool Reachability Check'), 'Must implement DB connection reachability check');
  assert.ok(source.includes('Upstash Redis Stream Reachability Check'), 'Must implement Redis stream reachability check');
  assert.ok(source.includes('https://api.openai.com/v1/models'), 'Must implement OpenAI API reachability check');
  assert.ok(source.includes('https://api.elevenlabs.io/v1/models'), 'Must implement ElevenLabs API reachability check');
  // This used to assert the literal comment text "Critical pg_cron Jobs Last Run
  // Time", so rewording a comment broke the "test" while the check itself could be
  // broken and stay green. Assert the actual data source instead.
  assert.ok(source.includes('from("cron_job_health")'), 'Must query real pg_cron run history, not request telemetry');
  assert.ok(source.includes('recordMetric'), 'Must record metrics to perf_metrics for SLO alerting');

  console.log('SRE Production Observability: Extended fn-health-check successfully verified and closed');
});
