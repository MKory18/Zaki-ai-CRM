import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE OWNER'S PRESS IS THE ONLY THING THAT SWITCHES A STORE.
 *
 * The catalogue rule: a store with at least one published shown page
 * offers the products those pages sell, and nothing else. The owner
 * approved it on one condition — «الكتالوج ما بصير يفضى» — and the thing
 * that keeps that condition is «اعرض كل الصفحات المنشورة»: ONE press, ONE
 * `updateMany`, so every page appears in the same moment the rule starts
 * reading them and the shop is never empty in between.
 *
 * ── THE HOLE THAT WAS IN IT ──
 *
 * The create route set `showInStore: !!productId`. One `!!`, and the
 * FIRST new page carrying a product switched the whole store on its own —
 * no press, no warning. And because it was then the only shown page, a
 * shop with twenty products in its window came back showing one. The
 * seller did it to themselves by pressing «صفحة جديدة».
 *
 * So the question is not «does this page sell something» but «has this
 * store already switched», and BOTH answers matter:
 *
 *   NOT SWITCHED → hidden. Nothing moves until the press.
 *   SWITCHED     → shown. The mirror bug is a product invisible in its
 *                  own shop until somebody finds a toggle.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db, standDownRedirectsTo } = vi.hoisted(() => ({
  db: {
    landingPage: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    product: { findFirst: vi.fn() },
  },
  standDownRedirectsTo: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({
  requireContext: async () => ({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' }),
}));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));
vi.mock('@/lib/store-redirects', () => ({ standDownRedirectsTo }));

import { POST } from './route';

/** A real uuid: the schema takes nothing else, and a rejected body never reaches the decision. */
const PRODUCT = '11111111-1111-4111-8111-111111111111';

const create = (body: Record<string, unknown> = {}) =>
  POST(
    new Request('http://localhost/api/landing-pages', {
      method: 'POST',
      body: JSON.stringify({ name: 'صفحة', slug: 'page-1', ...body }),
    })
  );

/** What the route actually wrote for this page. */
const written = () => db.landingPage.create.mock.calls[0][0].data as Record<string, unknown>;

/** How many published shown pages this store has — i.e. has it switched. */
const storeHasShownPages = (n: number) => db.landingPage.count.mockResolvedValue(n);

beforeEach(() => {
  vi.clearAllMocks();
  db.landingPage.findFirst.mockResolvedValue(null); // the slug is free
  db.product.findFirst.mockResolvedValue({ id: PRODUCT }); // the product is this store's
  db.landingPage.create.mockImplementation(async ({ data }: { data: { slug: string } }) => ({
    id: 'lp1',
    slug: data.slug,
  }));
  storeHasShownPages(0);
});

describe('a new page in a store that has not switched', () => {
  it('starts hidden, even though it sells a product', async () => {
    storeHasShownPages(0);
    await create({ productId: PRODUCT });
    expect(
      written().showInStore,
      'صفحةٌ جديدة بدّلت كتالوج المتجر كلّه بلا ضغطة من المالك'
    ).toBe(false);
  });

  it('and the shop keeps the catalogue it had — the page did not switch it', async () => {
    storeHasShownPages(0);
    await create({ productId: PRODUCT });
    // `storeShelf` switches on the first shown page. A new page that
    // starts hidden leaves that count at zero, so every listing in the
    // system still reads what it read yesterday.
    expect(written().showInStore).toBe(false);
    expect(written()).toMatchObject({ companyId: 'c1', storeId: 's1', productId: PRODUCT });
  });
});

describe('a new page in a store that has already switched', () => {
  it('starts shown, so its product is not invisible in its own shop', async () => {
    storeHasShownPages(3);
    await create({ productId: PRODUCT });
    expect(
      written().showInStore,
      'منتجٌ مخفيٌّ في متجرٍ بدّل كتالوجه — ينتظر أن يجدَ أحدٌ المفتاح'
    ).toBe(true);
  });

  it('but a page selling nothing is still a campaign page', async () => {
    // Reachable by its link and nowhere else — the whole point of the
    // flag. A switched store does not drag campaign pages into its window.
    storeHasShownPages(3);
    await create({});
    expect(written().showInStore).toBe(false);
  });
});

describe('the question the route asks before it decides', () => {
  it('is «has THIS store a published shown page», and nothing wider', async () => {
    storeHasShownPages(0);
    await create({ productId: PRODUCT });

    expect(db.landingPage.count).toHaveBeenCalledWith({
      where: { companyId: 'c1', storeId: 's1', isPublished: true, showInStore: true },
    });
  });

  it('and it asks about the store as it stands, before this page joins it', async () => {
    /*
     * Read BEFORE the create. Asking afterwards would count the page being
     * created — if the write happened to land first it would answer about
     * itself, and every new page would switch its own store again.
     */
    storeHasShownPages(0);
    await create({ productId: PRODUCT });

    const countOrder = db.landingPage.count.mock.invocationCallOrder[0];
    const createOrder = db.landingPage.create.mock.invocationCallOrder[0];
    expect(countOrder, 'سُئلَ السؤالُ بعد الكتابة').toBeLessThan(createOrder);
  });
});
