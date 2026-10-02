import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getStorefront, storefrontProducts } from '@/lib/storefront';
import { SUGGESTION_LIMIT, parseSynonyms, searchProducts } from '@/lib/store-search';

/**
 * WHAT THIS SHOP SELLS THAT MATCHES WHAT SOMEBODY TYPED.
 *
 * One endpoint for both the suggestions under the field and the results
 * page, because a suggestion that leads somewhere the results page does not
 * is worse than no suggestion — it teaches the shopper the box is lying.
 * `suggest=1` only shortens the list.
 *
 * The matching rule is `searchProducts`, and the spelling rule inside it is
 * `normalizeArabic`, which six other places in this system already ask.
 *
 * NO PRICES ARE DECIDED HERE. `storefrontProducts` is the same read the
 * grid uses, so a product's «من» price in a search result and on the shelf
 * cannot disagree.
 */

interface Ctx {
  params: Promise<{ store: string }>;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Long enough for «مرهم الأذن للأطفال», short enough not to be a payload. */
const MAX_QUERY = 60;

/** A whole page of results; past this nobody is reading, they are scrolling. */
const RESULT_LIMIT = 40;

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { store: slug } = await ctx.params;
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
      return NextResponse.json({ error: 'هذا المتجر غير موجود' }, { status: 404, headers: CORS });
    }

    /**
     * A search box is typed into on every keystroke, and it is also the
     * cheapest way to read a whole catalogue one query at a time. Generous
     * for a person, bounded for anything else.
     */
    const rl = rateLimit(`store_search:${getClientIp(req)}`, 120, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `محاولات كثيرة جدًا. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get('q') ?? '').slice(0, MAX_QUERY);
    const suggest = url.searchParams.get('suggest') === '1';

    // A blank answers with nothing rather than the catalogue: the page that
    // wanted the catalogue already has it, and this one was asked a
    // question nobody typed.
    if (!q.trim()) {
      return NextResponse.json({ query: '', products: [] }, { headers: CORS });
    }

    // A shop that is not open must not be searchable either: a closed
    // storefront reads as absent everywhere.
    const store = await getStorefront(slug);
    if (!store) {
      return NextResponse.json({ error: 'هذا المتجر غير موجود' }, { status: 404, headers: CORS });
    }

    const [products, vocabulary] = await Promise.all([
      storefrontProducts(store.companyId, store.id),
      db.store
        .findFirst({ where: { id: store.id }, select: { searchSynonyms: true } })
        .then((r) => parseSynonyms(r?.searchSynonyms)),
    ]);

    const hits = searchProducts(products, q, {
      synonyms: vocabulary,
      limit: suggest ? SUGGESTION_LIMIT : RESULT_LIMIT,
    });

    return NextResponse.json(
      {
        query: q,
        products: hits.map((h) => ({
          id: h.product.id,
          sku: h.product.sku,
          name: h.product.name,
          image: h.product.image,
          fromPrice: h.product.fromPrice,
          category: h.product.category,
        })),
      },
      { headers: { ...CORS, 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('GET /api/public/stores/[store]/search', e);
    return NextResponse.json({ error: 'تعذّر البحث الآن' }, { status: 500, headers: CORS });
  }
}
