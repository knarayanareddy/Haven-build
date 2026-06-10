-- ============================================================
-- BUURT (Neighbourhood Connector) Database Migration
-- Version: v1.0.0 (2026-06-10)
-- ============================================================

-- 1. Create connection status enum type
DO $$ BEGIN
    CREATE TYPE connection_status AS ENUM ('pending_initiator', 'pending_recipient', 'accepted', 'rejected', 'ended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create interest_tags table
CREATE TABLE IF NOT EXISTS interest_tags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_key       text UNIQUE NOT NULL,   -- e.g. 'tuinieren'
  label_nl      text NOT NULL,          -- e.g. '🌿 Tuinieren'
  category_nl   text,                   -- e.g. 'Buiten', 'Cultuur', 'Beweging'
  is_active     boolean DEFAULT true,
  sort_order    integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- Seed initial Dutch interest tag catalogue
INSERT INTO interest_tags (tag_key, label_nl, category_nl, sort_order) VALUES
  ('tuinieren',     '🌿 Tuinieren',        'Buiten',    1),
  ('wandelen',      '🚶 Wandelen',          'Beweging',  2),
  ('lezen',         '📖 Lezen',             'Cultuur',   3),
  ('muziek',        '🎵 Muziek',            'Cultuur',   4),
  ('schaken',       '♟️ Schaken',           'Spel',      5),
  ('kaarten',       '🃏 Kaartspelen',       'Spel',      6),
  ('koken',         '🍳 Koken',             'Thuis',     7),
  ('handwerken',    '🧶 Handwerken',        'Thuis',     8),
  ('vogels',        '🐦 Vogels kijken',     'Buiten',    9),
  ('fietsen',       '🚲 Fietsen',           'Beweging',  10),
  ('geschiedenis',  '📜 Geschiedenis',      'Cultuur',   11),
  ('film',          '🎬 Film & TV',         'Cultuur',   12),
  ('religie',       '🙏 Geloof & bezinning','Welzijn',   13),
  ('kleinkinderen', '👶 Kleinkinderen',     'Familie',   14),
  ('vrijwillig',    '🤝 Vrijwilligerswerk', 'Sociaal',   15)
ON CONFLICT (tag_key) DO NOTHING;

-- 3. Create neighbourhood_profiles table
CREATE TABLE IF NOT EXISTS neighbourhood_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id            uuid UNIQUE NOT NULL
                        REFERENCES profiles(id) ON DELETE CASCADE,
  -- Declared neighbourhood (PC4 level — NOT precise location)
  postcode_pc4        char(4) NOT NULL,         -- e.g. '1234' (4-digit NL postcode)
  neighbourhood_label text,                     -- e.g. 'De Pijp, Amsterdam' (display only)
  -- Discovery radius preference
  radius_km           integer DEFAULT 2
                        CHECK (radius_km BETWEEN 1 AND 5),
  -- Opt-in status
  is_active           boolean DEFAULT false,    -- elder must explicitly opt in
  opted_in_at         timestamptz,
  opted_out_at        timestamptz,
  -- Walk buddy preference
  walk_buddy_seeking  boolean DEFAULT false,
  walk_preferred_time text,                     -- 'ochtend' | 'middag' | 'beide'
  -- Family visibility (elder controls)
  family_can_see_connections boolean DEFAULT false,
  -- Timestamps
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  deleted_at          timestamptz,
  -- CONSTRAINT: no precise location stored here
  CONSTRAINT no_precise_location CHECK (length(postcode_pc4) = 4)
);

COMMENT ON COLUMN neighbourhood_profiles.postcode_pc4
  IS 'PC4 (4-digit postcode) only. Never store full postcode (PC6) or GPS coords in this table.';

-- 4. Create elder_interest_tags table
CREATE TABLE IF NOT EXISTS elder_interest_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES interest_tags(id),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (elder_id, tag_id)
);

-- Enforce max 5 tags per elder via trigger
CREATE OR REPLACE FUNCTION enforce_max_interest_tags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT count(*) FROM elder_interest_tags
    WHERE elder_id = NEW.elder_id
  ) >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 interesse-tags per oudere toegestaan.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_max_interest_tags ON elder_interest_tags;
CREATE TRIGGER trg_max_interest_tags
  BEFORE INSERT ON elder_interest_tags
  FOR EACH ROW EXECUTE FUNCTION enforce_max_interest_tags();

-- 5. Create neighbourhood_connections table
CREATE TABLE IF NOT EXISTS neighbourhood_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_elder_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_elder_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status                connection_status DEFAULT 'pending_initiator',
  -- Anonymous matching basis (what triggered this suggestion)
  shared_tag_ids        uuid[],                  -- which tags matched
  -- Mutual consent timestamps
  initiator_accepted_at timestamptz,
  recipient_accepted_at timestamptz,
  -- Identity reveal (only after both_accepted_at is populated)
  -- Names/details are NOT stored here; they are fetched from profiles on demand
  -- Walk buddy specific
  is_walk_buddy_match   boolean DEFAULT false,
  -- Ended reason (for internal analysis only, not shown to users)
  ended_by              uuid,                    -- references profiles(id)
  ended_reason_internal text,
  -- Timestamps
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  CONSTRAINT no_self_connection CHECK (initiator_elder_id != recipient_elder_id),
  UNIQUE (initiator_elder_id, recipient_elder_id)
);

