// ─── Phase 3.1: Carer API Client ───
// Reuses the same Edge Function endpoints as the elder app.
// Carer-specific endpoints: fn-carer-handover-note, fn-care-visit-log,
// fn-shift-summary, fn-incident-report, fn-care-plan.

export interface CarerClientConfig {
  supabaseUrl: string;
  accessToken: string;
}

export class CarerClient {
  constructor(private readonly config: CarerClientConfig) {}

  private async invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.config.supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? `${fn} failed`);
    return json as T;
  }

  async handoverNote(input: {
    elder_id: string;
    appetite: number;
    mood: number;
    mobility?: string;
    concerns_nl?: string;
    notes_nl?: string;
    photo_paths?: string[];
    administered_medication_id?: string;
    administered_at?: string;
    family_recipient_ids?: string[];
  }) {
    return this.invoke<{
      handover_id: string;
      recipients_added: number;
      photos_attached: number;
      interaction_alerts: Array<{ severity: string; summary_nl: string }>;
      interaction_warning: string | null;
    }>('fn-carer-handover-note', input);
  }

  async visitLog(input: {
    elder_id: string;
    started_at?: string;
    completed_at?: string;
    notes_nl?: string;
  }) {
    return this.invoke<{ success: boolean }>('fn-care-visit-log', input);
  }

  async shiftSummary(elderId: string, shiftStart: string, shiftEnd: string) {
    return this.invoke<{ summary: Record<string, unknown> }>('fn-shift-summary', {
      elder_id: elderId,
      shift_start: shiftStart,
      shift_end: shiftEnd,
    });
  }

  async incidentReport(input: {
    elder_id: string;
    severity: string;
    summary_nl: string;
    category?: string;
  }) {
    return this.invoke<{ success: boolean }>('fn-incident-report', input);
  }

  async carePlan(elderId: string) {
    return this.invoke<{ items: Array<Record<string, unknown>> }>('fn-care-plan', {
      elder_id: elderId,
      action: 'list',
    });
  }
}
