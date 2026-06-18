import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import { useTranslation } from '@haven/i18n';
import { useAuth } from '../auth/AuthProvider';
import { CarerClient } from '../services/havenClient';
import { enqueueOffline } from '../services/offlineQueue';

interface HandoverFormProps {
  route: { params: { elder_id: string; elder_name: string } };
  navigation: { goBack: () => void };
}

export function HandoverForm({ route, navigation }: HandoverFormProps) {
  const { elder_id, elder_name } = route.params;
  const { session } = useAuth();
  const { t } = useTranslation();
  
  const [appetite, setAppetite] = useState(3);
  const [mood, setMood] = useState(3);
  const [mobility, setMobility] = useState('handover.mobility.self');
  const [concerns, setConcerns] = useState('');
  const [notes, setNotes] = useState('');
  const [administeredMed, setAdministeredMed] = useState('');
  const [photosCount, setPhotosCount] = useState(0);
  const [isSubmitting, setSubmitting] = useState(false);
  const [interactionWarning, setInteractionWarning] = useState<string | null>(null);

  const MOBILITY_OPTIONS = [
    { value: 'handover.mobility.self', label: t('handover.mobility.self') },
    { value: 'handover.mobility.help', label: t('handover.mobility.help') },
    { value: 'handover.mobility.not_today', label: t('handover.mobility.not_today') },
  ];

  const MEDICATION_OPTIONS = [
    { id: '', label: t('handover.med.none') },
    { id: '99999999-0000-0000-0000-000000000001', label: 'Metformine 500 mg' },
    { id: '99999999-0000-0000-0000-000000000002', label: 'Lisinopril 10 mg' },
    { id: '99999999-0000-0000-0000-000000000003', label: 'Vitamine D 20 mcg' },
  ];

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
          mobility: mobility !== 'handover.mobility.self' ? mobility : undefined,
          concerns_nl: concerns || undefined,
          notes_nl: notes || undefined,
          administered_medication_id: administeredMed || undefined,
          administered_at: administeredMed ? new Date().toISOString() : undefined,
        });
        
        if (result.interaction_warning) {
          setInteractionWarning(result.interaction_warning);
        }
        
        Alert.alert(t('carerAppTitle'), t('carerHandoverSaved'), [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        enqueueOffline('handover_note', { elder_id, appetite, mood, mobility, concerns, notes });
        Alert.alert(t('carerAppTitle'), t('carerHandoverOffline'), [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (error) {
      enqueueOffline('handover_note', { elder_id, appetite, mood, mobility, concerns, notes });
      Alert.alert(t('carerAppTitle'), t('handover.alert.network_err'), [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } finally {
      setSubmitting(false);
    }
  }, [session, elder_id, appetite, mood, mobility, concerns, notes, administeredMed, t, navigation]);

  const saveOffline = useCallback(() => {
    enqueueOffline('handover_note', { elder_id, appetite, mood, mobility, concerns, notes });
    Alert.alert(t('carerAppTitle'), t('handover.alert.offline_saved'), [{ text: 'OK', onPress: () => navigation.goBack() }]);
  }, [elder_id, appetite, mood, mobility, concerns, notes, t, navigation]);

  const addPhoto = useCallback(() => {
    setPhotosCount((c) => c + 1);
    Alert.alert('HAVEN', t('handover.photo.demo'));
  }, [t]);

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
        {t('carerHandoverTitle')} — {elder_name}
      </Text>

      {renderScale(t('handover.appetite'), appetite, setAppetite)}
      {renderScale(t('handover.mood'), mood, setMood)}

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>{t('handover.mobility')}</Text>
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
          {t('handover.administered_med')}
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
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>{t('handover.concerns')}</Text>
        <TextInput
          accessibilityLabel={t('handover.concerns')}
          placeholder={t('handover.concerns.placeholder')}
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
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>{t('handover.notes')}</Text>
        <TextInput
          accessibilityLabel={t('handover.notes')}
          placeholder={t('handover.notes.placeholder')}
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
        accessibilityLabel={t('handover.photo.add')}
        onPress={addPhoto}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16,
          backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist,
        }}
      >
        <Text style={{ fontSize: 20 }}>📷</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
          {photosCount > 0 ? t('handover.photo.added', { count: photosCount }) : t('handover.photo.add')}
        </Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('handover.save_note.label')}
          accessibilityHint={t('handover.save_note.hint')}
          onPress={submitOnline}
          disabled={isSubmitting}
          style={{
            flex: 1, backgroundColor: isSubmitting ? colors.mist : colors.slate,
            borderRadius: 16, paddingVertical: 14, alignItems: 'center', minHeight: 56,
          }}
        >
          <Text style={{ color: 'white', fontSize: 18, fontWeight: '900' }}>
            {isSubmitting ? t('handover.submitting') : t('handover.submit_online')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('handover.submit_offline')}
          onPress={saveOffline}
          style={{
            flex: 1, backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.slate,
            borderRadius: 16, paddingVertical: 14, alignItems: 'center', minHeight: 56,
          }}
        >
          <Text style={{ color: colors.slate, fontSize: 18, fontWeight: '900' }}>{t('handover.submit_offline')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
