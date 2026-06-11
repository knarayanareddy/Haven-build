# Addendum A — RLS Policies (Complete SQL)

**File:** `docs/addenda/A-rls-policies.md`

last-updated: 2026-06-11   (PATCH HAVEN-SSOT-002 applied:
                            field names reconciled with
                            designdoc.md canonical schema.
                            All non-canonical column refs
                            removed. Zero drift from SSOT.)

## 🟢 THIS IS THE CANONICAL RLS SOURCE

This file contains the complete, production-ready `CREATE POLICY` SQL for
every table in HAVEN. It is the single RLS source of truth.

Doc 05 contains illustrative summaries only — do not implement from Doc 05.

Precedence: **Addendum A > Doc 05** for all RLS definitions.

---

## A.1 Principles
- Every user-data table has RLS **enabled + forced**
- Service role (Edge Functions) bypasses RLS via `service_role` key — **never expose this to clients**
- Policies follow the pattern: `elder owns their rows`, `family reads with consent + permission flag`, `carers read with active relationship`
- `deleted_at IS NULL` is included in all `SELECT` policies (soft-delete enforcement)

## 1a. Canonical column cross-reference (drift guard)

> Any column name used in a policy below MUST appear in
> this table. CI (`test:rls-column-names`) diffs this
> table against `docs/canonical-fields.json` on every PR.
> A mismatch is a build failure.

| Table                  | Canonical column name      | ❌ Previously wrong name  |
|------------------------|----------------------------|---------------------------|
| family_relationships   | family_member_id           | family_user_id            |
| family_relationships   | carer_member_id (via carer_relationships) | carer_user_id |
| family_relationships   | can_view_medications       | can_view_meds             |
| family_relationships   | can_view_location_events   | can_view_location         |
| family_relationships   | can_view_voice             | (correct — no change)     |
| family_relationships   | can_view_health            | (correct — no change)     |
| family_relationships   | can_view_safety            | (correct — no change)     |
| family_relationships   | elder_consented            | (correct — no change)     |
| family_relationships   | is_active                  | (correct — no change)     |
| carer_relationships    | carer_member_id            | carer_user_id             |
| carer_relationships    | is_active                  | (correct — no change)     |
| push_tokens            | profile_id                 | user_id                   |
| voice_interactions     | elder_id                   | (correct — no change)     |
| voice_interactions     | transcript_nl              | (correct — now nullable)  |
| voice_interactions     | transcript_redacted        | (correct — no change)     |
| medication_reminders   | scheduled_time             | scheduled_for             |
| medication_reminders   | status (Dutch enum)        | 'pending' literal         |
| medication_reminders   | escalation_count           | escalation_level          |
| location_events        | fuzzed_geom                | (correct — no change)     |
| location_events        | precise_geom               | (correct — no change)     |
| audit_log              | actor_id                   | (correct — no change)     |
| audit_log              | table_name                 | (correct — no change)     |

## A.2 Helper functions (create first)

```sql
-- Returns the role claim from the JWT
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::json->>'role',
    'anonymous'
  )
$$;

-- Returns the elder_id the current user IS (if role = elder)
CREATE OR REPLACE FUNCTION auth.elder_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN auth.user_role() = 'elder' THEN auth.uid()
    ELSE NULL
  END
$$;

-- Returns true if current user is a consented family member
-- for the given elder_id with a specific permission flag
CREATE OR REPLACE FUNCTION auth.family_can(
  p_elder_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM family_relationships fr
    WHERE fr.family_member_id = auth.uid()
      AND fr.elder_id = p_elder_id
      AND fr.elder_consented = true
      AND fr.is_active = true
      AND CASE p_permission
            WHEN 'medications' THEN fr.can_view_medications
            WHEN 'messages'  THEN fr.can_view_messages
            WHEN 'location'    THEN fr.can_view_location_events
            WHEN 'safety'      THEN fr.can_view_safety
            WHEN 'stories'   THEN fr.can_view_stories
            WHEN 'financials'  THEN fr.can_view_financials
            WHEN 'voice'       THEN fr.can_view_voice
            WHEN 'health'      THEN fr.can_view_health
            ELSE false
          END = true
  )
$$;

-- Returns true if current user is an active carer for elder_id
CREATE OR REPLACE FUNCTION auth.carer_can(
  p_elder_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM carer_relationships cr
    WHERE cr.carer_member_id = auth.uid()
      AND cr.elder_id = p_elder_id
      AND cr.is_active = true
  )
$$;
```

---

## A.3 Table-by-table RLS policies

### A.3.1 `profiles`

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

-- Users read their own profile
CREATE POLICY "profiles_select_own"
ON profiles FOR SELECT
USING (id = auth.uid());

