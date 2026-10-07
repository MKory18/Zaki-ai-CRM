import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getStorefront } from '@/lib/storefront';
import { basketDiscount, resolvePublicLines } from '@/lib/public-order';
import { computeCod } from '@/lib/money';
import { publicizeMedia } from '@/lib/public-media';
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from '@/lib/cart';
import { numeric } from '@/lib/numeric-input';

/**
 * WHAT IS IN THIS BASKET, AND WHAT IT COSTS.
 *
 * The cart holds identities and counts — no prices, because a price in a
 * browser is a price a browser can edit. So the page has to ask, and this
 * is what it asks.
 *
 * IT IS THE SAME ANSWER THE ORDER WILL GIVE. `resolvePublicLines` and
 * `computeCod` are the two the order path uses, called the same way with
 * the same inputs. A second pricing path for «what does the cart say»
 * would agree on the day it was written and disagree on the next — and the
 * customer would meet that disagreement at the moment they hand money over
 * at their own door.
 *
 * IT WRITES NOTHING AND ASKS FOR NOBODY. No name, no phone, no address —
 * a basket is not an order, and nothing here is stored or logged against a
 * person.
 */

interface Ctx {
  params: Promise<{ store: string }>;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const MAX_BODY_BYTES = 8 * 1024;

/** The basket as the browser sent it, bounded and stripped of everything else. */
function chosenFrom(raw: unknown): { productId: string; offerId: string; count: number }[] {
  const items = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: { productId: string; offerId: string; count: number }[] = [];
  for (const row of items.slice(0, MAX_CART_LINES)) {
    const r = (row ?? {}) as Record<string, unknown>;
    const productId = typeof r.productId === 'string' ? r.productId.slice(0, 64) : '';
    if (!productId) continue;
    /*
     * HOW MANY, READ STRICTLY — AND MEASURED AGAINST THE ORDER DOOR.
     *
     * This was `Math.trunc(Number(r.quantity))`, and `Number()` is open:
     * `'0x10'` → 16, `true` → 1, `['5']` → 5 (measured on this build).
     *
     * The worry worth naming is that 81f1cdd made this door quote the same
     * money the order door charges, so a quantity read differently here is
     * a quote that does not match the sale. CHECKED, and the answer is not
     * what it looks like: at 9f15044 the order door read the SAME field as
     * `z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY)`
     * (`lib/landing-order-schema.ts`), and `z.coerce.number()` IS
     * `Number()` — so on NOTATION the two doors already AGREED, both
     * reading `'0x10'` as 16. The notation defect never produced a
     * quote/sale mismatch; it produced the same wrong figure twice. Both
     * doors read it with `count()`/`numeric()` now, so they agree in the
     * strict direction instead, and the suite beside this file runs the
     * order door's real schema to keep that a measured fact.
     *
     * Where they DO disagree is the edge, and `numeric()` does not change
     * it: asked 150, this door clamps to `MAX_LINE_QUANTITY` and prices 99
     * while the order door answers 400; asked 2.5, this door prices 2 while
     * `.int()` answers 400. Clamping is deliberate here and follows the rule
     * `numeric-input.ts` writes down — nothing is WRITTEN by this door, and
     * the clamped figure is reported back in `lines[].quantity`, so the
     * shopper can see what they are being quoted for. Making the two agree
     * means changing the order door's schema, which is not this file.
     *
     * `numeric()` and not `count()`: `count()` would refuse 150 outright and
     * drop the line, and a line that silently disappears from a basket is
     * worse than a line clamped to 99 in plain sight. So the reading becomes
     * strict and the clamping stays. No `Number.isFinite` beside it —
     * `numeric()` already refuses NaN and Infinity, and a check that cannot
     * fire once is the vacuous guard this audit keeps catching.
     */
    const asked = numeric().safeParse(r.quantity);
    if (!asked.success) continue;
    const n = Math.trunc(asked.data);
    if (n < 1) continue;
    out.push({
      productId,
      offerId: typeof r.offerId === 'string' ? r.offerId.slice(0, 64) : '',
      count: Math.min(MAX_LINE_QUANTITY, n),
    });
  }
  return out;
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { store: slug } = await ctx.params;
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
      return NextResponse.json({ error: 'هذا المتجر غير موجود' }, { status: 404, headers: CORS });
    }

