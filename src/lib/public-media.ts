/**
 * IMAGES A VISITOR CAN SEE.
 *
 * Every image the system stores is written under
 *   companies/<companyId>/products/<ownerId>/<uuid>.<ext>
 * and linked as /api/media/<that key> — a route that needs a signed-in
 * session, because the dashboard's files are private. The public pages used
 * those same links: a product photo on a storefront, a hero image, a
 * gallery, an upsell's picture. A shopper has no session, so every one of
 * them came back 401 and the shop showed broken images to exactly the
 * people it was built for. The seller, signed in, saw them fine.
 *
 * A public page now rewrites those links, as it is built, to
 *   /api/public/media/<ownerId>/<file>          (a storefront's products)
 *   /api/public/media/<pageId>/<ownerId>/<file> (anything a landing page shows)
 * The second names the page showing the image: a duplicated page, or HTML
 * copied from another page, links into the ORIGINAL page's folder, and the
 * image is public because this page is published and references it — not
 * because of whose folder it sits in (see public-media-server.ts).
 *
 * Only path characters: the theme's backdrop accepts a bare same-origin path
 * and nothing else. The company id leaves the URL — the server rebuilds the
 * storage key from the owner's own row. The dashboard keeps its private
 * links; nothing stored changes.
 */

const PRIVATE_MEDIA =
  /\/api\/media\/companies\/[0-9a-f-]{36}\/products\/([0-9a-f-]{36})\/([0-9a-f-]{36}\.(?:webp|jpe?g|png))/gi;

/** A stored image's public file name: a fresh uuid per upload. */
export const PUBLIC_MEDIA_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:webp|jpe?g|png)$/i;

export interface PublicMediaOptions {
  /** The landing page the images are shown on. */
  via?: string;
  /**
   * A preview of an unpublished page, for a frame that sends no cookies
   * (the uploaded-HTML page). Its images load for the one holding it.
   */
  previewToken?: string;
}

/** Every private image link in a piece of text, made public. */
export function toPublicMedia(text: string, opts: PublicMediaOptions = {}): string {
  const via = opts.via ? `${opts.via.toLowerCase()}/` : '';
  const suffix = opts.previewToken ? `?p=${encodeURIComponent(opts.previewToken)}` : '';
  return text.replace(
    PRIVATE_MEDIA,
    (_m, owner: string, file: string) => `/api/public/media/${via}${owner.toLowerCase()}/${file}${suffix}`
  );
}

/**
 * The same for any value a public page renders — a block list, a theme, a
 * product listing — without walking its shape: every image link in it is a
 * string, and the value round-trips through JSON unchanged otherwise.
 */
export function publicizeMedia<T>(value: T, opts: PublicMediaOptions = {}): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return toPublicMedia(value, opts) as T;
  const json = JSON.stringify(value);
  if (!json.includes('/api/media/')) return value;
  return JSON.parse(toPublicMedia(json, opts)) as T;
}