-- Users update their own profile
CREATE POLICY "profiles_update_own"
ON profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Insert on sign-up (trigger-managed; policy allows service role)
CREATE POLICY "profiles_insert_self"
ON profiles FOR INSERT
WITH CHECK (id = auth.uid());
```

---

### A.3.2 `elder_profiles`

```sql
ALTER TABLE elder_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE elder_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY "elder_profiles_select_self"
ON elder_profiles FOR SELECT
USING (elder_id = auth.uid());

CREATE POLICY "elder_profiles_select_family"
ON elder_profiles FOR SELECT
USING (auth.family_can(elder_id, 'safety'));

CREATE POLICY "elder_profiles_update_self"
ON elder_profiles FOR UPDATE
USING (elder_id = auth.uid())
WITH CHECK (elder_id = auth.uid());

CREATE POLICY "elder_profiles_insert_self"
ON elder_profiles FOR INSERT
WITH CHECK (elder_id = auth.uid());
```

---

### A.3.3 `family_relationships`

```sql
ALTER TABLE family_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_relationships FORCE ROW LEVEL SECURITY;

-- Elder sees all relationships for themselves
CREATE POLICY "family_relationships_select_elder"
ON family_relationships FOR SELECT
USING (elder_id = auth.uid());

-- Family member sees their own relationship rows
CREATE POLICY "family_relationships_select_family"
ON family_relationships FOR SELECT
USING (family_member_id = auth.uid());

-- Only elder can update consent + permissions on their relationships
CREATE POLICY "family_relationships_update_elder"
ON family_relationships FOR UPDATE
USING (elder_id = auth.uid())
WITH CHECK (elder_id = auth.uid());

-- Family can insert a relationship (pending elder consent)
CREATE POLICY "family_relationships_insert_family"
ON family_relationships FOR INSERT
WITH CHECK (family_member_id = auth.uid() AND elder_consented = false);

-- Only elder can delete (revoke consent)
CREATE POLICY "family_relationships_delete_elder"
ON family_relationships FOR DELETE
USING (elder_id = auth.uid());
```

---

### A.3.4 `medications`

```sql
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications FORCE ROW LEVEL SECURITY;

CREATE POLICY "medications_select_elder"
ON medications FOR SELECT
USING (elder_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "medications_select_family"
ON medications FOR SELECT
USING (
  auth.family_can(elder_id, 'medications')
  AND deleted_at IS NULL
);

CREATE POLICY "medications_insert_elder"
ON medications FOR INSERT
WITH CHECK (elder_id = auth.uid());

CREATE POLICY "medications_update_elder"
ON medications FOR UPDATE
USING (elder_id = auth.uid())
WITH CHECK (elder_id = auth.uid());

CREATE POLICY "medications_softdelete_elder"
ON medications FOR UPDATE
USING (elder_id = auth.uid());
```

---

### A.3.5 `medication_reminders`

```sql
ALTER TABLE medication_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_reminders FORCE ROW LEVEL SECURITY;

CREATE POLICY "reminders_select_elder"
ON medication_reminders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM medications m
    WHERE m.id = medication_id
      AND m.elder_id = auth.uid()
  )
);

CREATE POLICY mr_family_sel ON medication_reminders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM family_relationships fr
      WHERE fr.family_member_id  = (auth.jwt() ->> 'sub')::uuid  -- ✅ canonical
        AND fr.elder_id          = medication_reminders.elder_id
        AND fr.is_active         = TRUE
        AND fr.elder_consented   = TRUE
        AND fr.can_view_medications = TRUE                        -- ✅ canonical
    )
    AND deleted_at IS NULL
  );

CREATE POLICY mr_carer_sel ON medication_reminders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM carer_relationships cr
      WHERE cr.carer_member_id = (auth.jwt() ->> 'sub')::uuid  -- ✅ canonical
        AND cr.elder_id        = medication_reminders.elder_id
        AND cr.is_active       = TRUE
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "reminders_update_elder"
ON medication_reminders FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM medications m
    WHERE m.id = medication_id
      AND m.elder_id = auth.uid()
  )
);

CREATE POLICY mr_carer_upd ON medication_reminders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM carer_relationships cr
      WHERE cr.carer_member_id = (auth.jwt() ->> 'sub')::uuid  -- ✅ canonical
        AND cr.elder_id        = medication_reminders.elder_id
        AND cr.is_active       = TRUE
    )
  ) WITH CHECK (
    status IN ('gesnoozed', 'bevestigd', 'gemist')
  );
```

---

### A.3.6 `family_messages`

```sql
ALTER TABLE family_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_elder"
ON family_messages FOR SELECT
USING (elder_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "messages_select_family"
ON family_messages FOR SELECT
USING (
  (sender_id = auth.uid() OR recipient_id = auth.uid())
  AND auth.family_can(elder_id, 'messages')
  AND deleted_at IS NULL
);

CREATE POLICY "messages_insert_elder"
ON family_messages FOR INSERT
WITH CHECK (elder_id = auth.uid() AND sender_id = auth.uid());

CREATE POLICY "messages_insert_family"
ON family_messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND auth.family_can(elder_id, 'messages')
);

