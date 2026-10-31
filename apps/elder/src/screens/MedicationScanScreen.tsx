// Photographing a medicine box so HAVEN can read it into the medication list.
//
// The elder app shipped `client.medicationOcr` and `expo-camera`, and no screen called either —
// the endpoint had no caller in any app. This is the caller: a camera screen with one large
// button, an honest progress state, and a result sentence an older adult can act on. There is no
// "type it in instead" fallback because a typed label is a different feature (and the family app
// is the place for correcting a reading).
//
// The flow, in order, and why each step exists:
//
//   1. camera permission, asked with a sentence rather than a system modal appearing from nowhere;
//   2. capture at 0.6 quality — the label has to stay legible, and a 12 MP phone photo is 8 MB;
//   3. upload to `ocr-inbox/<elder id>/…` (the bucket policy allows only the elder's own folder);
//   4. call `fn-medication-ocr`, which reads it with a vision model and either files a
//      prescription or sends it to family/pharmacy for review;
//   5. say which of those happened. `review_required` is not a failure and must not read as one.

import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from '@haven/i18n';
import { colors as baseColors, touch } from '@haven/ui/src/tokens';
import { useAuth } from '../auth/AuthProvider';
import { useNavigation } from '@react-navigation/native';
import { HavenClient } from '../services/havenClient';
import { uploadStorageObject, storageObjectPath } from '@haven/contracts/src/storage';
import { profileIdFromSession } from '@haven/contracts/src/session';

type Phase = 'ready' | 'reading' | 'added' | 'review' | 'failed';

export function MedicationScanScreen() {
  const { t, locale } = useTranslation();
  const { session } = useAuth();
  const navigation = useNavigation<{ goBack: () => void }>();
  const [permission, requestPermission] = useCameraPermissions();
  // expo-camera's `CameraView` is a class component; the ref is typed structurally because the
  // only method used here is `takePictureAsync`.
  const camera = useRef<{ takePictureAsync: (options?: { quality?: number; base64?: boolean; exif?: boolean }) => Promise<{ uri?: string } | undefined> } | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [message, setMessage] = useState<string | null>(null);

  const colors = baseColors;
  const elderId = profileIdFromSession(session as { access_token?: string } | null);

  const read = useCallback(async () => {
    if (!session || !elderId) {
      setMessage(t('medScan.offline'));
      setPhase('failed');
      return;
    }
    setPhase('reading');
    setMessage(null);
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.6, base64: false, exif: false });
      if (!photo?.uri) throw new Error('no-photo');

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const path = storageObjectPath(elderId, `${Date.now().toString(36)}.jpg`);
      await uploadStorageObject({
        supabaseUrl,
        accessToken: session.access_token,
        bucket: 'ocr-inbox',
        path,
        file: { uri: photo.uri, name: path.split('/').pop()!, type: 'image/jpeg' },
      });

      const client = new HavenClient({ supabaseUrl, accessToken: session.access_token });
      const result = await client.medicationOcr({
        elder_id: elderId,
        uploaded_by_id: elderId,
        storage_path: path,
      }) as { review_required?: boolean; extracted?: { name_nl?: string; dose_nl?: string } };

      const name = result.extracted?.name_nl ?? '';
      const dose = result.extracted?.dose_nl ?? '';
      if (result.review_required) {
        // Not a failure: the reading happened, a person still has to agree with it.
        setMessage(`${t('medScan.found').replace('{name}', name).replace('{dose}', dose)} ${t('medScan.needsReview')}`);
        setPhase('review');
      } else {
        setMessage(`${t('medScan.found').replace('{name}', name).replace('{dose}', dose)} ${t('medScan.added')}`);
        setPhase('added');
      }
    } catch (error) {
      const status = (error as { status?: number }).status;
      setMessage(status === 503 ? t('medScan.unreadable') : status === 413 ? t('medScan.tooLarge') : t('medScan.failed'));
      setPhase('failed');
    }
  }, [elderId, session, t]);

  if (!permission) {
    // The permission hook has not resolved yet; a spinner is honest, a camera preview is not.
    return (
      <View style={{ flex: 1, backgroundColor: colors.linen, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.linen, padding: 24, gap: 16, justifyContent: 'center' }}>
        <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '900', color: colors.ink }}>{t('medScan.title')}</Text>
        <Text style={{ fontSize: 20, color: colors.graphite, fontWeight: '700' }}>{t('medScan.intro')}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('medScan.allow')}
          onPress={() => { void requestPermission(); }}
          style={{ minHeight: touch.minimum, borderRadius: 20, backgroundColor: colors.slate, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: 'white', fontSize: 22, fontWeight: '900' }}>{t('medScan.allow')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('medScan.done')}
          onPress={() => navigation.goBack()}
          style={{ minHeight: touch.minimum, borderRadius: 20, borderWidth: 2, borderColor: colors.slate, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.slate, fontSize: 22, fontWeight: '900' }}>{t('medScan.done')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.linen }}>
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" />

      <View style={{ padding: 20, gap: 12 }}>
        <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '900', color: colors.ink }}>{t('medScan.title')}</Text>
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 18, fontWeight: '700', color: phase === 'failed' ? colors.rose : colors.graphite }}>
          {message ?? t('medScan.intro')}
        </Text>
        <Text style={{ fontSize: 14, color: colors.pewter, fontWeight: '700' }}>{t('medScan.privacy')}</Text>

        {phase === 'reading' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touch.minimum }}>
            <ActivityIndicator />
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{t('medScan.reading')}</Text>
          </View>
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={phase === 'ready' ? t('medScan.capture') : t('medScan.retake')}
            onPress={() => { setPhase('ready'); setMessage(null); void read(); }}
            style={{ minHeight: touch.minimum, borderRadius: 20, backgroundColor: colors.slate, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: 'white', fontSize: 24, fontWeight: '900' }}>
              {phase === 'ready' ? t('medScan.capture') : t('medScan.retake')}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('medScan.done')}
          onPress={() => navigation.goBack()}
          style={{ minHeight: touch.minimum, borderRadius: 20, borderWidth: 2, borderColor: colors.slate, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.slate, fontSize: 22, fontWeight: '900' }}>{t('medScan.done')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export { baseColors as scanColors };
export type { Phase as MedicationScanPhase };
