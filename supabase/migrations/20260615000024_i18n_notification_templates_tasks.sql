BEGIN;

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('nl-NL', 'en-GB', 'en-US')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (template_key, locale)
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title_en TEXT;

-- Seed critical notification strings
INSERT INTO notification_templates (template_key, locale, title, body)
VALUES
  ('crisis_gedetecteerd', 'nl-NL', 'HAVEN Noodoproep', 'Wij hebben een mogelijke calamiteit gedetecteerd. Neem onmiddellijk contact op.'),
  ('crisis_gedetecteerd', 'en-GB', 'HAVEN Crisis Alert', 'We detected a possible calamity incident. Please contact the older adult immediately.'),
  ('scam_rood', 'nl-NL', 'HAVEN Waarschuwing: Mogelijke Oplichting', 'Er is een verdacht bericht of telefoontje gescreend. Bel uw familielid eerst.'),
  ('scam_rood', 'en-GB', 'HAVEN Alert: Possible Scam Intercepted', 'A suspicious message or call was screened. Please call your family member first.'),
  ('welzijnscheck', 'nl-NL', 'HAVEN Welzijnscheck', 'Hoe voelt u zich vandaag? Laat uw familie weten dat alles goed gaat.'),
  ('welzijnscheck', 'en-GB', 'HAVEN Wellness Check', 'How are you feeling today? Let your family delegate know everything is fine.')
ON CONFLICT (template_key, locale) DO UPDATE 
SET title = EXCLUDED.title, body = EXCLUDED.body;

COMMIT;
