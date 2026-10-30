// Behavioural tests for _shared/core.ts's dispatchNotification().
//
// Replaces tests/edge/medium-fixes-c1c4-closure.test.mjs, which covered four unrelated
// fixes in one file: the supabase-js pin (asserted as a string), per-recipient WhatsApp
// fallback isolation (a simulated dispatcher), a POA export check, and Redis XACK
// ordering in the banking ingress. The export check is now covered by
// fn-data-export-behaviour.test.mjs against the real handler. The pin is asserted here
// against the parsed import specifier. The fallback isolation is driven for real.
//
// Why it matters: dispatchNotification is the single path by which an emergency reaches
// a family member. A failure for one recipient must not decide anything for the next
// one, and the fallback must not fire for someone whose push actually worked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMockDb, loadSharedModule } from './support/edge-function-harness.mjs';

const { dispatchNotification } = await loadSharedModule('core', {
  env: { SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 'k' },
});

const OK_RECIPIENT = 'aaaaaaaa-1111-4111-8111-111111111111';
const BAD_RECIPIENT = 'bbbbbbbb-2222-4222-8222-222222222222';
const ELDER = 'cccccccc-3333-4333-8333-333333333333';

function seed({ preferences = [] } = {}) {
  return createMockDb({
    tables: {
      profiles: [
        { id: OK_RECIPIENT, locale: 'nl-NL' },
        { id: BAD_RECIPIENT, locale: 'nl-NL' },
      ],
      notification_templates: [],
      notifications: [],
      push_tokens: [
        { profile_id: OK_RECIPIENT, token: 'push-ok', is_active: true },
        { profile_id: BAD_RECIPIENT, token: 'push-bad', is_active: true },
      ],
      device_health_events: [],
      notification_preferences: preferences,
      audit_log: [],
      perf_metrics: [],
    },
  });
}