-- 6. Create neighbourhood_events table
CREATE TABLE IF NOT EXISTS neighbourhood_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Location (PC4 level only)
  postcode_pc4      char(4) NOT NULL,
  location_label_nl text NOT NULL,        -- "Bibliotheek De Pijp"
  distance_label_nl text,                 -- "600m van uw huis"
  -- Event details (Dutch)
  title_nl          text NOT NULL,
  description_nl    text,
  event_date        date NOT NULL,
  event_time        time,
  is_free           boolean DEFAULT true,
  -- Matching
  relevant_tag_ids  uuid[],               -- which interest tags this event suits
  -- Source
  source            text DEFAULT 'manual',-- 'manual' | 'opendata' | 'bibliotheek_api'
  source_url        text,
  -- Status
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  expires_at        timestamptz           -- auto-expires after event_date
);

-- Auto-expire events after they pass using pg_cron (if available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove the job if it exists
    PERFORM cron.unschedule('expire-neighbourhood-events');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule the job
    PERFORM cron.schedule(
      'expire-neighbourhood-events',
      '0 5 * * *',
      $$
        UPDATE neighbourhood_events
        SET is_active = false
        WHERE event_date < CURRENT_DATE
          AND is_active = true;
      $$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not fully configured or active.';
END $$;

-- 7. Create event_interests table
CREATE TABLE IF NOT EXISTS event_interests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elder_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES neighbourhood_events(id) ON DELETE CASCADE,
  interested_at timestamptz DEFAULT now(),
  UNIQUE (elder_id, event_id)
);

-- 8. Create Indexes
CREATE INDEX IF NOT EXISTS idx_nbhd_profile_pc4 ON neighbourhood_profiles(postcode_pc4)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_nbhd_profile_elder ON neighbourhood_profiles(elder_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_elder_tags_elder ON elder_interest_tags(elder_id);
CREATE INDEX IF NOT EXISTS idx_elder_tags_tag ON elder_interest_tags(tag_id);

CREATE INDEX IF NOT EXISTS idx_nbhd_conn_initiator ON neighbourhood_connections(initiator_elder_id);
CREATE INDEX IF NOT EXISTS idx_nbhd_conn_recipient ON neighbourhood_connections(recipient_elder_id);
CREATE INDEX IF NOT EXISTS idx_nbhd_conn_status ON neighbourhood_connections(status)
  WHERE status IN ('pending_recipient', 'accepted');

CREATE INDEX IF NOT EXISTS idx_nbhd_events_pc4 ON neighbourhood_events(postcode_pc4)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_nbhd_events_date ON neighbourhood_events(event_date)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_event_interests_elder ON event_interests(elder_id);

-- 9. Enable RLS and create policies
ALTER TABLE interest_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_tags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interest_tags_read_all" ON interest_tags;
CREATE POLICY "interest_tags_read_all"
ON interest_tags FOR SELECT
USING (is_active = true);

ALTER TABLE neighbourhood_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbourhood_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nbhd_profile_select_self" ON neighbourhood_profiles;
CREATE POLICY "nbhd_profile_select_self"
ON neighbourhood_profiles FOR SELECT
USING (elder_id = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "nbhd_profile_select_family" ON neighbourhood_profiles;
CREATE POLICY "nbhd_profile_select_family"
ON neighbourhood_profiles FOR SELECT
USING (
  auth.family_can(elder_id, 'stories')
  AND family_can_see_connections = true
  AND deleted_at IS NULL
);

DROP POLICY IF EXISTS "nbhd_profile_insert_self" ON neighbourhood_profiles;
CREATE POLICY "nbhd_profile_insert_self"
ON neighbourhood_profiles FOR INSERT
WITH CHECK (elder_id = auth.uid());

DROP POLICY IF EXISTS "nbhd_profile_update_self" ON neighbourhood_profiles;
CREATE POLICY "nbhd_profile_update_self"
ON neighbourhood_profiles FOR UPDATE
USING  (elder_id = auth.uid())
WITH CHECK (elder_id = auth.uid());

ALTER TABLE elder_interest_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE elder_interest_tags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "elder_tags_select_self" ON elder_interest_tags;
CREATE POLICY "elder_tags_select_self"
ON elder_interest_tags FOR SELECT
USING (elder_id = auth.uid());

DROP POLICY IF EXISTS "elder_tags_insert_self" ON elder_interest_tags;
CREATE POLICY "elder_tags_insert_self"
ON elder_interest_tags FOR INSERT
WITH CHECK (elder_id = auth.uid());

DROP POLICY IF EXISTS "elder_tags_delete_self" ON elder_interest_tags;
CREATE POLICY "elder_tags_delete_self"
ON elder_interest_tags FOR DELETE
USING (elder_id = auth.uid());

ALTER TABLE neighbourhood_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbourhood_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nbhd_conn_select_participant" ON neighbourhood_connections;
CREATE POLICY "nbhd_conn_select_participant"
ON neighbourhood_connections FOR SELECT
USING (
  initiator_elder_id = auth.uid()
  OR recipient_elder_id = auth.uid()
);

ALTER TABLE neighbourhood_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbourhood_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nbhd_events_read_authenticated" ON neighbourhood_events;
CREATE POLICY "nbhd_events_read_authenticated"
ON neighbourhood_events FOR SELECT
USING (is_active = true);

ALTER TABLE event_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_interests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_interest_select_self" ON event_interests;
CREATE POLICY "event_interest_select_self"
ON event_interests FOR SELECT
USING (elder_id = auth.uid());

DROP POLICY IF EXISTS "event_interest_insert_self" ON event_interests;
CREATE POLICY "event_interest_insert_self"
ON event_interests FOR INSERT
WITH CHECK (elder_id = auth.uid());

DROP POLICY IF EXISTS "event_interest_delete_self" ON event_interests;
CREATE POLICY "event_interest_delete_self"
ON event_interests FOR DELETE
USING (elder_id = auth.uid());
