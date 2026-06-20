import type { BuurtDiscoverOutput, ScamPipelineInput, ScamPipelineOutput, VoicePipelineInput, VoicePipelineOutput } from '@haven/contracts/src/haven';

import { translateElderError } from './errorMapper';

export interface HavenClientConfig {
  supabaseUrl: string;
  accessToken: string;
  supabaseAnonKey?: string;
}

export class HavenClient {
  constructor(private readonly config: HavenClientConfig) {}

  private async invoke<T>(fn: string, body: unknown): Promise<T> {
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
      throw new Error(translateElderError(json.error ?? `HAVEN function failed: ${fn}`));
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
  videoCallJoinToken(input: Record<string, unknown>) { return this.invoke('fn-video-call-join-token', input); }
}
