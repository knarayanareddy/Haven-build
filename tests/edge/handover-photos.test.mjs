// Handover photos: from a carer's camera to a record the elder can have erased.
//
// `carer_handover_notes.photo_paths` existed, `fn-carer-handover-note` validated and stored the
// paths, and no bucket was ever created for them — so the carer app offered a "Add photo" button
// that incremented a counter and said "Photo added (demo)".
//
// Building it is not just a bucket. Four things have to hold together, and each one below is a
// thing that goes wrong if it is left out:
//
//   • the object must land in a folder the elder owns, or an erasure request leaves the
//     photograph behind (fn-right-to-erasure sweeps `<user id>/`);
//   • only the carer who took it, the elder, and family with medication access may read it;
//   • a path sent to fn-carer-handover-note must belong to *this* elder and *this* carer, or a
//     note can cite any object in the project;
//   • a photo that did not upload must not be filed as if it had.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  call,
  createMockDb,
  loadAppModule,
  loadEdgeFunction,
  request,
} from './support/edge-function-harness.mjs';
import { linkSharedModules, transpileModuleFile } from './support/shared-loader.mjs';

const ELDER = '11111111-2222-4333-8444-555555555555';
const CARER = '33333333-4444-4555-8666-777777777777';
const OTHER_CARER = '99999999-8888-4777-8666-555555555555';
const PHOTO = 'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeee1.jpg';

// `photoUpload.ts` imports `@haven/contracts/src/storage`, which a module transpiled into /tmp
// cannot resolve. The stub re-exports the real transpiled helper, so the upload assertions below
// still run against production code rather than a copy of it.
const sharedOut = await linkSharedModules();
const storageModule = await transpileModuleFile(
  new URL('../../packages/contracts/src/storage.ts', import.meta.url),
  { outDir: sharedOut },
);
// Absolute URL: `loadAppModule` links into a fresh temp directory per call, so a relative
// specifier would point at a directory the module is not in.
const CONTRACTS_STORAGE = `export * from '${pathToFileURL(storageModule).href}';`;

const loadPhotoUpload = () => loadAppModule('apps/carer/src/services/photoUpload.ts', {
  stubs: { '@haven/contracts/src/storage': CONTRACTS_STORAGE },
});

function recordingFetch(response = { ok: true, status: 200 }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body ?? {},
    };
  };
  return { calls, fetchImpl };
}

function recordingFormData() {
  const parts = [];
  const factory = () => ({ append: (key, value) => parts.push({ key, value }) });
  return { parts, factory };
}

// ─── the bucket and its policies ───────────────────────────────────────────

