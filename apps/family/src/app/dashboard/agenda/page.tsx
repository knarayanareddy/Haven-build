// ─── Phase 4.6: Family Agenda Tab ───
// Shows elder's upcoming HAVEN appointments + synced calendar events.
// Consent-gated: only visible if elder has shared appointment data.

import React from 'react';
import { DashboardCard } from '../../../components/DashboardCard';

interface AgendaEvent {
  id: string;
  title_nl: string;
  starts_at: string;
  ends_at: string;
  location_label: string | null;
  is_medical: boolean;
}

const DEMO_AGENDA: AgendaEvent[] = [
  {
    id: 'apt-1', title_nl: 'Huisartsafspraak dr. van der Linden',
    starts_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
    location_label: 'Huisartsenpraktijk De Pijp', is_medical: true,
  },
  {
    id: 'apt-2', title_nl: 'Apotheek refill ophalen',
    starts_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
    location_label: 'Apotheek De Pijp', is_medical: true,
  },
  {
    id: 'apt-3', title_nl: 'Bloedprikken (nuchter)',
    starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
    location_label: 'OLVG locatie Oost', is_medical: true,
  },
];

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }),
    time: d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
  };
}

export default function AgendaPage() {
  const data = DEMO_AGENDA;

  return (
    <main style={{ display: 'grid', gap: 24, padding: 32, background: '#F5F3EE', minHeight: '100vh', fontFamily: 'Nunito, system-ui, sans-serif', color: '#1A1F2E' }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 36 }}>Agenda — Margreet Bakker</h1>
        <p style={{ color: '#6B7490', fontWeight: 700, marginTop: 6 }}>
          Gesynchroniseerd met de telefoonagenda van de oudere. Alleen medische afspraken worden getoond.
        </p>
      </header>

      <DashboardCard title="Komende afspraken" subtitle={`${data.length} afspraken in de komende 30 dagen`}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {data.map((event) => {
            const dt = formatDateTime(event.starts_at);
            const et = formatDateTime(event.ends_at);
            return (
              <li key={event.id} style={{
                padding: 18, borderRadius: 22,
                background: event.is_medical ? '#EBF4EE' : '#FFFFFF',
                border: event.is_medical ? '2px solid #4A7B5A' : '1px solid #E8EBF2',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>
                      {event.is_medical ? '💊 ' : '📅 '}{event.title_nl}
                    </div>
                    <div style={{ color: '#6B7490', fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                      {dt.date}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, fontSize: 16, color: '#2C3E6B' }}>{dt.time}</div>
                    <div style={{ color: '#6B7490', fontSize: 13 }}>tot {et.time}</div>
                  </div>
                </div>
                {event.location_label && (
                  <div style={{ marginTop: 8, fontSize: 14, color: '#6B7490', fontWeight: 700 }}>
                    📍 {event.location_label}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </DashboardCard>

      <DashboardCard title="Synchronisatie" subtitle="HAVEN synchroniseert met de telefoonagenda van de oudere">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ background: '#EBF4EE', borderRadius: 16, padding: '12px 18px', fontWeight: 700, color: '#4A7B5A' }}>
            ✅ Agenda automatisch gesynchroniseerd
          </div>
          <div style={{ background: '#FDF3E0', borderRadius: 16, padding: '12px 18px', fontWeight: 700, color: '#A56A00' }}>
            ⚠️ Alleen medische afspraken worden geüpload
          </div>
        </div>
      </DashboardCard>

      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <a href="/dashboard" style={navLinkStyle}>← Dashboard</a>
      </nav>
    </main>
  );
}

const navLinkStyle: React.CSSProperties = {
  background: '#2C3E6B', color: '#FFFFFF', padding: '12px 18px', borderRadius: 18,
  fontWeight: 900, textDecoration: 'none', minHeight: 56, display: 'inline-flex', alignItems: 'center',
};
