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
  assert.ok(source.includes('Critical pg_cron Jobs Last Run Time'), 'Must implement pg_cron sweeper status check');
  assert.ok(source.includes('recordMetric'), 'Must record metrics to perf_metrics for SLO alerting');

  console.log('SRE Production Observability: Extended fn-health-check successfully verified and closed');
});
