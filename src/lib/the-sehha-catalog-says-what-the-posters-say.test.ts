import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyCatalog, type Deps } from '../../scripts/sehha/apply';
import { CATALOG, STORE_NAME, STORE_NAMES } from '../../scripts/sehha/catalog';

/**
 * «التزم بالعروض الي بالصور» — THE SEVEN PRODUCTS OF «صحة بلس», AS THE POSTERS PRICE THEM.
 *
 * Two things are held here, and they are different kinds of claim:
 *
 *   1. THE NUMBERS ARE THE OWNER'S, copied from the posters (each read off the picture, twice). The table
 *      below is written out a second time on purpose: a typo in the catalogue must disagree with it.
 *   2. THE SCRIPT IS SAFE TO RUN ON A LIVE SHOP — it tries before it writes, it never deletes, it does not
 *      do the same thing twice, and it stops rather than guess which store is meant.
 */

const POSTERS: Record<string, { base: number; tiers: [number, number, number, number?][] }> = {
  // sku → [quantity, free, price, struck-through price?]
  'LEG-4': { base: 20, tiers: [[1, 0, 20], [2, 0, 35], [3, 0, 45]] }, //       ALBETCHU
  'HOODIE-01': { base: 25, tiers: [[1, 0, 25], [2, 1, 50]] }, //               هودي بديل المازوت
  'LEG-18': { base: 20, tiers: [[1, 0, 20], [2, 0, 35], [3, 0, 45]] }, //      Clarden
  'LEG-21': { base: 20, tiers: [[1, 0, 20], [2, 0, 35], [3, 0, 45]] }, //      VARA حرير
  'LEG-19': { base: 12, tiers: [[1, 0, 12], [2, 1, 20]] }, //                  ماء الكمأة (البوستر الجديد 25/10: 12 · عبوتان + الثالثة مجاناً 20)
  'LEG-23': { base: 50, tiers: [[1, 0, 50, 60], [2, 0, 80, 100]] }, //         القبعة (كانت 100/180/250)
  'LEG-7': { base: 20, tiers: [[1, 0, 20], [2, 0, 35], [3, 0, 45]] }, //       فطريات الأظافر
};

describe('the catalogue', () => {
  it('prices every product exactly as its poster does', () => {
    expect(CATALOG.map((i) => i.sku).sort()).toEqual(Object.keys(POSTERS).sort());
    for (const item of CATALOG) {
      const want = POSTERS[item.sku];
      expect(item.basePrice, item.sku).toBe(want.base);
      expect(
        item.tiers.map((t) => [t.quantity, t.freeQuantity, t.price, ...(t.compareAt ? [t.compareAt] : [])]),
        item.sku
      ).toEqual(want.tiers);
    }
  });

  it('the single-unit price is the first offer’s price — one number for «السعر» on the shelf and at the form', () => {
    for (const item of CATALOG) expect(item.basePrice, item.sku).toBe(item.tiers[0].price);
  });

  it('every picture it names is a file that is there', () => {
    const dir = path.join(process.cwd(), 'scripts', 'sehha', 'images');
    for (const item of CATALOG) {
      expect(fs.existsSync(path.join(dir, item.key, 'cover.webp')), `${item.key}/cover`).toBe(true);
      for (const n of item.posters) expect(fs.existsSync(path.join(dir, item.key, `${n}.webp`)), `${item.key}/${n}`).toBe(true);
      expect(item.alts.length, `${item.key}: alt per poster`).toBe(item.posters.length);
    }
  });

  it('leaves out the «آراء العملاء / نتائج حقيقية» posters — those are the owner’s to add, not ours to publish', () => {
    const held: Record<string, number[]> = { albetchu: [3], hoodie: [3], clarden: [3], vara: [3], kamaa: [3], fungus: [3], cap: [2, 3] };
    for (const item of CATALOG) for (const n of held[item.key]) expect(item.posters, `${item.key} #${n}`).not.toContain(n);
  });
});

/* ── a small in-memory shop, with every write counted ─────────────────── */

