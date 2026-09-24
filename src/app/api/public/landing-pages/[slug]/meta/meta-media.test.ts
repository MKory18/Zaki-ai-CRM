import { describe, expect, it, vi } from 'vitest';

/**
 * THE EMBED'S DESCRIPTION OF A PAGE GIVES A PHOTO A VISITOR CAN LOAD.
 *
 * The form embedded on a seller's own site reads this answer; its visitors
 * have no session, so a private /api/media link was a broken image.
 */

const CO = 'e4fcc15a-05de-48e5-80d9-37bfd191adae';
const LP = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const FILE = '77fca75e-9831-4147-b8ef-9431e970e963.webp';

const { db } = vi.hoisted(() => ({ db: { landingPage: { findFirst: vi.fn() } } }));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/selling-currency', () => ({ sellingCurrency: async () => 'SYP', SELLING_STORE_SELECT: {} }));

import { GET } from './route';

describe('the product photo', () => {
  it('is a public link naming the page', async () => {
    db.landingPage.findFirst.mockResolvedValue({
      id: LP, name: 'عرض', slug: 'offer', productId: PRODUCT, companyId: CO, company: { name: 'ش' }, store: null,
      product: { name: 'كريم', nameEn: null, basePrice: 10, image: `/api/media/companies/${CO}/products/${PRODUCT}/${FILE}` },
    });
    const body = await (await GET(new Request('http://localhost/x'), { params: Promise.resolve({ slug: 'offer' }) })).json();
    expect(body.product.image).toBe(`/api/public/media/${LP}/${PRODUCT}/${FILE}`);
  });
});
