import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { CarerClient } from '../services/havenClient';
import { profileIdFromSession } from '@haven/contracts/src/session';
import {
  completeOfflineAction,
  listOfflineActionsForCarer,
  quarantineCorruptEntry,
  recordOfflineAttempt,
  refreshOfflineQueueSize,
} from '../services/offlineQueue';
import { carerDeliveryFor } from '../services/queueDelivery';
import { drainCarerQueue } from '../services/queueDrain';

/**
 * Sends this carer's queued captures when the app starts and when it comes back to the
 * foreground.
 *
 * Mounted once, by `QueueDrain` in App.tsx, because the queue belongs to the session and not
 * to any one screen: a carer who opens the app on the visit list must still send the handover
 * note she wrote in a basement yesterday.
 *
 * Returns the number still waiting so a screen can show it; callers that do not care can
 * ignore the value.
 */
export function useQueueDrain(): { pending: number; drain: () => Promise<void> } {
  const { session } = useAuth();
  const [pending, setPending] = useState(0);
  const carerId = profileIdFromSession(session as { access_token?: string } | null);
  const accessToken = session?.access_token;

  const drain = async () => {
    if (!carerId || !accessToken) return;
    const client = new CarerClient({
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!,
      accessToken,
    });

    const result = await drainCarerQueue({
      carerId,
      store: {
        list: listOfflineActionsForCarer,
        complete: completeOfflineAction,
        quarantine: quarantineCorruptEntry,
        recordAttempt: recordOfflineAttempt,
      },
      deliver: (item) => {
        const target = carerDeliveryFor(item);
        if (!target) throw Object.assign(new Error(`no route for ${item.action}`), { status: 400 });
        return target.deliver(client);
      },
      onQuarantine: (item, reason) => {
        console.warn(`[HAVEN] queued ${item.action} could not be sent: ${reason}`);
      },
    });

    setPending(result.remaining);
    // The badge reads the same per-carer count, so a drain cannot leave it stale.
    await refreshOfflineQueueSize(carerId).catch(() => undefined);
  };

  useEffect(() => {
    if (!carerId || !accessToken) {
      setPending(0);
      return;
    }
    void drain().catch((error) => {
      // Offline is the normal case here; the captures stay queued and the next launch retries.
      console.warn('[HAVEN] queue drain skipped:', String((error as Error)?.message ?? error));
    });
  }, [carerId, accessToken]);

  return { pending, drain };
}
