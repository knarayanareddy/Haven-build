import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Signing in to the grandchild app.
 *
 * The app used to ask a child for two UUIDs and a bearer token in text fields. Nobody has a
 * bearer token; the screen was a developer harness that shipped as an app. Identity now comes
 * from Supabase Auth using an emailed one-time code — no password for a child to forget, and
 * no identifier for anyone to paste.
 */

export interface GrandchildAuth {
  client: SupabaseClient;
  email: string;
}

export function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function createGrandchildClient(): SupabaseClient | null {
  const config = supabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

/** Sends the one-time code. Creates the account on first use. */
export async function requestSignInCode(client: SupabaseClient, email: string): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
}

/** Exchanges the emailed code for a session. */
export async function confirmSignInCode(client: SupabaseClient, email: string, code: string): Promise<string> {
  const { data, error } = await client.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw new Error(error.message);
  const userId = data.user?.id;
  if (!userId) throw new Error('De code is niet geldig.');
  return userId;
}

export async function signOut(client: SupabaseClient): Promise<void> {
  await client.auth.signOut();
}
