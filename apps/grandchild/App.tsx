import React, { useState } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import { sendGrandchildHello } from './src/client';
import { ErrorBoundary } from './src/components/ErrorBoundary';

function GrandchildContent() {
  const [elderId, setElderId] = useState('');
  const [familyMemberId, setFamilyMemberId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function sendHello() {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || !elderId || !familyMemberId || !displayName || !accessToken) {
      setState('failed');
      setError('Supabase URL, elder ID, family member ID, display name, and access token are required.');
      return;
    }

    setState('sending');
    setError(null);
    try {
      await sendGrandchildHello({ supabaseUrl, accessToken }, {
        elder_id: elderId,
        family_member_id: familyMemberId,
        display_name: displayName,
        message_type: 'text',
        content_nl: `${displayName} stuurde een lieve groet.`,
        content_en: `${displayName} sent a loving hello.`,
      });
      setState('sent');
    } catch (sendError) {
      setState('failed');
      setError(String((sendError as Error).message ?? sendError));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.linen, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 44, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>Send Grandma a hello</Text>
      <Text style={{ fontSize: 24, color: colors.graphite, textAlign: 'center', marginTop: 12 }}>One button. A warm message goes to HAVEN.</Text>
      <View style={{ width: '100%', gap: 10, marginTop: 24 }}>
        <TextInput placeholder="Elder profile ID" value={elderId} onChangeText={setElderId} autoCapitalize="none" style={inputStyle} />
        <TextInput placeholder="Family member ID" value={familyMemberId} onChangeText={setFamilyMemberId} autoCapitalize="none" style={inputStyle} />
        <TextInput placeholder="Grandchild display name" value={displayName} onChangeText={setDisplayName} style={inputStyle} />
        <TextInput placeholder="Family access token" value={accessToken} onChangeText={setAccessToken} autoCapitalize="none" secureTextEntry style={inputStyle} />
      </View>
      <TouchableOpacity disabled={state === 'sending'} onPress={sendHello} style={{ marginTop: 24, minHeight: 96, width: '100%', borderRadius: 32, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center', opacity: state === 'sending' ? 0.7 : 1 }}>
        <Text style={{ color: 'white', fontSize: 28, fontWeight: '900' }}>{state === 'sent' ? 'Sent' : state === 'sending' ? 'Sending...' : 'Send hello'}</Text>
      </TouchableOpacity>
      {error ? <Text style={{ fontSize: 18, color: colors.rose, textAlign: 'center', marginTop: 12 }}>{error}</Text> : null}
      <View style={{ marginTop: 24, backgroundColor: colors.paper, borderRadius: 24, padding: 20 }}>
        <Text style={{ fontSize: 20, color: colors.graphite }}>Guardian consent and elder consent are checked by fn-grandchild-message-send.</Text>
      </View>
    </SafeAreaView>
  );
}

export default function GrandchildApp() {
  return (
    <ErrorBoundary>
      <GrandchildContent />
    </ErrorBoundary>
  );
}

const inputStyle = {
  minHeight: 56,
  borderRadius: 18,
  backgroundColor: 'white',
  borderWidth: 1,
  borderColor: '#D8D2CA',
  paddingHorizontal: 16,
  fontSize: 18,
  color: colors.ink,
};
