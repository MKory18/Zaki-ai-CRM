/**
 * ONE PICTURE, SEVERAL SIZES — because a phone is not a laptop.
 *
 * Every product photograph this system stores is already a WebP capped at
 * 1200px (see the sharp pipeline in storage.ts), so the brief's «AVIF أو
 * WebP» was met the day uploads were written. What was not met is
 * «متجاوبة»: that same 1200px file is sent to a 360px phone showing twelve
 * of them two to a row, where each card is about 165px wide. The browser
 * throws away nine tenths of every pixel it paid for, on the connection
 * this shop is held to.
 *
 * THE WIDTHS ARE A CLOSED LIST. `?w=` on a public route that runs an image
 * resizer is a way to ask one server for a thousand different renders of
 * one file; anything not on this list is served as the original rather
 * than refused, so a stale or hand-edited link still shows the picture.
 *
 * THEY ARE OURS, AND ONLY OURS. A seller may paste an external image URL,
 * and this builds nothing for it: a `srcset` of addresses that ignore `?w=`
 * is the same bytes fetched three times under three names.
 *
 * AND `sizes` DESCRIBES THE REAL GRID. It is not a hint, it is the
 * browser's only way to pick before layout — a wrong `sizes` is worse than
 * none, because it is believed. The numbers here are the ones in
 * storefront styles.ts: two columns under 720px, three under 1000, four
 * above.
 */

/**
 * The renders this system will produce. Nothing else is resized.
 *
 * 480 is here because of a measurement, not a guess. The target device is
 * «أندرويد متوسط»: a 360px viewport at device-pixel-ratio 2. A card there
 * is 153 CSS pixels, so the browser needs 306 real ones — and with only
 * 320/640/960 on offer it took the 640, more than twice what it could use.
 * The list has to have a step just above the number the target device
 * actually asks for, or the whole `srcset` rounds up to the same waste it
 * was written to remove.
 */
export const IMAGE_WIDTHS = [320, 480, 640, 960] as const;

/** Only our own media route understands `?w=`. */
const OURS = /^\/api\/public\/media\/[0-9a-f-]{36}(?:\/[0-9a-f-]{36})?\/[0-9a-f-]{36}\.(?:webp|jpe?g|png)$/i;

export function isOurMedia(url: string | null | undefined): boolean {
  if (!url) return false;
  // A preview token or any other query means the address is already doing
  // something; leave it alone.
  return OURS.test(url);
}

/**
 * The `srcset` for one of our images, or null when there is nothing to
 * gain — which the caller renders as a plain `src`.
 */
export function srcSetFor(url: string | null | undefined): string | null {
  if (!isOurMedia(url)) return null;
  return IMAGE_WIDTHS.map((w) => `${url}?w=${w} ${w}w`).join(', ');
}

/**
 * What a card occupies, at each width the shop is measured at.
 *
 * `.sf-grid` is two columns below 720px, three below 1000, four above, in
 * a container that stops at 1100px with 20px of gutter. A quarter of 1100
 * is 275, so 300px is the honest ceiling.
 */
export const SIZES_CARD = '(max-width: 720px) 48vw, (max-width: 1000px) 31vw, 300px';

/**
 * What the product photograph occupies: the whole width on a phone, half
 * the page above 720px where `.sf-product-top` becomes two columns.
 */
export const SIZES_HERO = '(max-width: 720px) 100vw, 540px';

/**
 * The width to PRELOAD the product photograph at.
 *
 * A preload with no width fetches the 1200px original while the `img`
 * beside it, obeying `sizes`, asks for a 640 — two requests for one
 * picture, which is the thing a preload is supposed to prevent. The
 * preload must name a member of the list and the element must be able to
 * choose it.
 */
export function heroPreload(url: string | null | undefined): { href: string; imageSrcSet: string | null } | null {
  if (!url) return null;
  const set = srcSetFor(url);
  return { href: set ? `${url}?w=640` : url, imageSrcSet: set };
}
