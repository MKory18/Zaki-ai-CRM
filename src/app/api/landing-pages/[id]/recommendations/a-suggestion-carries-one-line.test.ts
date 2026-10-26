import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «وصف بسيط للمنتجات بالكروس سيل». The seller's one line for a suggestion,
 * through the two doors that write a suggestion — asserted on THE ROW HANDED
 * TO PRISMA, not on the status code.
 */

const { db } = vi.hoisted(() => ({
  db: {
    landingPage: { findFirst: vi.fn() },
    product: { findFirst: vi.fn() },
    landingPageRecommendation: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/landing-cache', () => ({ refreshLandingPages: async () => undefined }));
vi.mock('@/lib/geo-context', () => ({
  requireContext: async () => ({ user: { id: 'admin' }, companyId: 'c1', storeId: 's1' }),
}));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));

import { POST } from './route';
import { PATCH } from './[recId]/route';

const PRODUCT = '22222222-2222-4222-8222-222222222222';
const post = (body: unknown) =>
  POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'lp1' }) });
const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'lp1', recId: 'rec1' }),
  });
const createdRow = () => db.landingPageRecommendation.create.mock.calls[0]?.[0].data;
const updatedRow = () => db.landingPageRecommendation.update.mock.calls[0]?.[0].data;

beforeEach(() => {
  vi.clearAllMocks();
  db.landingPage.findFirst.mockResolvedValue({ id: 'lp1' });
  db.product.findFirst.mockResolvedValue({ id: PRODUCT });
  db.landingPageRecommendation.findFirst.mockResolvedValue({ id: 'rec1' });
  db.landingPageRecommendation.create.mockResolvedValue({ id: 'rec-new' });
  db.landingPageRecommendation.update.mockResolvedValue({ id: 'rec1' });
});

describe('adding a suggestion', () => {
  it('keeps the seller’s line, trimmed', async () => {
    expect((await post({ productId: PRODUCT, blurb: '  بيخلّي شعرك ناعم  ' })).status).toBe(201);
    expect(createdRow().blurb).toBe('بيخلّي شعرك ناعم');
  });

  it('no line, or a blank one, is stored as none — the description speaks instead', async () => {
    await post({ productId: PRODUCT });
    await post({ productId: PRODUCT, blurb: '   ' });
    expect(db.landingPageRecommendation.create.mock.calls.map((c) => c[0].data.blurb)).toEqual([null, null]);
  });

  it('NEGATIVE: a paragraph is not a line', async () => {
    const res = await post({ productId: PRODUCT, blurb: 'ا'.repeat(141) });
    expect(res.status).toBe(400);
    expect(db.landingPageRecommendation.create).not.toHaveBeenCalled();
  });
});

describe('editing one', () => {
  it('writes the new line', async () => {
    await patch({ blurb: 'جرّبه مع طلبك' });
    expect(updatedRow()).toEqual({ blurb: 'جرّبه مع طلبك' });
  });

  it('a blank line clears it back to the description', async () => {
    await patch({ blurb: '' });
    expect(updatedRow()).toEqual({ blurb: null });
  });

  it('NEGATIVE: an edit that does not mention the line leaves it alone', async () => {
    await patch({ isActive: false });
    expect(updatedRow()).toEqual({ isActive: false });
    expect('blurb' in updatedRow()).toBe(false);
  });
});