type Row = Record<string, any>;
function fakeShop(seed: { products?: Row[]; offers?: Row[]; images?: Row[]; stores?: Row[] } = {}) {
  const t = {
    stores: seed.stores ?? [{ id: 's1', companyId: 'co1', name: STORE_NAME }],
    products: seed.products ?? [],
    offers: seed.offers ?? [],
    images: seed.images ?? [],
  };
  let n = 0;
  const writes: string[] = [];
  const w = (what: string) => writes.push(what);
  const db: any = {
    store: { findMany: async ({ where }: any) => t.stores.filter((s) => where.name.in.includes(s.name)) },
    product: {
      findFirst: async ({ where }: any) => t.products.find((p) => p.sku === where.sku && p.storeId === where.storeId) ?? null,
      create: async ({ data }: any) => (w('product.create'), t.products.push({ id: `p${++n}`, ...data }), t.products.at(-1)),
      update: async ({ where, data }: any) => (w('product.update'), Object.assign(t.products.find((p) => p.id === where.id)!, data)),
    },
    offer: {
      findMany: async ({ where }: any) => t.offers.filter((o) => o.productId === where.productId),
      create: async ({ data }: any) => (w('offer.create'), t.offers.push({ id: `o${++n}`, isDefault: false, ...data })),
      update: async ({ where, data }: any) => (w('offer.update'), Object.assign(t.offers.find((o) => o.id === where.id)!, data)),
      delete: async () => { throw new Error('the script must never delete an offer'); },
    },
    productImage: {
      count: async ({ where }: any) =>
        t.images.filter(
          (i) =>
            i.productId === where.productId &&
            (where.isPrimary === undefined || i.isPrimary === where.isPrimary) &&
            (!where.altText?.startsWith || String(i.altText).startsWith(where.altText.startsWith))
        ).length,
      create: async ({ data }: any) => (w('image.create'), t.images.push({ id: `i${++n}`, ...data })),
    },
  };
  return { db, t, writes };
}

const deps = (db: any): Deps & { saved: string[]; lines: string[] } => {
  const saved: string[] = [];
  const lines: string[] = [];
  return {
    db,
    imagesDir: path.join(process.cwd(), 'scripts', 'sehha', 'images'),
    saveImage: async (o) => {
      saved.push(o.originalName);
      return { url: `/api/media/${o.productId}/${o.originalName}`, storageKey: `k/${o.originalName}`, fileName: o.originalName, mimeType: 'image/webp', fileSize: o.buffer.length };
    },
    log: (l) => lines.push(l),
    saved,
    lines,
  };
};

const withProducts = () =>
  fakeShop({
    products: CATALOG.filter((i) => !i.create).map((i, k) => ({ id: `x${k}`, sku: i.sku, name: i.key, storeId: 's1', basePrice: 100 })),
  });

describe('trying before writing', () => {
  it('a dry run touches nothing — and says what it would do', async () => {
    const { db, writes } = withProducts();
    const d = deps(db);
    const report = await applyCatalog(d, { apply: false });
    expect(writes).toEqual([]);
    expect(d.saved).toEqual([]);
    expect(report.items.flatMap((i) => i.actions).length).toBeGreaterThan(10);
  });
});

