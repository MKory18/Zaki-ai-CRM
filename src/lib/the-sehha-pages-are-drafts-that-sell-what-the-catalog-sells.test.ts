import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { landingSectionsSchema } from '@/lib/landing-sections';
import { applyPages, restyled, sectionsFor, TITLE_ID, type PagesDeps } from '../../scripts/sehha/pages';
import { CATALOG, STORE_NAMES } from '../../scripts/sehha/catalog';

/**
 * «صفحات الهبوط اعملهم زي هيك» (صفحة YouCan: البوسترات كاملة واحد تحت الثاني، ثم نموذج الطلب، وزر عائم).
 *
 * A page here is a DRAFT — never published, never in the shop window — and it carries no price: the order form
 * reads the product's own offers, so the figures stay where `apply-sehha` wrote them from the posters. The
 * pictures are the product's own posters (already uploaded), shown whole. Running twice makes nothing twice, and
 * a taken address is never overwritten.
 */

const STORE = { id: 'st1', companyId: 'co1', name: 'متجر صحة بلس' };

interface Row { id: string; slug: string; companyId: string; storeId: string; productId: string; isPublished: boolean; sections: string; [k: string]: unknown }

/** The poster rows `apply-sehha` would have left on a product: cover first, then `sehha:<key>:<n>` for each poster. */
const imagesOf = (productId: string, only?: string[]) =>
  CATALOG.filter((c) => `prod-${c.sku}` === productId).flatMap((c) => [
    { url: `/api/media/${productId}/${c.key}-cover.webp`, altText: `sehha:${c.key}:cover` },
    ...c.posters.map((n) => ({ url: `/api/media/${productId}/${c.key}-${n}.webp`, altText: `sehha:${c.key}:${n}` })),
  ]).filter((r) => !only || only.includes(r.altText.split(':')[2]));

function fake(opts: { stores?: unknown[]; taken?: Partial<Row>[]; products?: string[]; posterNumbers?: string[] } = {}) {
  const pages: Row[] = (opts.taken ?? []).map((t, i) => ({
    id: `p${i}`, slug: 's', companyId: 'co1', storeId: 'st1', productId: 'x', isPublished: false, sections: '[]', ...t,
  }));
  const db = {
    store: { findMany: vi.fn(async () => opts.stores ?? [STORE]) },
    product: {
      findFirst: vi.fn(async ({ where }: { where: { sku: string } }) =>
        (opts.products ?? CATALOG.map((c) => c.sku)).includes(where.sku) ? { id: `prod-${where.sku}` } : null
      ),
    },
    productImage: {
      findMany: vi.fn(async ({ where }: { where: { productId: string } }) => imagesOf(where.productId, opts.posterNumbers)),
    },
    landingPage: {
      findFirst: vi.fn(async ({ where }: { where: { slug: string } }) => pages.find((p) => p.slug === where.slug) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        pages.push({ ...data, id: `new${pages.length}` });
        return data;
      }),
    },
  };
  return { db: db as unknown as PrismaClient, raw: db, pages };
}

const deps = (db: PrismaClient): PagesDeps => ({ db, standDownRedirectsTo: vi.fn(async () => undefined), log: () => undefined });

beforeEach(() => vi.clearAllMocks());

describe('one page, as built from the posters', () => {
  const sections = sectionsFor(['/p/1.webp', '/p/2.webp', '/p/4.webp']);

  it('is a page the editor accepts, with the order form and the floating button every selling page has', () => {
    expect(landingSectionsSchema.safeParse(sections).success).toBe(true);
    const types = sections.map((s) => s.type);
    expect(types).toContain('form');
    expect(types).toContain('sticky');
  });

  it('opens on the posters — whole and one under another, in the order given', () => {
    expect(sections[0]).toMatchObject({ type: 'gallery', layout: 'stack', images: ['/p/1.webp', '/p/2.webp', '/p/4.webp'] });
  });

  it('the form comes straight after the posters', () => {
    expect(sections[1].type).toBe('form');
  });

  it('the form reads like a YouCan form: compact, with the bundles as a radio list', () => {
    expect(sections[1]).toMatchObject({ formStyle: 'compact', offerStyle: 'radio' });
  });

  it('NEGATIVE: carries no price — not one number of the catalog is a word on the page', () => {
    // Every WORD the page carries (strings, minus ids and the image paths) — a price would be one of them.
    const words = (v: unknown, key = ''): string[] =>
      typeof v === 'string' ? (key === 'id' || key === 'images' ? [] : [v])
      : Array.isArray(v) ? v.flatMap((x) => words(x, key))
      : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => words(x, k))
      : [];
    const spoken = words(sections).join(' | ');
    expect(JSON.stringify(sections)).not.toMatch(/"(price|sellingPrice|amount|basePrice)"/);
    for (const c of CATALOG) for (const t of c.tiers) expect(spoken, `${c.key} ${t.price}`).not.toMatch(new RegExp(`(^|\\D)${t.price}(\\D|$)`));
    expect(spoken).not.toMatch(/\$|دولار/);
  });

  it('and the trust block is left empty, so the renderer draws the facts instead of words nobody measured', () => {
    expect(sections.find((s) => s.type === 'trust')).toMatchObject({ items: [] });
  });
});

