// What happens once a session exists.
//
// Two things in this app only work after sign-in, and both used to be written but never
// called:
//
//   * registering the push token. `pushRegistration.ts` existed, expo-notifications was
//     configured, and `fn-notification-dispatch` pushed correctly — but nothing ever called
//     `registerPushToken`, so `push_tokens` was empty and every notification was written with
//     `send_error: 'no_active_token'`. Fall alerts, missed-medication escalations and family
//     messages reached nobody's phone.
//   * draining the offline queue. Captures made without a network sat in SQLite forever,
//     because nothing constructed `OfflineSyncMachine`.
//
// The two are independent: a refused notification permission must not stop the queue from
// draining, and a failing drain must not stop the token from registering. Both are also
// retried on every launch until they succeed, which is what makes them safe to attempt here.

export type SessionEffectStage = 'push' | 'queue';

export type PushOutcome = 'registered' | 'skipped' | 'failed';

export interface DrainResult {
  sent: number;
  failed: number;
}

export interface SessionEffectsOptions {
  /** The signed-in profile id, from the session — never from a form field. */
  profileId: string;
  registerPush: (profileId: string) => Promise<unknown>;
  drainQueue: () => Promise<DrainResult>;
  onError?: (stage: SessionEffectStage, error: unknown) => void;
  onDrained?: (result: DrainResult) => void;
}

export interface SessionEffectsResult {
  push: PushOutcome;
  drained: DrainResult;
}

export interface SessionEffectsRunner {
  run(options: SessionEffectsOptions): Promise<SessionEffectsResult>;
  /** Forgets what has already been registered — call on sign-out. */
  reset(): void;
}

/**
 * Creates the runner.
 *
 * Push registration is remembered per profile for the lifetime of the runner: the OS gives the
 * token back unchanged, and re-registering on every foreground would write to `push_tokens` on
 * every app switch for no benefit. The queue, by contrast, is drained on every call, because a
 * capture made two minutes ago should go out the moment there is a session.
 */
export function createSessionEffects(): SessionEffectsRunner {
  const pushRegistered = new Set<string>();

  return {
    async run(options) {
      const { profileId, registerPush, drainQueue, onError, onDrained } = options;

      let push: PushOutcome = 'skipped';
      if (!pushRegistered.has(profileId)) {
        try {
          await registerPush(profileId);
          pushRegistered.add(profileId);
          push = 'registered';
        } catch (error) {
          // A refused permission, or a device with no push service. The queue still runs.
          push = 'failed';
          onError?.('push', error);
        }
      }

      let drained: DrainResult = { sent: 0, failed: 0 };
      try {
        drained = await drainQueue();
        onDrained?.(drained);
      } catch (error) {
        onError?.('queue', error);
      }

      return { push, drained };
    },

    reset() {
      pushRegistered.clear();
    },
  };
}
