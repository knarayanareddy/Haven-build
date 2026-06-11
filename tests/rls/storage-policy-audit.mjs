import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../supabase/migrations/20260611000002_storage_rpc_security.sql', import.meta.url), 'utf8');
for (const bucket of ['voice-notes', 'life-story-audio', 'life-story-photos', 'profile-photos', 'document-vault', 'ocr-inbox', 'tts-cache']) {
  assert.ok(sql.includes(`'${bucket}'`), `${bucket} bucket should be declared`);
}
for (const policy of ['document_vault_elder_only', 'voice_notes_family_read', 'story_audio_family_read', 'ocr_inbox_elder_write']) {
  assert.ok(sql.includes(policy), `${policy} storage policy should exist`);
}
assert.ok(sql.includes('createSignedUrl') === false, 'migration should not hard-code signed URLs');
console.log('storage-policy audit passed');
