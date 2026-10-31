'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client for the family dashboard.
 *
 * Needed only for realtime: the server components read through the cookie-bound server client,
 * which cannot hold a websocket. `createBrowserClient` reads the same session cookies, so the
 * subscription carries the caller's own identity and RLS applies to it exactly as it does to
 * the server reads.
 *
 * Returns null when the public environment is missing, matching `createSupabaseServerClient`,
 * so a misconfigured deployment shows its setup message instead of throwing at hydration.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  // One client per tab: each createBrowserClient() opens its own socket and auth listener.
  cached ??= createBrowserClient(url, anonKey);
  return cached;
}
