import React from 'react';

import { DashboardCard } from '../../../components/DashboardCard';
import { withFamilyConsent } from '../../../components/ConsentGate';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

// Consent-scoped: RLS on medication_reminders already restricts rows to the family
// member; the gate adds an explicit, visible explanation when access is withheld.
export const dynamic = 'force-dynamic';

interface ReminderRow {
  id: string;
  scheduled_time: string;
  status: string;
  medication_id: string | null;
}

export default function MedicationsPage() {
  return withFamilyConsent('medications', 'Medicatie', async (session) => {
    const supabase = await createSupabaseServerClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = supabase
      ? await supabase
          .from('medication_reminders')
          .select('id, scheduled_time, status, medication_id')
          .eq('elder_id', session.elderId)
          .gte('scheduled_time', `${today}T00:00:00.000Z`)
          .lte('scheduled_time', `${today}T23:59:59.999Z`)
          .order('scheduled_time', { ascending: true })
      : { data: null, error: null };

    const rows = (data ?? []) as ReminderRow[];

    return (
      <>
        <DashboardCard title="Vandaag" subtitle={`${rows.length} herinneringen voor ${session.elderName || 'de oudere'}`} tone="safe">
          {error ? (
            <p style={{ margin: 0, fontWeight: 700 }}>De medicatie van vandaag kon niet worden geladen.</p>
          ) : rows.length === 0 ? (
            <p style={{ margin: 0, fontWeight: 700 }}>Er staan vandaag geen medicatieherinneringen gepland.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
              {rows.map((row) => (
                <li key={row.id} style={{ padding: 14, borderRadius: 16, background: '#FFFFFF', border: '1px solid #E8EBF2', fontWeight: 800 }}>
                  {new Date(row.scheduled_time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                  {row.status === 'ingenomen' ? 'bevestigd' : 'nog niet bevestigd'}
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
        <DashboardCard title="Privacy" subtitle="Wat u hier ziet">
          <p style={{ margin: 0, fontWeight: 700 }}>
            U ziet alleen de tijden en status van herinneringen. Medische notities en de volledige medicatielijst blijven bij de oudere en de zorgverlener.
          </p>
        </DashboardCard>
      </>
    );
  });
}
