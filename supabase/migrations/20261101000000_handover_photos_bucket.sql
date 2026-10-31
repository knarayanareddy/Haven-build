-- ─── Handover photos: a bucket the carer app can actually write to ───
--
-- `carer_handover_notes.photo_paths` has existed since 20260614000002 and
-- `fn-carer-handover-note` validates and stores those paths, but no bucket was ever created for
-- them: every path the app could produce pointed at nothing. The carer app's "Add photo" control
-- worked around that by incrementing a counter and saying "Photo added (demo)".
--
-- Path layout:  <elder_id>/<carer_id>/<uuid>.<ext>
--
-- The elder owns the folder, not the carer who took the photograph. This matters for two
-- reasons that are both legal rather than cosmetic:
--
--   • erasure: `fn-right-to-erasure` removes objects under `<user_id>/` in each bucket, so an
--     elder's erasure request must find these files. A carer-first layout would have left a
--     clinical record behind after the older adult asked for it to be deleted;
--   • retention: the photo documents care given to the elder. It follows the handover note
--     (WGBO: 20 years), not the carer's employment.

-- A policy that casts a path segment to uuid raises 22P02 when the segment is not a uuid, and a
-- raised policy error fails the whole statement — including the inserts of rows that were fine.
-- This helper is the guarded cast those policies use.
create or replace function public.haven_uuid_or_null(value text)
returns uuid language sql immutable as $$
  select case
    when value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then value::uuid
    else null
  end
$$;

comment on function public.haven_uuid_or_null(text) is
  'Casts a storage path segment to uuid, returning null instead of raising 22P02 for a non-uuid path.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('handover-photos', 'handover-photos', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- A carer may upload into the folder of an elder who has consented to their care, and only into
-- their own sub-folder there, so two carers on the same round cannot overwrite each other.
create policy "handover_photos_carer_write"
on storage.objects for insert
with check (
  bucket_id = 'handover-photos'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.carer_can(public.haven_uuid_or_null((storage.foldername(name))[1]))
);

-- A carer may correct or withdraw a photo they uploaded before the note is filed.
create policy "handover_photos_carer_update"
on storage.objects for update
using (
  bucket_id = 'handover-photos'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'handover-photos'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "handover_photos_carer_delete"
on storage.objects for delete
using (
  bucket_id = 'handover-photos'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- The older adult may always see photographs taken of them during care.
create policy "handover_photos_elder_read"
on storage.objects for select
using (
  bucket_id = 'handover-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Family see them on the same terms as the medications they document.
create policy "handover_photos_family_read"
on storage.objects for select
using (
  bucket_id = 'handover-photos'
  and public.family_can(public.haven_uuid_or_null((storage.foldername(name))[1]), 'medications')
);

-- Erasure must sweep this bucket too: `fn-right-to-erasure` enumerates buckets explicitly, and a
-- bucket added without a line there leaves clinical photographs behind on a completed deletion
-- request. The sweep is by `<elder_id>/` prefix, which is exactly why the elder is the folder.
