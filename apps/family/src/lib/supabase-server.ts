import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Server-side Supabase client bound to the caller's session cookie.
 *
 * Before this module the dashboard authenticated with a single build-time token
 * (`HAVEN_FAMILY_ACCESS_TOKEN`) shared by every visitor, so the dashboard showed the
 * same older adult's data to anyone who could reach the URL. Identity now comes
 * from the request's own Supabase session; RLS then decides what that user may read.
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/** Returns null instead of throwing so pages can render a setup message. */
export function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export async function createSupabaseServerClient() {
  const env = readSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only there. Session
          // refresh is handled by middleware.ts, which can write.
        }
      },
    },
  });
}
