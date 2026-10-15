import { cache } from 'react';
import { db } from './db';
import { deliveryWindows, windowFor } from './delivery-time';
import type { SellingFacts } from './selling-blocks';

/**
 * THE TWO FACTS THE TRUST ROW NEEDS, READ ONCE PER REQUEST.
 *
 * `selling-blocks.ts` decides what MAY be said; this reads what is true.
 * They are two files on purpose: the deciding is pure and is checked
 * without a database, and the reading is a query that must not happen twice
 * on one page.
 *
 * WHY `cache()`. A landing page served as a shop's front renders the view,
 * the shell and the footer in one request, and every one of them could
 * reasonably want the delivery window. React's per-request cache makes the
 * second ask free; a module-level map would be a cache shared between two
 * different shops' requests, which is the one thing it must never be.
 *
 * NOTHING HERE INVENTS A FALLBACK. A shop with no measured deliveries gets
 * `delivery: null` and the row loses that item — «يصل عادةً خلال يومين»
 * from four deliveries is a promise made out of an anecdote, which the
 * customer meets as a broken one at their door.
 */

/**
 * How long this shop's parcels have actually taken, country-wide.
 *
 * COUNTRY-WIDE AND NOT PER GOVERNORATE, because a visitor reading a landing
 * page has not told us where they live — there is no region until they pick
 * one in the form. `windowFor(windows, null)` is the existing lookup's own
 * last step (`EVERYWHERE`), so the sentence on the page and the sentence the
 * order screen quotes come from one function and one sample floor.
 */
const windowForStore = cache(async (companyId: string, storeId: string | null) => {
  try {
    const windows = await deliveryWindows({ companyId, storeId });
    return windowFor(windows, null);
  } catch {
    /*
     * A PUBLIC PAGE DOES NOT FAIL OVER A REASSURANCE.
     *
     * This is a secondary read on the page that takes the order. If it
     * throws — a timeout, a connection the pool could not give — the
     * shopper must still get a page they can buy from, with one fewer line
     * in the trust row. Swallowing a delivery-time query is not swallowing
     * an error that matters: the caller's alternative is a 500 on the only
     * screen that makes money.
     */
    return null;
  }
});

/**
 * The seller's own returns policy, when they published one.
 *
 * PUBLISHED, not merely present. Every store is created with three legal
 * pages seeded as DRAFTS, with «راجع هذا النصّ وعدّله ليطابق سياستك
 * الفعليّة قبل نشره» written into each — so an unpublished REFUND page is
 * precisely the case where the seller has NOT set a returns policy, and
 * linking it would turn our placeholder into their promise.
 */
const refundPageFor = cache(async (storeId: string | null, storeSlug: string | null) => {
  if (!storeId || !storeSlug) return null;
  try {
    const page = await db.storePage.findFirst({
      where: { storeId, kind: 'REFUND', isPublished: true },
      select: { slug: true },
    });
    return page ? `/s/${encodeURIComponent(storeSlug)}/pages/${encodeURIComponent(page.slug)}` : null;
  } catch {
    return null; // see above
  }
});

/**
 * Everything the trust row may draw about THIS shop.
 *
 * `guarantee` is the sentence the seller typed in the objections block, and
 * it WINS over the policy link: their own words about their own guarantee
 * are more use to a shopper than «اقرأ سياسة الاستبدال والإرجاع», and a row
 * carrying both would say the same thing twice.
 */
export async function sellingFacts(opts: {
  companyId: string;
  storeId: string | null;
  storeSlug: string | null;
  /** The objections block's guarantee line, when the page has one. */
  guarantee?: string | null;
}): Promise<SellingFacts> {
  const [delivery, href] = await Promise.all([
    windowForStore(opts.companyId, opts.storeId),
    refundPageFor(opts.storeId, opts.storeSlug),
  ]);

  const written = (opts.guarantee ?? '').trim();
  return {
    delivery,
    returns: written ? { text: written } : href ? { href } : null,
  };
}
