BEGIN;

-- ─── FINDING 1: RLS COLUMN-LEVEL UPDATE RESTRICTION FOR PROFILES.LOCALE ───
-- 1) Revoke general update from runtime roles
REVOKE UPDATE ON profiles FROM public, authenticated;
-- 2) Grant update specifically on allowed safety columns
GRANT UPDATE (locale, high_contrast, font_size_multiplier) ON profiles TO authenticated;
-- 3) Enforce policy specifically asserting assertSelf()
DROP POLICY IF EXISTS profiles_update_locale ON profiles;
CREATE POLICY profiles_update_locale ON profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 4) Document constraint explicitly: service_role bypasses RLS but NOT CHECK constraints
ALTER TABLE profiles ALTER COLUMN locale SET NOT NULL;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_locale_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_locale_check CHECK (locale IN ('nl-NL', 'en-GB', 'en-US'));

-- ─── FINDING 2: NOTIFICATION_TEMPLATES TABLE ACCESS CONTROL & UNIQUE CONSTRAINT ───
-- 1) Lockdown RLS
REVOKE ALL ON notification_templates FROM public, authenticated;
GRANT SELECT ON notification_templates TO service_role;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_only ON notification_templates;
CREATE POLICY "system_only" ON notification_templates FOR ALL USING (false) WITH CHECK (false);

-- 2) Unique constraint
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_template_key_locale_key;
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS uq_template_key_locale;
ALTER TABLE notification_templates ADD CONSTRAINT uq_template_key_locale UNIQUE (template_key, locale);

-- 3) Audit Log trigger on notification_templates
CREATE OR REPLACE FUNCTION log_notification_template_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_log (actor_id, actor_role, action, table_name, record_id, extra)
  VALUES ('00000000-0000-0000-0000-000000000001', 'system', 'NOTIFICATION_TEMPLATE_MODIFIED', 'notification_templates', COALESCE(NEW.id, OLD.id), 
    jsonb_build_object('template_key', COALESCE(NEW.template_key, OLD.template_key), 'locale', COALESCE(NEW.locale, OLD.locale), 'operation', TG_OP, 'timestamp', clock_timestamp()));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_notification_templates ON notification_templates;
CREATE TRIGGER trg_audit_notification_templates
AFTER INSERT OR UPDATE OR DELETE ON notification_templates
FOR EACH ROW EXECUTE FUNCTION log_notification_template_mutation();

-- ─── FINDING 5: MID-SESSION LOCALE COLUMN ON PENDING_CONFIRMATIONS ───
ALTER TABLE pending_confirmations ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'nl-NL';

COMMIT;