describe('applying', () => {
  it('a dry run writes nothing and says what it would build', async () => {
    const { db, raw } = fake();
    const d = deps(db);
    const r = await applyPages(d, { apply: false });
    expect(raw.landingPage.create).not.toHaveBeenCalled();
    expect(d.standDownRedirectsTo).not.toHaveBeenCalled();
    expect(r.pages).toHaveLength(7);
    expect(r.pages.every((p) => p.actions.length === 1 && p.warnings.length === 0)).toBe(true);
  });

  it('--apply makes seven pages — DRAFTS, in this store, out of the shop window, tied to their own product', async () => {
    const { db, pages } = fake();
    await applyPages(deps(db), { apply: true });
    expect(pages).toHaveLength(7);
    for (const p of pages) {
      expect(p).toMatchObject({ companyId: 'co1', storeId: 'st1', isPublished: false, showInStore: false, builderMode: 'BLOCKS' });
    }
    const item = CATALOG.find((c) => c.key === 'albetchu')!;
    const page = pages.find((p) => p.slug === item.slug)!;
    expect(page.productId).toBe(`prod-${item.sku}`);
    expect(landingSectionsSchema.safeParse(JSON.parse(page.sections)).success).toBe(true);
  });

  it('each page shows ITS product’s posters, in poster order — never the cover, never a held-back poster', async () => {
    const { db, pages } = fake();
    await applyPages(deps(db), { apply: true });
    for (const item of CATALOG) {
      const page = pages.find((p) => p.slug === item.slug)!;
      const stack = JSON.parse(page.sections).find((b: { type: string }) => b.type === 'gallery');
      expect(stack.images, item.key).toEqual(item.posters.map((n) => `/api/media/prod-${item.sku}/${item.key}-${n}.webp`));
    }
  });

  it('stands the redirect down for the new address, as the create door does', async () => {
    const { db } = fake();
    const d = deps(db);
    await applyPages(d, { apply: true, only: ['albetchu'] });
    expect(d.standDownRedirectsTo).toHaveBeenCalledWith('albetchu-scar-cream');
  });

  it('runs twice and still leaves seven — the second run builds nothing', async () => {
    const { db, pages } = fake();
    await applyPages(deps(db), { apply: true });
    const again = await applyPages(deps(db), { apply: true });
    expect(pages).toHaveLength(7);
    expect(again.pages.every((p) => p.actions[0].includes('تُركت كما هي'))).toBe(true);
  });

  it('a page the owner already published or edited at that address is left untouched', async () => {
    const item = CATALOG[0];
    const { db, raw, pages } = fake({
      taken: [{ slug: item.slug, productId: `prod-${item.sku}`, isPublished: true, sections: '[{"mine":true}]' }],
    });
    await applyPages(deps(db), { apply: true, only: ['albetchu'] });
    expect(raw.landingPage.create).not.toHaveBeenCalled();
    expect(pages[0].sections).toBe('[{"mine":true}]');
    expect(pages[0].isPublished).toBe(true);
  });

  it('NEGATIVE: an address held by another product or store is never overwritten — it is reported', async () => {
    const item = CATALOG[0];
    for (const other of [{ productId: 'someone-else' }, { storeId: 'st9' }, { companyId: 'co9' }]) {
      const { db, raw } = fake({ taken: [{ slug: item.slug, productId: `prod-${item.sku}`, ...other }] });
      const r = await applyPages(deps(db), { apply: true, only: ['albetchu'] });
      expect(raw.landingPage.create).not.toHaveBeenCalled();
      expect(r.pages[0].warnings[0]).toContain('مأخوذ');
    }
  });

  it('NEGATIVE: a missing product, or posters apply-sehha has not uploaded, is skipped with the step to take', async () => {
    const a = fake({ products: [] });
    const ra = await applyPages(deps(a.db), { apply: true });
    expect(a.raw.landingPage.create).not.toHaveBeenCalled();
    expect(ra.pages.every((p) => p.warnings[0].includes('apply-sehha'))).toBe(true);

    // only poster 1 of three is on the product
    const b = fake({ posterNumbers: ['1'] });
    const rb = await applyPages(deps(b.db), { apply: true, only: ['albetchu'] });
    expect(b.raw.landingPage.create).not.toHaveBeenCalled();
    expect(rb.pages[0].warnings[0]).toContain('ناقصة');
  });

  it('NEGATIVE: no matching store, or two, stops before anything is written', async () => {
    for (const stores of [[], [STORE, { ...STORE, id: 'st2', name: 'صحة بلس' }]]) {
      const { db, raw } = fake({ stores });
      await expect(applyPages(deps(db), { apply: true })).rejects.toThrow(/بالضبط/);
      expect(raw.landingPage.create).not.toHaveBeenCalled();
    }
    expect(STORE_NAMES).toContain('متجر صحة بلس');
  });

  it('--only touches just the named products', async () => {
    const { db, pages } = fake();
    await applyPages(deps(db), { apply: true, only: ['cap', 'vara'] });
    expect(pages.map((p) => p.slug).sort()).toEqual(['led-red-light-cap', 'vara-harir-cream']);
  });
});