CREATE POLICY "messages_update_sender"
ON family_messages FOR UPDATE
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());
```

---

### A.3.7 `scam_events`

```sql
ALTER TABLE scam_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scam_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "scam_events_select_elder"
ON scam_events FOR SELECT
USING (elder_id = auth.uid());

CREATE POLICY se_family_sel ON scam_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM family_relationships fr
      WHERE fr.family_member_id  = (auth.jwt() ->> 'sub')::uuid  -- ✅ canonical
        AND fr.elder_id          = scam_events.elder_id
        AND fr.is_active         = TRUE
        AND fr.elder_consented   = TRUE
        AND fr.can_view_safety   = TRUE                          -- ✅ correct (unchanged)
    )
    AND deleted_at IS NULL
  );

-- Only service role / edge function inserts
-- (no client-side INSERT policy = blocked by default for non-service)
```

---

### A.3.8 `location_events`

```sql
ALTER TABLE location_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "location_events_select_elder"
ON location_events FOR SELECT
USING (elder_id = auth.uid());

CREATE POLICY le_family_sel ON location_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM family_relationships fr
      WHERE fr.family_member_id      = (auth.jwt() ->> 'sub')::uuid  -- ✅ canonical
        AND fr.elder_id              = location_events.elder_id
        AND fr.is_active             = TRUE
        AND fr.elder_consented       = TRUE
        AND fr.can_view_location_events = TRUE                        -- ✅ canonical
    )
    AND deleted_at IS NULL
  );

-- Inserts only via Edge Function (service role)
```

---

### A.3.9 `life_stories`

```sql
ALTER TABLE life_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_stories FORCE ROW LEVEL SECURITY;

CREATE POLICY "stories_select_elder"
ON life_stories FOR SELECT
USING (elder_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "stories_select_family"
ON life_stories FOR SELECT
USING (
  auth.family_can(elder_id, 'stories')
  AND deleted_at IS NULL
  AND is_private = false
);

CREATE POLICY "stories_insert_elder"
ON life_stories FOR INSERT
WITH CHECK (elder_id = auth.uid());

CREATE POLICY "stories_update_elder"
ON life_stories FOR UPDATE
USING (elder_id = auth.uid())
WITH CHECK (elder_id = auth.uid());
```

---

### A.3.10 `voice_interactions`

```sql
ALTER TABLE voice_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_interactions FORCE ROW LEVEL SECURITY;

-- Elder reads their own interactions
CREATE POLICY "voice_select_elder"
ON voice_interactions FOR SELECT
USING (elder_id = auth.uid());

CREATE POLICY vi_family_sel ON voice_interactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM family_relationships fr
      WHERE fr.family_member_id = (auth.jwt() ->> 'sub')::uuid  -- ✅ canonical
        AND fr.elder_id         = voice_interactions.elder_id
        AND fr.is_active        = TRUE
        AND fr.elder_consented  = TRUE
        AND fr.can_view_voice   = TRUE                          -- ✅ correct (unchanged)
    )
    AND deleted_at IS NULL
    AND transcript_redacted = FALSE
  );

-- Inserts only via Edge Function (service role)
```

---

### A.3.11 `companion_memory`

```sql
ALTER TABLE companion_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion_memory FORCE ROW LEVEL SECURITY;

CREATE POLICY "companion_memory_select_elder"
ON companion_memory FOR SELECT
USING (elder_id = auth.uid());

-- No family access to companion memory (private)
-- Inserts/updates only via Edge Function (service role)
```

---

### A.3.12 `notifications`

```sql
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_self"
ON notifications FOR SELECT
USING (recipient_id = auth.uid());

CREATE POLICY "notifications_update_self"
ON notifications FOR UPDATE
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());
-- (only to mark as read)
```

---

### A.3.13 `push_tokens`

```sql
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens FORCE ROW LEVEL SECURITY;

-- ✅ CORRECTED 2026-06-11: profile_id is canonical (not user_id)
CREATE POLICY pt_owner_sel ON push_tokens
  FOR SELECT USING (
    profile_id = (auth.jwt() ->> 'sub')::uuid
  );
CREATE POLICY pt_owner_ins ON push_tokens
  FOR INSERT WITH CHECK (
    profile_id = (auth.jwt() ->> 'sub')::uuid
  );
CREATE POLICY pt_owner_del ON push_tokens
  FOR DELETE USING (
    profile_id = (auth.jwt() ->> 'sub')::uuid
  );
