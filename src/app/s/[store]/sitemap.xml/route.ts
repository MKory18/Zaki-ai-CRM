import { db } from '@/lib/db';
import { getStorefront, storefrontProducts } from '@/lib/storefront';
import { publicOrigin } from '@/lib/public-metadata';
import { cartBarApplies } from '@/lib/store-theme';

/**
 * ONE SHOP'S MAP, FOR THE CRAWLER.
 *
 * Per shop rather than one for the whole platform: these are different
 * businesses on one installation, and a single map would hand every
 * seller's catalogue to anybody who asked for it.
 *
 * ONLY WHAT A SHOPPER MAY OPEN. The cart, the checkout, the thank-you
 * and the tracking page are not here — they are either a device's own
 * state or one customer's, and they already say `noindex`. A map that
 * listed them would be inviting a crawler to walk a form.
 *
 * AND THE LAST-MODIFIED IS THE ROW'S OWN. A map that stamps today on
 * everything teaches a crawler to stop believing the field, and then a
 * product that really did change waits its turn with the rest.
 */

interface Ctx {
  params: Promise<{ store: string }>;
}

const xml = (body: string) =>
  new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // A catalogue changes in hours, not seconds. Long enough to be
      // cheap, short enough that a new product is found the same day.
      'Cache-Control': 'public, max-age=3600',
    },
  });

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { store: slug } = await ctx.params;
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) return new Response('Not found', { status: 404 });

    const store = await getStorefront(slug);
    if (!store) return new Response('Not found', { status: 404 });

    const origin = publicOrigin();
    const base = `${origin}/s/${store.slug}`;

    const [products, pages] = await Promise.all([
      storefrontProducts(store.companyId, store.id),
      db.storePage.findMany({
        where: { storeId: store.id, isPublished: true },
        select: { slug: true, updatedAt: true },
      }),
    ]);

    const entries: { loc: string; lastmod?: Date }[] = [{ loc: base }];

    // The shelf, and one address per category the shop's products carry.
    if (cartBarApplies(store.type)) {
      entries.push({ loc: `${base}/shop` });
      const categories = new Set(products.flatMap((p) => (p.category ? [p.category.id] : [])));
      for (const id of categories) {
        entries.push({ loc: `${base}/shop?cat=${encodeURIComponent(id)}` });
      }
    }

    for (const p of products) entries.push({ loc: `${base}/p/${encodeURIComponent(p.sku)}` });
    for (const p of pages) entries.push({ loc: `${base}/pages/${p.slug}`, lastmod: p.updatedAt });

    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries.map((e) =>
        [
          '  <url>',
          `    <loc>${escape(e.loc)}</loc>`,
          ...(e.lastmod ? [`    <lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>`] : []),
          '  </url>',
        ].join('\n')
      ),
      '</urlset>',
    ].join('\n');

    return xml(body);
  } catch (e) {
    console.error('GET /s/[store]/sitemap.xml', e);
    return new Response('Error', { status: 500 });
  }
}
