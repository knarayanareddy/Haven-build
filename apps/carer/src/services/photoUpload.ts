// Taking and uploading a handover photo.
//
// The form used to increment a counter and show "Photo added (demo)". What it needs instead is
// the small amount of policy this module holds:
//
//   • the bucket layout is `<elder_id>/<carer_id>/<uuid>.<ext>` (see the migration), because the
//     elder owns the record — so an erasure request under their id removes the photographs with
//     everything else;
//   • only the four image types the bucket accepts may be uploaded, and only up to its 8 MB
//     limit, so a phone that hands back a 40 MB HEIC fails here with a sentence a carer can read
//     rather than as a storage 413 after the round is over;
//   • a photograph that could not be uploaded is reported as not uploaded. The note is still
//     filed, and the form says which photographs did not go with it.

import { storageObjectPath, uploadStorageObject, isSafeStoragePath, type UploadableFile } from '@haven/contracts/src/storage';

export const HANDOVER_PHOTO_BUCKET = 'handover-photos';
/** Mirrors the bucket's file_size_limit; a phone photo is rarely over 4 MB. */
export const MAX_HANDOVER_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_HANDOVER_PHOTOS = 5;

const ALLOWED = /^image\/(jpeg|png|webp|heic)$/;

export interface PickedPhoto {
  uri: string;
  mimeType?: string | null;
  fileSize?: number | null;
  fileName?: string | null;
}

export interface UploadedPhoto {
  localUri: string;
  /** Storage object key, e.g. `<elder>/<carer>/<uuid>.jpg`. Empty until the upload succeeds. */
  path: string;
}

export class PhotoRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoRejectedError';
  }
}

/**
 * Why this photo may not be attached, or null if it may.
 *
 * Kept separate from the upload so the form can refuse *before* spending a carer's data on a
 * file the bucket would reject anyway.
 */
export function rejectPhotoReason(photo: PickedPhoto): string | null {
  const mime = (photo.mimeType ?? '').toLowerCase();
  // Some Android content providers report no MIME type; fall back to the extension.
  const extension = (photo.fileName ?? photo.uri).toLowerCase().split('.').pop() ?? '';
  const mimeLooksFine = ALLOWED.test(mime) || ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(extension);
  if (!mimeLooksFine) return 'unsupported-type';
  if (typeof photo.fileSize === 'number' && photo.fileSize > MAX_HANDOVER_PHOTO_BYTES) return 'too-large';
  return null;
}

export function handoverPhotoPath(elderId: string, carerId: string, photo: PickedPhoto, now = new Date()): string {
  const extension = (photo.fileName ?? photo.uri).toLowerCase().split('.').pop();
  const safeExtension = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(extension ?? '') ? extension : 'jpg';
  const name = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${safeExtension}`;
  return storageObjectPath(elderId, carerId, name);
}

export const handoverPhotoMime = (photo: PickedPhoto): string => {
  const mime = (photo.mimeType ?? '').toLowerCase();
  if (ALLOWED.test(mime)) return mime;
  const extension = (photo.fileName ?? photo.uri).toLowerCase().split('.').pop();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  return 'image/jpeg';
};

/**
 * Uploads one photograph and returns the object key to file with the note.
 *
 * `fetchImpl` and `formDataFactory` are injectable so the request can be asserted without a
 * device or a network.
 */
export async function uploadHandoverPhoto(options: {
  supabaseUrl: string;
  accessToken: string;
  elderId: string;
  carerId: string;
  photo: PickedPhoto;
  now?: Date;
  fetchImpl?: typeof fetch;
  formDataFactory?: () => FormData;
}): Promise<UploadedPhoto> {
  const { elderId, carerId, photo } = options;
  const rejection = rejectPhotoReason(photo);
  if (rejection) throw new PhotoRejectedError(rejection);

  const path = handoverPhotoPath(elderId, carerId, photo, options.now);
  if (!isSafeStoragePath(path)) throw new PhotoRejectedError('unsafe-path');

  const file: UploadableFile = { uri: photo.uri, name: path.split('/').pop()!, type: handoverPhotoMime(photo) };
  await uploadStorageObject({
    supabaseUrl: options.supabaseUrl,
    accessToken: options.accessToken,
    bucket: HANDOVER_PHOTO_BUCKET,
    path,
    file,
  }, { fetchImpl: options.fetchImpl, formDataFactory: options.formDataFactory });

  return { localUri: photo.uri, path };
}
