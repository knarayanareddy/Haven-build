-- HAVEN local development seed data. Synthetic data only.

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'elder@haven.local', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'family@haven.local', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carer@haven.local', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into profiles (id, role, full_name, preferred_name, phone_nl, locale, timezone, onboarding_complete)
values
  ('00000000-0000-0000-0000-000000000001', 'elder', 'Margaret de Vries', 'Margaret', '+31611111111', 'en-GB', 'Europe/Amsterdam', true),
  ('00000000-0000-0000-0000-000000000002', 'family', 'Sarah de Vries', 'Sarah', '+31622222222', 'en-GB', 'Europe/Amsterdam', true),
  ('00000000-0000-0000-0000-000000000003', 'carer', 'Eva Bakker', 'Eva', '+31633333333', 'nl-NL', 'Europe/Amsterdam', true)
on conflict (id) do update set full_name = excluded.full_name;

insert into elder_profiles (elder_id, safe_zone_radius_m, safe_zone_label_nl, emergency_contacts, medical_summary_nl, huisarts_name, huisarts_phone, allergies_nl, conditions_nl)
values (
  '00000000-0000-0000-0000-000000000001',
  500,
  'Thuis - De Pijp',
  '[{"name":"Sarah","phone":"+31622222222","relation":"daughter"}]',
  'Diabetes type 2, hoge bloeddruk. Geen BSN opgeslagen.',
  'Dr. Jansen',
  '+31201234567',
  array['Penicilline'],
  array['Diabetes type 2','Hypertensie']
)
on conflict (elder_id) do nothing;

insert into family_relationships (elder_id, family_member_id, relation_label_nl, relation_type, is_primary, elder_consented, elder_consented_at, is_active, can_view_medications, can_view_messages, can_view_location_events, can_view_alerts, can_view_stories, can_view_financials)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'dochter', 'kind', true, true, now(), true, true, true, true, true, true, false)
on conflict (elder_id, family_member_id) do nothing;

insert into carer_relationships (elder_id, carer_member_id, organisation_nl, role_label_nl, elder_consented, elder_consented_at, is_active, can_view_medications, can_view_visit_logs, can_create_visit_logs, can_file_incidents)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'Buurtzorg Amsterdam', 'wijkverpleegkundige', true, now(), true, true, true, true, true)
on conflict (elder_id, carer_member_id) do nothing;

insert into medications (id, elder_id, name_nl, name_en, dose_description_nl, dose_description_en, frequency, schedule_times, instructions_nl, instructions_en, with_food, current_stock, refill_threshold, is_active, start_date)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Metformine', 'Metformin', '500mg tablet', '500mg tablet', 'tweemaal_daags', array['08:00','18:00']::time[], 'Met voedsel innemen', 'Take with food', true, 18, 7, true, current_date),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Lisinopril', 'Lisinopril', '10mg tablet', '10mg tablet', 'dagelijks', array['12:30']::time[], 'Met water innemen', 'Take with water', false, 23, 7, true, current_date)
on conflict (id) do nothing;

insert into medication_reminders (medication_id, elder_id, scheduled_time, status)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', (current_date + time '08:00')::timestamptz, 'gepland'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', (current_date + time '12:30')::timestamptz, 'gepland')
on conflict do nothing;

insert into tasks (elder_id, created_by_role, title_nl, title_en, due_date, due_time)
values
  ('00000000-0000-0000-0000-000000000001', 'family', 'Huisartsafspraak met dr. Jansen', 'GP appointment with Dr. Jansen', current_date, '14:00'),
  ('00000000-0000-0000-0000-000000000001', 'elder', 'Korte wandeling na de lunch', 'Short walk after lunch', current_date, '13:15')
on conflict do nothing;

insert into family_messages (elder_id, sender_id, sender_role, message_type, content_nl, content_en)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'family', 'tekst', 'Ik denk vanochtend aan u. Ik bel na mijn werk.', 'Thinking of you this morning. I will call after work.'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'family', 'video_hallo', 'Videogroet van Lucas staat klaar.', 'Video hello from Lucas is ready.')
on conflict do nothing;

