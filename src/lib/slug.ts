import { normalizeArabic } from './order-parser';

/**
 * A READABLE ADDRESS, IN THE LANGUAGE THE SHOP IS WRITTEN IN.
 *
 * `/p/EAR-01` tells a shopper nothing and tells a search engine less.
 * `/p/كريم-الأذن` is the product's own name, and it is what somebody
 * pastes into a family group — where the link is read before it is
 * tapped.
 *
 * ARABIC LETTERS ARE KEPT, NOT TRANSLITERATED. A transliteration is a
 * third spelling of the product nobody chose: the seller did not write
 * it, the shopper will not type it, and it reads as neither language.
 * Modern browsers and every chat app show a percent-encoded Arabic path
 * decoded, so `كريم-الأذن` is what a person actually sees.
 *
 * AND THE SPELLING RULE IS THE ONE THAT ALREADY EXISTS.
 * `normalizeArabic` unifies أ/إ/آ → ا, ة → ه, ى → ي and strips the
 * diacritics — so `الأذن` and `الاذن` cannot become two addresses for
 * one product, which is the duplicate-content problem in its most
 * literal form.
 */

/** Long enough for a real product name, short enough to paste. */
export const MAX_SLUG = 80;

/**
 * The address for this name, or '' when the name gives nothing usable.
 *
 * An empty answer is a real one: a product named «...» or «١٢٣» has no
 * readable address, and the caller falls back to the SKU rather than
 * inventing one.
 */
export function slugify(name: string | null | undefined): string {
  const normalised = normalizeArabic((name ?? '').trim());
  return (
    normalised
      // Everything that is not an Arabic letter, a Latin letter or a
      // digit becomes a separator. Including the underscore: it is
      // invisible under a link's underline, which is where most of
      // these are read.
      .replace(/[^ء-غف-يa-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG)
      // A trailing separator left by the cut.
      .replace(/-+$/g, '')
  );
}

/** Anything this system will accept as a readable address. */
export const SLUG_RE = /^[ء-غف-يa-z0-9][ء-غف-يa-z0-9-]{0,79}$/;

export function isSlug(value: string): boolean {
  return SLUG_RE.test(value);
}

/**
 * The same address, with a number on the end until nothing else holds it.
 *
 * Two products called «كريم مرطّب» is an ordinary thing in a shop, and
 * the second one still needs an address. The number goes at the END so
 * the readable part is what a person sees first.
 *
 * `taken` is the set this address must be unique within — one store for
 * a product, one company for a category. The caller decides which,
 * because only the caller knows what it is naming.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!base) return '';
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base.slice(0, MAX_SLUG - String(n).length - 1)}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return '';
}

/**
 * WHAT A CHANGED ADDRESS LEAVES BEHIND.
 *
 * «تغيير رابط منتج بيولّد إعادة توجيه تلقائية». A product renamed after
 * its link has gone round a family group must not answer 404 — that
 * link is the shop's advertising, and it keeps being tapped for weeks.
 *
 * The history belongs to the PRODUCT, not to the seller's redirect
 * screen: it is generated rather than authored, and a seller deleting a
 * row there would silently break every old link without being told
 * what it was for.
 *
 * Bounded, newest first, and never holding the current address — a
 * product renamed back and forth would otherwise redirect to itself.
 */
export const MAX_HISTORY = 10;

export function rememberSlug(previous: string[], old: string, current: string): string[] {
  if (!old || old === current) return previous.slice(0, MAX_HISTORY);
  return [old, ...previous.filter((s) => s !== old && s !== current)].slice(0, MAX_HISTORY);
}

/** A history out of whatever is in the column. Never throws. */
export function parseHistory(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((s): s is string => typeof s === 'string' && isSlug(s)).slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}
