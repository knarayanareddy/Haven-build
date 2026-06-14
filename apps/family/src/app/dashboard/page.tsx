import React from 'react';
import Link from 'next/link';
import { DashboardCard } from '../../components/DashboardCard';
import { HaloStatus } from '../../components/HaloStatus';
import { MedicationList } from '../../components/MedicationList';
import { AlertList } from '../../components/AlertList';
import { DailyStatusPill } from '../../components/DailyStatusPill';
import { TrustSignalPanel } from '../../components/TrustSignalPanel';
import { DEMO_DASHBOARD } from '../../services/dashboard-fixtures';
import { CallButton } from '../../components/CallButton';

export default function DashboardPage() {
  const data = DEMO_DASHBOARD;
  return (
    <main style={{ display: 'grid', gap: 24, padding: 32, background: '#F5F3EE', minHeight: '100vh', fontFamily: 'Nunito, system-ui, sans-serif', color: '#1A1F2E' }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 36 }}>HAVEN — {data.elderName}</h1>
        <p style={{ color: '#6B7490', fontWeight: 700, marginTop: 6 }}>Toestemming-gebaseerde mantelzorg-dashboard. Precieze locatie wordt nooit getoond.</p>
      </header>

      <DailyStatusPill status={data.dailyStatus} />

      {/* ─── Phase 2.1: Call Grandma button ─── */}
      <DashboardCard title="Bellen" subtitle="Eén tik om een videogesprek te starten met {data.elderName}" tone="safe">
        <CallButton
          elderId={data.elderId}
          elderName={data.elderName}
          supabaseUrl="https://example.supabase.co"
          accessToken="demo-token"
        />
        <p style={{ color: '#6B7490', fontWeight: 700, fontSize: 14, marginTop: 12 }}>
          Dit is een demo-knop. In productie verbindt deze met de echte HAVEN backend.
        </p>
      </DashboardCard>

      <DashboardCard title="Halo" subtitle="Drie dimensies, één rustig beeld">
        <HaloStatus axes={data.haloAxes} />
      </DashboardCard>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <DashboardCard title="Veiligheidsmeldingen" subtitle="SCHILD — uitleg in plaats van paniek" tone="amber">
          <AlertList alerts={data.alerts} />
        </DashboardCard>

        <DashboardCard title="Medicatie vandaag" subtitle="ANKER — alleen zichtbaar met can_view_medications" tone="safe">
          <MedicationList medications={data.medications} />
        </DashboardCard>

        <DashboardCard title="Buurtverbindingen" subtitle="BUURT — alleen zichtbaar als oudere toestemming heeft gegeven" tone="teal">
          <p style={{ margin: 0, fontWeight: 700 }}>{data.buurt.nearbyCount} HAVEN-gebruikers in PC4 1072</p>
          <p style={{ margin: '8px 0', fontWeight: 700 }}>{data.buurt.tags.join(' · ')}</p>
          <p style={{ margin: 0, color: '#4A7B5A', fontWeight: 700 }}>{data.buurt.walkBuddyCount} wandelmaatje-kandidaten wachten op dubbele bevestiging.</p>
        </DashboardCard>

        <DashboardCard title="Zorgnotities" subtitle="WACHT — bezoeken en incidenten">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {data.visits.map((visit, idx) => (
              <li key={idx} style={{ padding: 12, borderRadius: 14, background: '#EAF6F4', border: '1px solid #A7D6CD' }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{visit.carer}</div>
                <div style={{ fontSize: 14, color: '#6B7490' }}>{visit.date}</div>
                <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{visit.note}</p>
              </li>
            ))}
          </ul>
        </DashboardCard>

        <DashboardCard title="Weekoverzicht" subtitle="Wekelijkse safety digest voor familie">
          <p style={{ margin: 0, fontWeight: 700 }}>{data.weeklyDigest.summary}</p>
          <ul style={{ marginTop: 8, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            <li>Meldingen: {data.weeklyDigest.scamEvents} (amber {data.weeklyDigest.amber}, rood {data.weeklyDigest.red}, zwart {data.weeklyDigest.black})</li>
            <li>Medicatie: {data.weeklyDigest.medsPct}% ingenomen</li>
            <li>Familiecontact: {data.weeklyDigest.familyInteractions} berichten</li>
          </ul>
        </DashboardCard>
      </div>

      <DashboardCard title="Acties voor {data.elderName}" subtitle="Twee-weg knoppen — wat u doet, hoort de oudere meteen">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {data.actionButtons.map((btn) => (
            <button key={btn.id} data-action={btn.id} style={actionButtonStyle(btn.tone)}>{btn.label_nl}</button>
          ))}
        </div>
      </DashboardCard>

      <TrustSignalPanel devices={data.trustDevices} recentEvents={data.trustEvents} />

      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/dashboard/meldingen" style={navLinkStyle}>Meldingen</Link>
        <Link href="/dashboard/medicijnen" style={navLinkStyle}>Medicijnen</Link>
        <Link href="/dashboard/locatie" style={navLinkStyle}>Locatie</Link>
        <Link href="/dashboard/buurt" style={navLinkStyle}>Buurt</Link>
        <Link href="/dashboard/wacht" style={navLinkStyle}>Zorg</Link>
        <Link href="/dashboard/familiar-voice" style={navLinkStyle}>Vertrouwde stem</Link>
      </nav>
    </main>
  );
}

function actionButtonStyle(tone: 'primary' | 'secondary' | 'safe'): React.CSSProperties {
  const bg = tone === 'primary' ? '#2C3E6B' : tone === 'safe' ? '#4A7B5A' : '#FFFFFF';
  const fg = tone === 'secondary' ? '#2C3E6B' : '#FFFFFF';
  return { background: bg, color: fg, padding: '12px 18px', borderRadius: 18, fontWeight: 900, border: tone === 'secondary' ? '2px solid #2C3E6B' : 'none', minHeight: 56, cursor: 'pointer' };
}

const navLinkStyle: React.CSSProperties = {
  background: '#2C3E6B',
  color: '#FFFFFF',
  padding: '12px 18px',
  borderRadius: 18,
  fontWeight: 900,
  textDecoration: 'none',
  minHeight: 56,
  display: 'inline-flex',
  alignItems: 'center',
};
