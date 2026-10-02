/**
 * «شوهد مؤخراً» — ON THE DEVICE ONLY.
 *
 * A list of product ids in one browser's own storage. It is never sent to
 * the server, never stored against a person, and never joined to anything:
 * «what this visitor looked at» is a behavioural record, and a shop that
 * kept one would be keeping it about somebody who never gave it a name.
 *
 * Ids and a count, like the cart, and for the same reason — a name or a
 * price here would be data the device was promised it would not hold, and
 * a price would be one a browser could edit.
 *
 * Everything here is pure. The small amount of browser around it lives
 * with the component that draws the row, and every read of storage is
 * wrapped: a private window, blocked site data or a full quota must cost a
 * shopper a row of thumbnails, never the page.
 */

/** Long enough to be useful, short enough to be a memory and not a history. */
export const MAX_RECENT = 8;

export function recentKey(storeSlug: string): string {
  return `zaki.recent.${storeSlug}`;
}

/** A list out of whatever was in storage. Never throws, never returns junk. */
export function parseRecent(raw: unknown): string[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string' || !id || id.length > 64) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_RECENT) break;
  }
  return out;
}

/**
 * This product, now, at the front.
 *
 * Seeing something again moves it up rather than adding it twice: the row
 * answers «what were you looking at», and the same thing three times is
 * one answer repeated.
 */
export function noteViewed(recent: string[], productId: string): string[] {
  if (!productId) return parseRecent(recent);
  return parseRecent([productId, ...recent]);
}

/**
 * What to draw, never including the page the shopper is standing on.
 *
 * «شوهد مؤخراً» that leads the list with the product already on screen is
 * a row that wastes the first and largest thumbnail on a link to here.
 */
export function recentToShow(recent: string[], currentProductId?: string): string[] {
  return parseRecent(recent).filter((id) => id !== currentProductId);
}