describe('--restyle — the form look on the drafts that already exist', () => {
  /** A draft as the first run saved it: the form block has no look chosen. */
  const oldSections = JSON.stringify([
    { id: 'g', type: 'gallery', images: ['/a'], layout: 'stack' },
    { id: 'f', type: 'form', title: 'أكمل الطلب', subtitle: '' },
  ]);
  const item = CATALOG[0];
  const draft = (over: Partial<Row> = {}) => ({ slug: item.slug, productId: `prod-${item.sku}`, isPublished: false, sections: oldSections, ...over });

  it('puts the compact form and the radio list on a draft whose form had no look chosen — and touches nothing else', async () => {
    const f = fake({ taken: [draft()] });
    (f.raw.landingPage as unknown as Record<string, unknown>).updateMany = vi.fn(async ({ data }: { data: { sections: string } }) => {
      f.pages[0].sections = data.sections;
      return { count: 1 };
    });
    await applyPages(deps(f.db), { apply: true, only: ['albetchu'], restyle: true });
    const saved = JSON.parse(f.pages[0].sections);
    // the product's name is put in front; everything that was there is still there, in order
    expect(saved[0].id).toBe(TITLE_ID);
    expect(saved[2]).toMatchObject({ id: 'f', type: 'form', title: 'أكمل الطلب', formStyle: 'compact', offerStyle: 'radio' });
    expect(saved[1]).toEqual(JSON.parse(oldSections)[0]);
    expect(f.raw.landingPage.create).not.toHaveBeenCalled();
  });

  it('a dry run says it would, and writes nothing', async () => {
    const f = fake({ taken: [draft()] });
    const update = vi.fn();
    (f.raw.landingPage as unknown as Record<string, unknown>).updateMany = update;
    const r = await applyPages(deps(f.db), { apply: false, only: ['albetchu'], restyle: true });
    expect(update).not.toHaveBeenCalled();
    expect(r.pages[0].actions[0]).toContain('شكل النموذج');
  });

  it('without --restyle an existing page is left exactly as it is', async () => {
    const f = fake({ taken: [draft()] });
    const update = vi.fn();
    (f.raw.landingPage as unknown as Record<string, unknown>).updateMany = update;
    await applyPages(deps(f.db), { apply: true, only: ['albetchu'] });
    expect(update).not.toHaveBeenCalled();
    expect(f.pages[0].sections).toBe(oldSections);
  });

  it('NEGATIVE: a published page is never restyled', async () => {
    const f = fake({ taken: [draft({ isPublished: true })] });
    const update = vi.fn();
    (f.raw.landingPage as unknown as Record<string, unknown>).updateMany = update;
    await applyPages(deps(f.db), { apply: true, only: ['albetchu'], restyle: true });
    expect(update).not.toHaveBeenCalled();
  });

  it('NEGATIVE: a form the owner already styled (any look chosen) is left alone', () => {
    const styled = JSON.stringify([{ id: 'f', type: 'form', formStyle: 'card', offerStyle: 'cards' }]);
    expect(restyled(styled)).toBeNull();
    expect(restyled(JSON.stringify([{ id: 'f', type: 'form', offerStyle: 'cards' }]))).toBeNull();
  });

  it('NEGATIVE: unreadable or empty sections change nothing', () => {
    expect(restyled(null)).toBeNull();
    expect(restyled('not json')).toBeNull();
    expect(restyled('{"a":1}')).toBeNull();
  });

  it('NEGATIVE: the update repeats the guard — a page published a moment ago is not overwritten', async () => {
    const f = fake({ taken: [draft()] });
    const update = vi.fn(async (_a: { where: Record<string, unknown> }) => ({ count: 0 }));
    (f.raw.landingPage as unknown as Record<string, unknown>).updateMany = update;
    await applyPages(deps(f.db), { apply: true, only: ['albetchu'], restyle: true });
    expect(update.mock.calls[0][0].where).toMatchObject({ isPublished: false });
  });

  it('running it again changes nothing — the look is on the page now', () => {
    const once = restyled(oldSections)!;
    expect(restyled(once)).toBeNull();
  });
});

