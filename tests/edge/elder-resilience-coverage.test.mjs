import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyNetworkError,
  resilientCall,
  retryDelay,
} from '../../apps/elder/src/state/networkResilience.ts';
import { OfflineActionQueue } from '../../apps/elder/src/services/offlineQueue.ts';
import {
  medicationNotificationCopy,
  shouldSuppressForQuietHours,
} from '../../apps/elder/src/services/notifications.ts';
import { withRetry } from '../../supabase/functions/_shared/retry.ts';
import { assertContrastTokenPair, touch } from '../../packages/ui/src/tokens.ts';
import { t as translateCopy } from '../../packages/i18n/src/copy.ts';

test('elder network resilience retry policy and classification', async () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    assert.equal(retryDelay(1, { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 500 }), 100);
    assert.equal(retryDelay(4, { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 500 }), 500);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(classifyNetworkError(new Error('Network request failed')), 'offline');
  assert.equal(classifyNetworkError(new Error('HTTP 503 timeout')), 'degraded');
  assert.equal(classifyNetworkError(new Error('validation error')), 'online');

  let attempts = 0;
  const result = await resilientCall(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('transient network failure');
    return 'ok';
  }, { maxAttempts: 4, baseDelayMs: 0, maxDelayMs: 0 });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('elder offline queue preserves retries and completes flushed actions', async () => {
  const queue = new OfflineActionQueue();
  const first = queue.enqueue('WELLNESS_CHECKIN', { mood: 4 });
  const second = queue.enqueue('CONFIRM_MEDICATION', { medication_id: 'med-1' });

  assert.equal(queue.list().length, 2);
  assert.equal(queue.list()[0].status, 'queued');

  queue.markRetry(first.idempotencyKey);
  assert.equal(queue.list().find((item) => item.idempotencyKey === first.idempotencyKey)?.retryCount, 1);

  await queue.flush(async (action) => {
    if (action.idempotencyKey === first.idempotencyKey) throw new Error('still offline');
  });

  const remaining = queue.list();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].idempotencyKey, first.idempotencyKey);
  assert.equal(remaining[0].retryCount, 2);
  assert.equal(remaining.some((item) => item.idempotencyKey === second.idempotencyKey), false);
});

test('elder notification copy and quiet-hour suppression boundaries', () => {
  const nl = medicationNotificationCopy({
    reminderId: 'reminder-1',
    medicationName: 'Metformine',
    scheduledAt: '2026-06-20T08:00:00Z',
    locale: 'nl-NL',
  });
  assert.equal(nl.title, 'Medicijntijd 💊');
  assert.equal(nl.data.reminder_id, 'reminder-1');

  assert.equal(shouldSuppressForQuietHours(new Date('2026-06-20T21:30:00'), '22:00', '07:00'), false);
  assert.equal(shouldSuppressForQuietHours(new Date('2026-06-20T23:30:00'), '22:00', '07:00'), true);
  assert.equal(shouldSuppressForQuietHours(new Date('2026-06-20T06:30:00'), '22:00', '07:00'), true);
  assert.equal(shouldSuppressForQuietHours(new Date('2026-06-20T12:00:00'), '09:00', '17:00'), true);
});

test('shared retry helper retries exactly until success or exhaustion', async () => {
  let attempts = 0;
  const value = await withRetry(async () => {
    attempts += 1;
    if (attempts < 2) throw new Error('temporary');
    return 42;
  }, { attempts: 3, baseDelayMs: 0 });
  assert.equal(value, 42);
  assert.equal(attempts, 2);

  let failedAttempts = 0;
  await assert.rejects(
    () => withRetry(async () => {
      failedAttempts += 1;
      throw new Error('permanent');
    }, { attempts: 2, baseDelayMs: 0 }),
    /permanent/
  );
  assert.equal(failedAttempts, 2);
});

test('i18n and UI token invariants stay safe for elder surfaces', () => {
  assert.equal(translateCopy('nl-NL', 'medicationTaken'), 'Goed gedaan. Ik heb het genoteerd.');
  assert.equal(translateCopy('en-GB', 'medicationTaken'), 'Well done. I recorded it.');
  assert.equal(touch.minimum >= 44, true);
  assert.equal(assertContrastTokenPair('#1A1F2E', '#FFFFFF'), true);
  assert.throws(() => assertContrastTokenPair('ink', '#FFFFFF'), /hex/);
});
