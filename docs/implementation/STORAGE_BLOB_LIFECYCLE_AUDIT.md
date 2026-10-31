# HAVEN Storage / Blob Lifecycle Audit

Last updated: 2026-06-13

## Buckets in scope

Defined in `20260611000002_storage_rpc_security.sql`:

- `voice-notes`
- `life-story-audio`
- `life-story-photos`
- `profile-photos`
- `document-vault`
- `ocr-inbox`
- `tts-cache`
- `handover-photos`

All buckets are private.

## Ownership and path model

Current policies assume the first folder segment is the elder/profile id:

- `voice-notes/{elderId}/...`
- `life-story-audio/{elderId}/...`
- `life-story-photos/{elderId}/...`
- `profile-photos/{profileId}/...`
- `document-vault/{elderId}/...`
- `ocr-inbox/{elderId}/...`
- `tts-cache/{elderId}/...`
- `handover-photos/{elderId}/{carerId}/...` — the elder owns the folder, the carer owns the
  sub-folder, so erasure by elder prefix finds it and two carers cannot overwrite each other

The hardening passes now enforce this assumption in the signed-URL and app write flows.

## Bucket-to-domain mapping

| Bucket | Main table/path field | Access model | Lifecycle notes |
|---|---|---|---|
| `voice-notes` | `family_messages.storage_path` | elder write/read, family read | deleted by elder-prefix on erasure |
| `life-story-audio` | `life_stories.recording_path` | elder write/read, family read | deleted by elder-prefix on erasure |
| `life-story-photos` | `memory_lane_photos.storage_path` | elder write/read, family read | deleted by elder-prefix on erasure |
| `profile-photos` | profile photo paths (future/current app usage) | self-only | deleted by elder/profile prefix on erasure |
| `document-vault` | `documents.storage_path` | elder-only | deleted by elder-prefix on erasure |
| `ocr-inbox` | `medication_ocr_jobs.storage_path`, `document_analysis_jobs.storage_path` | elder write-only ingress | deleted by elder-prefix on erasure; also 24h cron cleanup |
| `tts-cache` | `voice_interactions.response_audio_path` | internal/generated only | deleted by elder-prefix on erasure; also 48h cron cleanup |
| `handover-photos` | `carer_handover_notes.photo_paths` | carer write (own sub-folder, consented elder), elder read, family read with medications permission | deleted by elder-prefix on erasure; follows the note under WGBO 20 years |

## Erasure behavior

`fn-right-to-erasure` now performs explicit storage cleanup across:

- `voice-notes`
- `life-story-audio`
- `life-story-photos`
- `profile-photos`
- `document-vault`
- `ocr-inbox`
- `tts-cache`
- `handover-photos`

Implementation note:
- cleanup is prefix-based (`{elderId}/...`)
- current implementation removes up to 1000 matching objects per bucket per run
- this is acceptable for the current scaffold but should be paginated if production volumes grow

## Export behavior

The export RPC includes **storage paths**, not file blobs.

That means portability currently covers:
- metadata rows
- object path references

but does **not** yet package the underlying files into a downloadable archive.

A real production export should eventually define:
- whether blobs are included in the user export package
- how signed download URLs are generated safely
- how expiry and auditability are handled

## Retention behavior

Already present in SQL:

- `ocr-inbox` cleanup job: delete objects older than 24 hours
- `tts-cache` cleanup job: delete objects older than 48 hours

These retention jobs complement, but do not replace, explicit right-to-erasure cleanup.

## Known gap

`legacy_accounts.encrypted_secret_path` is not mapped to a defined Supabase storage bucket in the current repo.

Implication:
- SQL erasure removes the database row
- but the underlying secret blob lifecycle depends on the external secret-storage implementation

This is why the erasure function returns:
- `legacy_secret_store_cleanup_required: true`

## Recommendation

Next production-hardening step for storage should be:

1. add paginated bucket cleanup for large object sets
2. define whether exports should include blobs or only metadata
3. formalize external secret-store cleanup for legacy vault materials
