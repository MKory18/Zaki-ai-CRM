import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A public landing-page order always lands in the page's store; no store, no order. */

const { db } = vi.hoisted(() => ({
  db: {
    landingPage: { findFirst: vi.fn() },
    customer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/db', () => ({ db }));

import { POST } from '@/app/api/public/landing-pages/[slug]/orders/route';

const body = { full_name: 'أحمد علي', phone: '0933123456', address: 'شارع الثورة بناء 5', city: 'دمشق' };
const call = () =>
  POST(
    new Request('http://localhost/api/public/landing-pages/offer-1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.9' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug: 'offer-1' }) }
  );

beforeEach(() => vi.clearAllMocks());

describe('public landing order — store binding', () => {
  it('a published page without a store refuses the order (409) and creates nothing', async () => {
    db.landingPage.findFirst.mockResolvedValue({
      id: 'lp1', companyId: 'c1', productId: 'p1', store: null,
      company: { id: 'c1', currency: 'SYP' },
      product: { id: 'p1', basePrice: 10, name: 'x', image: null },
    });
    const res = await call();
    expect(res.status).toBe(409);
    expect(db.customer.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
