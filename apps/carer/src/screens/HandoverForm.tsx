// ─── Phase 3.1: Carer Handover Form Screen ───
// Quick 1-5 scales for appetite + mood, mobility dropdown, free-text concerns.
// Photo attachment support (Phase 3.3).
// Medication interaction warnings shown inline (Phase 3.4).
// Offline-first: saves to localStorage queue if no connectivity.

import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import { useAuth } from '../auth/AuthProvider';
import { CarerClient } from '../services/havenClient';
import { enqueueOffline } from '../services/offlineQueue';

interface HandoverFormProps {
  route: { params: { elder_id: string; elder_name: string } };
  navigation: { goBack: () => void };
}

const MOBILITY_OPTIONS = [
  { value: 'zelfstandig', label: 'Zelfstandig' },
  { value: 'met_hulp', label: 'Met hulp' },
  { value: 'niet_vandaag', label: 'Niet vandaag' },
];

const MEDICATION_OPTIONS = [
  { id: '', label: 'Niet van toepassing' },
  { id: '99999999-0000-0000-0000-000000000001', label: 'Metformine 500 mg' },
  { id: '99999999-0000-0000-0000-000000000002', label: 'Lisinopril 10 mg' },
  { id: '99999999-0000-0000-0000-000000000003', label: 'Vitamine D 20 mcg' },
];

