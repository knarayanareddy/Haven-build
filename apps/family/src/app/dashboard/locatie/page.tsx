import React from 'react';

import { DashboardCard } from '../../../components/DashboardCard';
import { withFamilyConsent } from '../../../components/ConsentGate';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

interface LocationRow {
  id: string;
  event_type: string;
  created_at: string;
}

// `location_events_partitioned` has no human-readable zone label: it stores fuzzed
// geometry (shown to nobody) and precise geometry (revoked at column level). The
// family dashboard therefore renders the *event kind*, which is the only
// non-geographic, shareable fact the table holds.
const EVENT_COPY: Record<string, string> = {
  veilige_zone_verlaten: 'Veilige zone verlaten',
  veilige_zone_teruggekeerd: 'Terug in de veilige zone',
  check_in: 'Check-in',
  nacht_beweging: 'Beweging tijdens de nacht',
};

export default function LocationPage() {
  return withFamilyConsent('location', 'Locatie', async (session) => {
    const supabase = await createSupabaseServerClient();

    // location_events_partitioned exposes only coarse zone labels to family; the
    // precise coordinate column is revoked at column level.
    const { data, error } = supabase
      ? await supabase
          .from('location_events_partitioned')
          .select('id, event_type, created_at')
          .eq('elder_id', session.elderId)
          .order('created_at', { ascending: false })
          .limit(10)
      : { data: null, error: null };

    const rows = (data ?? []) as unknown as LocationRow[];

    return (
      <>
        <DashboardCard title="Laatste zonegebeurtenissen" subtitle="Alleen globale omgeving, nooit een live route" tone="safe">
          {error ? (
            <p style={{ margin: 0, fontWeight: 700 }}>Locatiegegevens konden niet worden geladen.</p>
          ) : rows.length === 0 ? (
            <p style={{ margin: 0, fontWeight: 700 }}>Er zijn geen recente zonegebeurtenissen.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
              {rows.map((row) => (
                <li key={row.id} style={{ padding: 14, borderRadius: 16, background: '#FFFFFF', border: '1px solid #E8EBF2', fontWeight: 800 }}>
                  {EVENT_COPY[row.event_type] ?? row.event_type} ·{' '}
                  <span style={{ color: '#6B7490', fontWeight: 700 }}>
                    {new Date(row.created_at).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
        <DashboardCard title="Privacy" subtitle="Fuzzed privacy model">
          <p style={{ margin: 0, fontWeight: 700 }}>
            Precise coördinaten zijn op kolomniveau geblokkeerd en worden na 24 uur gewist. U ziet alleen veilige zones.
          </p>
        </DashboardCard>
      </>
    );
  });
}