insert into life_story_prompts (prompt_nl, prompt_en, category_nl, sort_order)
values
  ('Vertel over uw eerste eigen woning.', 'Tell me about your first home of your own.', 'Herinneringen', 1),
  ('Welke muziek maakte u vroeger blij?', 'What music made you happy when you were younger?', 'Muziek', 2)
on conflict do nothing;

insert into companion_memory (elder_id, memory_type, content_nl, content_en, importance_score, source)
values
  ('00000000-0000-0000-0000-000000000001', 'preference', 'Margaret luistert graag naar klassieke muziek in de middag.', 'Margaret enjoys classical music in the afternoon.', 7, 'manual'),
  ('00000000-0000-0000-0000-000000000001', 'personal_fact', 'Kleinzoon Lucas stuurt op donderdag videogroeten.', 'Grandson Lucas sends video hellos on Thursdays.', 8, 'manual')
on conflict do nothing;

insert into neighbourhood_profiles (elder_id, postcode_pc4, neighbourhood_label, is_active, opted_in_at, walk_buddy_seeking, walk_preferred_time, family_can_see_connections)
values ('00000000-0000-0000-0000-000000000001', '1072', 'De Pijp, Amsterdam', true, now(), true, 'ochtend', true)
on conflict (elder_id) do nothing;

insert into elder_interest_tags (elder_id, tag_id)
select '00000000-0000-0000-0000-000000000001', id from interest_tags where tag_key in ('tuinieren','wandelen','muziek')
on conflict do nothing;

insert into neighbourhood_events (postcode_pc4, location_label_nl, location_label_en, distance_label_nl, distance_label_en, title_nl, title_en, description_nl, description_en, event_date, event_time, is_free, source)
values ('1072', 'Bibliotheek De Pijp', 'De Pijp Library', '600m van huis', '600m from home', 'Gratis koffieochtend', 'Free coffee morning', 'Rustige buurtactiviteit met koffie en gesprek.', 'Calm neighbourhood event with coffee and conversation.', current_date + 2, '10:30', true, 'manual')
on conflict do nothing;

insert into appointments (elder_id, title_nl, title_en, provider_name, provider_phone, location_label, starts_at, is_medical, created_by_id)
values ('00000000-0000-0000-0000-000000000001', 'Jaarlijkse controle', 'Annual check-up', 'Dr. Jansen', '+31201234567', 'Huisartsenpraktijk De Pijp', now() + interval '2 days', true, '00000000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into hydration_logs (elder_id, amount_ml, source, notes_nl, notes_en)
values ('00000000-0000-0000-0000-000000000001', 250, 'voice', 'Glas water bij ontbijt', 'Glass of water at breakfast')
on conflict do nothing;

insert into nutrition_logs (elder_id, meal_label, description_nl, description_en, appetite_score)
values ('00000000-0000-0000-0000-000000000001', 'breakfast', 'Toast en thee', 'Toast and tea', 4)
on conflict do nothing;

insert into vital_signs (elder_id, vital_type, value, unit, reading_source, device_name)
values ('00000000-0000-0000-0000-000000000001', 'heart_rate', 72, 'bpm', 'manual', 'HAVEN demo')
on conflict do nothing;

insert into financial_accounts (elder_id, provider, bank_name, account_id_masked, consent_status, consent_expires_at, alert_threshold_cents)
values ('00000000-0000-0000-0000-000000000001', 'psd2', 'ABN AMRO', '****4821', 'active', now() + interval '90 days', 20000)
on conflict do nothing;

insert into emergency_access_tokens (elder_id, token_hash, label)
values ('00000000-0000-0000-0000-000000000001', encode(digest('haven-demo-emergency-token', 'sha256'), 'hex'), 'Printed emergency card')
on conflict (token_hash) do nothing;
