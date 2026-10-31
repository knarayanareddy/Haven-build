import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DashboardCard } from '../../components/DashboardCard';
import { HaloStatus } from '../../components/HaloStatus';
import { MedicationList } from '../../components/MedicationList';
import { AlertList, AlertRow } from '../../components/AlertList';
import { DailyStatusPill } from '../../components/DailyStatusPill';
import { TrustSignalPanel } from '../../components/TrustSignalPanel';
import { CallButton } from '../../components/CallButton';
import { DashboardRealtime } from '../../components/DashboardRealtime';
import { familyDashboardSummary } from '../../services/dashboard';
import { createSupabaseServerClient, readSupabaseEnv } from '../../lib/supabase-server';
import { NO_PERMISSIONS, resolveFamilySession, type FamilyPermissions } from '../../lib/session';
import type { ReminderStatus } from '@haven/contracts/src/haven';

// The dashboard depends on the caller's session cookie and on live consent rows.
// Without this, Next prerenders it at build time (where no session exists) and
// every visitor would be served that empty snapshot.
export const dynamic = 'force-dynamic';

type DashboardData = {
  permissions: FamilyPermissions;
  elderId: string;
  elderName: string;
  dailyStatus: { status: 'green' | 'amber' | 'red'; reasons: string[]; generated_at: string };
  haloAxes: Array<{ label: string; level: 'green' | 'amber' | 'red' | 'grey'; detail: string }>;
  medications: Array<{ id: string; medication_id: string; elder_id: string; scheduled_time: string; status: ReminderStatus; snooze_count: number; confirmed_at: string | null; medication_name_nl: string }>;
  alerts: AlertRow[];
  buurt: { nearbyCount: number; tags: string[]; walkBuddyCount: number };
  visits: Array<{ date: string; carer: string; note: string }>;
  weeklyDigest: { week: string; scamEvents: number; amber: number; red: number; black: number; medsPct: number; familyInteractions: number; summary: string };
  trustDevices: Array<{ profile_id: string; last_seen_at: string | null; battery_pct: number | null; network_type: string | null; location_permission: string | null; microphone_permission: string | null; push_token_ok: boolean | null }>;
  trustEvents: Array<{ id: string; severity: 'info' | 'warn' | 'p1' | 'p0'; event_key: string; message_nl: string; message_en: string; created_at: string }>;
  actionButtons: Array<{ id: string; label_nl: string; label_en: string; tone: 'primary' | 'secondary' | 'safe' }>;
};

type LoadedDashboard =
  | { kind: 'unconfigured'; message: string }
  | { kind: 'anonymous' }
  | { kind: 'no-consent' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: DashboardData; accessToken: string; supabaseUrl: string; userId: string };

/**
 * Loads the dashboard for the signed-in family member.
 *
 * Previously this authenticated with HAVEN_FAMILY_ACCESS_TOKEN — one token in the
 * server environment shared by every visitor — and used HAVEN_FAMILY_ELDER_ID to
 * pick the older adult. That meant any visitor to the URL saw that older adult's
 * medication, alerts and location, with no relationship check anywhere in the
 * request path. Identity now comes from the caller's own session, the elder id from
 * their consented `family_relationships` row, and the access token is that
 * session's token, so every read is subject to RLS.
 */
