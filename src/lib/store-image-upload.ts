import { apiFetch } from './api-client';

/**
 * ONE UPLOADER FOR THE SHOP'S OWN PICTURES.
 *
 * Two panels of «الواجهة» put an image into the shop: the home page's
 * blocks, and the cover image the owner asked for a real picker for
 * (15/10 01:33). They send to the same door — `/api/store/design/image`,
 * whose storage pipeline, MIME allowlist, rate limit and tenant namespace
 * are the ones every other upload in this system uses.
 *
 * WHY IT IS A FUNCTION AND NOT A SECOND `fetch` IN THE SECOND SCREEN.
 *
 * `bare-fetch-ratchet.test.ts` holds the number of raw `fetch` calls in
 * the components and only ever lets it fall: a wrapper gives the 401
 * redirect, the lost-context redirect and the fifteen-second timeout that
 * a bare call silently does without. The design screen had the one
 * remaining raw call here; it is gone with this, rather than copied.
 *
 * `FormData` and no `Content-Type`: the browser must set the multipart
 * boundary itself, and a header written by hand would make every upload a
 * 400 the first time somebody "tidied" it.
 */

const MAX_PER_REQUEST = 5;

export async function uploadStoreImages(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const body = new FormData();
  files.slice(0, MAX_PER_REQUEST).forEach((f) => body.append('files', f));

  const res = await apiFetch('/api/store/design/image', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The route's own Arabic message when it has one — it names the file
    // and what was wrong with it, which «تعذّر رفع الصور» cannot.
    throw new Error((data as { error?: string }).error || 'تعذّر رفع الصور');
  }
  return ((data as { urls?: string[] }).urls ?? []).filter((u) => typeof u === 'string');
}
