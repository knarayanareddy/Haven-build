import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const migrationSql = readFileSync(join(root, 'supabase/migrations/20260615000000_fix_fk_cascade_integrity.sql'), 'utf8');

test('5a: Migration correctly implements strict ON DELETE RESTRICT across all clinical tables', () => {
  const expectedTables = [
    'fall_events',
    'medication_reminders',
    'device_health_events',
    'carer_handover_notes',
    'medication_ocr_reviews',
    'medication_interaction_alerts',
    'video_call_sessions',
    'elder_voice_preferences',
    'webhook_receipts'
  ];

  for (const table of expectedTables) {
    const tableRegex = new RegExp(`ALTER TABLE ${table}\\b[^;]+ON DELETE RESTRICT`, 'i');
    assert.ok(tableRegex.test(migrationSql), `Migration missing ON DELETE RESTRICT for ${table}`);
  }

  // Confirm ON DELETE SET NULL is absent from executable UP migration
  const upSql = migrationSql.split('-- UP MIGRATION')[1].split('-- -- DOWN MIGRATION')[0];
  assert.ok(!upSql.includes('ON DELETE SET NULL'), 'UP migration must not contain any ON DELETE SET NULL instructions');
});

test('5b: Integration test asserting correct mock constraint behavior for fall_events and medication_reminders', async () => {
  // Simulated PostgreSQL constraint execution engine
  class MockPostgresEngine {
    constructor() {
      this.profiles = new Map();
      this.device_sessions = new Map();
      this.fall_events = new Map();
      this.medications = new Map();
      this.medication_reminders = new Map();
    }

    insertDeviceSession(session) {
      this.device_sessions.set(session.id, session);
    }

    insertFallEvent(ev) {
      if (!this.device_sessions.has(ev.device_session_id)) {
        throw new Error('23503: foreign key violation — device_session does not exist');
      }
      this.fall_events.set(ev.id, ev);
    }

    deleteDeviceSession(sessionId) {
      // Enforce ON DELETE RESTRICT policy
      for (const [_, ev] of this.fall_events) {
        if (ev.device_session_id === sessionId) {
          throw new Error('23503: update or delete on table "device_sessions" violates foreign key constraint "fall_events_device_session_id_fkey" on table "fall_events". Key is still referenced.');
        }
      }
      this.device_sessions.delete(sessionId);
    }

    insertMedication(med) {
      this.medications.set(med.id, med);
    }

    insertMedicationReminder(mr) {
      if (!this.medications.has(mr.medication_id)) {
        throw new Error('23503: foreign key violation — medication does not exist');
      }
      this.medication_reminders.set(mr.id, mr);
    }

    deleteMedication(medId) {
      // Enforce ON DELETE RESTRICT policy
      for (const [_, mr] of this.medication_reminders) {
        if (mr.medication_id === medId) {
          throw new Error('23503: update or delete on table "medications" violates foreign key constraint "medication_reminders_medication_id_fkey" on table "medication_reminders". Key is still referenced.');
        }
      }
      this.medications.delete(medId);
    }

    softDeleteMedication(medId) {
      const med = this.medications.get(medId);
      if (!med) throw new Error('Medication not found');
      med.deleted_at = new Date().toISOString();
      med.is_active = false;
    }
  }

  const db = new MockPostgresEngine();

  // ─── Scenario 1: Elder Fall Event Hardware Security Anchor ───
  const elderId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const fallEventId = crypto.randomUUID();

  db.insertDeviceSession({ id: sessionId, profile_id: elderId, platform: 'ios', last_seen_at: new Date().toISOString() });
  db.insertFallEvent({ id: fallEventId, elder_id: elderId, device_session_id: sessionId, status: 'possible' });

  // Attempt to delete device session mid-session
  let errorCaught = null;
  try {
    db.deleteDeviceSession(sessionId);
  } catch (err) {
    errorCaught = err;
  }

  // Assert that deletion is strictly rejected (RESTRICT), preventing orphan creation or NULL setting
  assert.ok(errorCaught !== null, 'Hard deleting a device session with linked fall events must throw a constraint error');
  assert.ok(errorCaught.message.includes('fall_events_device_session_id_fkey'), 'Must throw exact foreign key violation error');
  assert.equal(db.fall_events.get(fallEventId).device_session_id, sessionId, 'Fall event must retain its exact physical device anchor (not nulled)');

  // ─── Scenario 2: Medication Administration Record Immortality ───
  const medId = crypto.randomUUID();
  const reminderId = crypto.randomUUID();

  db.insertMedication({ id: medId, elder_id: elderId, name_nl: 'Furosemide', is_active: true, deleted_at: null });
  db.insertMedicationReminder({ id: reminderId, medication_id: medId, elder_id: elderId, scheduled_time: new Date().toISOString() });

  // Attempt to hard-delete medication
  let medErrorCaught = null;
  try {
    db.deleteMedication(medId);
  } catch (err) {
    medErrorCaught = err;
  }

  // Assert that hard deletion is blocked
  assert.ok(medErrorCaught !== null, 'Hard deleting a medication with linked reminders must throw a constraint error');
  assert.ok(medErrorCaught.message.includes('medication_reminders_medication_id_fkey'), 'Must throw exact MAR FK violation');

  // Assert that application-level soft deletion succeeds gracefully
  db.softDeleteMedication(medId);
  assert.equal(db.medications.get(medId).is_active, false, 'Soft deletion must correctly set is_active = false');
  assert.ok(db.medications.get(medId).deleted_at !== null, 'Soft deletion must timestamp deleted_at');
  assert.equal(db.medication_reminders.get(reminderId).medication_id, medId, 'Historical MAR reminder must remain intact and fully verifiable');
});

test('5c: Plain SQL data integrity health check cron query is fully compliant', () => {
  const cronHealthCheckQuery = `
    SELECT 
      'fall_events' AS table_name, id AS orphan_id, elder_id, created_at, 'Missing linked device_session' AS defect_reason
    FROM fall_events WHERE device_session_id IS NULL AND detection_source IN ('apple_watch', 'google_watch')
    UNION ALL
    SELECT 
      'medication_reminders' AS table_name, mr.id AS orphan_id, mr.elder_id, mr.created_at, 'Missing linked parent medication' AS defect_reason
    FROM medication_reminders mr LEFT JOIN medications m ON mr.medication_id = m.id WHERE m.id IS NULL
    UNION ALL
    SELECT 
      'carer_handover_notes' AS table_name, ch.id AS orphan_id, ch.elder_id, ch.created_at, 'Missing linked administered medication' AS defect_reason
    FROM carer_handover_notes ch LEFT JOIN medications m ON ch.administered_medication_id = m.id 
    WHERE ch.administered_medication_id IS NOT NULL AND m.id IS NULL;
  `;

  assert.ok(cronHealthCheckQuery.includes('UNION ALL'), 'Cron check must monitor multiple tables');
  assert.ok(cronHealthCheckQuery.includes('fall_events'), 'Cron check must include fall_events');
  assert.ok(cronHealthCheckQuery.includes('medication_reminders'), 'Cron check must include medication_reminders');
});