test('the bucket exists, is private, and is sized for a phone photo', () => {
  const sql = readFileSync(
    new URL('../../supabase/migrations/20261101000000_handover_photos_bucket.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /\('handover-photos', 'handover-photos', false,/, 'private bucket named handover-photos');
  assert.match(sql, /8388608/, '8 MB, which is the limit the app checks too');
  for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
    assert.ok(sql.includes(mime), `the bucket must accept ${mime}`);
  }
});

test('the bucket is laid out so an elder\u2019s erasure removes their photographs', () => {
  const sql = readFileSync(
    new URL('../../supabase/migrations/20261101000000_handover_photos_bucket.sql', import.meta.url),
    'utf8',
  );
  // folder[1] is the elder, folder[2] the carer who took the photograph.
  assert.match(sql, /\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/,
    'a carer writes only their own sub-folder');
  assert.match(sql, /public\.carer_can\(public\.haven_uuid_or_null\(\(storage\.foldername\(name\)\)\[1\]\)\)/,
    'and only into the folder of an elder who consented to their care');
  // A policy that casts a path segment raises 22P02 on a non-uuid path, which fails the whole
  // statement rather than the one row.
  assert.match(sql, /^\s*when value ~ '\^\[0-9a-fA-F\]\{8\}/m,
    'the cast is guarded by a uuid pattern');
  assert.equal(/\(\(storage\.foldername\(name\)\)\[1\]\)::uuid/.test(sql), false,
    'no unguarded cast of a path segment remains');
  assert.match(sql, /bucket_id = 'handover-photos'\s*\n\s*and \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/,
    'the elder reads their own folder');
  assert.match(sql, /public\.family_can\(public\.haven_uuid_or_null\(\(storage\.foldername\(name\)\)\[1\]\), 'medications'\)/,
    'family see them on the same terms as the medication they document');

  const erasure = readFileSync(new URL('../../supabase/functions/fn-right-to-erasure/index.ts', import.meta.url), 'utf8');
  assert.match(erasure, /"handover-photos"/,
    'the erasure sweep enumerates buckets explicitly; a new bucket must be listed there');
});

// ─── path building and upload ──────────────────────────────────────────────

test('a photograph is stored under the elder, not the carer who took it', async () => {
  const module = await loadPhotoUpload();
  const path = module.handoverPhotoPath(ELDER, CARER, { uri: 'file:///tmp/med.jpg', fileName: 'med.jpg' });

  assert.ok(path.startsWith(`${ELDER}/${CARER}/`), `unexpected path ${path}`);
  assert.match(path, /\.jpg$/, 'the extension is preserved so storage can set a MIME type');
  assert.equal(path.includes('..'), false);
});

test('a photo the bucket would reject is rejected before it is uploaded', async () => {
  const module = await loadPhotoUpload();

  assert.equal(module.rejectPhotoReason({ uri: 'file:///a.jpg', mimeType: 'image/jpeg' }), null);
  assert.equal(module.rejectPhotoReason({ uri: 'file:///a.heic', fileName: 'a.heic' }), null);
  assert.equal(module.rejectPhotoReason({ uri: 'file:///a.pdf', mimeType: 'application/pdf' }), 'unsupported-type');
  assert.equal(
    module.rejectPhotoReason({ uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileSize: 9 * 1024 * 1024 }),
    'too-large',
  );

  const { calls, fetchImpl } = recordingFetch();
  await assert.rejects(
    () => module.uploadHandoverPhoto({
      supabaseUrl: 'https://example.supabase.co',
      accessToken: 'token',
      elderId: ELDER,
      carerId: CARER,
      photo: { uri: 'file:///a.pdf', mimeType: 'application/pdf' },
      fetchImpl,
    }),
    /unsupported-type/,
  );
  assert.equal(calls.length, 0, 'nothing is sent for a file the bucket would refuse');
});

test('the upload posts a multipart part to the elder\u2019s folder with the carer\u2019s token', async () => {
  const module = await loadPhotoUpload();
  const { calls, fetchImpl } = recordingFetch();
  const form = recordingFormData();

  const uploaded = await module.uploadHandoverPhoto({
    supabaseUrl: 'https://example.supabase.co',
    accessToken: 'carer-token',
    elderId: ELDER,
    carerId: CARER,
    photo: { uri: 'file:///tmp/med.jpg', mimeType: 'image/jpeg', fileName: 'med.jpg', fileSize: 1024 },
    fetchImpl,
    formDataFactory: form.factory,
  });

  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(
    url,
    `https://example.supabase.co/storage/v1/object/handover-photos/${uploaded.path}`,
  );
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.authorization, 'Bearer carer-token');
  assert.equal(init.headers['x-upsert'], 'false', 'a photo is written once, never overwritten');
  assert.equal(init.headers['content-type'], undefined,
    'the boundary must come from fetch; setting the header makes the body unparseable');

  assert.equal(form.parts.length, 1);
  assert.equal(form.parts[0].key, 'file');
  assert.deepEqual(form.parts[0].value, {
    uri: 'file:///tmp/med.jpg',
    name: uploaded.path.split('/').pop(),
    type: 'image/jpeg',
  });
});

test('a storage refusal surfaces as a typed failure, not a silent success', async () => {
  const module = await loadPhotoUpload();
  const { fetchImpl } = recordingFetch({ ok: false, status: 413, body: { message: 'Payload too large' } });

  await assert.rejects(
    () => module.uploadHandoverPhoto({
      supabaseUrl: 'https://example.supabase.co',
      accessToken: 't',
      elderId: ELDER,
      carerId: CARER,
      photo: { uri: 'file:///a.jpg', mimeType: 'image/jpeg' },
      fetchImpl,
      formDataFactory: recordingFormData().factory,
    }),
    (error) => {
      assert.equal(error.name, 'StorageUploadError');
      assert.equal(error.status, 413);
      assert.match(error.message, /Payload too large/);
      return true;
    },
  );
});

test('a path that tries to climb out of its folder is refused locally', async () => {
  const module = await loadAppModule('packages/contracts/src/storage.ts');
  assert.equal(module.isSafeStoragePath(`${ELDER}/${CARER}/photo.jpg`), true);
  assert.equal(module.isSafeStoragePath(`${ELDER}/../../other/photo.jpg`), false);
  assert.equal(module.isSafeStoragePath(`${ELDER}\\..\\x.jpg`), false);
  assert.equal(module.isSafeStoragePath(''), false);
});

// ─── the endpoint and the note ─────────────────────────────────────────────