```

---

### A.3.14 `wellness_checkins`

```sql
ALTER TABLE wellness_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE wellness_checkins FORCE ROW LEVEL SECURITY;

CREATE POLICY "wellness_select_elder"
ON wellness_checkins FOR SELECT
USING (elder_id = auth.uid());

CREATE POLICY "wellness_select_family"
ON wellness_checkins FOR SELECT
USING (auth.family_can(elder_id, 'health'));

CREATE POLICY "wellness_insert_elder"
ON wellness_checkins FOR INSERT
WITH CHECK (elder_id = auth.uid());
```

---

### A.3.15 `cognitive_checkins`

```sql
ALTER TABLE cognitive_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_checkins FORCE ROW LEVEL SECURITY;

CREATE POLICY "cognitive_select_elder"
ON cognitive_checkins FOR SELECT
USING (elder_id = auth.uid());

CREATE POLICY "cognitive_select_family"
ON cognitive_checkins FOR SELECT
USING (auth.family_can(elder_id, 'health'));

-- Inserts via Edge Function (service role)
```

---

## A.4 Audit log (append-only, service role only)

```sql
CREATE TABLE audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id       uuid,
  actor_role     text,
  action         text NOT NULL,
  target_table   text NOT NULL,
  target_id      uuid,
  metadata       jsonb,
  created_at     timestamptz DEFAULT now()
);

-- No client-facing RLS; only service role writes + reads
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
-- No permissive policies = blocked for all JWT users
-- Service role bypasses RLS by design
```

-- ============================================================
-- BUURT RLS POLICIES (v1.0.0 — 2026-06-10)
-- ============================================================

-- interest_tags: public read (catalogue), service-only write
ALTER TABLE interest_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_tags FORCE ROW LEVEL SECURITY;
CREATE POLICY "interest_tags_read_all"
ON interest_tags FOR SELECT
USING (is_active = true);

-- neighbourhood_profiles: elder owns their own; family sees
-- ONLY if elder has set family_can_see_connections = true
ALTER TABLE neighbourhood_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbourhood_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY "nbhd_profile_select_self"
ON neighbourhood_profiles FOR SELECT
USING (elder_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "nbhd_profile_select_family"
ON neighbourhood_profiles FOR SELECT
USING (
  auth.family_can(elder_id, 'stories')    -- reuse stories permission as "kring" proxy
  AND family_can_see_connections = true
  AND deleted_at IS NULL
);

CREATE POLICY "nbhd_profile_insert_self"
ON neighbourhood_profiles FOR INSERT
WITH CHECK (elder_id = auth.uid());

CREATE POLICY "nbhd_profile_update_self"
ON neighbourhood_profiles FOR UPDATE
USING  (elder_id = auth.uid())
WITH CHECK (elder_id = auth.uid());

-- elder_interest_tags: elder owns their own
ALTER TABLE elder_interest_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE elder_interest_tags FORCE ROW LEVEL SECURITY;

CREATE POLICY "elder_tags_select_self"
ON elder_interest_tags FOR SELECT
USING (elder_id = auth.uid());

CREATE POLICY "elder_tags_insert_self"
ON elder_interest_tags FOR INSERT
WITH CHECK (elder_id = auth.uid());

CREATE POLICY "elder_tags_delete_self"
ON elder_interest_tags FOR DELETE
USING (elder_id = auth.uid());

-- neighbourhood_connections: elder sees their own connections only
-- CRITICAL: elder must NOT see the other party's identity until status = 'accepted'
-- Identity reveal is handled at the application layer (Edge Function)
-- NOT by exposing the other elder's profile_id in a direct join
ALTER TABLE neighbourhood_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbourhood_connections FORCE ROW LEVEL SECURITY;

CREATE POLICY "nbhd_conn_select_participant"
ON neighbourhood_connections FOR SELECT
USING (
  initiator_elder_id = auth.uid()
  OR recipient_elder_id = auth.uid()
);

-- Inserts only via Edge Function fn-buurt-match (service role)
-- Updates only via Edge Function fn-buurt-match (service role)

-- neighbourhood_events: all active HAVEN users can read events
-- (events are not personal data — they are public local activities)
ALTER TABLE neighbourhood_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighbourhood_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "nbhd_events_read_authenticated"
ON neighbourhood_events FOR SELECT
USING (is_active = true);

-- event_interests: elder owns their own
ALTER TABLE event_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_interests FORCE ROW LEVEL SECURITY;

CREATE POLICY "event_interest_select_self"
ON event_interests FOR SELECT
USING (elder_id = auth.uid());

CREATE POLICY "event_interest_insert_self"
ON event_interests FOR INSERT
WITH CHECK (elder_id = auth.uid());

CREATE POLICY "event_interest_delete_self"
ON event_interests FOR DELETE
USING (elder_id = auth.uid());
```

---

