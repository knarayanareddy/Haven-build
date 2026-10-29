// Unit tests for supabase/functions/_shared/idempotency.ts
//
// Two live bugs motivated this suite:
//   1. `.insert(values).onConflict('key_hash').ignore()` — neither method exists;
//      the request threw TypeError before its handler ran.
//   2. The request-hash comparison ran AFTER the "already completed" branch, so a
//      key reused with a different body replayed the first request's response.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDenoShim, linkSharedModules } from './support/shared-loader.mjs';

installDenoShim();
const sharedDir = await linkSharedModules();
const { classifyExisting, CLAIM_TTL_MS } = await import(`${sharedDir}/idempotency.mjs`);

const HASH_A = 'hash-a';
const HASH_B = 'hash-b';
const T0 = Date.parse('2026-10-29T10:00:00Z');

function row(overrides = {}) {
  return {
    status: 'claimed',
    request_hash: HASH_A,
    claimed_at: new Date(T0).toISOString(),
    completed_at: null,
    status_code: null,
    response_body: null,
    error_message: null,
    ...overrides,
  };
}

test('a completed key replays the stored response', () => {
  const decision = classifyExisting(
    row({ status: 'completed', completed_at: new Date(T0 + 1000).toISOString(), status_code: 201, response_body: { ok: true } }),
    HASH_A,
    T0 + 5000,
  );
  assert.equal(decision.action, 'replay');
  assert.equal(decision.status, 201);
  assert.deepEqual(decision.body, { ok: true });
});

test('a reused key with a different body is rejected, never replayed', () => {
  const decision = classifyExisting(
    row({ status: 'completed', completed_at: new Date(T0 + 1000).toISOString(), status_code: 201, response_body: { secret: 'first request' } }),
    HASH_B,
    T0 + 5000,
  );
  assert.equal(decision.action, 'conflict');
  assert.equal(decision.reason, 'body-mismatch');
});

test('a live claim makes the second request wait', () => {
  assert.equal(classifyExisting(row(), HASH_A, T0 + 1_000).action, 'wait');
});

test('a claim older than the TTL may be taken over', () => {
  assert.equal(classifyExisting(row(), HASH_A, T0 + CLAIM_TTL_MS + 1).action, 'execute');
});

test('a claim exactly at the TTL boundary is still live', () => {
  assert.equal(classifyExisting(row(), HASH_A, T0 + CLAIM_TTL_MS).action, 'wait');
});

test('the claim TTL is long enough for slow handlers', () => {
  // fn-voice-pipeline and the LLM scoring functions regularly exceed 30s; the
  // previous 30s TTL let a second request take over a live claim and double-run.
  assert.ok(CLAIM_TTL_MS >= 120_000, `claim TTL too short for slow handlers: ${CLAIM_TTL_MS}ms`);
});

test('an errored key is not replayed and asks for a new key', () => {
  const decision = classifyExisting(
    row({ status: 'errored', error_message: 'upstream 502' }),
    HASH_A,
    T0 + 1000,
  );
  assert.equal(decision.action, 'conflict');
  assert.equal(decision.reason, 'previously-errored');
  assert.match(decision.message, /upstream 502/);
});

test('an unknown state fails closed', () => {
  assert.equal(classifyExisting(row({ status: 'weird' }), HASH_A, T0).action, 'conflict');
  assert.equal(classifyExisting(null, HASH_A, T0).action, 'conflict');
});

test('a claim with a corrupt timestamp is treated as takeable rather than replaying', () => {
  assert.equal(classifyExisting(row({ claimed_at: 'not-a-date' }), HASH_A, T0).action, 'execute');
});