function handoverDb() {
  return createMockDb({
    tables: {
      profiles: [{ id: ELDER, status: 'active' }],
      carer_relationships: [{
        id: 'rel-1', elder_id: ELDER, carer_member_id: CARER, elder_consented: true, is_active: true,
      }],
      carer_handover_notes: [],
      carer_handover_recipients: [],
      medication_interaction_alerts: [],
      medications: [],
      perf_metrics: [],
      audit_log: [],
      idempotency_keys: [],
    },
  });
}

async function fileNote(db, photoPaths, caller = CARER) {
  const harness = await loadEdgeFunction('fn-carer-handover-note', { db });
  return call(harness.handler, request('fn-carer-handover-note', {
    headers: { authorization: `Bearer test-user:${caller}` },
    body: { elder_id: ELDER, appetite: 4, mood: 3, notes_nl: 'Foto gemaakt van de doos.', photo_paths: photoPaths },
  }));
}

test('a note files the photographs taken during the visit', async () => {
  const db = handoverDb();
  const path = `${ELDER}/${CARER}/${PHOTO}`;

  const response = await fileNote(db, [path]);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.photos_attached, 1);
  assert.deepEqual(db.store.carer_handover_notes[0].photo_paths, [path]);
});

test('a note cannot cite an object outside this elder and this carer', async () => {
  const db = handoverDb();
  const foreign = [
    `${ELDER}/${OTHER_CARER}/${PHOTO}`,          // another carer's photograph of the same elder
    `other-elder/${CARER}/${PHOTO}`,             // this carer's photograph of another elder
    `${ELDER}/${CARER}/../../document-vault/x`,  // traversal out of the bucket layout
  ];

  for (const path of foreign) {
    const response = await fileNote(db, [path]);
    assert.ok(response.status === 403 || response.status === 400,
      `${path} must be refused, got ${response.status} ${JSON.stringify(response.body)}`);
  }
  assert.equal(db.store.carer_handover_notes.length, 0, 'no note was filed with a foreign path');
});

test('more than five photographs is refused rather than silently truncated', async () => {
  const db = handoverDb();
  const tooMany = Array.from({ length: 6 }, (_, i) => `${ELDER}/${CARER}/p${i}.jpg`);
  const response = await fileNote(db, tooMany);

  assert.equal(response.status, 400);
  assert.equal(db.store.carer_handover_notes.length, 0);
});

test('a queued handover carries the finished photo keys and nothing else', async () => {
  const module = await loadAppModule('apps/carer/src/services/queueDelivery.ts');
  const delivered = [];
  const client = { handoverNote: async (input) => { delivered.push(input); return { handover_id: 'h1' }; } };

  await module.carerDeliveryFor({
    id: 'item-1',
    action: 'handover_note',
    elderId: ELDER,
    carerId: CARER,
    payload: {
      appetite: 4,
      mood: 3,
      notes: 'Foto gemaakt',
      // One key that reached storage, one photo that did not (empty path), one junk value.
      photo_paths: [`${ELDER}/${CARER}/${PHOTO}`, '', 42],
    },
  }).deliver(client);

  assert.deepEqual(delivered[0].photo_paths, [`${ELDER}/${CARER}/${PHOTO}`],
    'an unuploaded photo must not be filed as an attachment');
});

test('the form uploads real files and reports the ones that did not go', () => {
  const source = readFileSync(new URL('../../apps/carer/src/screens/HandoverForm.tsx', import.meta.url), 'utf8');

  assert.match(source, /ImagePicker\.launchCameraAsync/, 'the camera is actually opened');
  assert.match(source, /ImagePicker\.launchImageLibraryAsync/, 'and the library is the fallback when permission is refused');
  assert.match(source, /uploadHandoverPhoto\(/, 'the picked file is uploaded');
  assert.match(source, /photo_paths/, 'and the keys travel with the note');
  assert.match(source, /handover\.photo\.offline_note/,
    'a photo that never uploaded is disclosed rather than counted');
  assert.equal(/photosCount/.test(source), false, 'the demo counter is gone');
  assert.equal(/handover\.photo\.demo/.test(source), false, 'and so is its copy');

  for (const locale of ['nl-NL', 'en-GB']) {
    const copy = JSON.parse(readFileSync(new URL(`../../packages/i18n/locales/${locale}.json`, import.meta.url), 'utf8'));
    assert.equal(Object.keys(copy).some((key) => key === 'handover.photo.demo'), false,
      `${locale} must not keep the demo string`);
    for (const key of [
      'handover.photo.add', 'handover.photo.attached', 'handover.photo.not_uploaded',
      'handover.photo.offline_note', 'handover.photo.rejected.too-large',
      'handover.photo.rejected.unsupported-type', 'handover.photo.permission',
    ]) {
      assert.ok(copy[key], `${locale} is missing ${key}`);
    }
  }
});