/** The push provider accepts one token and rejects the other. */
function provider({ reject = 'push-bad', status = 410 } = {}) {
  const sent = [];
  const impl = (url, init) => {
    sent.push({ url, init });
    if (url.includes('exp.host')) {
      const payload = JSON.parse(init.body);
      if (payload[0]?.to === reject) {
        return new Response(JSON.stringify({ error: 'DeviceNotRegistered' }), { status });
      }
      return new Response(JSON.stringify({ data: [{ status: 'ok' }] }), { status: 200 });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { impl, sent };
}

async function withFetch(impl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = (...args) => Promise.resolve(impl(...args));
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

const crisis = (recipientId) => ({
  recipient_id: recipientId,
  elder_id: ELDER,
  notification_type: 'crisis_gedetecteerd',
  title_nl: 'Mogelijke Val',
  body_nl: 'Er is een val gedetecteerd.',
  data: { fall_event_id: 'fall-1' },
});

test('a delivered notification records sent_at and no error', async () => {
  const db = seed();
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  const { impl, sent } = provider();

  await withFetch(impl, () => dispatchNotification(crisis(OK_RECIPIENT)));

  const note = db.store.notifications[0];
  assert.ok(note.sent_at, 'a delivered notification must be stamped');
  assert.equal(note.send_error ?? null, null);
  assert.equal(sent.filter((entry) => entry.url.includes('exp.host')).length, 1);
});

test('a rejected push records why, and reaches WhatsApp for that recipient only', async () => {
  const db = seed();
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  const { impl, sent } = provider({ reject: 'push-bad' });

  await withFetch(impl, async () => {
    // Healthy recipient first, then the failing one. The order matters: if the failing
    // one's fallback leaked into shared state, the healthy path would change too.
    await dispatchNotification(crisis(OK_RECIPIENT));
    await dispatchNotification(crisis(BAD_RECIPIENT)).catch(() => undefined);
  });

  const [okNote, badNote] = db.store.notifications;
  assert.equal(okNote.send_error ?? null, null, 'the healthy recipient must not be marked failed');
  assert.ok(badNote.send_error, 'the rejected recipient must record the provider error');

  const fallbacks = db.store.audit_log.filter((row) => row.action === 'WHATSAPP_FALLBACK_DISPATCH');
  assert.equal(fallbacks.length, 1, 'exactly one fallback must be attempted');
  assert.equal(fallbacks[0].actor_id, BAD_RECIPIENT, 'and it must be for the recipient whose push failed');

  const fallbackCalls = sent.filter((entry) => entry.url.includes('fn-whatsapp-webhook'));
  assert.equal(fallbackCalls.length, 1);
  assert.equal(JSON.parse(fallbackCalls[0].init.body).recipient_id, BAD_RECIPIENT);
});

test('a doomed device token is deactivated, a healthy one is not', async () => {
  const db = seed();
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  const { impl } = provider({ reject: 'push-bad' });

  await withFetch(impl, async () => {
    await dispatchNotification(crisis(OK_RECIPIENT));
    await dispatchNotification(crisis(BAD_RECIPIENT)).catch(() => undefined);
  });

  const tokens = Object.fromEntries(db.store.push_tokens.map((row) => [row.token, row]));
  assert.equal(tokens['push-bad'].is_active, false, 'DeviceNotRegistered means the token is gone');
  assert.equal(tokens['push-ok'].is_active, true, 'a working token must survive');
  assert.equal(db.store.device_health_events.length, 1,
    'the invalid token must produce a p1 device-health event so it is visible');
});

test('a recipient with no active token is recorded as unsent, not as a failure', async () => {
  // Nobody to push to is not an error — it is a known state, and treating it as a
  // failure would send every such notification through the WhatsApp fallback.
  const db = seed();
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  db.store.push_tokens = [];
  const { impl, sent } = provider();

  await withFetch(impl, () => dispatchNotification(crisis(OK_RECIPIENT)));

  const note = db.store.notifications[0];
  assert.equal(note.send_error, 'no_active_token');
  assert.equal(sent.filter((entry) => entry.url.includes('fn-whatsapp-webhook')).length, 0,
    'the fallback is for a failed push, not for an absent device');
});

test('a non-critical notification that fails does not invoke the WhatsApp fallback', async () => {
  const db = seed();
  globalThis.__HAVEN_SUPABASE_MOCK__ = db;
  const { impl, sent } = provider({ reject: 'push-bad' });

  await withFetch(impl, () => dispatchNotification({
    recipient_id: BAD_RECIPIENT,
    elder_id: ELDER,
    notification_type: 'systeem',
    title_nl: 'Informatie',
    body_nl: 'Er is niets aan de hand.',
  }).catch(() => undefined));

  assert.equal(sent.filter((entry) => entry.url.includes('fn-whatsapp-webhook')).length, 0);
  assert.equal(db.store.audit_log.filter((row) => row.action === 'WHATSAPP_FALLBACK_DISPATCH').length, 0);
});

test('the supabase-js import is pinned to an exact version', () => {
  // C4: a floating major ("@supabase/supabase-js@2") resolves differently over time, so
  // the same commit produces different deployed behaviour. Asserted on the import
  // specifier because that is what the runtime resolves — a lockfile does not cover the
  // Deno edge runtime.
  const source = readFileSync(new URL('../../supabase/functions/_shared/core.ts', import.meta.url), 'utf8');
  const specifiers = [...source.matchAll(/from\s+["']((?:npm:|https:\/\/esm\.sh\/)@supabase\/supabase-js[^"']*)["']/g)]
    .map((match) => match[1]);
  assert.ok(specifiers.length > 0, 'core.ts must import supabase-js');
  for (const specifier of specifiers) {
    assert.match(specifier, /@supabase\/supabase-js@\d+\.\d+\.\d+$/,
      `${specifier} must pin an exact version, not a range or a major`);
  }
});
