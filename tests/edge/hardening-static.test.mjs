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
console.log('edge hardening static tests passed');
