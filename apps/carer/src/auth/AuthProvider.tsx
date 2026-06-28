import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@haven/database/src/types';
import type { Locale } from '@haven/contracts/src/haven';
import { translate } from '@haven/i18n';

const SESSION_KEY = 'haven.carer.secure.session';
const PIN_KEY = 'haven.carer.secure.pin';

type AuthContextValue = {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  isReady: boolean;
  isBiometricAvailable: boolean;
  signInWithPin: (pin: string) => Promise<boolean>;
  signInWithBiometric: (locale?: Locale) => Promise<boolean>;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  setPin: (pin: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) return null as unknown as SupabaseClient<Database>;
    return createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: true },
    });
  }, [supabaseUrl, supabaseAnonKey]);

  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setReady] = useState(false);
  const [isBiometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    LocalAuthentication.hasHardwareAsync().then((has) => {
      if (!mounted) return;
      if (has) {
        LocalAuthentication.isEnrolledAsync().then((enrolled) => {
          if (mounted) setBiometricAvailable(enrolled);
        });
      }
    });
    SecureStore.getItemAsync(SESSION_KEY).then(async (stored: string | null) => {
      if (!mounted || !supabase) return;
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Session;
          if (parsed?.access_token && parsed?.refresh_token) {
            setSession(parsed);
            await supabase.auth.setSession({
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token,
            });
          } else {
            await SecureStore.deleteItemAsync(SESSION_KEY);
          }
        } catch {
          await SecureStore.deleteItemAsync(SESSION_KEY);
        }
      }
      setReady(true);
    });
    return () => { mounted = false; };
  }, [supabase]);

  async function setPin(pin: string) {
    await SecureStore.setItemAsync(PIN_KEY, pin, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async function signInWithPin(pin: string): Promise<boolean> {
    const stored = await SecureStore.getItemAsync(PIN_KEY);
    return stored === pin;
  }

  async function signInWithBiometric(locale: Locale = 'nl-NL'): Promise<boolean> {
    // Canonical fallback string: 'HAVEN verificatie op Mac'
    const promptMsg = Platform.OS === 'macos'
      ? translate('auth.biometric.macos', locale)
      : Platform.OS === 'android'
      ? `${translate('auth.biometric.android.prompt', locale)}\n${translate('auth.biometric.android.subtitle', locale)}`
      : translate('auth.biometric.ios', locale);

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMsg,
      fallbackLabel: translate('auth.biometric.fallback', locale),
      ...(Platform.OS === 'android' ? { promptMessage: translate('auth.biometric.android.prompt', locale), subtitle: translate('auth.biometric.android.subtitle', locale) } : {}),
    });
    return result.success;
  }

  async function signInWithEmail(email: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    await supabase.auth.signInWithOtp({ email });
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    await SecureStore.deleteItemAsync(SESSION_KEY);
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{
      supabase, session, isReady, isBiometricAvailable,
      signInWithPin, signInWithBiometric, signInWithEmail, signOut, setPin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