describe('the product’s name above the posters', () => {
  const item = CATALOG[0];
  const title = { name: item.pageName, line: item.strip };

  it('is the FIRST block of a new page: the name as its title, in a display face, with the line the posters carry beneath', () => {
    const sections = sectionsFor(['/p/1.webp'], title);
    expect(landingSectionsSchema.safeParse(sections).success).toBe(true);
    expect(sections[0]).toMatchObject({
      id: TITLE_ID, type: 'text', title: item.pageName, body: item.strip,
      look: { text: { font: 'messiri', scale: 'l', weight: 'bold' } },
    });
    expect(sections[1].type).toBe('gallery');
  });

  it('and the pages the script creates all open with their own product’s name', async () => {
    const { db, pages } = fake();
    await applyPages(deps(db), { apply: true });
    for (const c of CATALOG) {
      const first = JSON.parse(pages.find((p) => p.slug === c.slug)!.sections)[0];
      expect(first, c.key).toMatchObject({ id: TITLE_ID, type: 'text', title: c.pageName });
    }
  });

  it('every product of the catalogue makes a valid titled page, and the name is its own', () => {
    for (const c of CATALOG) {
      const sections = sectionsFor(['/p/1.webp'], { name: c.pageName, line: c.strip });
      expect(landingSectionsSchema.safeParse(sections).success, c.key).toBe(true);
      expect(sections[0]).toMatchObject({ title: c.pageName });
    }
  });

  it('without a title the page is what it was (the posters first)', () => {
    expect(sectionsFor(['/p/1.webp'])[0].type).toBe('gallery');
  });

  it('--restyle puts it in front of an existing draft — once', () => {
    const old = JSON.stringify([{ id: 'g', type: 'gallery', images: ['/a'], layout: 'stack' }, { id: 'f', type: 'form', formStyle: 'compact', offerStyle: 'radio' }]);
    const once = restyled(old, title)!;
    expect(JSON.parse(once)[0]).toMatchObject({ id: TITLE_ID, title: item.pageName });
    expect(JSON.parse(once)).toHaveLength(3);
    expect(restyled(once, title)).toBeNull();
  });

  it('NEGATIVE: a page that already has it (or whose owner removed everything but the form look) is not given a second', () => {
    const has = JSON.stringify([{ id: TITLE_ID, type: 'text' }, { id: 'f', type: 'form', formStyle: 'card', offerStyle: 'cards' }]);
    expect(restyled(has, title)).toBeNull();
  });

  it('NEGATIVE: without a title to put, nothing is added to a page whose form is already styled', () => {
    const styled = JSON.stringify([{ id: 'f', type: 'form', formStyle: 'card', offerStyle: 'cards' }]);
    expect(restyled(styled)).toBeNull();
  });
});