async function loadDashboard(): Promise<LoadedDashboard> {
  const env = readSupabaseEnv();
  if (!env) {
    return {
      kind: 'unconfigured',
      message: 'Family dashboard requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  const resolved = await resolveFamilySession();
  if (resolved.kind === 'unconfigured') {
    return { kind: 'unconfigured', message: 'Supabase environment variables are missing.' };
  }
  if (resolved.kind === 'anonymous') return { kind: 'anonymous' };
  if (resolved.kind === 'no-consent') return { kind: 'no-consent' };

  const session = resolved.session;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { kind: 'unconfigured', message: 'Supabase client could not be created.' };

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { kind: 'anonymous' };

  try {
    const summary = (await familyDashboardSummary({ supabaseUrl: env.url, supabaseAnonKey: env.anonKey, accessToken }, session.elderId)) as {
      elder_id?: string;
      medications_today?: number;
      medications_taken_today?: number;
      unread_messages?: number;
      recent_rood_or_zwart_alerts?: number;
      last_location_event_at?: string | null;
    };

    const medsTotal = Number(summary.medications_today ?? 0);
    const medsTaken = Number(summary.medications_taken_today ?? 0);
    const unreadMessages = Number(summary.unread_messages ?? 0);
    const severeAlerts = Number(summary.recent_rood_or_zwart_alerts ?? 0);
    const medsPct = medsTotal > 0 ? Math.round((medsTaken / medsTotal) * 100) : 100;
    const status = severeAlerts > 0 ? 'red' : medsTotal > medsTaken ? 'amber' : 'green';

    return {
      kind: 'ready',
      accessToken,
      supabaseUrl: env.url,
      // The family member's own id, needed by the realtime subscriber to filter their own
      // notifications channel — the elder id would subscribe to the wrong person's.
      userId: session.userId,
      data: {
        permissions: session.permissions,
        elderId: summary.elder_id ?? session.elderId,
        elderName: session.elderName || 'Oudere',
        dailyStatus: {
          status,
          reasons: [
            severeAlerts > 0 ? `${severeAlerts} ernstige veiligheidsmelding(en)` : 'Geen ernstige veiligheidsmeldingen',
            medsTotal > 0 ? `${medsTaken}/${medsTotal} medicatieherinneringen bevestigd` : 'Geen medicatieherinneringen vandaag',
          ],
          generated_at: new Date().toISOString(),
        },
        haloAxes: [
          { label: 'Pillen', level: medsTotal > medsTaken ? 'amber' : 'green', detail: `${medsTaken}/${medsTotal} bevestigd` },
          { label: 'Veiligheid', level: severeAlerts > 0 ? 'red' : 'green', detail: `${severeAlerts} rood/zwart in 7 dagen` },
          { label: 'Familie', level: unreadMessages > 0 ? 'amber' : 'green', detail: `${unreadMessages} ongelezen bericht(en)` },
        ],
        medications: [],
        alerts: [],
        buurt: { nearbyCount: 0, tags: [], walkBuddyCount: 0 },
        visits: [],
        weeklyDigest: {
          week: new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium' }).format(new Date()),
          scamEvents: severeAlerts,
          amber: 0,
          red: severeAlerts,
          black: 0,
          medsPct,
          familyInteractions: unreadMessages,
          summary: `${severeAlerts} ernstige meldingen. Medicijnen ${medsPct}% bevestigd.`,
        },
        trustDevices: [
          {
            profile_id: session.elderId,
            last_seen_at: summary.last_location_event_at ?? null,
            battery_pct: null,
            network_type: null,
            location_permission: null,
            microphone_permission: null,
            push_token_ok: null,
          },
        ],
        trustEvents: [],
        actionButtons: [
          { id: 'send-heart', label_nl: 'Stuur een hart', label_en: 'Send a heart', tone: 'primary' },
          { id: 'send-voice', label_nl: 'Spraakbericht', label_en: 'Voice message', tone: 'secondary' },
          { id: 'checkin-now', label_nl: 'Vriendelijke check-in', label_en: 'Gentle check-in', tone: 'safe' },
          { id: 'video-call', label_nl: 'Bel nu (video)', label_en: 'Call now (video)', tone: 'safe' },
        ],
      },
    };
  } catch (error) {
    return { kind: 'error', message: String((error as Error).message ?? error) };
  }
}

export default async function DashboardPage() {
  const result = await loadDashboard();

  if (result.kind === 'anonymous') {
    redirect('/inloggen?next=/dashboard');
  }

  if (result.kind !== 'ready') {
    const copy: Record<Exclude<LoadedDashboard['kind'], 'ready' | 'anonymous'>, { title: string; body: string }> = {
      unconfigured: {
        title: 'Configuratie nodig',
        body: 'De omgeving is nog niet ingesteld. Vraag de beheerder om NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      },
      'no-consent': {
        title: 'Nog geen toestemming',
        body: 'De oudere heeft uw toegang nog niet goedgekeurd. U ziet daarom geen gegevens.',
      },
      error: {
        title: 'Gegevens konden niet worden geladen',
        body: 'Probeer het over enkele minuten opnieuw. Uw toegang is niet gewijzigd.',
      },
    };
    const view = copy[result.kind as Exclude<LoadedDashboard['kind'], 'ready' | 'anonymous'>];

    return (
      <main style={{ display: 'grid', gap: 24, padding: 32, background: '#F5F3EE', minHeight: '100vh', fontFamily: 'Nunito, system-ui, sans-serif', color: '#1A1F2E' }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 36 }}>HAVEN</h1>
          <p style={{ color: '#6B7490', fontWeight: 700, marginTop: 6 }}>Toestemming-gebaseerd mantelzorg-dashboard.</p>
        </header>
        <DashboardCard title={view.title} subtitle="Geen gegevens getoond" tone="amber">
          <p style={{ margin: 0, fontWeight: 700 }}>
            {result.kind === 'error' ? view.body : view.body}
          </p>
          <p style={{ margin: '12px 0 0' }}>
            <Link href="/inloggen" style={navLinkStyle}>
              Naar inloggen
            </Link>
          </p>
        </DashboardCard>
      </main>
    );
  }

  const { data, accessToken, supabaseUrl, userId } = result;
  const can = data.permissions ?? NO_PERMISSIONS;

  return (
    <main style={{ display: 'grid', gap: 24, padding: 32, background: '#F5F3EE', minHeight: '100vh', fontFamily: 'Nunito, system-ui, sans-serif', color: '#1A1F2E' }}>
      {/* Subscribes to this elder's alerts, medication, messages and own notifications and
          refreshes the server render when one arrives. Without it a fall alert raised while
          the dashboard is open is invisible until the page is reloaded by hand. */}
      <DashboardRealtime
        elderId={data.elderId}
        profileId={userId}
        permissions={{ alerts: can.alerts, medications: can.medications, messages: can.messages, location: can.location }}
      />
      <header>
        <h1 style={{ margin: 0, fontSize: 36 }}>HAVEN — {data.elderName}</h1>
        <p style={{ color: '#6B7490', fontWeight: 700, marginTop: 6 }}>Toestemming-gebaseerde mantelzorg-dashboard. Precieze locatie wordt nooit getoond.</p>
      </header>

      <DailyStatusPill status={data.dailyStatus} />

      <DashboardCard title="Bellen" subtitle={`Eén tik om een videogesprek te starten met ${data.elderName}`} tone="safe">
        {can.messages && supabaseUrl && accessToken ? (
          <CallButton elderId={data.elderId} elderName={data.elderName} supabaseUrl={supabaseUrl} accessToken={accessToken} />
        ) : (
          <p style={{ color: '#6B7490', fontWeight: 700, fontSize: 14, marginTop: 12 }}>
            {can.messages
              ? 'Videobellen vereist een geauthenticeerde familiesessie.'
              : 'De oudere heeft berichten en bellen niet met u gedeeld.'}
          </p>
        )}
      </DashboardCard>

      <DashboardCard title="Halo" subtitle="Drie dimensies, één rustig beeld">
        <HaloStatus axes={data.haloAxes} />
      </DashboardCard>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {can.alerts ? (
          <DashboardCard title="Veiligheidsmeldingen" subtitle="SCHILD — uitleg in plaats van paniek" tone="amber">
            <AlertList alerts={data.alerts} />
          </DashboardCard>
        ) : (
          <DashboardCard title="Veiligheidsmeldingen" subtitle="Niet gedeeld" tone="amber">
            <p style={{ margin: 0, fontWeight: 700 }}>De oudere heeft veiligheidsmeldingen niet met u gedeeld.</p>
          </DashboardCard>
        )}

        {can.medications ? (
          <DashboardCard title="Medicatie vandaag" subtitle="ANKER — zichtbaar met toestemming" tone="safe">
            <MedicationList medications={data.medications} />
          </DashboardCard>
        ) : (
          <DashboardCard title="Medicatie" subtitle="Niet gedeeld" tone="amber">
            <p style={{ margin: 0, fontWeight: 700 }}>De oudere heeft medicatiegegevens niet met u gedeeld.</p>
          </DashboardCard>
        )}

        {can.stories && (<DashboardCard title="Buurtverbindingen" subtitle="BUURT — alleen zichtbaar als oudere toestemming heeft gegeven" tone="teal">
          <p style={{ margin: 0, fontWeight: 700 }}>{data.buurt.nearbyCount} HAVEN-gebruikers zichtbaar binnen toestemming</p>
          <p style={{ margin: '8px 0', fontWeight: 700 }}>{data.buurt.tags.length ? data.buurt.tags.join(' · ') : 'Geen gedeelde interesses'}</p>
          <p style={{ margin: 0, color: '#4A7B5A', fontWeight: 700 }}>{data.buurt.walkBuddyCount} wandelmaatje-kandidaten wachten op dubbele bevestiging.</p>
        </DashboardCard>)}

        {can.visits && (<DashboardCard title="Zorgnotities" subtitle="WACHT — bezoeken en incidenten">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {data.visits.map((visit, idx) => (
              <li key={idx} style={{ padding: 12, borderRadius: 14, background: '#EAF6F4', border: '1px solid #A7D6CD' }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{visit.carer}</div>
                <div style={{ fontSize: 14, color: '#6B7490' }}>{visit.date}</div>
                <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{visit.note}</p>
              </li>
            ))}
          </ul>
        </DashboardCard>)}

        <DashboardCard title="Weekoverzicht" subtitle="Wekelijkse safety digest voor familie">
          <p style={{ margin: 0, fontWeight: 700 }}>{data.weeklyDigest.summary}</p>
          <ul style={{ marginTop: 8, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            <li>Meldingen: {data.weeklyDigest.scamEvents} (amber {data.weeklyDigest.amber}, rood {data.weeklyDigest.red}, zwart {data.weeklyDigest.black})</li>
            <li>Medicatie: {data.weeklyDigest.medsPct}% ingenomen</li>
            <li>Familiecontact: {data.weeklyDigest.familyInteractions} berichten</li>
          </ul>
        </DashboardCard>
      </div>

      <DashboardCard title={`Acties voor ${data.elderName}`} subtitle="Twee-weg knoppen — wat u doet, hoort de oudere meteen">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {data.actionButtons.map((btn) => (
            <button key={btn.id} data-action={btn.id} style={actionButtonStyle(btn.tone)}>{btn.label_nl}</button>
          ))}
        </div>
      </DashboardCard>

      <TrustSignalPanel devices={data.trustDevices} recentEvents={data.trustEvents} />

      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }} aria-label="Dashboardonderdelen">
        {can.alerts && <Link href="/dashboard/meldingen" style={navLinkStyle}>Meldingen</Link>}
        {can.medications && <Link href="/dashboard/medicijnen" style={navLinkStyle}>Medicijnen</Link>}
        {can.location && <Link href="/dashboard/locatie" style={navLinkStyle}>Locatie</Link>}
        {can.stories && <Link href="/dashboard/buurt" style={navLinkStyle}>Buurt</Link>}
        {can.visits && <Link href="/dashboard/wacht" style={navLinkStyle}>Zorg</Link>}
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
