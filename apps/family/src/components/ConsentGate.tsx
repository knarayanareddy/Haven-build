import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardCard } from './DashboardCard';
import { resolveFamilySession, type FamilySession } from '../lib/session';

/**
 * Server-side consent gate for every family dashboard page.
 *
 * Every sub-page used to be an unauthenticated static page that either described the
 * permission in prose or, worse, rendered invented clinical content ("Metformine
 * 08:00 and 18:00", "Huisartsafspraak dr. van der Linden", "Unknown bank-helpdesk
 * call scored amber"). A family member — or anyone with the URL — could open
 * /dashboard/medicijnen and read medication that does not exist, while the page's
 * own subtitle claimed it was consent-gated.
 *
 * This component resolves the caller's session and relationship permissions and
 * either renders the page's real content or an explicit "not shared" panel.
 */

export type FamilyPermission = 'medications' | 'messages' | 'location' | 'alerts' | 'stories' | 'visits' | 'finances';

export async function withFamilyConsent(
  permission: FamilyPermission,
  title: string,
  render: (session: FamilySession) => Promise<React.ReactElement> | React.ReactElement,
): Promise<React.ReactElement> {
  const result = await resolveFamilySession();

  if (result.kind === 'anonymous') redirect('/inloggen?next=/dashboard');

  const shell = (body: React.ReactElement) => (
    <main
      style={{
        display: 'grid',
        gap: 24,
        padding: 32,
        background: '#F5F3EE',
        minHeight: '100vh',
        fontFamily: 'Nunito, system-ui, sans-serif',
        color: '#1A1F2E',
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: 34 }}>{title}</h1>
      </header>
      {body}
      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/dashboard" style={navLinkStyle}>
          ← Dashboard
        </Link>
      </nav>
    </main>
  );

  if (result.kind !== 'ready') {
    const copy =
      result.kind === 'unconfigured'
        ? 'De omgeving is nog niet ingesteld.'
        : result.kind === 'no-consent'
          ? 'De oudere heeft uw toegang nog niet goedgekeurd.'
          : 'De gegevens konden niet worden geladen.';

    return shell(
      <DashboardCard title="Geen toegang" subtitle="Toestemming ontbreekt" tone="amber">
        <p style={{ margin: 0, fontWeight: 700 }}>{copy}</p>
      </DashboardCard>,
    );
  }

  const session = result.session;
  if (!session.permissions[permission]) {
    return shell(
      <DashboardCard title="Niet gedeeld" subtitle="Toestemming per onderdeel" tone="amber">
        <p style={{ margin: 0, fontWeight: 700 }}>
          De oudere heeft dit onderdeel niet met u gedeeld. U kunt dit niet zelf aanzetten; alleen de oudere kan toestemming geven.
        </p>
      </DashboardCard>,
    );
  }

  return shell(await render(session));
}

const navLinkStyle: React.CSSProperties = {
  background: '#2C3E6B',
  color: '#FFFFFF',
  padding: '12px 18px',
  borderRadius: 18,
  fontWeight: 900,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 56,
};
