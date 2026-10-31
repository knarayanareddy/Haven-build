import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import { useTranslation } from '@haven/i18n';
import { useAuth } from '../auth/AuthProvider';
import { useResponsiveLayout } from '../services/platform';
import { useAccessibilityInfo } from '../services/accessibility';
import { CarerClient } from '../services/havenClient';

interface SummaryEntry {
  elder_id: string;
  elder_name: string;
  visits: number;
  meds_given: number;
  meds_missed: number;
  incidents: number;
  recommendation: { level: string; label_key: string };
  last_note: string | null;
}

export function ShiftSummary() {
  const { session } = useAuth();
  const { locale, t } = useTranslation();

  const elderIds = useMemo(() => (process.env.EXPO_PUBLIC_CARER_ELDER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean), []);
  const [summary, setSummary] = useState<SummaryEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareReady, setShareReady] = useState(false);
  const [selectedElderId, setSelectedElderId] = useState<string | null>(null);

  const { isIpad, isLandscape } = useResponsiveLayout();
  const { textMultiplier } = useAccessibilityInfo();

  useEffect(() => {
    let mounted = true;
    async function loadSummary() {
      if (!session || elderIds.length === 0) {
        setSummary([]);
        setSelectedElderId(null);
        return;
      }
      try {
        const client = new CarerClient({ supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!, accessToken: session.access_token });
        const shiftEnd = new Date().toISOString();
        const shiftStart = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
        const rows = await Promise.all(elderIds.map(async (elderId) => {
          const result = await client.shiftSummary(elderId, shiftStart, shiftEnd);
          const live = result.summary as {
            visits_completed?: number;
            medications_administered?: number;
            incidents_reported?: number;
            outstanding_tasks?: unknown[];
            recommendation?: { level?: string };
            handover_notes?: Array<{ concerns_nl: string | null }>;
          };
          const level = live.recommendation?.level ?? 'rustig';
          return {
            elder_id: elderId,
            elder_name: elderId,
            visits: Number(live.visits_completed ?? 0),
            meds_given: Number(live.medications_administered ?? 0),
            meds_missed: live.outstanding_tasks?.length ?? 0,
            incidents: Number(live.incidents_reported ?? 0),
            recommendation: {
              level,
              label_key: level === 'urgent' ? 'summary.rec.urgent' : level === 'aandacht' ? 'summary.rec.attention' : 'summary.rec.calm',
            },
            last_note: live.handover_notes?.[0]?.concerns_nl ?? null,
          };
        }));
        if (mounted) {
          setSummary(rows);
          setSelectedElderId(rows[0]?.elder_id ?? null);
          setLoadError(null);
        }
      } catch (error) {
        if (mounted) setLoadError(String((error as Error).message ?? error));
      }
    }
    loadSummary();
    return () => { mounted = false; };
  }, [elderIds, session]);

  const formatNum = (num: number) => new Intl.NumberFormat(locale).format(num);

  const total = { 
    visits: summary.reduce((s, e) => s + e.visits, 0), 
    meds: summary.reduce((s, e) => s + e.meds_given, 0), 
    incidents: summary.reduce((s, e) => s + e.incidents, 0) 
  };

  const selectedEntry = summary.find((s) => s.elder_id === selectedElderId) ?? summary[0];

  const isSplitView = isIpad && isLandscape;

  if (summary.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.linen, padding: 20, justifyContent: 'center' }}>
        <View style={{ borderRadius: 22, padding: 20, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, gap: 10 }}>
          <Text accessibilityRole="header" style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: colors.ink }}>{t('summary.title')}</Text>
          <Text style={{ fontSize: 16 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>
            {!session ? 'Log in om de live dienstsamenvatting te laden.' : elderIds.length === 0 ? 'Configureer EXPO_PUBLIC_CARER_ELDER_IDS om toegewezen ouderen te laden.' : loadError ?? 'Geen dienstgegevens gevonden.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.linen }}>
      {isSplitView ? (
        <View style={{ flex: 1, flexDirection: 'row', padding: 20 }}>
          {/* Left Column: Master List of Patients (1/3 width) */}
          <View style={{ flex: 1, borderRightWidth: 1, borderColor: colors.mist, paddingRight: 20 }}>
            <Text accessibilityRole="header" accessibilityLabel={t('summary.patients.label')} style={{ fontSize: 30 * textMultiplier, fontWeight: '900', color: colors.ink, marginBottom: 14 }}>
              {t('summary.patients')} ({formatNum(summary.length)})
            </Text>
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {summary.map((entry) => (
                <TouchableOpacity
                  key={entry.elder_id}
                  onPress={() => setSelectedElderId(entry.elder_id)}
                  style={{
                    borderRadius: 18, padding: 16,
                    backgroundColor: entry.elder_id === selectedElderId ? colors.sagePale : colors.paper,
                    borderWidth: 2,
                    borderColor: entry.elder_id === selectedElderId ? colors.sage : colors.mist,
                  }}
                >
                  <Text style={{ fontSize: 20 * textMultiplier, fontWeight: '900', color: colors.ink }}>{entry.elder_name}</Text>
                  <Text style={{ fontSize: 14 * textMultiplier, fontWeight: '700', color: entry.recommendation.level === 'urgent' ? colors.rose : colors.graphite, marginTop: 4 }}>
                    {t(entry.recommendation.label_key as any)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Right Column: Selected Patient Detail & EMR Metrics (2/3 width) */}
          <View style={{ flex: 2, paddingLeft: 20, justifyContent: 'space-between' }}>
            <ScrollView contentContainerStyle={{ gap: 16 }}>
              <Text accessibilityRole="header" style={{ fontSize: 30 * textMultiplier, fontWeight: '900', color: colors.ink }}>
                {t('summary.detail')}
              </Text>

              <View style={{ borderRadius: 22, padding: 20, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, gap: 12 }}>
                <Text style={{ fontSize: 26 * textMultiplier, fontWeight: '900', color: colors.ink }}>{selectedEntry.elder_name}</Text>
                <View style={{ backgroundColor: selectedEntry.recommendation.level === 'urgent' ? colors.rose : colors.sagePale, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 16 * textMultiplier, fontWeight: '900', color: selectedEntry.recommendation.level === 'urgent' ? 'white' : colors.ink }}>
                    {t(selectedEntry.recommendation.label_key as any)}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 24, marginTop: 8 }}>
                  <Text style={{ fontSize: 18 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>💊 {t('summary.meds')}: {formatNum(selectedEntry.meds_given)}/{formatNum(selectedEntry.meds_given + selectedEntry.meds_missed)}</Text>
                  <Text style={{ fontSize: 18 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>🚨 {t('summary.incidents')}: {formatNum(selectedEntry.incidents)}</Text>
                </View>

                {selectedEntry.last_note && (
                  <View style={{ marginTop: 8, padding: 14, backgroundColor: colors.linen, borderRadius: 14 }}>
                    <Text style={{ fontSize: 16 * textMultiplier, color: colors.pewter, fontWeight: '700', marginBottom: 4 }}>{t('summary.last_note')}</Text>
                    <Text style={{ fontSize: 16 * textMultiplier, color: colors.ink, fontWeight: '500' }}>{selectedEntry.last_note}</Text>
                  </View>
                )}
              </View>

              <View style={{ borderRadius: 22, padding: 20, backgroundColor: colors.sagePale, borderWidth: 1, borderColor: colors.mist, flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 }}>
                <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: colors.sage }}>{formatNum(total.visits)}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>{t('summary.shift_visits')}</Text></View>
                <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: colors.sage }}>{formatNum(total.meds)}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>{t('summary.shift_meds')}</Text></View>
                <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: total.incidents > 0 ? colors.rose : colors.sage }}>{formatNum(total.incidents)}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>{t('summary.shift_incidents')}</Text></View>
              </View>
            </ScrollView>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('summary.share.label')}
              accessibilityHint={t('summary.generate.hint')}
              onPress={() => { setShareReady(true); Alert.alert(t('carerAppTitle'), t('summary.alert.shared')); }}
              style={{ backgroundColor: colors.sage, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 14 }}
            >
              <Text style={{ color: 'white', fontSize: 18 * textMultiplier, fontWeight: '900' }}>{shareReady ? t('summary.shared_shift') : t('summary.share_shift')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Text accessibilityRole="header" style={{ fontSize: 30 * textMultiplier, fontWeight: '900', color: colors.ink }}>{t('summary.title')}</Text>

          <View style={{ borderRadius: 22, padding: 20, backgroundColor: colors.sagePale, borderWidth: 1, borderColor: colors.mist, flexDirection: 'row', justifyContent: 'space-around' }}>
            <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: colors.sage }}>{formatNum(total.visits)}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>{t('summary.visits')}</Text></View>
            <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: colors.sage }}>{formatNum(total.meds)}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>{t('summary.meds')}</Text></View>
            <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: total.incidents > 0 ? colors.rose : colors.sage }}>{formatNum(total.incidents)}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>{t('summary.incidents')}</Text></View>
          </View>

          {summary.map((entry) => (
            <View key={entry.elder_id} style={{ borderRadius: 22, padding: 20, backgroundColor: colors.paper, borderWidth: 1, borderColor: entry.recommendation.level === 'urgent' ? colors.rose : entry.recommendation.level === 'aandacht' ? colors.amber : colors.mist, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 22 * textMultiplier, fontWeight: '900', color: colors.ink }}>{entry.elder_name}</Text>
                <Text style={{ fontSize: 14 * textMultiplier, fontWeight: '900', color: entry.recommendation.level === 'urgent' ? colors.rose : entry.recommendation.level === 'aandacht' ? colors.amber : colors.sage }}>{t(entry.recommendation.label_key as any)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>💊 {t('summary.meds')}: {formatNum(entry.meds_given)}/{formatNum(entry.meds_given + entry.meds_missed)}</Text>
                <Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>🚨 {t('summary.incidents')}: {formatNum(entry.incidents)}</Text>
              </View>
              {entry.last_note && <Text style={{ fontSize: 14 * textMultiplier, color: colors.pewter, fontWeight: '600' }} numberOfLines={2}>📝 {entry.last_note}</Text>}
            </View>
          ))}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('summary.share.label')}
            accessibilityHint={t('summary.generate.hint')}
            onPress={() => { setShareReady(true); Alert.alert(t('carerAppTitle'), t('summary.alert.shared')); }}
            style={{ backgroundColor: colors.sage, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8 }}
          >
            <Text style={{ color: 'white', fontSize: 18 * textMultiplier, fontWeight: '900' }}>{shareReady ? t('summary.shared') : t('summary.share_shift')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

    </View>
  );
}
