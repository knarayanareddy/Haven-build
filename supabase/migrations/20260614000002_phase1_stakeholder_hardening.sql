-- ─── Phase 1 Stakeholder Hardening Migration ───
-- Feature 1.4: Photo check-in support
-- Feature 1.5: WhatsApp fallback for critical push failures
-- Feature 1.6: Carer medication interaction columns

-- 1.4 Photo check-in: add photo_checkin to family_messages message_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'family_messages' AND column_name = 'photo_ttl_seconds'
  ) THEN
    ALTER TABLE family_messages ADD COLUMN photo_ttl_seconds integer DEFAULT 86400;
  END IF;
END $$;

-- 1.5 WhatsApp fallback: notification_preferences extension
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'whatsapp_enabled'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN whatsapp_enabled boolean NOT NULL DEFAULT false;
    ALTER TABLE notification_preferences ADD COLUMN whatsapp_phone text;
    ALTER TABLE notification_preferences ADD COLUMN email_digest_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 1.6 Medication refill email support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'pharmacy_email'
  ) THEN
    ALTER TABLE medications ADD COLUMN pharmacy_email text;
    ALTER TABLE medications ADD COLUMN pharmacy_name text;
  END IF;
END $$;

-- Photo handover support (Phase 3 prep)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'carer_handover_notes' AND column_name = 'photo_paths'
  ) THEN
    ALTER TABLE carer_handover_notes ADD COLUMN photo_paths text[];
  END IF;
END $$;

-- Phase 1 feature flags
INSERT INTO feature_flags (flag_key, enabled, rollout_pct, description_nl, description_en) VALUES
  ('whatsapp_fallback_enabled', false, 0, 'WhatsApp backup bij mislukte push-meldingen', 'WhatsApp fallback when push notifications fail'),
  ('photo_checkin_enabled', false, 0, 'Familie kan om een foto vragen ter bevestiging', 'Family can request a photo for visual confirmation'),
  ('floating_voice_enabled', true, 100, 'Altijd-zichtbare microfoonknop', 'Always-visible floating microphone button'),
  ('simplified_home_enabled', true, 100, 'Vereenvoudigd startscherm met 5 hoofdkaarten', 'Simplified home screen with 5 primary cards'),
  ('help_button_enabled', true, 100, 'Wat moet ik doen?-knop op elk scherm', 'What do I do? help button on every screen')
ON CONFLICT (flag_key) DO UPDATE SET
  description_nl = EXCLUDED.description_nl,
  description_en = EXCLUDED.description_en;
