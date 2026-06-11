-- HAVEN correction for grandchild profile upserts.
create unique index if not exists idx_grandchild_unique_family_elder_name
on grandchild_profiles(family_member_id, elder_id, display_name)
where deleted_at is null;
