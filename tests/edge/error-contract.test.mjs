// Error contract tests for supabase/functions/_shared/errors.ts.
//
// Regression targets (all were live bugs in the October 2026 review):
//   1. handler.ts answered 400 for a 403 authorisation failure.
//   2. async_wrapper.ts derived the status by searching the sanitised message for
//      "400"/"403"/"422"/"429".
//   3. core.json() rewrote any response to 429 when the body text contained "429".
//   4. safeErrorMessage() translated "429 Too Many Requests … Rate limit exceeded"
//      into "Request too large" (its `limit` rule matched first).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HavenHttpError,
  errorBody,
  toHttpError,
} from '../../supabase/functions/_shared/errors.ts';

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

test('403 authorisation failures keep their status and code', () => {
  const authz = new Error('Caller abc is not allowed to act for this resource owner');
  authz.name = 'AuthzError';
  authz.status = 403;

  const http = toHttpError(authz);
  assert.equal(http.status, 403);
  assert.equal(http.code, 'FORBIDDEN');
  assert.match(http.message, /not allowed to act for this/);
});

test('an AuthzError is 403 even without an explicit status property', () => {
  const authz = new Error('No active verified older adult consent delegate credentials.');
  authz.name = 'AuthzError';
  assert.equal(toHttpError(authz).status, 403);
});

test('rate limiting is 429 with Retry-After and copy that tells the client to back off', () => {
  const breach = new Error('429 Too Many Requests: Rate limit exceeded for fn-scam-pipeline.');
  breach.name = 'RateLimitBreachError';
  breach.retryAfterSeconds = 37;

  const http = toHttpError(breach);
  assert.equal(http.status, 429);
  assert.equal(http.code, 'TOO_MANY_REQUESTS');
  assert.equal(http.retryAfterSeconds, 37);
  assert.equal(http.message, 'Too many requests');
  assert.notEqual(http.message, 'Request too large', 'the old safety filter produced this false message');
});

test('a rate limit breach without an explicit retry hint still gets a sane Retry-After', () => {
  const breach = new Error('429 Too Many Requests: Rate limit exceeded.');
  breach.name = 'RateLimitBreachError';
  const http = toHttpError(breach);
  assert.equal(http.status, 429);
  assert.equal(http.retryAfterSeconds, 60);
});

test('BSN policy rejections are 422 and keep the actionable explanation', () => {
  const bsn = new Error('422: Prohibited Dutch Citizen Service Number (BSN) detected. Storage, transmission, and processing of BSN is strictly prohibited.');
  bsn.status = 422;
  bsn.isBsnViolation = true;

  const http = toHttpError(bsn);
  assert.equal(http.status, 422);
  assert.equal(http.code, 'UNPROCESSABLE_ENTITY');
  assert.match(http.message, /BSN/);
});

test('validation failures are 400 and quote the offending field', () => {
  const http = toHttpError(new Error('Invalid request: elder_id is required; channel must be a string'));
  assert.equal(http.status, 400);
  assert.equal(http.code, 'BAD_REQUEST');
  assert.match(http.message, /elder_id is required/);
});

test('payload limits are 413', () => {
  const error = httpError('raw_content exceeds maximum length of 10000 characters', 413, 'PAYLOAD_TOO_LARGE');
  const http = toHttpError(error);
  assert.equal(http.status, 413);
  assert.equal(http.code, 'PAYLOAD_TOO_LARGE');
});

test('unknown failures are 500 and never echo internals', () => {
  const leaky = new Error('duplicate key value violates unique constraint "profiles_pkey" at Object.<anonymous>');
  const http = toHttpError(leaky);
  assert.equal(http.status, 500);
  assert.equal(http.code, 'INTERNAL');
  assert.equal(http.message, 'An unexpected error occurred');
  assert.equal(/constraint|profiles_pkey|Object/.test(http.message), false);
});

test('Postgres and SDK internals are stripped even when the error claims a 4xx status', () => {
  const error = httpError('select * from profiles where id = $1 failed: relation "profiles" does not exist', 400);
  const http = toHttpError(error);
  assert.equal(http.status, 400);
  assert.equal(http.message, 'The request could not be processed');
  assert.equal(/select \*|relation/i.test(http.message), false);
});

test('a non-error thrown value still produces a valid envelope', () => {
  assert.deepEqual(toHttpError(undefined), {
    status: 500,
    code: 'INTERNAL',
    message: 'An unexpected error occurred',
  });
  assert.deepEqual(toHttpError('boom'), {
    status: 500,
    code: 'INTERNAL',
    message: 'An unexpected error occurred',
  });
});

test('errorBody returns the client-facing envelope', () => {
  const body = errorBody(new Error('Caller is not allowed to access this older adult record'));
  assert.equal(body.error_code, 'FORBIDDEN');
  assert.equal(body.error, 'Caller is not allowed to access this older adult record');
});

test('HavenHttpError exposes a safe public message', () => {
  const explicit = new HavenHttpError('Vendor is not configured for this region', 400);
  assert.equal(explicit.publicMessage, 'Vendor is not configured for this region');

  const leaky = new HavenHttpError('socket hang up in pg_pool at async Object.connect', 500);
  assert.equal(leaky.publicMessage, 'An unexpected error occurred');
});

test('numeric "429" text inside a message does not change a successful response', async () => {
  // Guards the removed behaviour in core.ts: json() used to rewrite the status to
  // 429 whenever the serialised body contained "429".
  const { readFileSync } = await import('node:fs');
  const core = readFileSync(new URL('../../supabase/functions/_shared/core.ts', import.meta.url), 'utf8');
  const jsonFn = core.slice(core.indexOf('export function json('), core.indexOf('export function errorResponse('));
  assert.equal(/finalStatus/.test(jsonFn), false, 'json() must not compute a second status');
  assert.equal(/includes\(\s*["']429["']\s*\)/.test(jsonFn), false, 'json() must not sniff the body for "429"');
});

// ─── Status announced in the message ─────────────────────────────────────────
//
// Handlers across the repository throw `new Error("409 Conflict: …")` and
// `new Error("400: Malformed …")`. The mapper used to recognise 401/403/404/422/429 only,
// so a malformed request surfaced as a 500 and a lethal medication contraindication
// surfaced as a 500 instead of a 409 — the client could not tell "you sent something
// wrong" from "we broke", and the safety alert looked like an outage.

test('a 400 announced in the message is a 400, not a 500', () => {
  assert.equal(toHttpError(new Error('400: Malformed FHIR resources array')).status, 400);
});

test('a 409 announced in the message is a 409', () => {
  const mapped = toHttpError(new Error('409 Conflict: Lethal contraindication detected'));
  assert.equal(mapped.status, 409);
  assert.equal(mapped.code, 'CONFLICT');
});

test('every status this API uses maps from its message prefix', () => {
  const cases = [
    ['400: bad', 400], ['401 Nope', 401], ['403 Forbidden', 403], ['404: gone', 404],
    ['409 Conflict', 409], ['413 Too Large', 413], ['422 Unprocessable', 422],
    ['429 Too Many Requests', 429], ['503 Unavailable', 503],
  ];
  for (const [message, expected] of cases) {
    assert.equal(toHttpError(new Error(message)).status, expected, `${message} must be ${expected}`);
  }
});

test('a status number that is not an API status is not invented', () => {
  // "3 items failed" or "502 upstream" must not be read as the caller's status when it is
  // not one this API uses; 502 stays a server error rather than becoming a client one.
  assert.equal(toHttpError(new Error('234 things went wrong')).status, 500);
  assert.equal(toHttpError(new Error('999: nonsense')).status, 500);
});
