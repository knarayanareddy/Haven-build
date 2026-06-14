import React from 'react';

export interface TrustSignalDevice {
  profile_id: string;
  last_seen_at: string | null;
  battery_pct: number | null;
  network_type: string | null;
  location_permission: string | null;
  microphone_permission: string | null;
  push_token_ok: boolean | null;
}

export interface TrustSignalEvent {
  id: string;
  severity: 'info' | 'warn' | 'p1' | 'p0';
  event_key: string;
  message_nl: string;
  message_en: string;
  created_at: string;
}

export interface TrustSignalPanelProps {
  devices: TrustSignalDevice[];
  recentEvents: TrustSignalEvent[];
}

const SEVERITY_COLOUR: Record<TrustSignalEvent['severity'], string> = {
  info: '#E8EBF2',
  warn: '#FDF3E0',
  p1: '#FAE8E8',
  p0: '#FAE8E8',
};

function relativeTime(iso: string | null) {
  if (!iso) return 'onbekend';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'zojuist';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min geleden`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} u geleden`;
  return `${Math.floor(ms / 86_400_000)} d geleden`;
}

export function TrustSignalPanel({ devices, recentEvents }: TrustSignalPanelProps) {
  const offline = devices.filter((d) => !d.last_seen_at || Date.now() - new Date(d.last_seen_at).getTime() > 12 * 3_600_000);
  const flagged = devices.filter((d) => d.battery_pct !== null && d.battery_pct < 15);
  const denied = devices.filter((d) => d.location_permission === 'denied' || d.microphone_permission === 'denied');
  const tokensBad = devices.filter((d) => d.push_token_ok === false);

  const summary: { label: string; tone: 'good' | 'warn' | 'bad'; count: number }[] = [
    { label: 'Telefoon offline (>12 u)', tone: 'bad', count: offline.length },
    { label: 'Batterij laag (<15%)', tone: 'warn', count: flagged.length },
    { label: 'Recht geweigerd', tone: 'warn', count: denied.length },
    { label: 'Push-token ongeldig', tone: 'warn', count: tokensBad.length },
  ];

  return (
    <section style={{ background: '#FFFFFF', borderRadius: 22, padding: 24, boxShadow: '0 14px 40px rgba(44,62,107,.12)', border: '1px solid #E8EBF2', fontFamily: 'Nunito, system-ui, sans-serif', color: '#1A1F2E' }}>
      <h2 style={{ marginTop: 0 }}>Haven Health</h2>
      <p style={{ color: '#6B7490', fontWeight: 700, marginTop: 4 }}>Vertrouwenssignaal: werkt HAVEN vanaf de apparaten van uw naaste?</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {summary.map((s) => (
          <li key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 14, background: s.tone === 'good' ? '#EBF4EE' : s.tone === 'warn' ? '#FDF3E0' : '#FAE8E8', color: s.tone === 'good' ? '#4A7B5A' : s.tone === 'warn' ? '#A56A00' : '#C94A4A', fontWeight: 700 }}>
            <span>{s.label}</span>
            <span>{s.count}</span>
          </li>
        ))}
      </ul>
      <h3 style={{ marginTop: 24 }}>Apparaten</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {devices.map((d) => (
          <li key={d.profile_id} style={{ padding: 12, borderRadius: 14, background: '#F5F3EE', fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{d.profile_id.slice(0, 8)}</strong><span>{relativeTime(d.last_seen_at)}</span></div>
            <div style={{ color: '#6B7490' }}>
              {d.battery_pct !== null ? `Batterij ${d.battery_pct}% · ` : ''}
              {d.network_type ?? '?'} · locatie {d.location_permission ?? '?'} · microfoon {d.microphone_permission ?? '?'}
            </div>
          </li>
        ))}
      </ul>
      <h3 style={{ marginTop: 24 }}>Recente meldingen</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {recentEvents.length === 0 ? <li style={{ color: '#6B7490', fontWeight: 700 }}>Geen recente meldingen.</li> : null}
        {recentEvents.map((e) => (
          <li key={e.id} style={{ padding: 12, borderRadius: 14, background: SEVERITY_COLOUR[e.severity], fontSize: 14 }}>
            <div style={{ fontWeight: 900, textTransform: 'uppercase', color: '#1A1F2E' }}>{e.severity}</div>
            <div>{e.message_nl}</div>
            <div style={{ color: '#6B7490', marginTop: 4 }}>{e.event_key} · {relativeTime(e.created_at)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
