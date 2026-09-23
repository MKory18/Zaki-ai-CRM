'use client';

/**
 * MAKING IMAGES VISIBLE INSIDE THE PREVIEW.
 *
 * The live preview is an iframe with `sandbox="allow-scripts"` and NO
 * `allow-same-origin`, so its origin is opaque. That is on purpose: the
 * page being previewed is markup the seller typed, and an opaque origin
 * cannot reach the dashboard's DOM, cookies or storage.
 *
 * The price is that the iframe sends no cookies either. Every image the
 * system stores is served from `/api/media/...`, which requires a session —
 * so the preview asked for them, got 401, and drew a broken-image icon.
 * The seller uploads a picture, sees it break, and has no way to tell
 * whether the upload failed or the page is wrong. It was neither.
 *
 * The fix is not to open the sandbox. The dashboard CAN read those images —
 * it has the session — so it reads them and inlines them as data URLs,
 * which an opaque origin renders happily. Nothing about the saved page
 * changes: this is the preview's copy only. The published page serves the
 * same images over its own public, slug-scoped route.
 *
 * Results are cached per URL, because the preview rebuilds on every
 * keystroke and re-downloading a photo each time would be its own bug.
 */

const cache = new Map<string, string>();

/** `/api/media/...` up to the closing quote. Both quote styles, and url(). */
const MEDIA_URL = /\/api\/media\/[A-Za-z0-9/_.\-]+/g;

export function findMediaUrls(html: string, css = ''): string[] {
  return [...new Set([...(html.match(MEDIA_URL) ?? []), ...(css.match(MEDIA_URL) ?? [])])];
}

/**
 * Read one image with the dashboard's session and return it as a data URL.
 * Returns null when it cannot be read — the caller leaves the original URL
 * in place, so a preview never silently swaps a real image for a blank one.
 */
export async function toDataUrl(url: string): Promise<string | null> {
  const hit = cache.get(url);
  if (hit) return hit;

  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    // A very large image as base64 would bloat the srcDoc past what the
    // browser will happily re-parse on every keystroke.
    if (blob.size > 4_000_000) return null;

    const data = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (data) cache.set(url, data);
    return data;
  } catch {
    return null;
  }
}

/** Every media URL in the text, replaced by its data URL where we have one. */
export function inlineMedia(text: string, resolved: Map<string, string>): string {
  if (!text || resolved.size === 0) return text;
  return text.replace(MEDIA_URL, (m) => resolved.get(m) ?? m);
}
