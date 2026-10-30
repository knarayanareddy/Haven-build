import React from 'react';

import { DashboardCard } from '../../../components/DashboardCard';
import { withFamilyConsent } from '../../../components/ConsentGate';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

interface VisitRow {
  id: string;
  visit_date: string;
  check_in_time: string | null;
}

export default function WachtPage() {
  // Care notes follow the message permission: there is no separate consent column,
  // and inventing one would let the UI grant access RLS does not.
  return withFamilyConsent('visits', 'Zorg', async (session) => {
    const supabase = await createSupabaseServerClient();

    const { data, error } = supabase
      ? await supabase
          .from('carer_visit_logs')
          .select('id, visit_date, check_in_time')
          .eq('elder_id', session.elderId)
          .order('visit_date', { ascending: false })
          .limit(10)
      : { data: null, error: null };

    const rows = (data ?? []) as VisitRow[];

    return (
      <DashboardCard title="WACHT" subtitle="Professionele zorg overdracht">
        {error ? (
          <p style={{ margin: 0, fontWeight: 700 }}>Zorgnotities konden niet worden geladen.</p>
        ) : rows.length === 0 ? (
          <p style={{ margin: 0, fontWeight: 700 }}>Er zijn geen recente zorgbezoeken gedeeld.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {rows.map((row) => (
              <li key={row.id} style={{ padding: 14, borderRadius: 16, background: '#FFFFFF', border: '1px solid #E8EBF2', fontWeight: 800 }}>
                Bezoek ·{' '}
                <span style={{ color: '#6B7490', fontWeight: 700 }}>
                  {new Date(row.visit_date).toLocaleDateString('nl-NL', { dateStyle: 'medium' })}
                  {row.check_in_time
                    ? ` · ${new Date(row.check_in_time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>
    );
  });
}
