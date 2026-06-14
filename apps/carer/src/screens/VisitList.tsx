// ─── Phase 3.1: Carer Visit List Screen ───
// Today's schedule of elders to visit. Shows medication status,
// last handover note summary, and one-tap "Start visit" / "Complete visit".

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import { useAuth } from '../auth/AuthProvider';
import { CarerClient } from '../services/havenClient';
import { getOfflineQueue, getQueueSize } from '../services/offlineQueue';

interface ElderVisit {
  elder_id: string;
  elder_name: string;
  next_medication: string | null;
  last_note_summary: string | null;
  visit_status: 'pending' | 'in_progress' | 'completed';
}

// Demo data — in production, fetched from fn-care-plan + fn-shift-summary
const DEMO_VISITS: ElderVisit[] = [
  { elder_id: '00000000-0000-0000-0000-000000000001', elder_name: 'Margreet Bakker', next_medication: 'Metformine 500 mg om 08:00', last_note_summary: 'Stemming rustig. Medicatiecontrole afgerond.', visit_status: 'in_progress' },
  { elder_id: '11111111-0000-0000-0000-000000000002', elder_name: 'Jan de Vries', next_medication: 'Lisinopril 10 mg om 09:00', last_note_summary: 'Mobiliteit verminderd. Extra hulp bij opstaan.', visit_status: 'pending' },
  { elder_id: '22222222-0000-0000-0000-000000000003', elder_name: 'Ans Smit', next_medication: null, last_note_summary: null, visit_status: 'pending' },
];

export function VisitList({ navigation }: { navigation: { navigate: (screen: string, params?: Record<string, string>) => void } }) {
  const { session } = useAuth();
  const [visits, setVisits] = useState<ElderVisit[]>(DEMO_VISITS);
  const [offlineCount, setOfflineCount] = useState(getQueueSize());

  useEffect(() => {
    const interval = setInterval(() => setOfflineCount(getQueueSize()), 5000);
    return () => clearInterval(interval);
  }, []);

  const startVisit = useCallback((elderId: string) => {
    setVisits((prev) => prev.map((v) => v.elder_id === elderId ? { ...v, visit_status: 'in_progress' as const } : v));
  }, []);

  const completeVisit = useCallback((elderId: string) => {
    setVisits((prev) => prev.map((v) => v.elder_id === elderId ? { ...v, visit_status: 'completed' as const } : v));
  }, []);

  void session;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.linen }} contentContainerStyle={{ padding: 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>
          Vandaag ({visits.length})
        </Text>
        {offlineCount > 0 && (
          <View style={{ backgroundColor: colors.amber, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: colors.amber, fontWeight: '900' }}>
              {offlineCount} offline
            </Text>
          </View>
        )}
      </View>

      {visits.map((visit) => (
        <View
          key={visit.elder_id}
          style={{
            borderRadius: 22, padding: 20, backgroundColor: colors.paper,
            borderWidth: 1, borderColor: visit.visit_status === 'completed' ? colors.sage : colors.mist,
            gap: 8,
            opacity: visit.visit_status === 'completed' ? 0.6 : 1,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>{visit.elder_name}</Text>
            <View style={{
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
              backgroundColor: visit.visit_status === 'completed' ? colors.sagePale :
                visit.visit_status === 'in_progress' ? colors.amberPale : colors.paper,
            }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: colors.graphite }}>
                {visit.visit_status === 'completed' ? 'Klaar' : visit.visit_status === 'in_progress' ? 'Bezig' : 'Te doen'}
              </Text>
            </View>
          </View>

          {visit.next_medication && (
            <Text style={{ fontSize: 16, color: colors.graphite, fontWeight: '700' }}>💊 {visit.next_medication}</Text>
          )}
          {visit.last_note_summary && (
            <Text style={{ fontSize: 14, color: colors.pewter, fontWeight: '600' }} numberOfLines={2}>
              📝 {visit.last_note_summary}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {visit.visit_status === 'pending' && (
              <TouchableOpacity
                accessibilityRole="button" accessibilityLabel={`Start bezoek ${visit.elder_name}`}
                onPress={() => startVisit(visit.elder_id)}
                style={{ flex: 1, backgroundColor: colors.sage, borderRadius: 16, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>Start bezoek</Text>
              </TouchableOpacity>
            )}
            {visit.visit_status === 'in_progress' && (
              <>
                <TouchableOpacity
                  accessibilityRole="button" accessibilityLabel={`Notitie ${visit.elder_name}`}
                  onPress={() => navigation.navigate('HandoverForm', { elder_id: visit.elder_id, elder_name: visit.elder_name })}
                  style={{ flex: 1, backgroundColor: colors.slate, borderRadius: 16, paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>Notitie</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button" accessibilityLabel={`Voltooi bezoek ${visit.elder_name}`}
                  onPress={() => completeVisit(visit.elder_id)}
                  style={{ flex: 1, backgroundColor: colors.sage, borderRadius: 16, paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>Voltooid</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
