import React, { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import { useAuth } from '../auth/AuthProvider';
import { useResponsiveLayout } from '../services/platform';
import { useAccessibilityInfo } from '../services/accessibility';
import { FloatingVoiceButton } from '../components/FloatingVoiceButton';

interface SummaryEntry {
  elder_id: string;
  elder_name: string;
  visits: number;
  meds_given: number;
  meds_missed: number;
  incidents: number;
  recommendation: { level: string; label_nl: string };
  last_note: string | null;
}

const DEMO_SUMMARY: SummaryEntry[] = [
  { elder_id: '00000000-0000-0000-0000-000000000001', elder_name: 'Margreet Bakker', visits: 1, meds_given: 3, meds_missed: 0, incidents: 0, recommendation: { level: 'rustig', label_nl: 'Alles rustig' }, last_note: 'Stemming rustig. Medicatie afgerond.' },
  { elder_id: '11111111-0000-0000-0000-000000000002', elder_name: 'Jan de Vries', visits: 1, meds_given: 2, meds_missed: 1, incidents: 0, recommendation: { level: 'aandacht', label_nl: 'Let op — medicatie gemist' }, last_note: 'Mobiliteit verminderd.' },
  { elder_id: '22222222-0000-0000-0000-000000000003', elder_name: 'Ans Smit', visits: 0, meds_given: 0, meds_missed: 0, incidents: 1, recommendation: { level: 'urgent', label_nl: 'Urgent — incident gemeld' }, last_note: 'Val gemeld in badkamer.' },
];

export function ShiftSummary() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<SummaryEntry[]>(DEMO_SUMMARY);
  const [shareReady, setShareReady] = useState(false);
  const [selectedElderId, setSelectedElderId] = useState<string>(DEMO_SUMMARY[0].elder_id);

  const { isIpad, isLandscape } = useResponsiveLayout();
  const { textMultiplier } = useAccessibilityInfo();
  void session;

  const total = { 
    visits: summary.reduce((s, e) => s + e.visits, 0), 
    meds: summary.reduce((s, e) => s + e.meds_given, 0), 
    incidents: summary.reduce((s, e) => s + e.incidents, 0) 
  };

  const selectedEntry = summary.find((s) => s.elder_id === selectedElderId) ?? summary[0];

  // LAYOUT 2: Split-view for shift summary + handover notes on iPad landscape
  const isSplitView = isIpad && isLandscape;

  return (
    <View style={{ flex: 1, backgroundColor: colors.linen }}>
      {isSplitView ? (
        <View style={{ flex: 1, flexDirection: 'row', padding: 20 }}>
          {/* Left Column: Master List of Patients (1/3 width) */}
          <View style={{ flex: 1, borderRightWidth: 1, borderColor: colors.mist, paddingRight: 20 }}>
            <Text accessibilityRole="header" style={{ fontSize: 30 * textMultiplier, fontWeight: '900', color: colors.ink, marginBottom: 14 }}>
              Patiënten ({summary.length})
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
                    {entry.recommendation.label_nl}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Right Column: Selected Patient Detail & EMR Metrics (2/3 width) */}
          <View style={{ flex: 2, paddingLeft: 20, justifyContent: 'space-between' }}>
            <ScrollView contentContainerStyle={{ gap: 16 }}>
              <Text accessibilityRole="header" style={{ fontSize: 30 * textMultiplier, fontWeight: '900', color: colors.ink }}>
                Overdracht Detail
              </Text>

              <View style={{ borderRadius: 22, padding: 20, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, gap: 12 }}>
                <Text style={{ fontSize: 26 * textMultiplier, fontWeight: '900', color: colors.ink }}>{selectedEntry.elder_name}</Text>
                <View style={{ backgroundColor: selectedEntry.recommendation.level === 'urgent' ? colors.rose : colors.sagePale, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 16 * textMultiplier, fontWeight: '900', color: selectedEntry.recommendation.level === 'urgent' ? 'white' : colors.ink }}>
                    {selectedEntry.recommendation.label_nl}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 24, marginTop: 8 }}>
                  <Text style={{ fontSize: 18 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>💊 Medicatie: {selectedEntry.meds_given}/{selectedEntry.meds_given + selectedEntry.meds_missed}</Text>
                  <Text style={{ fontSize: 18 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>🚨 Incidenten: {selectedEntry.incidents}</Text>
                </View>

                {selectedEntry.last_note && (
                  <View style={{ marginTop: 8, padding: 14, backgroundColor: colors.linen, borderRadius: 14 }}>
                    <Text style={{ fontSize: 16 * textMultiplier, color: colors.pewter, fontWeight: '700', marginBottom: 4 }}>Laatste WACHT Notitie:</Text>
                    <Text style={{ fontSize: 16 * textMultiplier, color: colors.ink, fontWeight: '500' }}>{selectedEntry.last_note}</Text>
                  </View>
                )}
              </View>

              <View style={{ borderRadius: 22, padding: 20, backgroundColor: colors.sagePale, borderWidth: 1, borderColor: colors.mist, flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 }}>
                <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: colors.sage }}>{total.visits}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>Shift Bezoeken</Text></View>
                <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: colors.sage }}>{total.meds}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>Shift Medicatie</Text></View>
                <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: total.incidents > 0 ? colors.rose : colors.sage }}>{total.incidents}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>Shift Incidenten</Text></View>
              </View>
            </ScrollView>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Deel overdracht"
              onPress={() => { setShareReady(true); Alert.alert('HAVEN WACHT', 'Overdracht gedeeld met volgende shift. Bedankt.'); }}
              style={{ backgroundColor: colors.sage, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 14 }}
            >
              <Text style={{ color: 'white', fontSize: 18 * textMultiplier, fontWeight: '900' }}>{shareReady ? '✓ Gedeeld met shift' : 'Deel overdracht met volgende shift'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Standard Single-Column Existing Behavior (iPad Portrait or iPhone) */
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Text accessibilityRole="header" style={{ fontSize: 30 * textMultiplier, fontWeight: '900', color: colors.ink }}>Overdracht</Text>

          <View style={{ borderRadius: 22, padding: 20, backgroundColor: colors.sagePale, borderWidth: 1, borderColor: colors.mist, flexDirection: 'row', justifyContent: 'space-around' }}>
            <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: colors.sage }}>{total.visits}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>Bezoeken</Text></View>
            <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: colors.sage }}>{total.meds}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>Medicatie</Text></View>
            <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 * textMultiplier, fontWeight: '900', color: total.incidents > 0 ? colors.rose : colors.sage }}>{total.incidents}</Text><Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>Incidenten</Text></View>
          </View>

          {summary.map((entry) => (
            <View key={entry.elder_id} style={{ borderRadius: 22, padding: 20, backgroundColor: colors.paper, borderWidth: 1, borderColor: entry.recommendation.level === 'urgent' ? colors.rose : entry.recommendation.level === 'aandacht' ? colors.amber : colors.mist, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 22 * textMultiplier, fontWeight: '900', color: colors.ink }}>{entry.elder_name}</Text>
                <Text style={{ fontSize: 14 * textMultiplier, fontWeight: '900', color: entry.recommendation.level === 'urgent' ? colors.rose : entry.recommendation.level === 'aandacht' ? colors.amber : colors.sage }}>{entry.recommendation.label_nl}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>💊 {entry.meds_given}/{entry.meds_given + entry.meds_missed}</Text>
                <Text style={{ fontSize: 14 * textMultiplier, color: colors.graphite, fontWeight: '700' }}>🚨 {entry.incidents}</Text>
              </View>
              {entry.last_note && <Text style={{ fontSize: 14 * textMultiplier, color: colors.pewter, fontWeight: '600' }} numberOfLines={2}>📝 {entry.last_note}</Text>}
            </View>
          ))}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Deel overdracht"
            onPress={() => { setShareReady(true); Alert.alert('HAVEN WACHT', 'Overdracht gedeeld met volgende shift. Bedankt.'); }}
            style={{ backgroundColor: colors.sage, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8 }}
          >
            <Text style={{ color: 'white', fontSize: 18 * textMultiplier, fontWeight: '900' }}>{shareReady ? '✓ Gedeeld' : 'Deel overdracht met volgende shift'}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* FloatingVoiceButton with LAYOUT 3 Repositioning */}
      <FloatingVoiceButton />
    </View>
  );
}
