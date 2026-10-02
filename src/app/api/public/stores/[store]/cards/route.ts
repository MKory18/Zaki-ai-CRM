import { NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getStorefront, storefrontProducts } from '@/lib/storefront';
import { MAX_RECENT } from '@/lib/recently-viewed';

/**
 * A FEW PRODUCTS BY ID, AS CARDS.
 *
 * «شوهد مؤخراً» lives on the device as a list of ids and nothing else —
 * no name, no price, no picture, because a device that was promised it
 * holds no record of a person should not hold one of what they looked at
 * either. So the row has to ask what those ids are, and this answers.
 *
 * IT ANSWERS ONLY ABOUT THIS SHOP, and only about products it would list
 * anyway: `storefrontProducts` is the same read the grid uses, so a
 * product that has been retired or emptied is simply absent — the row
 * shrinks rather than linking somewhere gone.
 *
 * AND IT DECIDES NO PRICE. The «من» figure is the one the grid shows,
 * computed where every other one is.
 *
 * It is a POST because the ids are a list and a GET would put them in a
 * URL — not personal data, but a log line saying which products one
 * visitor has been looking at is a behavioural record all the same.
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

/** No more than a row's worth, whatever was asked for. */
const MAX_IDS = MAX_RECENT;

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { store: slug } = await ctx.params;
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
      return NextResponse.json({ error: 'هذا المتجر غير موجود' }, { status: 404, headers: CORS });
    }

    const rl = rateLimit(`store_cards:${getClientIp(req)}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `محاولات كثيرة جدًا. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400, headers: CORS });
    }

    const asked = Array.isArray((raw as { ids?: unknown } | null)?.ids)
      ? ((raw as { ids: unknown[] }).ids
          .filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64)
          .slice(0, MAX_IDS))
      : [];
    if (asked.length === 0) {
      return NextResponse.json({ products: [] }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
    }

    const store = await getStorefront(slug);
    if (!store) {
      return NextResponse.json({ error: 'هذا المتجر غير موجود' }, { status: 404, headers: CORS });
    }

    const shelf = await storefrontProducts(store.companyId, store.id);
    const byId = new Map(shelf.map((p) => [p.id, p]));

    return NextResponse.json(
      {
        // IN THE ORDER ASKED. The device knows which was seen most
        // recently; re-sorting here would throw that away and the row
        // would stop meaning «مؤخراً».
        products: asked
          .map((id) => byId.get(id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map((p) => ({
            id: p.id,
            handle: p.handle,
            sku: p.sku,
            name: p.name,
            image: p.image,
            fromPrice: p.fromPrice,
          })),
        currency: store.currencyCode,
      },
      { headers: { ...CORS, 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('POST /api/public/stores/[store]/cards', e);
    return NextResponse.json({ error: 'تعذّر التحميل' }, { status: 500, headers: CORS });
  }
}
