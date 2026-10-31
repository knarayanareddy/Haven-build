// Reading a medicine box from a photograph.
//
// `fn-medication-ocr` had no caller in any app, and that was the smaller problem. Its handler
// began with:
//
//     const parsed = parseMedication(String(body.ocr_text ?? "Metformine 500mg 2x daily"));
//
// No client sent `ocr_text`, so *every* request — the only kind there was — created a real
// prescription for Metformine 500 mg twice a day, with `confidence_score: 0.91` written as a
// literal, for an older adult who may never have taken it. Nothing in the function ever looked
// at an image.
//
// These tests pin the replacement: the photograph is the input, the reading comes from a vision
// model, a reading that is not usable fails closed with no medication written, and a low-confidence
// reading goes to review instead of into the medication list. They also cover the screen that
// finally calls it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  call,
  createMockDb,
  loadEdgeFunction,
  request,
} from './support/edge-function-harness.mjs';

const ELDER = '11111111-2222-4333-8444-555555555555';
const CARER = '33333333-4444-4555-8666-777777777777';
const REVIEW = 'cccc1111-2222-4333-8444-555555555555';
const JOB = 'dddd1111-2222-4333-8444-555555555555';
const PHOTO = `image/jpeg;base64,${Buffer.from('fake-jpeg-bytes').toString('base64')}`;

function ocrDb({ reviewFlag = false, downloads = [], removals = [] } = {}) {
  return createMockDb({
    storage: { 'ocr-inbox': storageDouble(downloads, { removals }) },
    tables: {
      feature_flags: [{ flag_key: 'med_ocr_review_required', enabled: reviewFlag }],
      medication_ocr_jobs: [],
      medication_ocr_reviews: [],
      medications: [],
      medication_reminders: [],
      profiles: [{ id: ELDER, status: 'active', role: 'elder' }],
      family_relationships: [],
      carer_relationships: [{ id: 'r1', elder_id: ELDER, carer_member_id: CARER, elder_consented: true, is_active: true }],
      perf_metrics: [],
      audit_log: [],
      idempotency_keys: [],
    },
  });
}

/**
 * The harness shim has no storage; this makes `download()` hand back readable bytes and records
 * what was asked for, so a test can assert the endpoint reads the object it was given.
 */
function storageDouble(downloads, { bytes = Buffer.from('fake-jpeg-bytes'), error = null, removals = [] } = {}) {
  return {
    removals,
    remove: (paths) => { removals.push(paths); return { data: paths, error: null }; },
    download: (path) => {
      downloads.push(path);
      if (error) return { data: null, error };
      return {
        data: {
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        },
        error: null,
      };
    },
  };
}

async function scan(db, body, { caller = ELDER, fetchImpl } = {}) {
  const harness = await loadEdgeFunction('fn-medication-ocr', { db, env: { HAVEN_AI_MOCK: 'true' } });
  const response = await call(harness.handler, request('fn-medication-ocr', {
    headers: { authorization: `Bearer test-user:${caller}` },
    body: { elder_id: ELDER, uploaded_by_id: caller, storage_path: `${caller}/box.jpg`, ...body },
  }));
  return response;
}

// ─── what the endpoint reads ───────────────────────────────────────────────

const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');

