'use client';

import React, { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Passwordless sign-in for family members.
 *
 * The previous page was a static paragraph ("Use the real Supabase-auth flow in
 * production") with no form at all — the dashboard had no way to authenticate a
 * real person, which is why it fell back to a shared build-time token.
 *
 * A magic link is used deliberately: it needs no password to remember, works with
 * a screen reader, and can be forwarded to a family member by the older adult.
 */

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anonKey);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) return;

    setStatus('sending');
    setMessage('');
    try {
      const supabase = createBrowserClient(url as string, anonKey as string);
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        new URLSearchParams(window.location.search).get('next') ?? '/dashboard',
      )}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      });
      if (error) throw error;
      setStatus('sent');
      setMessage('Controleer uw e-mail. De inloglink is 10 minuten geldig.');
    } catch (error) {
      setStatus('error');
      setMessage((error as Error).message || 'Inloggen is mislukt. Probeer het opnieuw.');
    }
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 32, background: '#F5F3EE' }}>
      <section
        style={{
          maxWidth: 560,
          width: '100%',
          background: '#FFFFFF',
          borderRadius: 24,
          padding: 28,
          border: '1px solid #E8EBF2',
          boxShadow: '0 14px 40px rgba(44,62,107,.12)',
          fontFamily: 'Nunito, system-ui, sans-serif',
        }}
      >
        <h1 style={{ marginTop: 0, color: '#1A1F2E', fontSize: 30 }}>Inloggen bij HAVEN</h1>
        <p style={{ color: '#6B7490', fontWeight: 700 }}>
          Vul het e-mailadres in dat de oudere voor u heeft goedgekeurd. U ontvangt een inloglink — u hoeft geen wachtwoord te onthouden.
        </p>

        {!configured ? (
          <p role="alert" style={{ color: '#8A2C2C', fontWeight: 800 }}>
            De omgeving is nog niet ingesteld (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ontbreken).
          </p>
        ) : (
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
            <label htmlFor="email" style={{ fontWeight: 900, color: '#1A1F2E' }}>
              E-mailadres
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={{ minHeight: 56, borderRadius: 16, border: '2px solid #C9CFDD', padding: '0 16px', fontSize: 18 }}
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              style={{
                minHeight: 56,
                borderRadius: 18,
                border: 'none',
                background: '#2C3E6B',
                color: '#FFFFFF',
                fontSize: 18,
                fontWeight: 900,
                cursor: status === 'sending' ? 'wait' : 'pointer',
              }}
            >
              {status === 'sending' ? 'Bezig…' : 'Stuur inloglink'}
            </button>
          </form>
        )}

        <p role="status" aria-live="polite" style={{ marginTop: 16, fontWeight: 800, color: status === 'error' ? '#8A2C2C' : '#2F6B45' }}>
          {message}
        </p>

        <p style={{ color: '#6B7490', fontSize: 14, fontWeight: 700 }}>
          Geen toegang? Vraag de oudere om uw uitnodiging opnieuw te versturen. Toegang is altijd per onderdeel: medicijnen, locatie, meldingen en berichten.
        </p>
      </section>
    </main>
  );
}
