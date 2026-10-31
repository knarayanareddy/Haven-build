import React, { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { profileIdFromSession } from '@haven/contracts/src/session';
import { HavenClient } from '../services/havenClient';
import { registerPushToken } from '../services/pushRegistration';
import { createSessionEffects } from '../services/sessionEffects';
import { drainElderQueue } from '../services/drainElderQueue';
import {
  claimNextOfflineAction,
  completeOfflineAction,
  markOfflineActionFailed,
  quarantineOfflineAction,
} from '../services/sqliteOfflineQueue';

/**
 * Runs the once-per-session work: register this device for push, and send anything the elder
 * captured while offline.
 *
 * Rendered inside AuthProvider in App.tsx. It exists as a component because both jobs need a
 * signed-in session, and until now neither job ran at all: `pushRegistration.ts` and
 * `OfflineSyncMachine` were written, tested in isolation, and never mounted.
 *
 * Failures are swallowed into `console.warn` deliberately. This runs at app start; a refused
 * notification permission must not put an error in front of an older adult, and the queue will
 * be retried on the next launch.
 */
export function SessionEffects(): null {
  const { session } = useAuth();
  const runnerRef = useRef(createSessionEffects());
  const lastProfileRef = useRef<string | null>(null);

  const profileId = profileIdFromSession(session as { access_token?: string } | null);

  useEffect(() => {
    if (!profileId || !session) {
      // Signed out: forget the registration so a different person on the same handset
      // registers their own token.
      lastProfileRef.current = null;
      runnerRef.current.reset();
      return;
    }
    if (lastProfileRef.current === profileId) return;
    lastProfileRef.current = profileId;

    const client = new HavenClient({
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!,
      accessToken: session.access_token,
    });

    void runnerRef.current.run({
      profileId,
      registerPush: (id) => registerPushToken(client, id),
      drainQueue: () => drainElderQueue({
        store: {
          claimNext: claimNextOfflineAction,
          complete: completeOfflineAction,
          fail: markOfflineActionFailed,
          quarantine: quarantineOfflineAction,
        },
        client,
      }),
      onError: (stage, error) => {
        console.warn(`[HAVEN] session effect failed: ${stage}`, String((error as Error)?.message ?? error));
      },
    });
  }, [profileId, session]);

  return null;
}
