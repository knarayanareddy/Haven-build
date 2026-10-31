// ─── Phase 3.1: Carer Visit List Screen ───
// Today's schedule of elders to visit. Shows medication status,
// last handover note summary, and one-tap "Start visit" / "Complete visit".

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@haven/ui/src/tokens';
import { useAuth } from '../auth/AuthProvider';
import { CarerClient } from '../services/havenClient';
import { enqueueOffline, getQueueSize, refreshOfflineQueueSize } from '../services/offlineQueue';

interface ElderVisit {
  elder_id: string;
  elder_name: string;
  next_medication: string | null;
  last_note_summary: string | null;
  visit_status: 'pending' | 'in_progress' | 'completed';
  started_at: string | null;
}

function sessionUserId(session: { access_token?: string } | null): string | null {
  const directUser = (session as unknown as { user?: { id?: string } } | null)?.user?.id;
  if (directUser) return directUser;
  const token = session?.access_token;
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload))?.sub ?? null;
  } catch {
    return null;
  }
}

export function VisitList({ navigation }: { navigation: { navigate: (screen: string, params?: Record<string, string>) => void } }) {
  const { session } = useAuth();
  const elderIds = useMemo(() => (process.env.EXPO_PUBLIC_CARER_ELDER_IDS ?? '').split(',').map((id: string) => id.trim()).filter(Boolean), []);
  const [visits, setVisits] = useState<ElderVisit[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(getQueueSize());

  useEffect(() => {
    // Count only this carer's captures: the store lives on the handset, and a shared device
    // holds her colleague's queue too. Reading IndexedDB is async, so poll it rather than the
    // synchronous mirror, which is empty after a cold start.
    let cancelled = false;
    const carerId = sessionUserId(session) ?? undefined;
    const tick = async () => {
      const count = await refreshOfflineQueueSize(carerId);
      if (!cancelled) setOfflineCount(count);
    };
    setOfflineCount(getQueueSize());
    void tick();
    const interval = setInterval(() => { void tick(); }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  useEffect(() => {
    let mounted = true;
    async function loadVisits() {
      if (!session || elderIds.length === 0) {
        setVisits([]);
        return;
      }

      try {
        const client = new CarerClient({
          supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!,
          accessToken: session.access_token,
        });
        const shiftEnd = new Date().toISOString();
        const shiftStart = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
        const rows = await Promise.all(elderIds.map(async (elderId: string) => {
          const result = await client.shiftSummary(elderId, shiftStart, shiftEnd);
          const summary = result.summary as {
            outstanding_tasks?: Array<{ medication_name: string; scheduled_time: string }>;
            handover_notes?: Array<{ concerns_nl: string | null }>;
          };
          const nextMed = summary.outstanding_tasks?.[0];
          return {
            elder_id: elderId,
            elder_name: elderId,
            next_medication: nextMed ? `${nextMed.medication_name} ${new Date(nextMed.scheduled_time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : null,
            last_note_summary: summary.handover_notes?.[0]?.concerns_nl ?? null,
            visit_status: 'pending' as const,
            started_at: null,
          };
        }));
        if (mounted) {
          setVisits(rows);
          setLoadError(null);
        }
      } catch (error) {
        if (mounted) setLoadError(String((error as Error).message ?? error));
      }
    }
    loadVisits();
    return () => { mounted = false; };
  }, [elderIds, session]);

  const startVisit = useCallback((elderId: string) => {
    const startedAt = new Date().toISOString();
    setVisits((prev) => prev.map((v) => v.elder_id === elderId ? { ...v, visit_status: 'in_progress' as const, started_at: startedAt } : v));
  }, []);

  const completeVisit = useCallback(async (elderId: string) => {
    const visit = visits.find((v) => v.elder_id === elderId);
    const completedAt = new Date().toISOString();
    const signedInCarerId = sessionUserId(session);
    if (!session || !signedInCarerId) {
      // Without a session there is no carer to attribute the visit to. Queuing it under a made-up
      // id is how this used to lose the attribution entirely; say so instead of filing it wrong.
      Alert.alert('HAVEN', 'Log opnieuw in om je bezoek af te ronden.');
      return;
    }
    try {
      const client = new CarerClient({ supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!, accessToken: session.access_token });
      await client.visitLog({
        elder_id: elderId,
        carer_id: signedInCarerId,
        visit_date: completedAt.slice(0, 10),
        check_in_time: visit?.started_at ?? completedAt,
        check_out_time: completedAt,
      });
      setVisits((prev) => prev.map((v) => v.elder_id === elderId ? { ...v, visit_status: 'completed' as const } : v));
    } catch (error) {
      void enqueueOffline(signedInCarerId, 'visit_log', { elder_id: elderId, check_in_time: visit?.started_at ?? completedAt, check_out_time: completedAt }).catch(() => undefined);
      Alert.alert('HAVEN', String((error as Error).message ?? error));
    }
  }, [session, visits]);

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

      {!session && (
        <View style={{ borderRadius: 18, padding: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist }}>
          <Text style={{ color: colors.graphite, fontWeight: '800' }}>Log in om live bezoeken te laden.</Text>
        </View>
      )}

      {session && elderIds.length === 0 && (
        <View style={{ borderRadius: 18, padding: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist }}>
          <Text style={{ color: colors.graphite, fontWeight: '800' }}>Configureer EXPO_PUBLIC_CARER_ELDER_IDS om toegewezen ouderen te laden.</Text>
        </View>
      )}

      {loadError && (
        <View style={{ borderRadius: 18, padding: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.amber }}>
          <Text style={{ color: colors.graphite, fontWeight: '800' }}>{loadError}</Text>
        </View>
      )}

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
