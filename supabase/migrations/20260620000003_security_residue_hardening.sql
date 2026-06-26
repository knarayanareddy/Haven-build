-- Security residue hardening.
-- Applies corrections as a forward migration so already-migrated staging/prod DBs
-- receive the same fixes as fresh local resets.

BEGIN;

ALTER TABLE public.medication_ocr_reviews
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ocr_reviews_elder_live_status
  ON public.medication_ocr_reviews(elder_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

DROP POLICY IF EXISTS ocr_reviews_self ON public.medication_ocr_reviews;
CREATE POLICY ocr_reviews_self ON public.medication_ocr_reviews
  FOR ALL
  USING (elder_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (elder_id = auth.uid());

DROP POLICY IF EXISTS ocr_reviews_family ON public.medication_ocr_reviews;
CREATE POLICY ocr_reviews_family ON public.medication_ocr_reviews
  FOR SELECT
  USING (public.family_can(elder_id, 'medications') AND deleted_at IS NULL);

DROP POLICY IF EXISTS ocr_reviews_carer ON public.medication_ocr_reviews;
CREATE POLICY ocr_reviews_carer ON public.medication_ocr_reviews
  FOR ALL
  USING (public.carer_can(elder_id) AND deleted_at IS NULL)
  WITH CHECK (public.carer_can(elder_id));

CREATE OR REPLACE FUNCTION public.family_can(p_elder_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.family_relationships fr
    WHERE fr.family_member_id = auth.uid()
      AND fr.elder_id = p_elder_id
      AND fr.elder_consented = TRUE
      AND fr.is_active = TRUE
      AND fr.deleted_at IS NULL
      AND CASE p_permission
        WHEN 'medications' THEN fr.can_view_medications
        WHEN 'messages' THEN fr.can_view_messages
        WHEN 'location' THEN fr.can_view_location_events
        WHEN 'alerts' THEN fr.can_view_alerts
        WHEN 'stories' THEN fr.can_view_stories
        WHEN 'financials' THEN fr.can_view_financials
        ELSE FALSE
      END = TRUE
  )
$$;

CREATE OR REPLACE FUNCTION public.carer_can(p_elder_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.carer_relationships cr
    WHERE cr.carer_member_id = auth.uid()
      AND cr.elder_id = p_elder_id
      AND cr.elder_consented = TRUE
      AND cr.is_active = TRUE
      AND cr.deleted_at IS NULL
  )
$$;

REVOKE ALL ON FUNCTION public.family_can(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.carer_can(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.family_can(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.carer_can(UUID) TO authenticated, service_role;


COMMIT;