    // A cart is re-priced on every change, so this is generous — and it is
    // still a door that reads the catalogue, so it is bounded.
    const rl = rateLimit(`store_quote:${getClientIp(req)}`, 120, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `محاولات كثيرة جدًا. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    if (parseInt(req.headers.get('content-length') || '0', 10) > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'البيانات كبيرة جدًا' }, { status: 413, headers: CORS });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400, headers: CORS });
    }

    const store = await getStorefront(slug);
    if (!store) {
      return NextResponse.json({ error: 'هذا المتجر غير موجود' }, { status: 404, headers: CORS });
    }

    const chosen = chosenFrom(raw);
    if (chosen.length === 0) {
      // An empty basket is not an error; it is an empty basket.
      return NextResponse.json(
        { lines: [], subtotal: 0, cod: 0, currency: store.currencyCode, pieces: 0 },
        { headers: { ...CORS, 'Cache-Control': 'no-store' } }
      );
    }

    // This shop's products only. An id from another shop's catalogue is not
    // found here, and the resolver then refuses it by name.
    const products = await db.product.findMany({
      where: {
        id: { in: [...new Set(chosen.map((c) => c.productId))] },
        companyId: store.companyId,
        storeId: store.id,
        status: 'ACTIVE',
        basePrice: { gt: 0 },
      },
      select: { id: true, name: true, image: true, basePrice: true },
    });

    const resolved = await resolvePublicLines(store.companyId, products, chosen);
    if (!resolved.ok) {
      return NextResponse.json(
        { error: Object.values(resolved.fieldErrors)[0] ?? 'تعذّر تسعير السلة' },
        { status: 400, headers: CORS }
      );
    }

    const country = await db.country.findUnique({
      where: { id: store.countryId },
      select: { currencyCode: true, minorUnit: true },
    });
    if (!country) {
      return NextResponse.json({ error: 'هذا المتجر لا يقبل الطلبات حاليًا' }, { status: 409, headers: CORS });
    }

    /**
     * THE ORDER PATH'S OWN CALL, WITH THE ORDER PATH'S OWN INPUTS —
     * `createPublicOrder` builds exactly this object, argument for argument.
     *
     * `discount` IS NOT OPTIONAL HERE, whatever its type says. This comment
     * claimed «the order path's own inputs» while the call below left the
     * discount off, and a comment that lies is worse than no comment: the
     * next reader trusts it and stops looking. An offer with
     * `sellingPrice: 25` and `discount: 3` quoted the shopper 25 and then
     * charged 22 at the door — two doors, two figures, and the customer
     * meets the difference with cash in their hand.
     *
     * `basketDiscount` is the order door's own function, imported rather
     * than reimplemented. A second «what does this basket's discount come
     * to» would agree on the day it was written and disagree on the next —
     * which is the whole defect this door already exists to avoid.
     *
     * NOTHING ELSE IS PASSED, and that too is parity: `createPublicOrder`
     * passes no `deliveryFee` and no `priceIncludesDelivery` either, so the
     * fee is settled when the order is raised, not when a cart is priced.
     * Adding one here would make this door disagree in the other direction.
     */
    const money = computeCod({
      lines: resolved.lines.map((l) => ({
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        freeQuantity: l.freeQuantity,
      })),
      discount: basketDiscount(resolved.lines),
      minorUnit: country.minorUnit,
    });

    // A shopper has no session, so stored image links are made public for
    // this answer — the same rule the grid follows.
    const images = publicizeMedia(resolved.lines.map((l) => l.product.image));

    return NextResponse.json(
      {
        lines: resolved.lines.map((l, i) => ({
          productId: l.product.id,
          name: l.product.name,
          image: images[i] ?? null,
          offerId: l.offer?.id ?? null,
          offerName: l.offer?.name ?? null,
          quantity: l.quantity,
          freeQuantity: l.freeQuantity,
          unitPrice: l.unitPrice,
          lineTotal: money.lineTotals[i] ?? 0,
        })),
        subtotal: money.subtotal,
        cod: money.cod,
        currency: country.currencyCode,
        minorUnit: country.minorUnit,
        pieces: resolved.lines.reduce((n, l) => n + l.quantity + l.freeQuantity, 0),
      },
      { headers: { ...CORS, 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('POST /api/public/stores/[store]/quote', e);
    return NextResponse.json({ error: 'تعذّر تسعير السلة الآن' }, { status: 500, headers: CORS });
  }
}
