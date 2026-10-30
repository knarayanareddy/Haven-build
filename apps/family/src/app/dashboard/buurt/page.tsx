import React from 'react';

import { DashboardCard } from '../../../components/DashboardCard';
import { withFamilyConsent } from '../../../components/ConsentGate';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

interface ConnectionRow {
  id: string;
  status: string;
}

export default function BuurtPage() {
  return withFamilyConsent('stories', 'Buurt', async (session) => {
    const supabase = await createSupabaseServerClient();

    // Only counts and the caller's own relationships — other older adults' identities
    // are never exposed, and neighbourhood_profiles RLS returns nothing observable.
    const { data, error } = supabase
      ? await supabase
          .from('neighbourhood_connections')
          .select('id, status')
          .or(`initiator_elder_id.eq.${session.elderId},recipient_elder_id.eq.${session.elderId}`)
          .in('status', ['accepted', 'pending_recipient', 'pending_initiator'])
      : { data: null, error: null };

    const rows = (data ?? []) as ConnectionRow[];
    const accepted = rows.filter((row) => row.status === 'accepted').length;
    const pending = rows.length - accepted;

    return (
      <DashboardCard title="BUURT" subtitle="Zichtbaarheid bepaald door de oudere" tone="teal">
        {error ? (
          <p style={{ margin: 0, fontWeight: 700 }}>Buurtverbindingen konden niet worden geladen.</p>
        ) : (
          <>
            <p style={{ margin: 0, fontWeight: 700 }}>{accepted} geaccepteerde buurtverbinding(en)</p>
            <p style={{ margin: '8px 0 0', fontWeight: 700 }}>{pending} verzoek(en) wachten op dubbele bevestiging</p>
            <p style={{ margin: '8px 0 0', color: '#4A7B5A', fontWeight: 700 }}>
              Namen van andere deelnemers worden nooit getoond. Alleen aantallen.
            </p>
          </>
        )}
      </DashboardCard>
    );
  });
}
