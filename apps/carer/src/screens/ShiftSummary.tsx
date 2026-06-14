import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import { useAuth } from '../auth/AuthProvider';
import { CarerClient } from '../services/havenClient';

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
  void session;

  const total = { visits: summary.reduce((s, e) => s + e.visits, 0), meds: summary.reduce((s, e) => s + e.meds_given, 0), incidents: summary.reduce((s, e) => s + e.incidents, 0) };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.linen }} contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>Overdracht</Text>

      <View style={{ borderRadius: 22, padding: 20, backgroundColor: colors.sagePale, borderWidth: 1, borderColor: colors.mist, flexDirection: 'row', justifyContent: 'space-around' }}>
        <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28, fontWeight: '900', color: colors.sage }}>{total.visits}</Text><Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700' }}>Bezoeken</Text></View>
        <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28, fontWeight: '900', color: colors.sage }}>{total.meds}</Text><Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700' }}>Medicatie</Text></View>
        <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28, fontWeight: '900', color: total.incidents > 0 ? colors.rose : colors.sage }}>{total.incidents}</Text><Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700' }}>Incidenten</Text></View>
      </View>

      {summary.map((entry) => (
        <View key={entry.elder_id} style={{ borderRadius: 22, padding: 20, backgroundColor: colors.paper, borderWidth: 1, borderColor: entry.recommendation.level === 'urgent' ? colors.rose : entry.recommendation.level === 'aandacht' ? colors.amber : colors.mist, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>{entry.elder_name}</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: entry.recommendation.level === 'urgent' ? colors.rose : entry.recommendation.level === 'aandacht' ? colors.amber : colors.sage }}>{entry.recommendation.label_nl}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700' }}>💊 {entry.meds_given}/{entry.meds_given + entry.meds_missed}</Text>
            <Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700' }}>🚨 {entry.incidents}</Text>
          </View>
          {entry.last_note && <Text style={{ fontSize: 14, color: colors.pewter, fontWeight: '600' }} numberOfLines={2}>📝 {entry.last_note}</Text>}
        </View>
      ))}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Deel overdracht"
        onPress={() => { setShareReady(true); Alert.alert('HAVEN WACHT', 'Overdracht gedeeld met volgende shift. Bedankt.'); }}
        style={{ backgroundColor: colors.sage, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8 }}
      >
        <Text style={{ color: 'white', fontSize: 18, fontWeight: '900' }}>{shareReady ? '✓ Gedeeld' : 'Deel overdracht met volgende shift'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
