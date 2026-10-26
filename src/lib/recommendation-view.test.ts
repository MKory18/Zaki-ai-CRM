import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({ db: { landingPage: { findMany: vi.fn() } } }));
vi.mock('@/lib/db', () => ({ db }));

import { blurbOf, productPageLinks, shopHasProductPages, type ShopForLinks } from './recommendation-view';

/**
 * «وصف بسيط… او رابط بيثير الفضول لصفحة المنتج او صفحة الهبوط».
 * The line and the link a suggestion carries onto the thank-you screen.
 */

describe('the line', () => {
  it('is the seller’s own when they wrote one', () => {
    expect(blurbOf('  ناعم من أول غسلة ', 'وصف طويل')).toBe('ناعم من أول غسلة');
  });

  it('otherwise the start of the description, cut on a word, without markup', () => {
    const description = `<p>شامبو بزيت الأرغان</p> ${'يغذّي الشعر من الجذور '.repeat(8)}`;
    const line = blurbOf(null, description)!;
    expect(line.startsWith('شامبو بزيت الأرغان يغذّي')).toBe(true);
    expect(line.endsWith('…')).toBe(true);
    expect(line).not.toContain('<');
    expect(line.length).toBeLessThanOrEqual(91);
    expect(line.slice(0, -1).endsWith(' ')).toBe(false);
  });

  it('a short description is read whole', () => {
    expect(blurbOf('', 'شامبو بزيت الأرغان')).toBe('شامبو بزيت الأرغان');
  });

  it('NEGATIVE: nothing to say is nothing said — no invented sentence', () => {
    expect(blurbOf(null, null)).toBeNull();
    expect(blurbOf('   ', '  <br>  ')).toBeNull();
  });
});

const OPEN: ShopForLinks = { slug: 'zaki', storefrontEnabled: true, status: 'ACTIVE', type: 'MULTI_PRODUCT', landingPageId: null };
const products = [
  { id: 'p1', sku: 'SH-1', slug: 'shampoo' },
  { id: 'p2', sku: 'OIL-2', slug: null },
];

describe('the link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com/');
    db.landingPage.findMany.mockResolvedValue([]);
  });

  it('the product’s own published landing page first, absolute, never the page the customer is on', async () => {
    db.landingPage.findMany.mockResolvedValue([
      { productId: 'p1', slug: 'shampoo-new' },
      { productId: 'p1', slug: 'shampoo-old' },
    ]);
    const links = await productPageLinks({ companyId: 'c1', storeId: 's1', exceptPageId: 'lp-here', products, shop: OPEN });
    expect(links.get('p1')).toBe('https://app.example.com/lp/shampoo-new');
    const where = db.landingPage.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: 'c1', storeId: 's1', isPublished: true, id: { not: 'lp-here' } });
  });

  it('else its page in the open shop, by its readable address or its SKU', async () => {
    const links = await productPageLinks({ companyId: 'c1', storeId: 's1', exceptPageId: null, products, shop: OPEN });
    expect(links.get('p1')).toBe('https://app.example.com/s/zaki/p/shampoo');
    expect(links.get('p2')).toBe('https://app.example.com/s/zaki/p/OIL-2');
  });

  it('NEGATIVE: a closed shop, a paused one, or a one-page shop gives no product link — never a dead one', async () => {
    for (const shop of [
      { ...OPEN, storefrontEnabled: false },
      { ...OPEN, status: 'PAUSED' },
      { ...OPEN, type: 'SINGLE_PRODUCT', landingPageId: 'front' },
      null,
    ]) {
      expect(shopHasProductPages(shop)).toBe(false);
      const links = await productPageLinks({ companyId: 'c1', storeId: 's1', exceptPageId: null, products, shop });
      expect(links.size).toBe(0);
    }
  });

  it('NEGATIVE: no suggestions, no query', async () => {
    expect((await productPageLinks({ companyId: 'c1', storeId: 's1', exceptPageId: null, products: [], shop: OPEN })).size).toBe(0);
    expect(db.landingPage.findMany).not.toHaveBeenCalled();
  });
});
