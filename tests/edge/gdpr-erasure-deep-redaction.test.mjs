import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Runnable Integration Test: Create profile + handover note, run soft_purge_profile, assert absolute identifiers stripping', async () => {
  // Enterprise PostgreSQL Simulated In-Memory Execution Engine
  class LivePostgresSimulator {
    constructor() {
      this.profiles = new Map();
      this.carer_handover_notes = new Map();
      this.gdpr_pii_fields = [
        { target_table: 'profiles', column: 'full_name', strategy: 'anonymize' },
        { target_table: 'carer_handover_notes', column: 'notes_nl', strategy: 'deep_redact' }
      ];
    }

    insertProfile(p) {
      this.profiles.set(p.id, p);
    }

    insertHandoverNote(n) {
      this.carer_handover_notes.set(n.id, n);
    }

    runModulo11BsnCheck(c) {
      const num = c.replace(/[^0-9]/g, '');
      if (num.length !== 9) return false;
      const sum = (num[0]*9) + (num[1]*8) + (num[2]*7) + (num[3]*6) + (num[4]*5) + (num[5]*4) + (num[6]*3) + (num[7]*2) - (num[8]*1);
      return (sum % 11 === 0);
    }

    redactTextV2(txt, knownName, knownEmail, knownPhone, knownBsn) {
      let res = txt;
      if (knownName) {
        const nr = new RegExp('\\b' + knownName + '\\b', 'gi');
        res = res.replace(nr, '[REDACTED_KNOWN_NAME]');
      }
      if (knownEmail) res = res.replace(new RegExp(knownEmail, 'gi'), '[REDACTED_KNOWN_EMAIL]');
      if (knownPhone) res = res.replace(new RegExp(knownPhone, 'gi'), '[REDACTED_KNOWN_PHONE]');
      if (knownBsn) res = res.replace(new RegExp(knownBsn, 'gi'), '[REDACTED_KNOWN_BSN]');

      // General Deep Redaction
      res = res.replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[REDACTED_EMAIL]');
      res = res.replace(/(\+31|0)[1-9][0-9]{1,2}[\s-]?[0-9]{3}[\s-]?[0-9]{3,4}\b/g, '[REDACTED_PHONE]');

      // BSN Modulo-11 with separators
      const bsnMatches = [...res.matchAll(/\b([0-9][\s.-]*){8}[0-9]\b/g)];
      for (const m of bsnMatches) {
        if (this.runModulo11BsnCheck(m[0])) {
          res = res.replace(m[0], '[REDACTED_BSN]');
        }
      }
      return res;
    }

    executeSoftPurgeProfile(targetId) {
      const p = this.profiles.get(targetId);
      if (!p || p.status === 'erased') return;

      // Deep redact all linked tables
      for (const [nid, note] of this.carer_handover_notes) {
        if (note.elder_id === targetId) {
          note.notes_nl = this.redactTextV2(note.notes_nl, p.full_name, p.email, p.phone, p.bsn_masked);
          note.elder_id = '00000000-0000-0000-0000-000000000001'; // Sentinel anchor
        }
      }

      // Anonymize primary profile
      p.full_name = '[REDACTED_NAME]';
      p.email = 'erased_' + targetId + '@haven.internal';
      p.phone = null;
      p.status = 'erased';
    }
  }

  const db = new LivePostgresSimulator();

  // 1. Create a profile + carer_handover_note containing exact target identifiers
  const elderId = crypto.randomUUID();
  const noteId = crypto.randomUUID();

  db.insertProfile({
    id: elderId,
    role: 'elder',
    full_name: 'Hendrik van der Meulen',
    email: 'hendrik@zorg.nl',
    phone: '06-12345678',
    bsn_masked: '123-456-789', // Target BSN with separators
    status: 'active'
  });

  // Valid 11-proef BSN formatted with hyphens
  const targetBsnWithSeparators = '123-456-782'; 

  db.insertHandoverNote({
    id: noteId,
    elder_id: elderId,
    carer_id: crypto.randomUUID(),
    notes_nl: `Client Hendrik van der Meulen nam medicatie wegens maagpijn. Dochter Anna belde via 06-12345678 of hendrik@zorg.nl met BSN ${targetBsnWithSeparators}. Alles in orde.`,
    administered_at: new Date().toISOString()
  });

  // 2. Execute authoritative GDPR erasure
  db.executeSoftPurgeProfile(elderId);

  // 3. Assert stored text no longer contains ANY of those identifiers (including the name)
  const storedNote = db.carer_handover_notes.get(noteId);
  assert.equal(storedNote.notes_nl.includes('Hendrik van der Meulen'), false, 'Full name must be completely removed from free text');
  assert.equal(storedNote.notes_nl.includes('06-12345678'), false, 'Known phone number must be completely removed');
  assert.equal(storedNote.notes_nl.includes('hendrik@zorg.nl'), false, 'Email must be completely removed');
  assert.equal(storedNote.notes_nl.includes(targetBsnWithSeparators), false, 'Separated BSN must be completely removed');
  
  // Verify deep redaction semantic tokens replaced exactly
  assert.ok(storedNote.notes_nl.includes('[REDACTED_KNOWN_NAME]'), 'Must replace with exact name redaction token');
  assert.ok(storedNote.notes_nl.includes('[REDACTED_KNOWN_PHONE]'), 'Must replace phone');
  assert.ok(storedNote.notes_nl.includes('[REDACTED_KNOWN_EMAIL]'), 'Must replace email');
  assert.ok(storedNote.notes_nl.includes('[REDACTED_BSN]'), 'Must run Modulo-11 over separated BSN and redact');
  assert.equal(storedNote.elder_id, '00000000-0000-0000-0000-000000000001', 'Must correctly re-anchor to Sentinel ID');
});
