-- Video calling: a consent pack of its own, and a join token that can be verified.
--
-- Two defects are closed here.
--
-- 1. `fn-video-call-create` gated on `shield_scam_coaching` — the consent pack for scam
--    coaching — because a dedicated pack did not exist. An elder who accepted scam coaching
--    had therefore "consented" to being filmed over a video link, and an elder who refused
--    scam coaching could not call their family. Consent must name the thing consented to.
--
-- 2. `fn-video-call-join-token` returned `crypto.randomUUID()`: unsigned, unstored, and
--    accepted by nothing. The session row now carries the hash of the one token it issued,
--    when that token expires, who it was issued to, and whether it has been used.
--
-- `video_call_enabled` is seeded explicitly disabled. It was previously absent, which fails
-- closed but is indistinguishable from an oversight, and it masked the broken token: nobody
-- ever got far enough to see it. Enabling the flag is now an operator decision with a stated
-- prerequisite (a configured media provider and the consent pack below).

-- ── 1. Consent pack ────────────────────────────────────────────────────────
insert into consent_packs (pack_key, title_nl, title_en, description_nl, description_en, recommended_day) values
  ('core_video_call',
   'Beeldbellen met familie',
   'Video calling with family',
   'Familie kan u bellen met beeld. U ziet wie er belt voordat u opneemt, en u kunt altijd weigeren. Er wordt niets opgenomen.',
   'Family can call you with video. You see who is calling before you answer, and you can always decline. Nothing is recorded.',
   0)
on conflict (pack_key) do nothing;

-- ── 2. Join-token bookkeeping ──────────────────────────────────────────────
alter table video_call_sessions
  add column if not exists join_token_hash text,
  add column if not exists join_token_expires_at timestamptz,
  add column if not exists join_token_subject uuid references profiles(id) on delete set null,
  add column if not exists join_token_role text,
  add column if not exists join_token_used_at timestamptz;

comment on column video_call_sessions.join_token_hash is
  'SHA-256 of the single join token issued for this session. Only the hash is stored; the token itself exists in the response to fn-video-call-join-token.';
comment on column video_call_sessions.join_token_used_at is
  'Set when the token is redeemed. A token is single-use; a second redemption is rejected.';

create index if not exists idx_video_call_sessions_join_token_expiry
  on video_call_sessions(join_token_expires_at)
  where join_token_expires_at is not null;

-- ── 3. The flag, honestly ──────────────────────────────────────────────────
insert into feature_flags (flag_key, description, enabled, rollout_pct)
values (
  'video_call_enabled',
  'Enable video calls. Requires VIDEO_JOIN_TOKEN_SECRET and a configured media provider (LIVEKIT_* or TWILIO_*); the mock provider is test-only and carries no media.',
  false,
  0
)
on conflict (flag_key) do nothing;
