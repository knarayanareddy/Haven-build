import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { HavenClient } from '../services/havenClient';
import { mapScreenData, type MappedScreenData, type ScreenDataPayload } from '../services/screenDataMapper';
import type { Locale } from '@haven/contracts/src/haven';

/**
 * Loads what the open screen renders.
 *
 * `ElderScreen` used to build its context from a shell whose every array was empty, and
 * `fn-screen-data` — the endpoint that returns medication reminders, family messages, scam
 * events, family, tasks, visits and open confirmations — was called by nothing. The app
 * therefore showed an older adult "0 due today", "0 messages" and an empty family list while
 * the data sat in the database.
 *
 * The previous payload is kept while a refresh is in flight, and kept on failure: an app that
 * blanks itself because one request timed out is worse than one showing slightly old data. The
 * hook never invents values — an unreachable endpoint leaves the arrays empty and `error` set.
 */
export interface ScreenDataState extends MappedScreenData {
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const EMPTY: MappedScreenData = mapScreenData(null, 'nl-NL');

export function useScreenData(options: {
  client: HavenClient | null;
  elderId: string | null;
  screenId: string;
  locale: Locale;
  /** Poll interval while the screen is open. Foreground refresh always runs on focus. */
  refreshMs?: number;
}): ScreenDataState {
  const { client, elderId, screenId, locale, refreshMs = 60_000 } = options;
  const [mapped, setMapped] = useState<MappedScreenData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!client || !elderId) return;
    setLoading(true);
    try {
      const payload = await client.screenData({ elder_id: elderId, screen_id: screenId, locale }) as ScreenDataPayload;
      if (!mounted.current) return;
      setMapped(mapScreenData(payload, locale, elderId));
      setError(null);
    } catch (loadError) {
      // Offline is the normal case on a handset; keep whatever is on screen and try again.
      if (mounted.current) setError(String((loadError as Error)?.message ?? loadError));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [client, elderId, screenId, locale]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => { void load(); }, refreshMs);
    // A phone spends most of its life with the app backgrounded; coming back to it is the one
    // moment the screen is certainly being looked at.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [load, refreshMs]);

  const refresh = useCallback(() => { void load(); }, [load]);
  return { ...mapped, loading, error, refresh };
}
