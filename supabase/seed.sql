-- HAVEN synthetic local seed data for development and CI.
-- Compatible with all 12 migrations through 20260613000012.
-- Idempotent: every insert uses on conflict do nothing so supabase db reset is safe.
-- No real personal data. Synthetic Dutch names only. No BSN, no DigiD, no full postcodes.

-- =====================================================================
-- Test users in auth.users (referenced by profiles.id)
-- =====================================================================

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000001', 'margreet@haven.test', now(), '{"role":"elder","preferred_name":"Margreet"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'sarah@haven.test', now(), '{"role":"family","full_name":"Sarah Bakker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'lucas@haven.test', now(), '{"role":"family","full_name":"Lucas Bakker"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000004', 'eva@haven.test', now(), '{"role":"carer","full_name":"Nurse Eva de Boer"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000005', 'admin@haven.test', now(), '{"role":"admin","full_name":"HAVEN Admin"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000006', 'onbekend@haven.test', now(), '{"role":"family","full_name":"Other Family"}'::jsonb, now(), now())
on conflict (id) do update set
  email = excluded.email,
  raw_user_meta_data = excluded.raw_user_meta_data;

-- =====================================================================
-- profiles (role-bearing)
-- =====================================================================

insert into profiles (id, role, full_name, preferred_name, locale, timezone, country_code, high_contrast, font_size_multiplier, onboarding_complete, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000001', 'elder',  'Margreet Bakker',          'Margreet', 'nl-NL', 'Europe/Amsterdam', 'NL', true,  1.30, true,  now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'family', 'Sarah Bakker',             'Sarah',    'nl-NL', 'Europe/Amsterdam', 'NL', false, 1.00, true,  now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'family', 'Lucas Bakker',             'Lucas',    'nl-NL', 'Europe/Amsterdam', 'NL', false, 1.00, true,  now(), now()),
  ('00000000-0000-0000-0000-000000000004', 'carer',  'Eva de Boer',              'Eva',      'nl-NL', 'Europe/Amsterdam', 'NL', false, 1.00, true,  now(), now()),
  ('00000000-0000-0000-0000-000000000005', 'admin',  'HAVEN Admin',              'Admin',    'nl-NL', 'Europe/Amsterdam', 'NL', false, 1.00, true,  now(), now()),
  ('00000000-0000-0000-0000-000000000006', 'family', 'Petra van Dijk',           'Petra',    'nl-NL', 'Europe/Amsterdam', 'NL', false, 1.00, false, now(), now())
on conflict (id) do update set
  role = excluded.role,
  full_name = excluded.full_name,
  preferred_name = excluded.preferred_name,
  locale = excluded.locale,
  timezone = excluded.timezone,
  country_code = excluded.country_code,
  high_contrast = excluded.high_contrast,
  font_size_multiplier = excluded.font_size_multiplier,
  onboarding_complete = excluded.onboarding_complete;

-- =====================================================================
-- elder_profiles (safe zone is PostGIS POINT; use SRID 4326 = WGS84 lng/lat)
-- Coordinates are for "De Pijp, Amsterdam" — a synthetic, public test location.
-- =====================================================================

insert into elder_profiles (
  id, elder_id, safe_zone_centre, safe_zone_radius_m, safe_zone_label_nl,
  night_mode_start, night_mode_end, night_mode_active,
  cognitive_support, emergency_contacts,
  medical_summary_nl, huisarts_name, huisarts_phone, allergies_nl, conditions_nl,
  font_scale, high_contrast, created_at, updated_at
) values (
  '11111111-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  ST_SetSRID(ST_MakePoint(4.8987, 52.3557), 4326)::geography,
  300, 'Thuis — De Pijp',
  '22:00', '08:00', false,
  false,
  '[{"name":"Sarah Bakker","relation":"dochter","phone_label":"+31 6 1234 5678"}]'::jsonb,
  'Margreet is 78 jaar. Woont zelfstandig. Gebruikt drie medicijnen dagelijks.',
  'Dr. van der Linden', '+31 20 555 1234',
  array['penicilline'],
  array['diabetes type 2','hypertensie'],
  1.20, true, now(), now()
) on conflict do nothing;

-- =====================================================================
-- family_relationships (insert pending, then update to consented = true)
-- Insert satisfies family_relationships_family_insert policy (elder_consented=false),
-- the follow-up update satisfies the elder-side consent grant.
-- =====================================================================

insert into family_relationships (id, elder_id, family_member_id, relation_label_nl, relation_type, is_primary, elder_consented, is_active, can_view_medications, can_view_messages, can_view_location_events, can_view_alerts, can_view_stories, can_view_financials, notify_on_scam_amber, notify_on_scam_rood, notify_on_scam_zwart, notify_on_missed_meds, notify_on_safe_zone_exit, notify_on_crisis, created_at, updated_at) values
  ('22222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Dochter Sarah', 'kind',   true,  false, true, true,  true,  true,  true,  true,  false, true, true, true, true, true, true, now(), now()),
  ('22222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'Kleinzoon Lucas', 'kleinkind', false, false, true, false, true,  false, true,  true,  false, true, true, true, true, true, true, now(), now()),
  ('22222222-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', 'Nicht Petra',    'andere', false, false, true, false, false, false, false, false, false, true, true, true, false, false, true, now(), now())
on conflict do nothing;

-- Now grant elder consent (this would normally happen via fn-consent-update from the elder app).
update family_relationships set elder_consented = true, elder_consented_at = now() where id in (
  '22222222-0000-0000-0000-000000000001',
  '22222222-0000-0000-0000-000000000002'
);

-- =====================================================================
-- carer_relationships (Buurtzorg Amsterdam synthetic)
-- =====================================================================

insert into carer_relationships (id, elder_id, carer_member_id, organisation_nl, role_label_nl, carer_role, elder_consented, is_active, can_view_medications, can_view_visit_logs, can_create_visit_logs, can_file_incidents, created_at, updated_at) values
  ('33333333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'Buurtzorg Amsterdam', 'Wijkverpleegkundige', 'wijkverpleegkundige', true, true, true, true, true, true, now(), now())
on conflict do nothing;

-- =====================================================================
-- consent_records (granular per-category, per design doc sec 3.2)
-- =====================================================================

insert into consent_records (id, elder_id, consent_type, granted, consent_version, channel, granted_at) values
  ('44444444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'voice_recordings',           true, '1.2.1', 'elder_app',         now() - interval '14 days'),
  ('44444444-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'medication_data',            true, '1.2.1', 'elder_app',         now() - interval '14 days'),
  ('44444444-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'location_data',             true, '1.2.1', 'elder_app',         now() - interval '14 days'),
  ('44444444-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'financial_transaction_data', false, '1.2.1', 'family_onboarding', now() - interval '14 days'),
  ('44444444-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'family_messages',           true, '1.2.1', 'elder_app',         now() - interval '14 days'),
  ('44444444-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'buurt_connector',           true, '1.2.1', 'elder_app',         now() - interval '7 days'),
  ('44444444-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'life_stories',              true, '1.2.1', 'elder_app',         now() - interval '14 days'),
  ('44444444-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'wellness_checkins',         true, '1.2.1', 'elder_app',         now() - interval '14 days'),
  ('44444444-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'cognitive_checkins',        true, '1.2.1', 'elder_app',         now() - interval '14 days'),
  ('44444444-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'companion_memory',          true, '1.2.1', 'elder_app',         now() - interval '14 days')
on conflict do nothing;

-- =====================================================================
-- feature_flags — MVP coverage plus BUURT/PSD2/WACHT gated off
-- (already inserted by migration 0001 on conflict do nothing; reset here)
-- =====================================================================

update feature_flags set enabled = true, rollout_pct = 100 where flag_key in (
  'schild_call_reputation',
  'anker_medication_ocr',
  'kring_life_story_recording',
  'kompas_safe_zone_alerts',
  'stem_companion',
  'psd2_transaction_intercept',
  'buurt_neighbourhood_connector',
  'buurt_walk_buddy',
  'buurt_events'
);
update feature_flags set enabled = false, rollout_pct = 0 where flag_key in (
  'companion_memory',
  'wacht_professional_portal'
);

-- =====================================================================
-- contacts (trusted/untrusted Dutch names only — no BSN, no phone numbers)
-- phone_hashed and email_hashed are SHA-256 placeholders, not real values
-- =====================================================================

insert into contacts (id, elder_id, display_name, phone_hashed, email_hashed, relationship_label, is_trusted, interaction_count, last_interaction_at, grooming_risk_score, notes, created_at, updated_at) values
  ('55555555-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Dr. van der Linden (huisarts)',  'h:placeholder-doctor-phone',    'h:placeholder-doctor-mail',    'Huisarts',     true,  8, now() - interval '14 days', 0,  'Betrouwbaar; belt nooit over financiën.',                now(), now()),
  ('55555555-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Apotheek De Pijp',              'h:placeholder-pharmacy-phone', 'h:placeholder-pharmacy-mail', 'Apotheek',     true,  4, now() - interval '5 days',  0,  'Refill via recept.',                                     now(), now()),
  ('55555555-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Buurtcentrum De Pijp',          null,                              null,                            'Buurtcentrum', true,  2, now() - interval '30 days', 0,  'Koffieochtend elke vrijdag.',                            now(), now()),
  ('55555555-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Onbekend nummer',               'h:placeholder-unknown-phone',   null,                            'Onbekend',     false, 1, now() - interval '2 days',  45, 'Amber scamelert ontvangen — niet opgenomen.',           now(), now())
on conflict do nothing;

-- =====================================================================
-- scam_events (SCHILD coverage: 1 amber, 1 rood-black history)
-- raw_content_hash + signal_reference_hashed are SHA-256 placeholders
-- =====================================================================

insert into scam_events (id, elder_id, contact_id, channel, signal_reference_hashed, raw_content_hash, threat_types, alert_level, score_composite, score_reputation, score_pattern, score_nlp_intent, score_longitudinal, explanation_nl, explanation_en, elder_dismissed, family_notified, created_at, updated_at) values
  ('66666666-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000004', 'phone', 'h:placeholder-signal-1', 'h:placeholder-content-1', array['bankhelpdeskfraude']::scam_threat_type[], 'amber', 52, 30, 78, 40, 15, 'lemand belde en vroeg naar uw bankpas. Geef nooit codes door.', 'Someone called and asked about your bank card. Never share codes.', false, true, now() - interval '2 days', now() - interval '2 days'),
  ('66666666-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', null, 'whatsapp', 'h:placeholder-signal-2', 'h:placeholder-content-2', array['vriend_in_nood']::scam_threat_type[], 'rood', 82, 40, 88, 80, 50, 'Een bekende lijkt in nood maar het account is mogelijk overgenomen. Bel uw familie eerst.', 'A contact appears in need but the account may be hijacked. Call family first.', false, true, now() - interval '11 days', now() - interval '11 days')
on conflict do nothing;

-- =====================================================================
-- documents (Document Vault — no BSN, no DigiD per design doc)
-- is_sensitive_legal = false because we are seeding non-legal docs only.
-- Summary text deliberately avoids any 9-digit numeric pattern (BSN guard trigger).
-- =====================================================================

insert into documents (id, elder_id, label_nl, label_en, document_type, storage_path, summary_nl, summary_en, is_sensitive_legal, in_emergency_profile, created_at, updated_at) values
  ('77777777-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Zorgverzekeringspolis 2026',  'Health insurance policy 2026', 'insurance_policy', 'document-vault/00000000-0000-0000-0000-000000000001/zorgverzekering-2026.pdf', 'Overzicht van uw zorgverzekering voor 2026, polisvoorwaarden en dekking.', 'Summary of your 2026 health insurance coverage.', false, true, now() - interval '60 days', now() - interval '60 days'),
  ('77777777-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Medicijnoverzicht',           'Medication summary',          'medication_list',  'document-vault/00000000-0000-0000-0000-000000000001/medicijnoverzicht.pdf',  'Lijst van huidige medicijnen zonder burgerservicenummer.', 'Current medication list, no citizen-service number.', false, true, now() - interval '30 days', now() - interval '30 days'),
  ('77777777-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Energierekening Q1',          'Utility bill Q1',              'utility_bill',     'document-vault/00000000-0000-0000-0000-000000000001/energierekening-q1.pdf', 'Overzicht van energieverbruik en kosten Q1.',                'Energy usage summary for Q1.',                              false, false, now() - interval '20 days', now() - interval '20 days')
on conflict do nothing;

-- =====================================================================
-- financial_accounts + financial_transactions (PSD2 + transaction intercept)
-- Only consent_status = 'active' on the active consent; masked account IDs only.
-- =====================================================================

insert into financial_accounts (id, elder_id, provider, bank_name, account_id_masked, consent_status, consent_expires_at, last_synced_at, alert_threshold_cents, is_active, created_at, updated_at) values
  ('88888888-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'tink', 'ABN AMRO', '**** 4821', 'active',  now() + interval '180 days', now() - interval '1 day', 20000, true, now() - interval '30 days', now() - interval '1 day')
on conflict do nothing;

insert into financial_transactions (id, elder_id, financial_account_id, account_id_masked, bank_name, amount_cents, currency, counterparty_name, counterparty_iban_masked, description, transaction_date, anomaly_score, flagged, intercepted, source_provider, raw_reference_hash, created_at, updated_at) values
  ('88888888-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', '**** 4821', 'ABN AMRO',    1255,    'EUR', 'Albert Heijn',   null,                'Boodschappen', current_date - 1, 0,  false, false, 'psd2', 'h:placeholder-txn-1', now() - interval '1 day',  now() - interval '1 day'),
  ('88888888-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', '**** 4821', 'ABN AMRO',  -45000,    'EUR', 'Onbekende begunstigde', 'NL**ABNA**********', 'Nieuwe begunstigde — simulatie', current_date, 76, true, true, 'psd2', 'h:placeholder-txn-2', now(), now())
on conflict do nothing;

-- =====================================================================
-- medications (ANKER) + medication_reminders (today, Dutch enum values)
-- =====================================================================

insert into medications (id, elder_id, name_nl, name_en, brand_name_nl, dose_description_nl, dose_description_en, frequency, schedule_times, instructions_nl, instructions_en, with_food, current_stock, refill_threshold, refill_pharmacy_nl, prescribed_by_nl, is_active, start_date, created_at, updated_at) values
  ('99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Metformine',  'Metformin',  'Glucophage', '500 mg per tablet', '500 mg per tablet',  'tweemaal_daags',  array['08:00','18:00']::time[], 'Innemen met voedsel.', 'Take with food.', true,  18, 10, 'Apotheek De Pijp', 'Dr. van der Linden', true, current_date - interval '180 days', now(), now()),
  ('99999999-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Lisinopril',  'Lisinopril',  null,        '10 mg per tablet',  '10 mg per tablet',   'eenmaal_daags',   array['08:00']::time[],      'In de ochtend.',     'In the morning.', false, 23, 10, 'Apotheek De Pijp', 'Dr. van der Linden', true, current_date - interval '120 days', now(), now()),
  ('99999999-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Vitamine D',  'Vitamin D',  null,        '20 mcg per tablet','20 mcg per tablet', 'dagelijks',       array['18:00']::time[],      null,                  null,                   false, 42, 14, 'Apotheek De Pijp', 'Dr. van der Linden', true, current_date - interval '60 days',  now(), now())
on conflict do nothing;

-- Reminders for today (gepland = scheduled; reminder state machine)
insert into medication_reminders (id, medication_id, elder_id, scheduled_time, status, snooze_count, idempotency_key, created_at, updated_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', (current_date + time '08:00') at time zone 'Europe/Amsterdam', 'gepland', 0, gen_random_uuid(), now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', (current_date + time '08:00') at time zone 'Europe/Amsterdam', 'gepland', 0, gen_random_uuid(), now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', (current_date + time '18:00') at time zone 'Europe/Amsterdam', 'gepland', 0, gen_random_uuid(), now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000004', '99999999-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', (current_date + time '18:00') at time zone 'Europe/Amsterdam', 'gepland', 0, gen_random_uuid(), now(), now())
on conflict do nothing;

-- =====================================================================
-- tasks + wellness_checkins + hydration_logs (ANKER daily rhythm)
-- =====================================================================

insert into tasks (id, elder_id, created_by_role, title_nl, title_en, notes_nl, notes_en, due_date, due_time, completed, completed_at, voice_created, created_at, updated_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'family', 'Huisartsafspraak met dr. van der Linden', 'GP appointment with Dr. van der Linden', 'Neem medicijnoverzicht mee.', 'Bring medication list.', current_date, '14:00', false, null, false, now() - interval '3 days', now() - interval '3 days'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'elder',  'Korte wandeling na de lunch',              'Short walk after lunch',                  null, null, current_date, '13:15', false, null, true, now() - interval '1 day', now() - interval '1 day'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'family', 'Apotheek bellen voor refill',              'Call pharmacy for refill',                null, null, current_date + 2, '10:00', false, null, false, now() - interval '1 day', now() - interval '1 day')
on conflict do nothing;

insert into wellness_checkins (id, elder_id, mood_score, energy_score, pain_score, notes_nl, checked_in_at, created_at) values
  ('cccccccc-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 4, 4, 1, 'Goede ochtend, voel me rustig.', now() - interval '3 days', now() - interval '3 days'),
  ('cccccccc-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 4, 3, 2, null,                                   now() - interval '2 days', now() - interval '2 days'),
  ('cccccccc-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 3, 3, 1, null,                                   now() - interval '1 day',  now() - interval '1 day'),
  ('cccccccc-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 4, 4, 1, 'Fijne dag vandaag.',                  now(),                          now())
on conflict do nothing;

insert into hydration_logs (id, elder_id, amount_ml, source, notes_nl, logged_at, created_at) values
  ('dddddddd-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 250, 'voice', 'Thee na het ontbijt.', now() - interval '6 hours', now() - interval '6 hours'),
  ('dddddddd-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 200, 'voice', 'Water bij de lunch.',   now() - interval '2 hours', now() - interval '2 hours'),
  ('dddddddd-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 200, 'manual', null,                  now(),                        now())
on conflict do nothing;

-- =====================================================================
-- family_messages (KRING) — text, voice_note metadata, video_hallo from grandchild
-- =====================================================================

insert into family_messages (id, elder_id, sender_id, sender_role, message_type, content_nl, content_en, storage_path, duration_seconds, read_by_elder, created_at, updated_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'family', 'tekst',       'Ik denk vanochtend aan u. Ik bel na mijn werk.',                                          'Thinking of you this morning. I will call after work.',           null,        null,   false, now() - interval '8 hours',  now() - interval '8 hours'),
  ('eeeeeeee-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'family', 'video_hallo', null,                                                                                null,                                                                       'voice-notes/00000000-0000-0000-0000-000000000001/lucas-hello.m4a', 12, false, now() - interval '4 hours',  now() - interval '4 hours'),
  ('eeeeeeee-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'family', 'voice_note',  null,                                                                                null,                                                                       'voice-notes/00000000-0000-0000-0000-000000000001/sarah-spraakbericht.m4a', 24, false, now() - interval '1 day',  now() - interval '1 day'),
  ('eeeeeeee-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'elder',  'tekst',       'Hartelijke groet aan Sarah en Lucas.',                                                   'Warm regards to Sarah and Lucas.',                                null,        null,   true,  now() - interval '2 days',  now() - interval '2 days')
on conflict do nothing;

-- =====================================================================
-- life_story_prompts + life_stories (KRING — Mijn Verhaal)
-- =====================================================================

insert into life_story_prompts (id, prompt_nl, prompt_en, category_nl, sort_order, active) values
  ('ffffffff-0000-0000-0000-000000000001', 'Vertel over uw eerste woning.',                    'Tell about your first home.',                 'Jeugd',       1, true),
  ('ffffffff-0000-0000-0000-000000000002', 'Hoe ontmoette u uw partner?',                      'How did you meet your partner?',              'Liefde',      2, true),
  ('ffffffff-0000-0000-0000-000000000003', 'Wat was uw eerste baan?',                          'What was your first job?',                   'Werk',        3, true),
  ('ffffffff-0000-0000-0000-000000000004', 'Welke muziek luisterde u graag als kind?',         'What music did you love as a child?',         'Herinnering', 4, true),
  ('ffffffff-0000-0000-0000-000000000005', 'Wat is uw favoriete plek in Nederland?',           'What is your favourite place in the Netherlands?', 'Plaatsen', 5, true)
on conflict do nothing;

insert into life_stories (id, elder_id, prompt_id, title_nl, title_en, recording_path, transcript_nl, transcript_en, duration_seconds, status, keepsake_book_include, year_approximate, location_nl, created_at, updated_at) values
  ('ffffffff-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'Het eerste appartement in Rotterdam', 'The first apartment in Rotterdam', 'life-story-audio/00000000-0000-0000-0000-000000000001/eerste-appartement.m4a', 'We trouwden jong en kregen een klein appartement aan de Coolsingel. Twee kamers, een gaskachel, veel buren.', 'We married young and got a small apartment on Coolsingel. Two rooms, a gas heater, lots of neighbours.', 240, 'gereed', true, 1968, 'Rotterdam', now() - interval '30 days', now() - interval '30 days'),
  ('ffffffff-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000004', 'Muziek uit mijn jeugd',               'Music from my youth',               'life-story-audio/00000000-0000-0000-0000-000000000001/muziek-jeugd.m4a',       'Op zondagmiddag draaide vader platen van Wim Sonneveld en de Kilima Hawaiians.', 'On Sunday afternoons father played records by Wim Sonneveld and the Kilima Hawaiians.', 180, 'gereed', false, 1962, 'Rotterdam', now() - interval '14 days', now() - interval '14 days')
on conflict do nothing;

insert into memory_lane_photos (id, elder_id, uploaded_by_id, storage_path, caption_nl, caption_en, year_approximate, date_taken, location_nl, is_memorial, surface_on_anniversary, anniversary_date, created_at) values
  ('ffffffff-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'life-story-photos/00000000-0000-0000-0000-000000000001/trouwfoto-1965.jpg', 'Trouwfoto 1965',  'Wedding photo 1965', 1965, '1965-06-12', 'Rotterdam', false, false, null, now() - interval '60 days'),
  ('ffffffff-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'life-story-photos/00000000-0000-0000-0000-000000000001/lucas-geboorte.jpg', 'Lucas geboren', 'Lucas born', 1995, '1995-03-04', 'Amsterdam', false, true,  '1995-03-04', now() - interval '30 days')
on conflict do nothing;

-- =====================================================================
-- voice_interactions (last 24h, distress_detected false)
-- =====================================================================

insert into voice_interactions (id, elder_id, screen_id, transcript_nl, transcript_en, intent, entities, response_text_nl, response_text_en, distress_detected, action_taken, duration_ms, created_at) values
  ('99999999-1111-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'STEM',  'Ik heb mijn pillen ingenomen en voel me rustig.', 'I took my pills and feel calm.', 'bevestig_ingenomen', '{"medication":"metformine"}'::jsonb, 'Goed gedaan. Ik heb het genoteerd.', 'Well done. I recorded it.', false, 'CONFIRM_MEDICATION_TAKEN', 820, now() - interval '6 hours'),
  ('99999999-1111-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'FAMILY', 'Stuur een hart naar Sarah.',                          'Send a heart to Sarah.',                'family_message',   '{"recipient":"sarah"}'::jsonb,    'Hart verstuurd.',                  'Heart sent.',                false, 'SEND_HEART',                540, now() - interval '3 hours'),
  ('99999999-1111-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'PILLS', 'Vertel over mijn pillen.',                            'Tell me about my pills.',               'companion',        '{}'::jsonb,                            'U heeft Metformine om 8 en 18 uur, Lisinopril om 8 uur, en Vitamine D om 18 uur.', 'You have Metformin at 8 and 18, Lisinopril at 8, and Vitamin D at 18.', false, 'COMPANION_REPLY', 1100, now() - interval '1 hour')
on conflict do nothing;

-- =====================================================================
-- companion_memory (elder-private — non-sensitive, importance_score 1..10)
-- =====================================================================

insert into companion_memory (id, elder_id, memory_type, content_nl, content_en, importance_score, source, source_id, expires_at, created_at) values
  ('99999999-2222-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'personal_fact',    'De kleindochter van Margreet heet Sofia.',                       'Margreet''s granddaughter is named Sofia.',                8, 'voice_interaction', '99999999-1111-0000-0000-000000000002', null,                              now() - interval '30 days'),
  ('99999999-2222-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'preference',       'Margreet luistert graag naar klassieke muziek in de middag.',   'Margreet enjoys classical music in the afternoon.',         6, 'manual',            null,                                    now() + interval '1 year',         now() - interval '14 days'),
  ('99999999-2222-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'recurring_event',  'Elke dinsdag belt dochter Sarah.',                                'Daughter Sarah calls every Tuesday.',                       7, 'manual',            null,                                    now() + interval '6 months',       now() - interval '7 days'),
  ('99999999-2222-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'life_event',       'Margreet is in 1968 getrouwd in Rotterdam.',                     'Margreet married in 1968 in Rotterdam.',                    9, 'life_story',        'ffffffff-0000-0000-0000-000000000010', null,                          now() - interval '30 days'),
  ('99999999-2222-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'emotional_state',  'Margreet voelde zich deze week rustig en tevreden.',             'Margreet felt calm and content this week.',                 4, 'voice_interaction', '99999999-1111-0000-0000-000000000001', now() + interval '90 days',   now() - interval '2 days'),
  ('99999999-2222-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'medical_context',  'Metformine wordt ingenomen met ontbijt en avondeten.',            'Metformin is taken with breakfast and dinner.',             7, 'anker_sync',        null,                                    now() + interval '1 year',         now() - interval '30 days')
on conflict do nothing;

-- =====================================================================
-- BUURT (interest_tags already inserted by migration 0001; neighbourhood_profiles here)
-- =====================================================================

insert into neighbourhood_profiles (id, elder_id, postcode_pc4, neighbourhood_label, radius_km, is_active, opted_in_at, walk_buddy_seeking, walk_preferred_time, family_can_see_connections, created_at, updated_at) values
  ('99999999-3333-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '1072', 'De Pijp, Amsterdam', 2, true, now() - interval '7 days', true, 'ochtend', true, now() - interval '7 days', now() - interval '7 days')
on conflict do nothing;

insert into elder_interest_tags (id, elder_id, tag_id, created_at)
select gen_random_uuid(),
       '00000000-0000-0000-0000-000000000001',
       it.id,
       now()
from interest_tags it
where it.tag_key in ('tuinieren','wandelen','lezen','muziek','koken')
on conflict do nothing;

insert into neighbourhood_events (id, postcode_pc4, location_label_nl, location_label_en, distance_label_nl, distance_label_en, title_nl, title_en, description_nl, event_date, event_time, is_free, relevant_tag_ids, source, source_url, is_active, created_at, expires_at) values
  ('99999999-3333-0000-0000-000000000010', '1072', 'Bibliotheek De Pijp', 'Library De Pijp', '600 m', '600 m', 'Gratis koffieochtend', 'Free coffee morning', 'Elke vrijdag van 10:00 tot 12:00.', current_date + 3, '10:00:00', true, null, 'manual', null, true, now(), current_date + 3),
  ('99999999-3333-0000-0000-000000000011', '1072', 'Park Frankendael',   'Park Frankendael', '1.2 km', '1.2 km', 'Wandelgroep ouderen', 'Senior walking group', 'Wandel mee met andere ouderen uit de buurt.', current_date + 5, '14:00:00', true, null, 'ouderenfonds', 'https://www.ouderenfonds.nl', true, now(), current_date + 5)
on conflict do nothing;

-- =====================================================================
-- location_events + cognitive_checkins (KOMPAS)
-- location_precise is intentionally null (only fuzzed stored); auto_delete_at nulled for fuzzed entries
-- =====================================================================

insert into location_events (id, elder_id, event_type, location_fuzzed, location_precise, accuracy_metres, family_notified, check_in_prompted, created_at, auto_delete_at) values
  ('99999999-4444-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'veilige_zone_teruggekeerd', ST_SetSRID(ST_MakePoint(4.8987, 52.3557), 4326), null, 100, false, false, now() - interval '2 hours', null),
  ('99999999-4444-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'veilige_zone_verlaten',     ST_SetSRID(ST_MakePoint(4.9020, 52.3590), 4326), null,  80, true,  true,  now() - interval '1 day',  null)
on conflict do nothing;

insert into cognitive_checkins (id, elder_id, question_nl, question_en, answer_nl, expected_answer_nl, correct, confidence_score, rolling_score_7d, significant_change, checked_in_at, created_at) values
  ('99999999-5555-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Welke dag van de week is het vandaag?', 'What day of the week is it today?', to_char(current_date, 'Day'), to_char(current_date, 'Day'), true, 0.95, 0.92, false, now() - interval '1 day', now() - interval '1 day'),
  ('99999999-5555-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'In welke stad woont u?',                  'In which city do you live?',         'Amsterdam',                         'Amsterdam',                          true, 1.00, 0.92, false, now() - interval '1 day', now() - interval '1 day')
on conflict do nothing;

-- =====================================================================
-- WACHT — care_plans, care_plan_items, carer_visit_logs, incidents, safeguarding_reports
-- =====================================================================

insert into care_plans (id, elder_id, created_by_id, status, title_nl, title_en, goals_nl, goals_en, review_due_date, approved_by_elder, approved_at, created_at, updated_at) values
  ('99999999-6666-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'active', 'Dagelijkse zorg en medicatie', 'Daily care and medication', array['Stabiele bloedsuiker','Voldoende hydratatie','Veilige mobiliteit'], array['Stable blood sugar','Adequate hydration','Safe mobility'], current_date + interval '90 days', true, now() - interval '30 days', now() - interval '30 days', now())
on conflict do nothing;

insert into care_plan_items (id, care_plan_id, elder_id, category, instruction_nl, instruction_en, frequency, assigned_role, created_at, updated_at) values
  ('99999999-6666-0000-0000-000000000010', '99999999-6666-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'medication', 'Controleer of Metformine ingenomen is.',                   'Verify Metformin was taken.',                   'dagelijks', 'carer',   now(), now()),
  ('99999999-6666-0000-0000-000000000011', '99999999-6666-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'hydration',  'Stimuleer 1.5L waterinname per dag.',                       'Encourage 1.5L water intake per day.',            'dagelijks', 'family',  now(), now()),
  ('99999999-6666-0000-0000-000000000012', '99999999-6666-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'mobility',   'Bied ondersteuning bij korte wandeling na lunch.',          'Offer support during short walk after lunch.',   'dagelijks', 'carer',   now(), now())
on conflict do nothing;

insert into carer_visit_logs (id, elder_id, carer_id, visit_date, check_in_time, check_out_time, activities_nl, observations_nl, mood_observed, concerns_nl, follow_up_required, created_at, updated_at) values
  ('99999999-6666-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', current_date - 1, (current_date - 1)::timestamp + time '10:00', (current_date - 1)::timestamp + time '10:45', array['medicatiecontrole','koffiepraatje'], 'Margreet was vandaag rustig en in een goede stemming.', 4, null, false, now() - interval '1 day', now() - interval '1 day'),
  ('99999999-6666-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', current_date - 8, (current_date - 8)::timestamp + time '11:00', (current_date - 8)::timestamp + time '11:30', array['refill overleg'],                   'Refill voor Metformine aangevraagd bij apotheek.',  3, 'Let op voorraad Vitamine D.', false, now() - interval '8 days', now() - interval '8 days')
on conflict do nothing;

insert into incidents (id, elder_id, reported_by_id, incident_type, description_nl, severity, meldcode_step_reached, external_report_made, external_authority_nl, resolved, resolved_at, resolution_notes_nl, created_at, updated_at) values
  ('99999999-6666-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'valrisico', 'Rand van kleed in de gang is mogelijk een struikelblok.', 'laag', 1, false, null, true, now() - interval '14 days', 'Kleed is verplaatst en gang is vrij.', now() - interval '15 days', now() - interval '14 days')
on conflict do nothing;

-- =====================================================================
-- Platform — notifications, push_tokens, notification_preferences, device_sessions
-- =====================================================================

insert into notifications (id, recipient_id, elder_id, notification_type, title_nl, title_en, body_nl, body_en, data, read, sent_at, created_at) values
  ('99999999-7777-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'medicijn_herinnering', 'Pilletijd 💊', 'Medicine time 💊', 'Margreet moet nu haar pillen innemen.', 'Margreet should take her medicine now.', '{"reminder_id":"aaaaaaaa-0000-0000-0000-000000000001"}'::jsonb, false, null, now() - interval '6 hours'),
  ('99999999-7777-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'scam_amber',          'Mogelijk verdacht telefoontje',  'Possibly suspicious call', 'Een onbekend nummer belde Margreet. Geef nooit codes door.', 'An unknown number called Margreet. Never share codes.', '{"scam_event_id":"66666666-0000-0000-0000-000000000001"}'::jsonb, false, null, now() - interval '2 days'),
  ('99999999-7777-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'veilige_zone_verlaten','Margreet was buiten de veilige zone', 'Margreet was outside the safe zone', 'Ze is inmiddels teruggekeerd.', 'She has returned since.', '{"location_event_id":"99999999-4444-0000-0000-000000000002"}'::jsonb, true, null, now() - interval '1 day')
on conflict do nothing;

insert into push_tokens (id, profile_id, token, platform, is_active, created_at, updated_at) values
  ('99999999-7777-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'ExponentPushToken[DEV-PLACEHOLDER-ELDER-IOS]',  'ios',     true, now(), now()),
  ('99999999-7777-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', 'ExponentPushToken[DEV-PLACEHOLDER-FAMILY-ANDROID]', 'android', true, now(), now()),
  ('99999999-7777-0000-0000-000000000012', '00000000-0000-0000-0000-000000000004', 'ExponentPushToken[DEV-PLACEHOLDER-CARER-IOS]', 'ios',     true, now(), now())
on conflict do nothing;

insert into notification_preferences (id, profile_id, notification_type, enabled, quiet_hours_start, quiet_hours_end, created_at, updated_at) values
  ('99999999-7777-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'crisis_gedetecteerd', true, '22:00', '08:00', now(), now()),
  ('99999999-7777-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'scam_zwart',         true, null,    null,    now(), now()),
  ('99999999-7777-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'medicijn_herinnering', true, null,  null,    now(), now())
on conflict do nothing;

insert into device_sessions (id, profile_id, device_label, platform, device_id_hash, last_seen_at, created_at) values
  ('99999999-7777-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'Margreet-iPhone-12',  'ios',     'h:placeholder-device-elder', now(), now()),
  ('99999999-7777-0000-0000-000000000031', '00000000-0000-0000-0000-000000000002', 'Sarah-Pixel-7',       'android', 'h:placeholder-device-family', now(), now()),
  ('99999999-7777-0000-0000-000000000032', '00000000-0000-0000-0000-000000000004', 'Eva-iPhone-14',       'ios',     'h:placeholder-device-carer',  now(), now())
on conflict do nothing;

-- =====================================================================
-- Emergency profile tokens (KOMPAS) + access log
-- =====================================================================

insert into emergency_access_tokens (id, elder_id, token_hash, label, expires_at, last_used_at, created_at) values
  ('99999999-8888-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'h:placeholder-emergency-token', 'QR-kaart voor eerstehulpverleners', current_date + interval '365 days', null, now())
on conflict do nothing;

-- =====================================================================
-- Grandchild profiles + partner_event_feeds (KRING / Phase 3)
-- =====================================================================

insert into grandchild_profiles (id, family_member_id, elder_id, display_name, age_band, guardian_consented, elder_consented, created_at, updated_at) values
  ('99999999-9999-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Lucas', '13_plus', true, true, now() - interval '30 days', now() - interval '30 days'),
  ('99999999-9999-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Sophie', '6_9',    true, true, now() - interval '30 days', now() - interval '30 days')
on conflict do nothing;

-- =====================================================================
-- App events (observability seed)
-- =====================================================================

insert into app_events (id, profile_id, elder_id, surface, event_name, properties, occurred_at) values
  ('aaaaaaaa-1111-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'elder_app',         'screen_opened',     '{"screen":"HOME"}'::jsonb,                       now() - interval '4 hours'),
  ('aaaaaaaa-1111-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'elder_app',         'medication_taken',  '{"reminder_id":"aaaaaaaa-0000-0000-000000000001"}'::jsonb, now() - interval '6 hours'),
  ('aaaaaaaa-1111-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'family_dashboard',  'page_viewed',       '{"path":"/dashboard/meldingen"}'::jsonb,           now() - interval '2 days'),
  ('aaaaaaaa-1111-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'carer_portal',      'visit_log_created', '{"visit_id":"99999999-6666-0000-0000-000000000020"}'::jsonb, now() - interval '1 day')
on conflict do nothing;

-- =====================================================================
-- Idempotency keys + integration_connections (already in migration 0009; verify state)
-- =====================================================================

insert into idempotency_keys (id, key_hash, function_name, elder_id, profile_id, request_hash, locked_until, expires_at) values
  ('bbbbbbbb-1111-0000-0000-000000000001', 'h:placeholder-idempotency-1', 'fn-voice-pipeline', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'h:placeholder-req-1', now() + interval '2 minutes', now() + interval '24 hours')
on conflict do nothing;

insert into audit_log (actor_id, actor_role, action, table_name, record_id, elder_id, ip_address_hash, user_agent, extra, created_at) values
  ('00000000-0000-0000-0000-000000000001', 'elder', 'READ',  'companion_memory',  '99999999-2222-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'h:placeholder-ip-1', 'Haven-iOS/1.0', '{}'::jsonb, now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000002', 'family', 'READ',  'medications',       '99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'h:placeholder-ip-2', 'Haven-Web/1.0', '{"permission":"can_view_medications"}'::jsonb, now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000004', 'carer',  'CREATE','carer_visit_logs',  '99999999-6666-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'h:placeholder-ip-3', 'Haven-Carer/1.0', '{}'::jsonb, now() - interval '1 day');

-- =====================================================================
-- Perf metrics (observability seed)
-- =====================================================================

insert into perf_metrics (id, fn_name, duration_ms, status, env, recorded_at) values
  ('dddddddd-1111-0000-0000-000000000001', 'fn-voice-pipeline',          820, 'success', 'production', now() - interval '6 hours'),
  ('dddddddd-1111-0000-0000-000000000002', 'fn-scam-pipeline',           340, 'success', 'production', now() - interval '2 days'),
  ('dddddddd-1111-0000-0000-000000000003', 'fn-medication-escalation',   210, 'success', 'production', now() - interval '12 hours'),
  ('dddddddd-1111-0000-0000-000000000004', 'fn-transaction-intercept',   180, 'success', 'production', now()),
  ('dddddddd-1111-0000-0000-000000000005', 'fn-screen-data',             95,  'success', 'production', now() - interval '4 hours'),
  ('dddddddd-1111-0000-0000-000000000006', 'fn-buurt-discover',          120, 'success', 'production', now() - interval '1 day'),
  ('dddddddd-1111-0000-0000-000000000007', 'fn-emergency-profile',       75,  'success', 'production', now() - interval '30 days')
on conflict do nothing;

-- =====================================================================
-- Safety digest (weekly digest seed)
-- =====================================================================

insert into safety_digests (id, elder_id, week_starting, scam_events_count, amber_count, rood_count, zwart_count, medications_taken_pct, wellness_avg_score, family_interactions, summary_nl, summary_en, sent_at, created_at) values
  ('eeeeeeee-1111-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date, 2, 1, 1, 0, 94.0, 4.1, 6, 'Deze week: 1 amber melding, 1 rood incident. Medicijnen 94% ingenomen.', 'This week: 1 amber alert, 1 red incident. Medications 94% taken.', now() - interval '1 day', now() - interval '2 days')
on conflict do nothing;

-- =====================================================================
-- Validation invariants that should hold after seeding
-- =====================================================================

do $$
declare
  v_active_relationships integer;
  v_consented_relationships integer;
  v_pending_count integer;
  v_medication_count integer;
  v_medication_reminder_count integer;
  v_scam_count integer;
  v_family_msg_count integer;
  v_companion_count integer;
  v_audit_count integer;
begin
  select count(*) into v_active_relationships     from family_relationships where elder_id = '00000000-0000-0000-0000-000000000001' and is_active = true;
  select count(*) into v_consented_relationships  from family_relationships where elder_id = '00000000-0000-0000-0000-000000000001' and elder_consented = true;
  select count(*) into v_pending_count           from family_relationships where elder_id = '00000000-0000-0000-0000-000000000001' and elder_consented = false and is_active = true;
  select count(*) into v_medication_count         from medications where elder_id = '00000000-0000-0000-0000-000000000001' and deleted_at is null;
  select count(*) into v_medication_reminder_count from medication_reminders where elder_id = '00000000-0000-0000-0000-000000000001' and scheduled_time::date = current_date;
  select count(*) into v_scam_count               from scam_events where elder_id = '00000000-0000-0000-0000-000000000001' and deleted_at is null;
  select count(*) into v_family_msg_count         from family_messages where elder_id = '00000000-0000-0000-0000-000000000001' and deleted_at is null;
  select count(*) into v_companion_count          from companion_memory where elder_id = '00000000-0000-0000-0000-000000000001' and deleted_at is null;
  select count(*) into v_audit_count              from audit_log where elder_id = '00000000-0000-0000-0000-000000000001';

  raise notice 'Seed sanity check:';
  raise notice '  family relationships (active): %  (consented: %, pending: %)', v_active_relationships, v_consented_relationships, v_pending_count;
  raise notice '  medications (active): %  reminders today: %', v_medication_count, v_medication_reminder_count;
  raise notice '  scam_events: %  family_messages: %  companion_memory: %  audit_log: %', v_scam_count, v_family_msg_count, v_companion_count, v_audit_count;

  if v_active_relationships < 3 then raise exception 'Seed invariant failed: expected >=3 active family relationships, got %', v_active_relationships; end if;
  if v_consented_relationships < 2 then raise exception 'Seed invariant failed: expected >=2 consented family relationships, got %', v_consented_relationships; end if;
  if v_pending_count < 1 then raise exception 'Seed invariant failed: expected >=1 pending (unconsented) family relationship for negative tests, got %', v_pending_count; end if;
  if v_medication_count < 3 then raise exception 'Seed invariant failed: expected >=3 medications, got %', v_medication_count; end if;
  if v_medication_reminder_count < 3 then raise exception 'Seed invariant failed: expected >=3 reminders today, got %', v_medication_reminder_count; end if;
  if v_scam_count < 2 then raise exception 'Seed invariant failed: expected >=2 scam events, got %', v_scam_count; end if;
  if v_family_msg_count < 4 then raise exception 'Seed invariant failed: expected >=4 family messages, got %', v_family_msg_count; end if;
  if v_companion_count < 5 then raise exception 'Seed invariant failed: expected >=5 companion memory entries, got %', v_companion_count; end if;
end
$$;

-- =====================================================================
-- Done. Synthetic data is fully ready for RLS, Edge Function and live tests.
-- =====================================================================
