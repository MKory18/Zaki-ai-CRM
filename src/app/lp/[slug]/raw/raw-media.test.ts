import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE UPLOADED-HTML PAGE SHOWS ITS IMAGES.
 *
 * It is served into a sandboxed frame on an opaque origin, which sends no
 * cookies — so an image linked through /api/media (in the seller's HTML,
 * their CSS, or a product photo placed by a marker) was broken for everyone,
 * the seller included. Every one goes out as a public link now.
 */

const { db, verifyPreviewToken } = vi.hoisted(() => ({
  db: { landingPage: { findFirst: vi.fn() }, offer: { findMany: vi.fn(async () => []) } },
  verifyPreviewToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/selling-currency', () => ({ sellingCurrency: async () => 'SYP', SELLING_STORE_SELECT: {} }));
vi.mock('@/lib/landing-pages', async (orig) => ({
  ...(await orig<typeof import('@/lib/landing-pages')>()),
  verifyPreviewToken: (...a: unknown[]) => verifyPreviewToken(...a),
}));

import { GET } from './route';

const CO = 'e4fcc15a-05de-48e5-80d9-37bfd191adae';
const LP = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const FILE = '77fca75e-9831-4147-b8ef-9431e970e963.webp';
const privateUrl = (owner: string) => `/api/media/companies/${CO}/products/${owner}/${FILE}`;

const page = {
  id: LP, name: 'عرض', slug: 'offer', companyId: CO, productId: PRODUCT, store: null, pageSettings: null,
  htmlContent: `<html><head></head><body><img src="${privateUrl(LP)}"><img src="{{product.image}}"></body></html>`,
  cssContent: `.hero{background:url(${privateUrl(LP)})}`,
  product: { name: 'كريم', nameEn: null, image: privateUrl(PRODUCT), description: null, basePrice: 10 },
  recommendations: [],
};

const get = (query = '') =>
  GET(new Request(`http://localhost/lp/offer/raw${query}`), { params: Promise.resolve({ slug: 'offer' }) });

beforeEach(() => {
  vi.clearAllMocks();
  db.landingPage.findFirst.mockResolvedValue(page);
  verifyPreviewToken.mockResolvedValue(null);
});

describe('the served page', () => {
  it('links every stored image publicly — HTML, CSS and the product photo', async () => {
    const html = await (await get()).text();
    expect(html).not.toContain('/api/media/');
    expect(html).toContain(`/api/public/media/${LP}/${LP}/${FILE}`);
    expect(html).toContain(`url(/api/public/media/${LP}/${LP}/${FILE})`);
  });

  it('a preview carries its token on the images of the draft', async () => {
    verifyPreviewToken.mockResolvedValue({ lpId: LP });
    const html = await (await get('?p=tok')).text();
    expect(html).toContain(`/api/public/media/${LP}/${LP}/${FILE}?p=tok`);
  });

  it('an invalid token is no preview — no token is passed on', async () => {
    const html = await (await get('?p=forged')).text();
    expect(html).not.toContain('?p=forged');
  });
});
