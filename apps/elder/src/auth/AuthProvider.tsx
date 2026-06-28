import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@haven/database/src/types';

const SESSION_KEY = 'haven.secure.supabase.session';

type AuthContextValue = {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  isReady: boolean;
  signInWithOtp: (emailOrPhone: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) return null as unknown as SupabaseClient<Database>;
    return createClient<Database>(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: true } });
  }, [supabaseUrl, supabaseAnonKey]);
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let mounted = true;
    SecureStore.getItemAsync(SESSION_KEY).then(async (stored: string | null) => {
      if (!mounted) return;
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Session;
          if (parsed?.access_token && parsed?.refresh_token) {
            setSession(parsed);
            await supabase.auth.setSession({ access_token: parsed.access_token, refresh_token: parsed.refresh_token });
          } else {
            await SecureStore.deleteItemAsync(SESSION_KEY);
          }
        } catch {
          await SecureStore.deleteItemAsync(SESSION_KEY);
        }
      }
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange(async (_event: string, next: Session | null) => {
      setSession(next);
      if (next) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      else await SecureStore.deleteItemAsync(SESSION_KEY);
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, [supabase]);

  async function signInWithOtp(emailOrPhone: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    if (emailOrPhone.includes('@')) await supabase.auth.signInWithOtp({ email: emailOrPhone });
    else await supabase.auth.signInWithOtp({ phone: emailOrPhone });
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    await SecureStore.deleteItemAsync(SESSION_KEY);
    setSession(null);
  }

  return <AuthContext.Provider value={{ supabase, session, isReady, signInWithOtp, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
