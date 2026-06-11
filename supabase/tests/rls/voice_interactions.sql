-- ============================================================
-- HAVEN RLS Golden Tests — voice_interactions
-- ============================================================

BEGIN;
SELECT plan(6);

-- 1. Initialize extensions
CREATE EXTENSION IF NOT EXISTS pgtap;

-- 2. Clean and setup test environment
INSERT INTO auth.users (id, email)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'elder@test.nl'),
  ('00000000-0000-0000-0000-000000000002', 'family@test.nl'),
  ('00000000-0000-0000-0000-000000000003', 'other_elder@test.nl')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, role, locale, timezone)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'elder', 'nl-NL', 'Europe/Amsterdam'),
  ('00000000-0000-0000-0000-000000000002', 'family', 'nl-NL', 'Europe/Amsterdam'),
  ('00000000-0000-0000-0000-000000000003', 'elder', 'nl-NL', 'Europe/Amsterdam')
ON CONFLICT (id) DO NOTHING;

-- Insert family relationship (consented, active)
INSERT INTO family_relationships (
  id, family_member_id, elder_id, relation_label_nl, elder_consented, is_active,
  can_view_medications, can_view_messages, can_view_location_events, can_view_safety, can_view_stories, can_view_financials,
  can_view_voice, can_view_health
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'dochter',
  true,
  true,
  true, true, true, true, true, true,
  true, true
) ON CONFLICT DO NOTHING;

-- Insert some test voice interactions for the elder
INSERT INTO voice_interactions (
  id, elder_id, screen_id, transcript_nl, transcript_redacted
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  'home',
  'Hallo, test transcript.',
  false
) ON CONFLICT DO NOTHING;

-- 3. Execute test cases

-- Test 1: Elder can read their own voice interaction
SET local role = 'authenticated';
SET local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "elder"}';

SELECT results_eq(
  $$ SELECT transcript_nl FROM voice_interactions WHERE id = '11111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('Hallo, test transcript.') $$,
  'An elder must be able to read their own voice interactions'
);

-- Test 2: Other elder CANNOT read this elder's voice interaction
SET local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "elder"}';

SELECT is_empty(
  $$ SELECT * FROM voice_interactions WHERE id = '11111111-1111-1111-1111-111111111111' $$,
  'An elder must not be able to read another elder''s voice interactions'
);

-- Test 3: Family member CANNOT read raw voice interactions directly (privacy boundary)
SET local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "family"}';

SELECT is_empty(
  $$ SELECT * FROM voice_interactions WHERE id = '11111111-1111-1111-1111-111111111111' $$,
  'A family member must not be able to read raw voice interactions directly, even if consented'
);

-- Test 4: Clients cannot INSERT voice_interactions directly
SET local role = 'authenticated';
SET local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "elder"}';

SELECT throws_like(
  $$ INSERT INTO voice_interactions (elder_id, screen_id, transcript_nl) VALUES ('00000000-0000-0000-0000-000000000001', 'home', 'Direct insert test') $$,
  '%new row violates row-level security%',
  'Clients should not be able to directly insert voice interactions (inserts go through Edge Functions using service_role)'
);

-- Test 5: Service role (Edge Function) can insert voice_interactions
RESET role;
SET local request.jwt.claims = ''; -- simulated service role / admin bypass

SELECT lives_ok(
  $$ INSERT INTO voice_interactions (id, elder_id, screen_id, transcript_nl) VALUES ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', 'home', 'Service role insert test') $$,
  'Service role can bypass RLS constraints to insert voice interactions'
);

-- Test 6: Service role can read all voice interactions
SELECT results_eq(
  $$ SELECT transcript_nl FROM voice_interactions WHERE id = '22222222-2222-2222-2222-222222222222' $$,
  $$ VALUES ('Service role insert test') $$,
  'Service role can select any voice interaction'
);

SELECT * FROM finish();
ROLLBACK;
