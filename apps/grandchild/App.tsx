import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import { sendGrandchildHello } from './src/client';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { confirmSignInCode, createGrandchildClient, requestSignInCode, signOut } from './src/auth';
import { resolveGrandchildScope, type GrandchildScope } from './src/scope';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Warm border on the terracotta card. No token expresses it, and inventing one to satisfy a
 *  colour audit would be the same mistake as inventing a test. */
const GRANDCHILD_CARD_BORDER = '#D8D2CA';

export default function GrandchildApp() {
  return (
    <ErrorBoundary>
      <GrandchildFlow />
    </ErrorBoundary>
  );
}

type Stage = 'loading' | 'email' | 'code' | 'ready';

/**
 * Sign in with an emailed code, then send one hello.
 *
 * Before this the app asked for an elder UUID, a family-member UUID and a bearer token — a
 * developer harness with a child's name on it. There is now no field a person could not fill:
 * an email address, a six-digit code from that inbox, and one button.
 */
function GrandchildFlow() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [scope, setScope] = useState<GrandchildScope | null>(null);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createGrandchildClient();
    if (!supabase) {
      setStage('email');
      setError('De app is niet geconfigureerd: EXPO_PUBLIC_SUPABASE_URL ontbreekt.');
      return;
    }
    setClient(supabase);

    let cancelled = false;
    // A returning child is already signed in; the stored session is verified with the server
    // rather than trusted from storage, and the scope is resolved from their own relationships.
    void supabase.auth.getUser().then(async (result: { data: { user?: { id?: string } | null } }) => {
      const data = result.data;
      if (cancelled) return;
      const userId = data.user?.id;
      if (!userId) {
        setStage('email');
        return;
      }
      const resolved = await resolveGrandchildScope(supabase, userId);
      if (cancelled) return;
      setScope(resolved);
      setStage(resolved ? 'ready' : 'email');
      if (!resolved) setError('Er is nog geen oudere aan uw account gekoppeld.');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sendCode = useCallback(async () => {
    if (!client) return;
    setError(null);
    try {
      await requestSignInCode(client, email);
      setStage('code');
    } catch (signInError) {
      setError(String((signInError as Error).message ?? signInError));
    }
  }, [client, email]);

  const verifyCode = useCallback(async () => {
    if (!client) return;
    setError(null);
    try {
      const userId = await confirmSignInCode(client, email, code);
      const resolved = await resolveGrandchildScope(client, userId);
      if (!resolved) {
        setError('Er is nog geen oudere aan uw account gekoppeld. Vraag uw ouder om toegang.');
        return;
      }
      setScope(resolved);
      setStage('ready');
    } catch (verifyError) {
      setError(String((verifyError as Error).message ?? verifyError));
    }
  }, [client, email, code]);

  const sendHello = useCallback(async () => {
    if (!client || !scope) return;
    const { data } = await client.auth.getSession();
    const accessToken = data.session?.access_token;
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!accessToken || !supabaseUrl) {
      setSendState('failed');
      setError('Uw sessie is verlopen. Log opnieuw in.');
      return;
    }

    setSendState('sending');
    setError(null);
    try {
      // The ids come from the verified session and the relationship row. Nothing here is typed.
      await sendGrandchildHello({ supabaseUrl, accessToken }, {
        elder_id: scope.elderId,
        family_member_id: scope.familyMemberId,
        display_name: 'Kleinkind',
        message_type: 'tekst',
        content_nl: 'Uw kleinkind stuurde een lieve groet.',
        content_en: 'Your grandchild sent a loving hello.',
      });
      setSendState('sent');
    } catch (sendError) {
      setSendState('failed');
      setError(String((sendError as Error).message ?? sendError));
    }
  }, [client, scope]);

  if (stage === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.terracottaPale, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, color: colors.graphite }}>Even geduld…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.terracottaPale, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 44, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>
        {stage === 'ready' ? 'Send een groet' : 'Inloggen'}
      </Text>
      <Text style={{ fontSize: 24, color: colors.graphite, textAlign: 'center', marginTop: 12 }}>
        {stage === 'ready'
          ? `Eén knop. Uw groet gaat naar ${scope?.elderName ?? 'uw oma of opa'}.`
          : 'We sturen een code naar uw e-mail. Geen wachtwoord nodig.'}
      </Text>

      {stage !== 'ready' && (
        <View style={{ width: '100%', gap: 10, marginTop: 24 }}>
          <TextInput
            placeholder="Uw e-mailadres"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={stage === 'email'}
            style={inputStyle}
          />
          {stage === 'code' && (
            <TextInput
              placeholder="De code uit uw e-mail"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              style={inputStyle}
            />
          )}
        </View>
      )}

      <TouchableOpacity
        disabled={stage === 'code' ? code.length < 4 : stage === 'ready' ? sendState === 'sending' : email.length < 3}
        onPress={stage === 'code' ? verifyCode : stage === 'ready' ? sendHello : sendCode}
        style={{
          marginTop: 24,
          minHeight: 96,
          width: '100%',
          borderRadius: 32,
          backgroundColor: colors.violet,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: sendState === 'sending' ? 0.7 : 1,
        }}
      >
        <Text style={{ color: 'white', fontSize: 28, fontWeight: '900' }}>
          {stage === 'ready'
            ? sendState === 'sent' ? 'Verstuurd' : sendState === 'sending' ? 'Versturen…' : 'Stuur een groet'
            : stage === 'code' ? 'Inloggen' : 'Stuur mij een code'}
        </Text>
      </TouchableOpacity>

      {error ? <Text style={{ fontSize: 16, color: colors.rose, textAlign: 'center', marginTop: 12 }}>{error}</Text> : null}

      {stage === 'ready' && (
        <TouchableOpacity
          onPress={async () => {
            if (!client) return;
            await signOut(client);
            setScope(null);
            setStage('email');
            setSendState('idle');
          }}
          style={{ marginTop: 16 }}
        >
          <Text style={{ fontSize: 18, color: colors.graphite, textDecorationLine: 'underline' }}>Uitloggen</Text>
        </TouchableOpacity>
      )}

      <View style={{ marginTop: 24, backgroundColor: 'white', borderRadius: 24, padding: 20 }}>
        <Text style={{ fontSize: 20, color: colors.graphite }}>
          Uw ouder beheert de koppeling. HAVEN controleert of uw oma of opa toestemming gaf voordat er iets wordt verstuurd.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const inputStyle = {
  minHeight: 56,
  borderRadius: 18,
  backgroundColor: 'white',
  borderWidth: 1,
  borderColor: GRANDCHILD_CARD_BORDER,
  paddingHorizontal: 16,
  fontSize: 18,
  color: colors.ink,
};