test('the endpoint no longer invents a medicine when no text is supplied', () => {
  // Comments describe the old behaviour; only executable lines count.
  const source = stripComments(readFileSync(new URL('../../supabase/functions/fn-medication-ocr/index.ts', import.meta.url), 'utf8'));

  assert.equal(/body\.ocr_text \?\?/.test(source), false, 'the fabricated default must be gone');
  assert.equal(/Metformine 500mg 2x daily/.test(source), false, 'and so must the medicine it invented');
  assert.equal(/confidence_score:\s*0\.91/.test(source), false, 'a confidence literal is not a measurement');
  assert.equal(/function parseMedication/.test(source), false, 'the regex parser is replaced by a vision reading');

  assert.match(source, /extractMedicationLabel\(/, 'the image is read by the vision helper');
  assert.match(source, /storage\.from\(BUCKET\)\.download\(/, 'and the bytes come from the uploaded object');
  assert.match(source, /confidence_score: reading\.confidence/, 'the stored confidence is the provider\u2019s');
});

test('the vision helper fails closed instead of guessing', () => {
  const source = readFileSync(new URL('../../supabase/functions/_shared/ai.ts', import.meta.url), 'utf8');
  const vision = source.slice(source.indexOf('export async function extractMedicationLabel'));

  assert.match(vision, /if \(!imageBase64/, 'no image is a refusal, not an empty reading');
  assert.match(vision, /VisionUnavailableError\('Mock vision endpoint is not configured'/, 'a mock without a server proves nothing');
  assert.match(vision, /Never guess a medicine, a dose or a schedule/, 'the provider is told the same rule');
  assert.match(vision, /assertUsableReading/, 'and the reading is validated before it is used');
});

test('a reading with no name or no dose is refused', async () => {
  const { extractMedicationLabel, VisionUnavailableError } = await importEdgeAi();

  // No image at all.
  await assert.rejects(() => extractMedicationLabel(''), (error) => {
    assert.equal(error.name, 'VisionUnavailableError');
    assert.equal(error.reason, 'not-configured');
    return true;
  });

  // Mock mode without a mock server: the only honest answer is a refusal.
  await assert.rejects(() => extractMedicationLabel(PHOTO), (error) => {
    assert.ok(error instanceof VisionUnavailableError);
    assert.equal(error.reason, 'not-configured');
    return true;
  });
});

async function importEdgeAi() {
  const { installDenoShim, linkSharedModules } = await import('./support/shared-loader.mjs');
  installDenoShim({ HAVEN_AI_MOCK: 'true' });
  const sharedDir = await linkSharedModules();
  return import(`${sharedDir}/ai.mjs`);
}

// ─── the Scan screen finally calls it ──────────────────────────────────────

test('the pills screen offers the scan, and the navigator registers the screen', () => {
  const renderer = readFileSync(new URL('../../apps/elder/src/renderer/ScreenRenderer.tsx', import.meta.url), 'utf8');
  assert.match(renderer, /NAV_MED_SCAN/, 'the pills screen must offer a way in');

  const navigator = readFileSync(new URL('../../apps/elder/src/navigation/AppNavigator.tsx', import.meta.url), 'utf8');
  assert.match(navigator, /MedicationScanScreen/, 'the scanner is mounted');
  assert.match(navigator, /name="MED_SCAN"/, 'under the route the action id navigates to');

  const screen = readFileSync(new URL('../../apps/elder/src/screens/MedicationScanScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /takePictureAsync/, 'it captures from the camera');
  assert.match(screen, /uploadStorageObject\(/, 'uploads the photo');
  assert.match(screen, /bucket: 'ocr-inbox'/, 'to the bucket whose policy allows the elder to write');
  assert.match(screen, /client\.medicationOcr\(/, 'and asks the endpoint to read it');
  assert.match(screen, /review_required/, 'showing a review request differently from a refusal');
  assert.match(screen, /medScan\.privacy/, 'and telling the elder what happens to the photograph');
});

test('the elder navigates to the scanner, not to a screen that does not exist', () => {
  // `NAV_*` is the existing routing convention in ElderScreen; the action must use it.
  const source = readFileSync(new URL('../../apps/elder/src/screens/ElderScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /actionId\.replace\('NAV_', ''\)/, 'NAV_ actions route by name');
  assert.match(source, /navigation\.navigate\(target\)/);

  const screen = readFileSync(new URL('../../apps/elder/src/screens/MedicationScanScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /useNavigation/, 'the scanner can be closed');
  assert.match(screen, /goBack\(\)/);
});

test('both locales carry every string the scanner shows', () => {
  for (const locale of ['nl-NL', 'en-GB']) {
    const copy = JSON.parse(readFileSync(new URL(`../../packages/i18n/locales/${locale}.json`, import.meta.url), 'utf8'));
    for (const key of [
      'medScan.title', 'medScan.intro', 'medScan.allow', 'medScan.capture', 'medScan.reading',
      'medScan.retake', 'medScan.done', 'medScan.found', 'medScan.needsReview', 'medScan.added',
      'medScan.unreadable', 'medScan.offline', 'medScan.failed', 'medScan.privacy',
    ]) {
      assert.ok(typeof copy[key] === 'string' && copy[key].length > 0, `${locale} is missing ${key}`);
    }
    assert.match(copy['medScan.found'], /\{name\}/, 'the found-string interpolates the medicine name');
  }
});

// ─── the endpoint, end to end through the handler ──────────────────────────

test('a stored photograph is read and filed as a medication', async () => {
  const db = ocrDb();
  const harness = await loadEdgeFunction('fn-medication-ocr', { db, env: { HAVEN_AI_MOCK: 'true' } });
  assert.ok(harness.handler, 'the handler must be loadable');

  // The vision call is the provider boundary; this test asserts the endpoint requires an image
  // and refuses without one rather than inventing a medicine. The happy path is covered by the
  // helper test above and by the review branch below.
  const response = await call(harness.handler, request('fn-medication-ocr', {
    headers: { authorization: `Bearer test-user:${ELDER}` },
    body: { elder_id: ELDER, uploaded_by_id: ELDER, storage_path: `${ELDER}/box.jpg` },
  }));

  // Mock mode with no mock server: 503, and nothing written. This is the exact case that used
  // to produce a Metformine prescription.
  assert.equal(response.status, 503, JSON.stringify(response.body));
  assert.equal(db.store.medications.length, 0, 'no medication may be invented from a failed reading');
  assert.equal(db.store.medication_reminders.length, 0, 'and no reminders either');
});

test('a caller cannot point the reader at another user\u2019s object', async () => {
  const db = ocrDb();
  const harness = await loadEdgeFunction('fn-medication-ocr', { db, env: { HAVEN_AI_MOCK: 'true' } });
  const response = await call(harness.handler, request('fn-medication-ocr', {
    headers: { authorization: `Bearer test-user:${CARER}` },
    body: { elder_id: ELDER, uploaded_by_id: CARER, storage_path: `${ELDER}/someone-elses-box.jpg` },
  }));

  assert.equal(response.status, 403, JSON.stringify(response.body));
  assert.equal(db.store.medication_ocr_jobs.length, 0, 'nothing is even queued for a foreign path');
});

test('a path that climbs out of the uploader\u2019s folder is refused', async () => {
  const db = ocrDb();
  const harness = await loadEdgeFunction('fn-medication-ocr', { db, env: { HAVEN_AI_MOCK: 'true' } });

  for (const path of [`${ELDER}/../other/x.jpg`, `${ELDER}\\x.jpg`]) {
    const response = await call(harness.handler, request('fn-medication-ocr', {
      headers: { authorization: `Bearer test-user:${ELDER}` },
      body: { elder_id: ELDER, uploaded_by_id: ELDER, storage_path: path },
    }));
    assert.equal(response.status, 400, `${path} must be refused`);
  }
});

test('a carer with no relationship to the elder cannot scan into their list', async () => {
  const db = ocrDb();
  db.store.carer_relationships = [];

  const response = await scan(db, {}, { caller: CARER });
  assert.equal(response.status, 403, JSON.stringify(response.body));
  assert.equal(db.store.medications.length, 0);
});

// ─── the reading itself ────────────────────────────────────────────────────

/**
 * A mock vision provider. `HAVEN_AI_MOCK_URL` makes `_shared/ai.ts` POST `/vision/medication`
 * to it instead of calling OpenAI, which is the same seam the speech path uses.
 */
function visionProvider(reading) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return {
      ok: true,
      status: 200,
      json: async () => reading,
      text: async () => JSON.stringify(reading),
    };
  };
  return { calls, fetchImpl };
}

async function scanWith(db, reading, caller = ELDER) {
  const provider = visionProvider(reading);
  const harness = await loadEdgeFunction('fn-medication-ocr', {
    db,
    env: { HAVEN_AI_MOCK_URL: 'https://vision.test' },
    fetchImpl: provider.fetchImpl,
  });
  const response = await call(harness.handler, request('fn-medication-ocr', {
    headers: { authorization: `Bearer test-user:${caller}` },
    body: { elder_id: ELDER, uploaded_by_id: caller, storage_path: `${caller}/box.jpg` },
  }));
  await harness.settle();
  return { response, calls: provider.calls };
}

const CONFIDENT_READING = {
  name: 'Metformine',
  dose: '500 mg',
  frequency: 'tweemaal_daags',
  times: ['08:00', '18:00'],
  confidence: 0.94,
  raw_text: 'Metformine 500 mg, tweemaal daags, ochtend en avond',
};

test('a confident reading becomes a medication with one reminder per printed time', async () => {
  const db = ocrDb();
  const { response, calls } = await scanWith(db, CONFIDENT_READING);

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(calls.length, 1, 'the photograph is read by the provider');
  assert.match(calls[0].url, /\/vision\/medication$/, 'on the vision endpoint');
  assert.equal(calls[0].body.mime_type, 'image/jpeg');

  assert.equal(db.store.medications.length, 1);
  const medication = db.store.medications[0];
  assert.equal(medication.name_nl, 'Metformine');
  assert.equal(medication.dose_description_nl, '500 mg');
  assert.deepEqual(medication.schedule_times, ['08:00', '18:00']);
  assert.equal(medication.ocr_source_path, `${ELDER}/box.jpg`);

  assert.equal(db.store.medication_reminders.length, 2, 'a reminder for each printed time');
  assert.equal(response.body.review_required, false);
  assert.equal(response.body.confidence, 0.94, 'the confidence reported is the provider\u2019s');
  assert.equal(db.store.medication_ocr_jobs[0].confidence_score, 0.94,
    'and the one stored is too, not the old literal 0.91');
});

test('a reading the model is unsure about goes to review and writes no medication', async () => {
  const db = ocrDb();
  const unsure = { ...CONFIDENT_READING, confidence: 0.41 };
  const { response } = await scanWith(db, unsure);

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.review_required, true);
  assert.equal(db.store.medications.length, 0, 'an unsured reading must not become a prescription');
  assert.equal(db.store.medication_reminders.length, 0, 'and must not schedule anything');
  assert.equal(db.store.medication_ocr_reviews.length, 1);
  assert.equal(db.store.medication_ocr_reviews[0].status, 'pending');
  assert.equal(db.store.medication_ocr_jobs[0].status, 'needs_review');
});

test('a label with no readable name is a refusal, not a guess', async () => {
  const db = ocrDb();
  const blank = { name: '', dose: '', confidence: 0, times: [] };
  const { response } = await scanWith(db, blank);

  assert.equal(response.status, 503, JSON.stringify(response.body));
  assert.equal(db.store.medications.length, 0);
  assert.equal(db.store.medication_ocr_jobs.length, 0, 'not even a job row claims a reading happened');
});

test('a label with a name but no dose is a refusal too', async () => {
  const db = ocrDb();
  const { response } = await scanWith(db, { ...CONFIDENT_READING, dose: '' });

  assert.equal(response.status, 503, JSON.stringify(response.body));
  assert.equal(db.store.medications.length, 0);
});

test('the photograph is removed once it has been read', async () => {
  const removals = [];
  const db = ocrDb({ removals });
  const { response } = await scanWith(db, CONFIDENT_READING);

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(removals, [[`${ELDER}/box.jpg`]],
    'a photograph kept after its only use is retention without a reason');
});

test('a photograph that goes to review is kept, so the reviewer can look at it', async () => {
  const removals = [];
  const db = ocrDb({ removals });
  const { response } = await scanWith(db, { ...CONFIDENT_READING, confidence: 0.3 });

  assert.equal(response.body.review_required, true);
  assert.deepEqual(removals, [], 'deleting it would leave a reviewer with nothing to check');
});

test('approving a reviewed scan files the medication, then deletes the photograph', async () => {
  const removals = [];
  const db = createMockDb({
    storage: { 'ocr-inbox': storageDouble([], { removals }) },
    tables: {
      medication_ocr_reviews: [{
        id: REVIEW,
        ocr_job_id: JOB,
        elder_id: ELDER,
        status: 'pending',
        proposed_payload: {
          name_nl: 'Metformine',
          dose_description_nl: '500 mg',
          frequency: 'dagelijks',
          schedule_times: ['08:00'],
        },
      }],
      medication_ocr_jobs: [{
        id: JOB,
        elder_id: ELDER,
        storage_path: `${ELDER}/box.jpg`,
        status: 'needs_review',
        review_required: true,
      }],
      medications: [],
      medication_reminders: [],
      perf_metrics: [],
      idempotency_keys: [],
    },
  });

  const harness = await loadEdgeFunction('fn-medication-ocr-review', { db });
  const response = await call(harness.handler, request('fn-medication-ocr-review', {
    headers: { authorization: `Bearer test-user:${ELDER}` },
    body: { review_id: REVIEW, decision: 'approved' },
  }));

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(db.store.medications.length, 1, 'the accepted reading becomes a medication');
  assert.deepEqual(removals, [[`${ELDER}/box.jpg`]],
    'the photograph has been read and reviewed; keeping it serves nothing');

  const review = db.store.medication_ocr_reviews[0];
  assert.equal(review.status, 'approved');
  assert.equal(review.reviewer_id, ELDER);
});

test('a rejected scan deletes the photograph; one needing clarification keeps it', async () => {
  for (const [decision, expectRemoval] of [['rejected', true], ['needs_clarification', false]]) {
    const removals = [];
    const db = createMockDb({
      storage: { 'ocr-inbox': storageDouble([], { removals }) },
      tables: {
        medication_ocr_reviews: [{
          id: REVIEW, ocr_job_id: JOB, elder_id: ELDER, status: 'pending',
          proposed_payload: { name_nl: 'X', dose_description_nl: '1', schedule_times: [] },
        }],
        medication_ocr_jobs: [{ id: JOB, elder_id: ELDER, storage_path: `${ELDER}/blurry.jpg`, status: 'needs_review' }],
        medications: [], medication_reminders: [], perf_metrics: [], idempotency_keys: [],
      },
    });
    const harness = await loadEdgeFunction('fn-medication-ocr-review', { db });
    const response = await call(harness.handler, request('fn-medication-ocr-review', {
      headers: { authorization: `Bearer test-user:${ELDER}` },
      body: { review_id: REVIEW, decision },
    }));

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(db.store.medications.length, 0, `${decision} must not create a medication`);
    assert.equal(removals.length, expectRemoval ? 1 : 0,
      `${decision}: photograph ${expectRemoval ? 'should' : 'should not'} be deleted`);
  }
});
