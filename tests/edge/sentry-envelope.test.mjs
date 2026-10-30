// Tests for supabase/functions/_shared/sentry.ts
//
// The previous implementation POSTed a bare `{message}` JSON body to the DSN
// itself (https://key@host/project-id). Sentry answers that with 405, so error
// reporting was silently dead even with a correct SENTRY_DSN. It also dropped the
// stacktrace, release and environment.
//
// These tests pin the envelope format and the DSN handling without any network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDenoShim, linkSharedModules } from './support/shared-loader.mjs';

installDenoShim({ SENTRY_DSN: 'https://abc123@sentry.example.org/42', HAVEN_ENVIRONMENT: 'staging', HAVEN_RELEASE: 'haven@1.2.3' });
const sharedDir = await linkSharedModules();
const sentry = await import(`${sharedDir}/sentry.mjs`);

test('a SaaS DSN maps to the envelope endpoint', () => {
  const config = sentry.parseDsn('https://0123456789abcdef@o1.ingest.us.sentry.io/4505');
  assert.equal(config.endpoint, 'https://o1.ingest.us.sentry.io/api/4505/envelope/');
  assert.equal(config.publicKey, '0123456789abcdef');
  assert.equal(config.projectId, '4505');
});

test('a self-hosted DSN maps to the envelope endpoint', () => {
  const config = sentry.parseDsn('https://deadbeef@sentry.haven.internal/7');
  assert.equal(config.endpoint, 'https://sentry.haven.internal/api/7/envelope/');
});

test('malformed or unsafe DSNs are refused', () => {
  for (const dsn of [
    'http://key@example.org/1', // not https
    'https://example.org/1', // no public key
    'https://key@example.org/not-a-project',
    'https://key@localhost/1',
    'not a url',
    '',
    null,
  ]) {
    assert.equal(sentry.parseDsn(dsn), null, `must refuse ${String(dsn)}`);
  }
});

test('the envelope carries the exception, stacktrace, release and environment', () => {
  const error = new Error('boom');
  const { event } = sentry.buildEnvelope(error, { fn: 'fn-test', error_code: 'INTERNAL' });
  assert.equal(event.exception.values[0].type, 'Error');
  assert.equal(event.exception.values[0].value, 'boom');
  assert.ok(event.exception.values[0].stacktrace.frames.length > 1);
  assert.equal(event.environment, 'staging');
  assert.equal(event.release, 'haven@1.2.3');
  assert.equal(event.tags.function, 'fn-test');
});

test('non-Error throwables still produce a valid event', () => {
  const { event } = sentry.buildEnvelope('string thrown', { fn: 'fn-test' });
  assert.equal(event.exception.values[0].type, 'NonError');
  assert.match(event.exception.values[0].value, /string thrown/);
});

test('PII is scrubbed from the event context', () => {
  const { event } = sentry.buildEnvelope(new Error('boom'), {
    fn: 'fn-test',
    email: 'someone@example.org',
    phone: '+31612345678',
    bsn: '123456782',
    transcript: 'my secret words',
    nested: { token: 'abc', safe: 'visible' },
  });
  assert.equal(event.extra.email, '[redacted]');
  assert.equal(event.extra.phone, '[redacted]');
  assert.equal(event.extra.bsn, '[redacted]');
  assert.equal(event.extra.transcript, '[redacted]');
  assert.equal(event.extra.nested.token, '[redacted]');
  assert.equal(event.extra.nested.safe, 'visible');
});

test('captureException is a no-op when the DSN is absent and never throws', async () => {
  installDenoShim({}); // no SENTRY_DSN
  await sentry.captureException(new Error('ignored'), { fn: 'fn-test' });
  // With a DSN but an unreachable host it must still resolve, not reject.
  installDenoShim({ SENTRY_DSN: 'https://abc123@127.0.0.1/42' });
  await assert.doesNotReject(() => sentry.captureException(new Error('offline'), { fn: 'fn-test' }));
});
