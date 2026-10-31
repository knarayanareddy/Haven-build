"use client";

// ─── Phase 2.1: "Call Grandma" Button ───
// Family dashboard component that triggers a video call to the elder.
// Flow: idle → ringing (fn-video-call-create called) → connected/declined/error
// No automatic phone fallback is implemented.
// Security: Requires elder consent (fn-video-call-create checks feature flag + consent).

import React, { useCallback, useState } from 'react';

type CallState = 'idle' | 'ringing' | 'connected' | 'declined' | 'error' | 'unavailable';

interface CallButtonProps {
  elderId: string;
  elderName: string;
  supabaseUrl: string;
  accessToken: string;
}

export function CallButton({ elderId, elderName, supabaseUrl, accessToken }: CallButtonProps) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [errorMessage, setError] = useState<string | null>(null);

  const initiateCall = useCallback(async () => {
    if (callState !== 'idle') return;
    setCallState('ringing');
    setError(null);

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/fn-video-call-create`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        // No provider: the server uses whichever media provider this deployment has
        // credentials for. This used to send 'mock', so even a configured LiveKit deployment
        // opened a room with no media in it.
        body: JSON.stringify({
          elder_id: elderId,
          idempotency_key: `call-${elderId}-${Date.now()}`,
        }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Could not initiate call');

      // `media: 'none'` comes back for the test-only mock provider. Saying "Belt…" there
      // promises a call that cannot be answered, so it is reported as unavailable instead.
      if (json.media === 'none') {
        setCallState('unavailable');
        setError('Beeldbellen is in deze omgeving nog niet beschikbaar.');
        return;
      }

      setCallState(json.status === 'connected' ? 'connected' : 'ringing');
    } catch (error) {
      setCallState('error');
      setError(String((error as Error).message ?? error));
    }
  }, [callState, elderId, supabaseUrl, accessToken]);

  const endCall = useCallback(() => {
    setCallState('idle');
    setError(null);
  }, []);

  const stateConfig: Record<CallState, { label_nl: string; label_en: string; bg: string; fg: string }> = {
    idle:      { label_nl: `Bel ${elderName}`,  label_en: `Call ${elderName}`,  bg: '#4A7B5A', fg: '#FFFFFF' },
    ringing:   { label_nl: 'Belt…',             label_en: 'Calling…',           bg: '#A56A00', fg: '#FFFFFF' },
    connected: { label_nl: 'Verbonden',          label_en: 'Connected',          bg: '#4A7B5A', fg: '#FFFFFF' },
    declined:  { label_nl: 'Niet opgenomen',    label_en: 'Not answered',       bg: '#C94A4A', fg: '#FFFFFF' },
    error:     { label_nl: 'Bellen niet gelukt', label_en: 'Call failed',        bg: '#C94A4A', fg: '#FFFFFF' },
    unavailable: { label_nl: 'Beeldbellen nog niet beschikbaar', label_en: 'Video calling not available yet', bg: '#6B7490', fg: '#FFFFFF' },
  };

  const config = stateConfig[callState];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      <button
        onClick={callState === 'ringing' || callState === 'connected' ? endCall : initiateCall}
        disabled={callState === 'ringing' || callState === 'unavailable'}
        aria-label={config.label_nl}
        style={{
          background: config.bg,
          color: config.fg,
          border: 'none',
          borderRadius: 18,
          padding: '16px 28px',
          fontSize: 20,
          fontWeight: 900,
          cursor: (callState === 'ringing') ? 'wait' : 'pointer',
          minHeight: 64,
          minWidth: 220,
          opacity: callState === 'ringing' ? 0.7 : 1,
          transition: 'background 0.3s',
        }}
      >
        {callState === 'ringing' ? '📞⏳' : callState === 'connected' ? '📞✅' : callState === 'error' ? '📞❌' : '📞'}
        {' '}{config.label_nl}
      </button>

      {callState === 'ringing' && (
        <p style={{ color: '#A56A00', fontWeight: 700, fontSize: 14, margin: 0 }}>
          Oproep aangevraagd. De oudere moet de app open hebben. Beeldbellen werkt nog niet; bel zelf op een andere manier.
        </p>
      )}

      {callState === 'connected' && (
        <p style={{ color: '#4A7B5A', fontWeight: 700, fontSize: 14, margin: 0 }}>
          Verbinding gemaakt. Praat rustig.
        </p>
      )}

      {(callState === 'error' || callState === 'unavailable') && errorMessage && (
        <p style={{ color: '#C94A4A', fontWeight: 700, fontSize: 14, margin: 0 }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}
