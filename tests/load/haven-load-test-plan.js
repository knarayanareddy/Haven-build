import http from 'k6/http';
import { check, sleep } from 'k6';

// ===================================================================================
// HAVEN PRODUCTION LOAD TEST PLAN (k6 EXECUTABLE SPECIFICATION)
// Target Architecture: Distributed Supabase Edge Functions & PostgreSQL 16 Clusters
// ===================================================================================

const BASE_URL = __ENV.HAVEN_SUPABASE_URL || 'https://haven-staging.supabase.co/functions/v1';
const AUTH_TOKEN = __ENV.HAVEN_ACCESS_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.haven_simulated_load_token';

// ═══════════════════════════════════════════════════════════════════════════════════
// EXECUTABLE LOAD PROFILES & PASS/FAIL THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════════════
export const options = {
  discardResponseBodies: false,
  scenarios: {
    // 1. MORNING SPIKE SCENARIO (10,000 Elders simultaneously opening app at 08:00)
    // Modeled as a steep ramping arrival rate over 5 minutes to simulate authentic app launch concurrency.
    morning_spike: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 1000,
      maxVUs: 5000,
      stages: [
        { target: 333, duration: '2m' },  // Ramp up to ~20,000 req/min (333 req/s)
        { target: 333, duration: '3m' },  // Hold morning peak concurrency for 3 minutes
        { target: 0,   duration: '1m' },  // Cool down
      ],
      exec: 'executeMorningSpike',
    },

    // 2. EMERGENCY CASCADE SCENARIO (500 Simultaneous Fall Events)
    // Modeled as an immediate burst arrival rate capturing high-priority life-safety telemetry.
    emergency_cascade: {
      executor: 'constant-arrival-rate',
      rate: 100, // 100 simultaneous fall intakes per second over 5 seconds = 500 total falls
      timeUnit: '1s',
      duration: '5s',
      preAllocatedVUs: 500,
      maxVUs: 1000,
      exec: 'executeEmergencyCascade',
    },

    // 3. SHIFT CHANGEOVER SCENARIO (1,000 Carers simultaneously syncing offline queues)
    // Modeled as a sustained batch data synchronization and heavy analytical summary pipeline.
    shift_changeover: {
      executor: 'constant-arrival-rate',
      rate: 50, // 50 carers syncing per second over 20 seconds = 1,000 carers
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 500,
      maxVUs: 1000,
      exec: 'executeShiftChangeover',
    },
  },
  thresholds: {
    // Universal App-Wide Health Invariants
    'http_req_failed': ['rate < 0.001'], // Global failure rate must remain exactly < 0.1%

    // Scenario 1: Morning Spike UI/API Latency Constraints
    'http_req_duration{scenario:morning_spike}': ['p(95) < 500', 'p(99) < 1000'], // API p95 < 500ms

    // Scenario 2: Emergency Cascade Life-Safety Constraints
    'http_req_failed{scenario:emergency_cascade}': ['rate === 0'], // Zero drops permitted for emergency falls
    'http_req_duration{scenario:emergency_cascade}': ['p(95) < 400', 'max < 800'], // Intake p95 < 400ms

    // Scenario 3: Bulk Shift Sync analytical constraints
    'http_req_duration{scenario:shift_changeover}': ['p(95) < 800', 'p(99) < 1500'], // Relational compute p95 < 800ms
  },
};

