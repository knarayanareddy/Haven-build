import type { BuurtDiscoverOutput, ScamPipelineInput, ScamPipelineOutput, VoicePipelineInput, VoicePipelineOutput } from '@haven/contracts/src/haven';

import { translateElderError } from './errorMapper';

export interface HavenClientConfig {
  supabaseUrl: string;
  accessToken: string;
  supabaseAnonKey?: string;
}

export class HavenClient {
  constructor(private readonly config: HavenClientConfig) {}

  /**
   * Calls an edge function.
   *
   * Public because the offline dispatcher routes a queued capture to the same function the
   * online path would have called, and not every one of those has a named method here.
   */
  async invoke<T = unknown>(fn: string, body: object = {}): Promise<T> {
    const response = await fetch(`${this.config.supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) {
      // FIX P2: COGNITIVE LOAD Automatically translate all underlying API and network exceptions into reassuring Dutch B1 prose
      const failure = new Error(translateElderError(json.error ?? `HAVEN function failed: ${fn}`)) as Error & { status?: number };
      // The offline queue decides between "retry later" and "this will never be accepted" from
      // the status; without it every rejection looks like a network blip and the capture is
      // retried until the ceiling hides it.
      failure.status = response.status;
      throw failure;
    }
    return json as T;
  }

  async rest<T>(path: string): Promise<T> {
    const anonKey = this.config.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.accessToken}`,
      accept: 'application/json',
    };
    if (anonKey) headers.apikey = anonKey;

    const response = await fetch(`${this.config.supabaseUrl}/rest/v1/${path}`, { headers });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(translateElderError(json.error ?? json.message ?? 'HAVEN data request failed'));
    }
    return json as T;
  }

  voice(input: VoicePipelineInput) { return this.invoke<VoicePipelineOutput>('fn-voice-pipeline', input); }
  scam(input: ScamPipelineInput) { return this.invoke<ScamPipelineOutput>('fn-scam-pipeline', input); }
  medicationOcr(input: Record<string, unknown>) { return this.invoke('fn-medication-ocr', input); }
  documentAnalyse(input: Record<string, unknown>) { return this.invoke('fn-document-analyse', input); }
  sendFamilyMessage(input: Record<string, unknown>) { return this.invoke('fn-family-message-send', input); }
  updateConsent(input: Record<string, unknown>) { return this.invoke('fn-consent-update', input); }
  locationIngest(input: Record<string, unknown>) { return this.invoke('fn-location-ingest', input); }
  healthLog(input: Record<string, unknown>) { return this.invoke('fn-health-log', input); }
  telehealthTransport(input: Record<string, unknown>) { return this.invoke('fn-telehealth-transport', input); }
  buurtDiscover(elder_id: string) { return this.invoke<BuurtDiscoverOutput>('fn-buurt-discover', { elder_id }); }
  buurtMatch(input: Record<string, unknown>) { return this.invoke('fn-buurt-match', input); }
  featureFlags(elder_id: string) { return this.invoke('fn-feature-flags', { elder_id }); }
  screenData(input: Record<string, unknown>) { return this.invoke('fn-screen-data', input); }
  registerPushToken(input: Record<string, unknown>) { return this.invoke('fn-push-token-register', input); }
  videoCallJoinToken(input: { video_call_session_id: string }) { return this.invoke<{ token: string; expires_in_seconds: number }>('fn-video-call-join-token', input); }
  /** Trades the join token for media credentials. The session only becomes 'joined' here. */
  videoCallRedeem(input: { video_call_session_id: string; token: string }) {
    return this.invoke<{ status: string; media: 'webrtc' | 'none'; provider_token: string | null; provider_room_id: string }>('fn-video-call-redeem', input);
  }
}
