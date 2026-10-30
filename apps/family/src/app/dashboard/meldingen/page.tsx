import React from 'react';

import { DashboardCard } from '../../../components/DashboardCard';
import { withFamilyConsent } from '../../../components/ConsentGate';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

interface AlertRow {
  id: string;
  alert_level: string;
  explanation_nl: string | null;
  created_at: string;
}

const LEVEL_COPY: Record<string, string> = {
  rood: 'Dringend — bel rustig even mee',
  zwart: 'Zeer dringend — neem contact op',
  amber: 'Let op — bespreek dit samen',
  geel: 'Licht — geen actie nodig',
  groen: 'Veilig',
  none: 'Veilig',
};

export default function AlertsPage() {
  return withFamilyConsent('alerts', 'Veiligheidsmeldingen', async (session) => {
    const supabase = await createSupabaseServerClient();

    const { data, error } = supabase
      ? await supabase
          .from('scam_events')
          .select('id, alert_level, explanation_nl, created_at')
          .eq('elder_id', session.elderId)
          .in('alert_level', ['amber', 'rood', 'zwart'])
          .order('created_at', { ascending: false })
          .limit(20)
      : { data: null, error: null };

    const rows = (data ?? []) as AlertRow[];

    return (
      <>
        <DashboardCard title="Recente meldingen" subtitle="SCHILD — uitleg in plaats van paniek" tone="amber">
          {error ? (
            <p style={{ margin: 0, fontWeight: 700 }}>De meldingen konden niet worden geladen.</p>
          ) : rows.length === 0 ? (
            <p style={{ margin: 0, fontWeight: 700 }}>Er zijn de afgelopen periode geen veiligheidsmeldingen.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
              {rows.map((row) => (
                <li key={row.id} style={{ padding: 16, borderRadius: 18, background: '#FFFFFF', border: '1px solid #E8EBF2' }}>
                  <div style={{ fontWeight: 900 }}>{LEVEL_COPY[row.alert_level] ?? row.alert_level}</div>
                  <div style={{ color: '#6B7490', fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                    {new Date(row.created_at).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                  {row.explanation_nl ? <p style={{ margin: '8px 0 0', fontWeight: 700 }}>{row.explanation_nl}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
        <DashboardCard title="Wat u niet ziet" subtitle="Privacy by design">
          <p style={{ margin: 0, fontWeight: 700 }}>
            Inhoud van gesprekken, bedragen en rekeningnummers worden nooit getoond. Alleen het risiconiveau en een neutrale uitleg.
          </p>
        </DashboardCard>
      </>
    );
  });
}
