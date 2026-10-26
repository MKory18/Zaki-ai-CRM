import { db } from '@/lib/db';
import { readLimit } from '@/lib/numeric-input';
import { activeOffersFor } from '@/lib/offers';
import { availableStock } from '@/lib/reservation';
import { realStoresOnly } from '@/lib/test-store';
import { requireSystemToken } from '@/lib/v1/system-token';
import { v1ErrorResponse, v1Ok, requestIdOf } from '@/lib/v1/door';
import { amountString } from '@/lib/v1/shape';
import { productFigures, readFields, requireCostScope } from '@/lib/v1/product-figures';

/**
 * GET /api/v1/products — what the other system may quote from.
 *
 * «المنتجات الفعّالة للشركة بس · السعر والعروض من الـ OMS نفسه (مصدر
 * الحقيقة) · بلا تكلفة ولا مخزون رقمي حساس.»
 *
 * THE PRICE LIVES HERE AND NOWHERE ELSE. The replies system must not keep
 * its own price list: the moment it does, a seller changing a bundle in this
 * product has a week of conversations quoting the old figure. So this is the
 * catalogue, with the live offers on it, and the order door re-prices from
 * the same rows anyway.
 *
 * ── WHAT IS DELIBERATELY WITHHELD ──
 *
 * · The COST of anything. The contract says «بلا تكلفة» and it is right:
 *   what a thing cost us is not something a conversation needs, and a
 *   webhook pointed at the wrong URL would publish the business's margin.
 * · The STOCK COUNT. A status word — IN_STOCK / LOW_STOCK / OUT_OF_STOCK —
 *   answers «can I promise this?» and a number answers «how much does this
 *   shop hold?», which is a competitor's question.
 * · A TEST BENCH'S products. «أرقامٌ لا تدخل أيَّ حسبة» — an outside system
 *   selling off a bench would put real orders on it.
 *
 * ── `?fields=` — WHAT THE MEDIA BUYER MAY ADD (2026-10-26) ──
 *
 * Without `fields` the answer is byte-for-byte what it was. With it, the
 * named optional fields are ADDED to each item — never instead of one:
 * `aliases` and `price_options` under `products.read`, and the cost and
 * shelf figures only under `products.costs.read` (`src/lib/v1/product-figures.ts`,
 * which says where each comes from and which have no single source).
 */

/** Below this many units a shelf is reported as short rather than stocked. */
const LOW_STOCK_AT = 5;

export async function GET(req: Request) {
  const requestId = requestIdOf(req);
  try {
    const caller = await requireSystemToken(req, 'products.read');
    const { searchParams } = new URL(req.url);

    // The shared reader, with the same ceiling the catalogue screens use.
    // `?limit=abc` is page-sized, not a 500 — see
    // `a-page-number-is-not-a-crash.test.ts`.
    const limit = readLimit(searchParams, 100, 500);
    const wanted = readFields(searchParams.get('fields'));
    // Before any query: a key without the scope learns nothing, not even
    // how long the answer would have taken.
    requireCostScope(caller, wanted);

    const products = await db.product.findMany({
      where: { companyId: caller.companyId, status: 'ACTIVE', ...realStoresOnly() },
      orderBy: [{ name: 'asc' }],
      take: limit,
      select: {
        id: true,
        sku: true,
        name: true,
        nameEn: true,
        basePrice: true,
        storeId: true,
        store: { select: { country: { select: { currencyCode: true, minorUnit: true } } } },
      },
    });

    const figures = await productFigures(
      caller.companyId,
      products.map((p) => ({
        id: p.id,
        storeId: p.storeId,
        currency: p.store?.country?.currencyCode ?? 'USD',
        minorUnit: p.store?.country?.minorUnit ?? 2,
      })),
      wanted
    );

    const items = [];
    for (const p of products) {
      const minorUnit = p.store?.country?.minorUnit ?? 2;
      const currency = p.store?.country?.currencyCode ?? 'USD';

      // The SAME offer view four public surfaces render, through the same
      // function — so a bundle's price is one number wherever it is read.
      const offers = await activeOffersFor(db, caller.companyId, p.id, minorUnit);
      const free = await availableStock(db, caller.companyId, p.id, undefined, p.storeId);

      items.push({
        code: p.sku,
        name: p.name,
        price: amountString(p.basePrice, minorUnit),
        currency,
        /*
         * ── TWO FIELDS THE CONTRACT ASKS FOR THAT THIS SYSTEM HAS NOT GOT ──
         *
         * `wholesale_price` and `discount_cap` are in the specification's
         * example body and in NO column, setting or screen of this product
         * — measured across `prisma/schema.prisma` and the whole of `src`.
         *
         * They are sent as null rather than invented. The nearest thing to a
         * wholesale price here is `productCost`, and publishing that would
         * break the same paragraph's own rule — «بلا تكلفة» — so the honest
         * answer is «we do not have this», which null says and a guessed
         * number does not. Flagged for the owner in the PR; the key stays so
         * the calling client's shape does not change when he rules.
         */
        wholesale_price: null,
        discount_cap: null,
        stock_status: free <= 0 ? 'OUT_OF_STOCK' : free < LOW_STOCK_AT ? 'LOW_STOCK' : 'IN_STOCK',
        offers: offers.map((o) => ({
          title: o.name,
          quantity: o.quantity,
          price: amountString(o.price, minorUnit),
          saving:
            o.listPrice !== null && o.listPrice > o.price
              ? amountString(o.listPrice - o.price, minorUnit)
              : null,
          /*
           * `remaining_qty` is null for the same reason the stock count is
           * withheld: the contract's own example has it null, and an offer
           * in this product carries no remaining-units limit at all — only
           * an end date, which is what `expires_at` is.
           */
          remaining_qty: null,
          expires_at: o.endsAt ? o.endsAt.toISOString() : null,
        })),
        /*
         * `complements` — «what goes with this» — has no model here. The
         * nearest is `LandingPageRecommendation`, which belongs to one PAGE
         * and not to a product, so reading it would answer a different
         * question. An empty list is what this system knows.
         */
        complements: [] as string[],
        // The other name a seller wrote for it — the media buyer matches old
        // campaign names against these. Nothing is invented to fill the list.
        ...(wanted.has('aliases') ? { aliases: p.nameEn?.trim() ? [p.nameEn.trim()] : [] } : {}),
        // The single-unit price first, then each live offer — the same
        // figures as `price` and `offers` above, in the shape the media
        // buyer's calculator reads.
        ...(wanted.has('price_options')
          ? {
              price_options: [
                { title: null, quantity: 1, price: amountString(p.basePrice, minorUnit) },
                ...offers.map((o) => ({ title: o.name, quantity: o.quantity, price: amountString(o.price, minorUnit) })),
              ],
            }
          : {}),
        ...figures.get(p.id),
      });
    }

    return v1Ok(requestId, { items });
  } catch (error) {
    return v1ErrorResponse(requestId, error);
  }
}
