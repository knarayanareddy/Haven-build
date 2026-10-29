// ─── Family Agenda Tab ───
// Consent-gated: only visible if the older adult shares appointment data.
//
// This page previously rendered `DEMO_AGENDA`: three invented medical appointments
// ("Huisartsafspraak dr. van der Linden", "Bloedprikken (nuchter)", "OLVG locatie
// Oost") shown to every visitor, under a heading that claimed it only appeared with
// the older adult's consent. Invented clinical appointments in a family dashboard are
// indistinguishable from real ones to the reader, so this now reads `appointments`
// under RLS and shows an explicit empty state.

import React from 'react';

import { DashboardCard } from '../../../components/DashboardCard';
import { withFamilyConsent } from '../../../components/ConsentGate';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

interface AppointmentRow {
  id: string;
  title_nl: string;
  starts_at: string;
  ends_at: string | null;
  location_label: string | null;
  is_medical: boolean;
}

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }),
    time: d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
  };
}

export default function AgendaPage() {
  // Appointment data follows medication visibility: it is the same clinical scope.
  return withFamilyConsent('medications', 'Agenda', async (session) => {
    const supabase = await createSupabaseServerClient();

    const { data, error } = supabase
      ? await supabase
          .from('appointments')
          .select('id, title_nl, starts_at, ends_at, location_label, is_medical')
          .eq('elder_id', session.elderId)
          .is('deleted_at', null)
          .gte('starts_at', new Date().toISOString())
          .order('starts_at', { ascending: true })
          .limit(30)
      : { data: null, error: null };

    const rows = (data ?? []) as AppointmentRow[];

    return (
      <>
        <DashboardCard title="Komende afspraken" subtitle={`${rows.length} afspraken in de komende 30 dagen`}>
          {error ? (
            <p style={{ margin: 0, fontWeight: 700 }}>De agenda kon niet worden geladen.</p>
          ) : rows.length === 0 ? (
            <p style={{ margin: 0, fontWeight: 700 }}>Er staan geen afspraken gepland, of de oudere heeft de agenda niet gedeeld.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
              {rows.map((event) => {
                const dt = formatDateTime(event.starts_at);
                const et = event.ends_at ? formatDateTime(event.ends_at) : null;
                return (
                  <li
                    key={event.id}
                    style={{
                      padding: 18,
                      borderRadius: 22,
                      background: event.is_medical ? '#EBF4EE' : '#FFFFFF',
                      border: event.is_medical ? '2px solid #4A7B5A' : '1px solid #E8EBF2',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 18 }}>{event.title_nl}</div>
                        <div style={{ color: '#6B7490', fontSize: 14, fontWeight: 700, marginTop: 4 }}>{dt.date}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 900, fontSize: 16, color: '#2C3E6B' }}>{dt.time}</div>
                        {et ? <div style={{ color: '#6B7490', fontSize: 13 }}>tot {et.time}</div> : null}
                      </div>
                    </div>
                    {event.location_label ? (
                      <div style={{ marginTop: 8, fontSize: 14, color: '#6B7490', fontWeight: 700 }}>📍 {event.location_label}</div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardCard>
        <DashboardCard title="Privacy" subtitle="Wat u hier ziet">
          <p style={{ margin: 0, fontWeight: 700 }}>
            Alleen afspraken die de oudere met u deelt. Niet-medische afspraken blijven privé.
          </p>
        </DashboardCard>
      </>
    );
  });
}