describe('applying', () => {
  let shop: ReturnType<typeof withProducts>;
  beforeEach(() => {
    shop = withProducts();
    // the cap, as it stands today: 100 / 180 / «3 + 1 هدية» 250
    const cap = shop.t.products.find((p) => p.sku === 'LEG-23')!;
    shop.t.offers.push(
      { id: 'c1', productId: cap.id, name: 'قطعة واحدة', quantity: 1, freeQuantity: 0, sellingPrice: 100, compareAtPrice: null, deliveryIncluded: true, sortOrder: 0, status: 'ACTIVE' },
      { id: 'c2', productId: cap.id, name: 'قطعتان', quantity: 2, freeQuantity: 0, sellingPrice: 180, compareAtPrice: null, deliveryIncluded: true, sortOrder: 1, status: 'ACTIVE' },
      { id: 'c3', productId: cap.id, name: 'ثلاث قطع + واحدة هدية', quantity: 3, freeQuantity: 1, sellingPrice: 250, compareAtPrice: null, deliveryIncluded: true, sortOrder: 2, status: 'ACTIVE' }
    );
  });

  it('moves the cap to the poster’s 50 / 80, with the struck-through 60 / 100', async () => {
    await applyCatalog(deps(shop.db), { apply: true, only: ['cap'] });
    const cap = shop.t.products.find((p) => p.sku === 'LEG-23')!;
    expect(cap.basePrice).toBe(50);
    const byId = (id: string) => shop.t.offers.find((o) => o.id === id)!;
    expect([byId('c1').sellingPrice, byId('c1').compareAtPrice]).toEqual([50, 60]);
    expect([byId('c2').sellingPrice, byId('c2').compareAtPrice]).toEqual([80, 100]);
  });

  it('stops the cap’s old «3 + 1» offer — it is not on the poster — and never deletes it', async () => {
    await applyCatalog(deps(shop.db), { apply: true, only: ['cap'] });
    const old = shop.t.offers.find((o) => o.id === 'c3')!;
    expect(old.status).toBe('INACTIVE');
    expect(old.sellingPrice).toBe(250); // history kept as it was
    expect(shop.t.offers.filter((o) => o.productId === old.productId)).toHaveLength(3);
  });

  it('creates the hoodie, which the shop did not have, with «قطعتان + قطعة مجانية» = 50', async () => {
    await applyCatalog(deps(shop.db), { apply: true, only: ['hoodie'] });
    const hoodie = shop.t.products.find((p) => p.sku === 'HOODIE-01')!;
    expect(hoodie).toMatchObject({ name: 'هودي بديل المازوت', basePrice: 25, storeId: 's1', companyId: 'co1', status: 'ACTIVE' });
    const offers = shop.t.offers.filter((o) => o.productId === hoodie.id);
    expect(offers.map((o) => [o.quantity, o.freeQuantity, o.sellingPrice])).toEqual([[1, 0, 25], [2, 1, 50]]);
    expect(offers.every((o) => o.deliveryIncluded && o.status === 'ACTIVE')).toBe(true);
  });

  it('uploads the cover first and makes it the primary picture, in sync with `product.image`', async () => {
    const d = deps(shop.db);
    await applyCatalog(d, { apply: true, only: ['vara'] });
    expect(d.saved).toEqual(['cover.webp', '1.webp', '2.webp', '4.webp']);
    const vara = shop.t.products.find((p) => p.sku === 'LEG-21')!;
    const imgs = shop.t.images.filter((i) => i.productId === vara.id);
    expect(imgs.map((i) => i.isPrimary)).toEqual([true, false, false, false]);
    expect(vara.image).toBe(imgs[0].url);
  });

  it('keeps a picture the product already has as its primary — ours go behind it', async () => {
    const vara = shop.t.products.find((p) => p.sku === 'LEG-21')!;
    shop.t.images.push({ id: 'old', productId: vara.id, isPrimary: true, altText: 'the owner’s own', url: '/old.webp' });
    await applyCatalog(deps(shop.db), { apply: true, only: ['vara'] });
    const mine = shop.t.images.filter((i) => String(i.altText).startsWith('sehha:vara:'));
    expect(mine.every((i) => i.isPrimary === false)).toBe(true);
    expect(shop.t.images.find((i) => i.id === 'old')!.isPrimary).toBe(true);
  });

  it('does not do it twice: a second run writes nothing at all', async () => {
    await applyCatalog(deps(shop.db), { apply: true });
    shop.writes.length = 0;
    const again = deps(shop.db);
    await applyCatalog(again, { apply: true });
    expect(shop.writes).toEqual([]);
    expect(again.saved).toEqual([]);
  });

  it('and does not touch an offer that is already right', async () => {
    await applyCatalog(deps(shop.db), { apply: true, only: ['albetchu'] });
    const before = shop.t.offers.length;
    shop.writes.length = 0;
    await applyCatalog(deps(shop.db), { apply: true, only: ['albetchu'] });
    expect(shop.t.offers.length).toBe(before);
    expect(shop.writes.filter((x) => x.startsWith('offer'))).toEqual([]);
  });
});

describe('refusing to guess', () => {
  it('finds the shop under either of its two names — «صحة بلس» here, «متجر صحة بلس» in production', async () => {
    for (const name of STORE_NAMES) {
      const { db } = fakeShop({ stores: [{ id: 's1', companyId: 'co1', name }] });
      const report = await applyCatalog(deps(db), { apply: false, only: ['vara'] });
      expect(report.store).toBe(name);
    }
  });

  it('stops, writing nothing, when the store is not there', async () => {
    const { db, writes } = fakeShop({ stores: [] });
    await expect(applyCatalog(deps(db), { apply: true })).rejects.toThrow(/وُجد 0/);
    expect(writes).toEqual([]);
  });

  it('stops when two stores carry the name — which one is not for a script to choose', async () => {
    const { db, writes } = fakeShop({
      stores: [{ id: 's1', companyId: 'co1', name: STORE_NAME }, { id: 's2', companyId: 'co1', name: STORE_NAME }],
    });
    await expect(applyCatalog(deps(db), { apply: true })).rejects.toThrow(/وُجد 2/);
    expect(writes).toEqual([]);
  });

  it('skips, and says so, a product it does not know how to create', async () => {
    const { db } = fakeShop(); // no products at all
    const report = await applyCatalog(deps(db), { apply: true, only: ['vara'] });
    expect(report.items[0].warnings.join(' ')).toContain('LEG-21');
    expect(report.items[0].actions).toEqual([]);
  });

  it('refuses a key it has never heard of, instead of quietly doing nothing', async () => {
    const { db } = fakeShop();
    await expect(applyCatalog(deps(db), { apply: false, only: ['nope'] })).rejects.toThrow(/nope/);
  });
});
