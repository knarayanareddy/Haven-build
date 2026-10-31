import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import { useTranslation } from '@haven/i18n';
import { useAuth } from '../auth/AuthProvider';
import { CarerClient } from '../services/havenClient';
import { enqueueOffline } from '../services/offlineQueue';
import { profileIdFromSession } from '@haven/contracts/src/session';
import * as ImagePicker from 'expo-image-picker';
import {
  MAX_HANDOVER_PHOTOS,
  PhotoRejectedError,
  rejectPhotoReason,
  uploadHandoverPhoto,
  type UploadedPhoto,
} from '../services/photoUpload';

interface MedicationOption {
  id: string;
  label: string;
}

interface HandoverFormProps {
  route: { params: { elder_id: string; elder_name: string } };
  navigation: { goBack: () => void };
}

export function HandoverForm({ route, navigation }: HandoverFormProps) {
  const { elder_id, elder_name } = route.params;
  const { session } = useAuth();
  const { locale, t } = useTranslation();
  const carerId = profileIdFromSession(session as { access_token?: string } | null);
  
  const [appetite, setAppetite] = useState(3);
  const [mood, setMood] = useState(3);
  const [mobility, setMobility] = useState('handover.mobility.self');
  const [concerns, setConcerns] = useState('');
  const [notes, setNotes] = useState('');
  const [administeredMed, setAdministeredMed] = useState('');
  // The elder's actual prescriptions, loaded from fn-carer-medications. Empty until it answers:
  // a picker with nothing in it is honest, three hardcoded ids were not.
  const [medications, setMedications] = useState<MedicationOption[]>([]);
  const [medicationsError, setMedicationsError] = useState(false);
  // Photographs are attached to the note by object key. `path` is empty for a photo taken
  // without a connection: the form keeps the local file and says it was not attached.
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [interactionWarning, setInteractionWarning] = useState<string | null>(null);

  const MOBILITY_OPTIONS = [
    { value: 'handover.mobility.self', label: t('handover.mobility.self') },
    { value: 'handover.mobility.help', label: t('handover.mobility.help') },
    { value: 'handover.mobility.not_today', label: t('handover.mobility.not_today') },
  ];

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const client = new CarerClient({
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!,
      accessToken: session.access_token,
    });
    client.medications(elder_id)
      .then((result) => {
        if (cancelled) return;
        setMedications((result.medications ?? []).map((med) => ({
          id: med.id,
          label: locale === 'nl-NL'
            ? `${med.name_nl} ${med.dose_description_nl}`.trim()
            : `${med.name_en} ${med.dose_description_en}`.trim(),
        })));
      })
      .catch(() => { if (!cancelled) setMedicationsError(true); });
    return () => { cancelled = true; };
  }, [session, elder_id, locale]);

  const uploadedPhotoPaths = photos.map((photo) => photo.path).filter((path) => path.length > 0);

  /**
   * Queues the note under the signed-in carer.
   *
   * Returns false when there is no carer id to attribute it to, which is the one case where
   * the note cannot be kept: filing it under a placeholder id would attach a clinical record
   * to nobody, and the server rejects the send either way.
   */
  const enqueueHandover = useCallback(async (): Promise<boolean> => {
    if (!carerId) return false;
    try {
      await enqueueOffline(carerId, 'handover_note', {
        elder_id,
        appetite,
        mood,
        // The untouched default is an i18n key, not an observation; the online path omits it
        // and the queued path must send the same record.
        mobility: mobility !== 'handover.mobility.self' ? mobility : undefined,
        concerns,
        notes,
        // Recorded at the point of care, so it must survive the queue as well: dropping it
        // meant an offline round left no record that the medication had been given.
        ...(administeredMed
          ? { administered_medication_id: administeredMed, administered_at: new Date().toISOString() }
          : {}),
        // Only the photographs that reached storage. A local file URI is meaningless to the
        // endpoint, and the carer is told separately which ones did not go.
        ...(uploadedPhotoPaths.length > 0 ? { photo_paths: uploadedPhotoPaths } : {}),
      });
      return true;
    } catch (error) {
      console.warn('[HAVEN] handover note could not be queued:', String((error as Error)?.message ?? error));
      return false;
    }
  }, [carerId, elder_id, appetite, mood, mobility, concerns, notes, administeredMed, uploadedPhotoPaths]);

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
          ...(uploadedPhotoPaths.length > 0 ? { photo_paths: uploadedPhotoPaths } : {}),
        });
        
        if (result.interaction_warning) {
          setInteractionWarning(result.interaction_warning);
        }
        
        Alert.alert(t('carerAppTitle'), t('carerHandoverSaved'), [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        await enqueueHandover();
        Alert.alert(t('carerAppTitle'), t('carerHandoverOffline'), [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (error) {
      await enqueueHandover();
      Alert.alert(t('carerAppTitle'), t('handover.alert.network_err'), [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } finally {
      setSubmitting(false);
    }
  }, [session, elder_id, appetite, mood, mobility, concerns, notes, administeredMed, enqueueHandover, t, navigation]);

  const saveOffline = useCallback(async () => {
    const queued = await enqueueHandover();
    Alert.alert(
      t('carerAppTitle'),
      queued ? t('handover.alert.offline_saved') : t('handover.alert.network_err'),
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  }, [enqueueHandover, t, navigation]);

  /**
   * Files one picked image: rejects what the bucket would reject, uploads the rest.
   *
   * A failed upload keeps the photo in the list with an empty path, so the carer sees it in the
   * strip and is told it is not going with the note — instead of the count quietly disagreeing
   * with what was filed.
   */
  const attachPickedAsset = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    const rejection = rejectPhotoReason(asset);
    if (rejection) {
      // Two reasons, two sentences; spelled out so the key stays checkable by the i18n type.
      Alert.alert(
        t('carerAppTitle'),
        rejection === 'too-large'
          ? t('handover.photo.rejected.too-large')
          : t('handover.photo.rejected.unsupported-type'),
      );
      return;
    }
    if (!carerId || !session) {
      Alert.alert(t('carerAppTitle'), t('handover.photo.signin_required'));
      return;
    }
    try {
      const uploaded = await uploadHandoverPhoto({
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!,
        accessToken: session.access_token,
        elderId: elder_id,
        carerId,
        photo: asset,
      });
      setPhotos((previous) => [...previous, uploaded]);
    } catch (error) {
      setPhotos((previous) => [...previous, { localUri: asset.uri, path: '' }]);
      Alert.alert(
        t('carerAppTitle'),
        error instanceof PhotoRejectedError ? t('handover.photo.rejected.unsafe-path') : t('handover.photo.upload_failed'),
      );
    }
  }, [carerId, elder_id, session, t]);

  const pickFromLibrary = useCallback(async () => {
    setPhotoBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, exif: false });
      if (!result.canceled && result.assets[0]) await attachPickedAsset(result.assets[0]);
    } finally {
      setPhotoBusy(false);
    }
  }, [attachPickedAsset]);

  const addPhoto = useCallback(async () => {
    if (photos.length >= MAX_HANDOVER_PHOTOS) {
      Alert.alert(t('carerAppTitle'), t('handover.photo.limit', { count: MAX_HANDOVER_PHOTOS }));
      return;
    }
    setPhotoBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        // Denial is not a dead end: the carer can still attach a photo already on the phone.
        Alert.alert(t('carerAppTitle'), t('handover.photo.permission'), [
          { text: t('handover.photo.choose'), onPress: () => { void pickFromLibrary(); } },
          { text: t('handover.photo.cancel'), style: 'cancel' },
        ]);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, exif: false });
      if (!result.canceled && result.assets[0]) await attachPickedAsset(result.assets[0]);
    } finally {
      setPhotoBusy(false);
    }
  }, [attachPickedAsset, photos.length, pickFromLibrary, t]);

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
        {[{ id: '', label: t('handover.med.none') }, ...medications].map((opt) => (
          <TouchableOpacity
            key={opt.id || 'none'}
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
        {medicationsError && (
          // Silently showing only "none" would look like the elder has no prescriptions.
          <Text accessibilityLiveRegion="polite" style={{ fontSize: 14, fontWeight: '700', color: colors.rose }}>
            {t('handover.med.unavailable')}
          </Text>
        )}
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

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>{t('handover.photo.section')}</Text>
        {photos.map((photo, index) => (
          <View
            key={photo.localUri}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10,
              borderRadius: 14, backgroundColor: colors.paper,
              borderWidth: 1, borderColor: photo.path ? colors.mist : colors.rose,
            }}
          >
            <Image source={{ uri: photo.localUri }} style={{ width: 56, height: 56, borderRadius: 10 }} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: photo.path ? colors.ink : colors.rose }}>
              {photo.path ? t('handover.photo.attached') : t('handover.photo.not_uploaded')}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${t('handover.photo.remove')} ${index + 1}`}
              onPress={() => setPhotos((previous) => previous.filter((p) => p.localUri !== photo.localUri))}
              style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.mist }}
            >
              <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('handover.photo.add')}
          accessibilityHint={t('handover.photo.hint')}
          accessibilityState={{ disabled: photoBusy, busy: photoBusy }}
          disabled={photoBusy}
          onPress={addPhoto}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16,
            backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist,
            opacity: photoBusy ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 20 }}>📷</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
            {photoBusy ? t('handover.photo.uploading') : t('handover.photo.add')}
          </Text>
        </TouchableOpacity>
        {photos.some((photo) => !photo.path) && (
          <Text accessibilityLiveRegion="polite" style={{ fontSize: 14, fontWeight: '700', color: colors.rose }}>
            {t('handover.photo.offline_note')}
          </Text>
        )}
      </View>

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