export function HandoverForm({ route, navigation }: HandoverFormProps) {
  const { elder_id, elder_name } = route.params;
  const { session } = useAuth();
  const [appetite, setAppetite] = useState(3);
  const [mood, setMood] = useState(3);
  const [mobility, setMobility] = useState('zelfstandig');
  const [concerns, setConcerns] = useState('');
  const [notes, setNotes] = useState('');
  const [administeredMed, setAdministeredMed] = useState('');
  const [photosCount, setPhotosCount] = useState(0);
  const [isSubmitting, setSubmitting] = useState(false);
  const [interactionWarning, setInteractionWarning] = useState<string | null>(null);

  const submitOnline = useCallback(async () => {
    setSubmitting(true);
    try {
      const client = session
        ? new CarerClient({
            supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!,
            accessToken: session.access_token,
          })
        : null;

      if (client) {
        const result = await client.handoverNote({
          elder_id,
          appetite,
          mood,
          mobility: mobility !== 'zelfstandig' ? mobility : undefined,
          concerns_nl: concerns || undefined,
          notes_nl: notes || undefined,
          administered_medication_id: administeredMed || undefined,
          administered_at: administeredMed ? new Date().toISOString() : undefined,
          photo_paths: undefined, // Photos handled separately via storage
        });
        
        if (result.interaction_warning) {
          setInteractionWarning(result.interaction_warning);
        }
        
        Alert.alert('HAVEN WACHT', 'Notitie opgeslagen en gesynchroniseerd.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        enqueueOffline('handover_note', { elder_id, appetite, mood, mobility, concerns, notes });
        Alert.alert('HAVEN WACHT', 'Offline opgeslagen. Wordt gesynchroniseerd zodra u online bent.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (error) {
      // Offline fallback
      enqueueOffline('handover_note', { elder_id, appetite, mood, mobility, concerns, notes });
      Alert.alert('HAVEN WACHT', 'Offline opgeslagen vanwege netwerkfout.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } finally {
      setSubmitting(false);
    }
  }, [session, elder_id, appetite, mood, mobility, concerns, notes, administeredMed, navigation]);

  const saveOffline = useCallback(() => {
    enqueueOffline('handover_note', { elder_id, appetite, mood, mobility, concerns, notes });
    Alert.alert('HAVEN WACHT', 'Offline opgeslagen.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
  }, [elder_id, appetite, mood, mobility, concerns, notes, navigation]);

  const addPhoto = useCallback(() => {
    // In production: opens device camera via expo-camera
    setPhotosCount((c) => c + 1);
    Alert.alert('HAVEN', 'Foto toegevoegd (demo). In productie opent de camera.');
  }, []);

  const renderScale = (label: string, value: number, onChange: (v: number) => void) => (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${n}`}
            onPress={() => onChange(n)}
            style={{
              flex: 1, minHeight: 48, borderRadius: 12,
              backgroundColor: value === n ? colors.sage : colors.paper,
              borderWidth: 1, borderColor: colors.mist,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '900', color: value === n ? 'white' : colors.ink }}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.linen }} contentContainerStyle={{ padding: 20, gap: 18 }}>
      <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '900', color: colors.ink }}>
        Handover — {elder_name}
      </Text>

      {renderScale('Eetlust', appetite, setAppetite)}
      {renderScale('Stemming', mood, setMood)}

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>Mobiliteit</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {MOBILITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              onPress={() => setMobility(opt.value)}
              style={{
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14,
                backgroundColor: mobility === opt.value ? colors.slate : colors.paper,
                borderWidth: 1, borderColor: colors.mist,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: mobility === opt.value ? 'white' : colors.ink }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>
          Toegediend medicijn (MAR-light)
        </Text>
        {MEDICATION_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.id}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            onPress={() => setAdministeredMed(opt.id)}
            style={{
              paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
              backgroundColor: administeredMed === opt.id ? colors.sagePale : colors.paper,
              borderWidth: 1, borderColor: administeredMed === opt.id ? colors.sage : colors.mist,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {interactionWarning && (
        <View style={{ borderRadius: 16, padding: 16, backgroundColor: interactionWarning.includes('CRITICAL') ? '#FAE8E8' : '#FDF3E0', borderWidth: 1, borderColor: interactionWarning.includes('CRITICAL') ? '#C94A4A' : '#A56A00' }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>
            ⚠️ {interactionWarning}
          </Text>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>Zorgen of opmerkingen</Text>
        <TextInput
          accessibilityLabel="Zorgen of opmerkingen"
          placeholder="Geen BSN, geen adressen..."
          placeholderTextColor={colors.pewter}
          value={concerns}
          onChangeText={setConcerns}
          multiline
          numberOfLines={3}
          style={{
            borderRadius: 14, padding: 14, backgroundColor: colors.paper,
            borderWidth: 1, borderColor: colors.mist, fontSize: 16, color: colors.ink,
            minHeight: 80, textAlignVertical: 'top',
          }}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>Extra notities</Text>
        <TextInput
          accessibilityLabel="Extra notities"
          placeholder="Aanvullende observaties..."
          placeholderTextColor={colors.pewter}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={2}
          style={{
            borderRadius: 14, padding: 14, backgroundColor: colors.paper,
            borderWidth: 1, borderColor: colors.mist, fontSize: 16, color: colors.ink,
            minHeight: 60, textAlignVertical: 'top',
          }}
        />
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Foto toevoegen"
        onPress={addPhoto}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16,
          backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist,
        }}
      >
        <Text style={{ fontSize: 20 }}>📷</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
          {photosCount > 0 ? `${photosCount} foto('s) toegevoegd` : 'Foto toevoegen'}
        </Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Opslaan online"
          onPress={submitOnline}
          disabled={isSubmitting}
          style={{
            flex: 1, backgroundColor: isSubmitting ? colors.mist : colors.slate,
            borderRadius: 16, paddingVertical: 14, alignItems: 'center', minHeight: 56,
          }}
        >
          <Text style={{ color: 'white', fontSize: 18, fontWeight: '900' }}>
            {isSubmitting ? 'Opslaan...' : 'Opslaan (online)'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Opslaan offline"
          onPress={saveOffline}
          style={{
            flex: 1, backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.slate,
            borderRadius: 16, paddingVertical: 14, alignItems: 'center', minHeight: 56,
          }}
        >
          <Text style={{ color: colors.slate, fontSize: 18, fontWeight: '900' }}>Offline</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