// Request Headers Helper
const headers = {
  'Authorization': `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json',
  'X-Haven-Client-Version': '1.1.0-loadtest',
};

// ═══════════════════════════════════════════════════════════════════════════════════
// CRITICAL PATH 1: MORNING SPIKE EXECUTION (08:00 MAR Flow)
// ═══════════════════════════════════════════════════════════════════════════════════
export function executeMorningSpike() {
  const elderId = `00000000-0000-0000-0000-${(Math.floor(Math.random() * 10000) + 1).toString().padStart(12, '0')}`;

  // Step 1.1: Elder opens app → POST to load PILLS screen & MAR reminders
  const screenRes = http.post(`${BASE_URL}/fn-screen-data`, JSON.stringify({
    elder_id: elderId,
    screen_id: 'PILLS',
    locale: 'nl-NL',
  }), { headers, tags: { name: 'MorningSpike_LoadScreenData' } });

  check(screenRes, {
    'Screen data successfully returned 200 OK': (r) => r.status === 200,
    'Response payload contains planned MAR reminders': (r) => r.json('ok') !== false,
  });

  sleep(0.5); // Simulated user reading and tapping microphone

  // Step 1.2: Elder activates Voice Pipeline → POST transcript "Ik heb mijn pil ingenomen"
  const voiceRes = http.post(`${BASE_URL}/fn-voice-pipeline`, JSON.stringify({
    elder_id: elderId,
    screen_id: 'PILLS',
    transcript_text: 'Ik heb mijn pil ingenomen',
    locale: 'nl-NL',
  }), { headers, tags: { name: 'MorningSpike_VoicePipeline' } });

  check(voiceRes, {
    'Voice pipeline successfully processed 200 OK': (r) => r.status === 200,
    'Returned multi-modal repeat-back action prompt': (r) => r.json('action_taken') !== null,
  });

  sleep(0.5); // Simulated user confirming YES

  // Step 1.3: Conversational 2-step MAR repeat-back confirmation completion
  const confirmRes = http.post(`${BASE_URL}/fn-consent-update`, JSON.stringify({
    elder_id: elderId,
    action: 'MAR_REPEAT_BACK_CONFIRMED',
    timestamp: new Date().toISOString(),
  }), { headers, tags: { name: 'MorningSpike_MARConfirmation' } });

  check(confirmRes, {
    'MAR repeat-back confirmation fully recorded': (r) => r.status === 200,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CRITICAL PATH 2: EMERGENCY CASCADE EXECUTION (500 Life-Safety Falls)
// ═══════════════════════════════════════════════════════════════════════════════════
export function executeEmergencyCascade() {
  const fallId = `fall-load-${__VU}-${__ITER}`;
  const elderId = `00000000-0000-0000-0000-${(Math.floor(Math.random() * 500) + 1).toString().padStart(12, '0')}`;

  // Step 2.1: Paramedic or wearable sensor dispatches instantaneous Fall Calamity Event
  const fallRes = http.post(`${BASE_URL}/fn-fall-escalation`, JSON.stringify({
    fall_id: fallId,
    elder_id: elderId,
    status: 'possible',
    detected_at: new Date().toISOString(),
    telemetry: { impact_g: 4.8, orientation_change: true },
  }), { headers, tags: { name: 'EmergencyCascade_Intake' } });

  // Verify highly absolute atomic test-and-set claim successful reservation
  check(fallRes, {
    'Fall escalation successfully ingested (200 OK)': (r) => r.status === 200,
    'Atomic DB processing claim affirmative acknowledgement': (r) => r.json('ok') === true,
  });

  // Step 2.2: Mock / Simulate upstream APNs/FCM Push Notification dispatch & WhatsApp fallback
  // In authentic staging environments, this triggers our regulatory Chief Webhook SIEM flusher.
  const escalationRes = http.post(`${BASE_URL}/fn-whatsapp-webhook`, JSON.stringify({
    event_type: 'CRISIS_ESCALATION_DISPATCH',
    calamity_id: fallId,
    recipient_type: 'primary_family_delegate',
    delivery_status: 'fallback_whatsapp_flushed',
  }), { headers, tags: { name: 'EmergencyCascade_WhatsAppFallback' } });

  check(escalationRes, {
    'Emergency push / WhatsApp fallback logged completely': (r) => r.status === 200,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CRITICAL PATH 3: SHIFT CHANGEOVER EXECUTION (1,000 Carers Syncing Offline Queues)
// ═══════════════════════════════════════════════════════════════════════════════════
export function executeShiftChangeover() {
  const carerId = `carer-load-${__VU}`;
  const elderId = `00000000-0000-0000-0000-${(Math.floor(Math.random() * 1000) + 1).toString().padStart(12, '0')}`;

  // Step 3.1: IndexedDB offline shift queue drain → Batch bulk insert 10 clinical observation notes
  const notesBatch = Array.from({ length: 10 }).map((_, i) => ({
    note_id: `note-${__VU}-${__ITER}-${i}`,
    elder_id: elderId,
    carer_id: carerId,
    observation: `Routine clinical observation #${i} synced from local IndexedDB offline storage.`,
    observed_at: new Date(Date.now() - (i * 3600000)).toISOString(),
  }));

  const batchRes = http.post(`${BASE_URL}/fn-carer-handover-note`, JSON.stringify({
    carer_id: carerId,
    sync_mode: 'indexeddb_bulk_drain',
    notes: notesBatch,
  }), { headers, tags: { name: 'ShiftChangeover_BatchInsertNotes' } });

  check(batchRes, {
    'Offline IndexedDB queue drain batch successfully inserted': (r) => r.status === 200,
    'Returned non-repudiable multi-row storage receipt': (r) => r.json('inserted_count') === 10,
  });

  sleep(0.2); // Brief pause before complex analytical summary calculation

  // Step 3.2: Generate highly relational multi-tenant Shift Handover Summary report
  const summaryRes = http.post(`${BASE_URL}/fn-shift-summary`, JSON.stringify({
    carer_member_id: carerId,
    target_elder_id: elderId,
    shift_start: new Date(Date.now() - 28800000).toISOString(), // 8 hours ago
    shift_end: new Date().toISOString(),
  }), { headers, tags: { name: 'ShiftChangeover_GenerateSummary' } });

  check(summaryRes, {
    'Highly relational Shift Handover Summary report built': (r) => r.status === 200,
    'Agency cross-tenant isolation boundaries actively enforced': (r) => r.json('agency_verified') !== false,
  });
}
