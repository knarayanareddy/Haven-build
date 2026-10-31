'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../lib/supabase-browser';
import { subscriptionsFor, type FamilyPermissionsForRealtime } from '../services/realtime';

/**
 * Keeps the dashboard current while it is open.
 *
 * The dashboard is server-rendered, so it showed whatever was true when the page was loaded: a
 * fall alert raised five minutes after the family member opened the tab stayed invisible until
 * a manual reload. That is the one thing this dashboard exists to prevent.
 *
 * Every subscribed change triggers `router.refresh()`, which re-renders the server component
 * with fresh data through the same cookie-bound client and RLS as a page load — the browser
 * client is only used to *hear* about changes, never to decide what is shown.
 *
 * Refreshes are coalesced: a burst of rows (a medication run writes several) becomes one
 * render, and a dashboard left open overnight cannot loop.
 */
export function DashboardRealtime({
  elderId,
  profileId,
  permissions,
}: {
  elderId: string;
  profileId: string;
  permissions: FamilyPermissionsForRealtime;
}) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const specs = subscriptionsFor(permissions, { elderId, profileId });
    const channels = specs.map((spec) =>
      supabase
        .channel(spec.channel)
        .on(
          // postgres_changes across all events: a reminder flipping to 'confirmed' is an
          // UPDATE, a new alert is an INSERT, and the dashboard shows both.
          'postgres_changes',
          { event: '*', schema: 'public', table: spec.table, filter: spec.filter },
          () => {
            if (timerRef.current) return;
            timerRef.current = setTimeout(() => {
              timerRef.current = null;
              router.refresh();
            }, 1500);
          }
        )
        .subscribe()
    );

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      for (const channel of channels) void supabase.removeChannel(channel);
    };
    // `permissions` is an object rebuilt on every server render; comparing its fields keeps
    // the effect from tearing down and rebuilding the socket on each refresh.
  }, [elderId, profileId, permissions.alerts, permissions.medications, permissions.messages, permissions.location, router]);

  return null;
}
