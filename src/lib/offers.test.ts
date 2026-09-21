import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ db: {} }));

import { offerInputSchema, clearOtherDefaults, toOfferView } from './offers';

/**
 * Offers used to exist twice: on the product and again on every landing page.
 * Merging them into one place removes the drift, but it puts every price a
 * customer sees behind this one schema — so the ways it can be wrong are all
 * ways of charging the wrong amount.
 */

describe('what an offer may say', () => {
  it('accepts a bundle with a gift', () => {
    const parsed = offerInputSchema.parse({
      name: 'ثلاث قطع + واحدة هدية',
      quantity: 3,
      freeQuantity: 1,
      sellingPrice: 150,
      compareAtPrice: 240,
    });
    expect(parsed.quantity).toBe(3);
    expect(parsed.freeQuantity).toBe(1);
    expect(parsed.deliveryIncluded).toBe(true);
  });

  it('refuses an offer of nothing', () => {
    expect(offerInputSchema.safeParse({ name: 'x', quantity: 0, sellingPrice: 10 }).success).toBe(false);
  });

  it('refuses a nameless offer, which a customer cannot tell apart', () => {
    expect(offerInputSchema.safeParse({ name: '', quantity: 1, sellingPrice: 10 }).success).toBe(false);
  });

  it('refuses a negative price rather than paying the customer', () => {
    expect(offerInputSchema.safeParse({ name: 'x', quantity: 1, sellingPrice: -5 }).success).toBe(false);
  });

  it('reads numbers that arrive as strings from a form', () => {
    const parsed = offerInputSchema.parse({ name: 'x', quantity: '2', sellingPrice: '35.5' });
    expect(parsed.quantity).toBe(2);
    expect(parsed.sellingPrice).toBe(35.5);
  });

  it('defaults a plain offer to one unit, no gift, active', () => {
    const parsed = offerInputSchema.parse({ name: 'قطعة', sellingPrice: 20 });
    expect(parsed).toMatchObject({ quantity: 1, freeQuantity: 0, discount: 0, status: 'ACTIVE' });
  });
});

describe('the view a customer is shown', () => {
  const base = {
    id: 'o1', name: 'قطعتان', quantity: 2, freeQuantity: 0,
    sellingPrice: 108, compareAtPrice: 120, isDefault: true,
  };

  it('shows the bundle total as the price, never a unit price', () => {
    expect(toOfferView(base).price).toBe(108);
  });

  it('hides a "was" price that is not above the price', () => {
    // 108 was 108 is not a saving; it is a lie with extra steps.
    expect(toOfferView({ ...base, compareAtPrice: 108 }).compareAtPrice).toBeNull();
    expect(toOfferView({ ...base, compareAtPrice: 90 }).compareAtPrice).toBeNull();
    expect(toOfferView({ ...base, compareAtPrice: null }).compareAtPrice).toBeNull();
  });

  it('keeps a genuine "was" price', () => {
    expect(toOfferView(base).compareAtPrice).toBe(120);
  });
});

describe('exactly one default per product', () => {
  const tx = { offer: { updateMany: vi.fn() } } as never;
  beforeEach(() => vi.clearAllMocks());

  it('clears the others when one is made default', async () => {
    await clearOtherDefaults(tx, { id: 'b', productId: 'p1', companyId: 'c1', isDefault: true });
    const args = (tx as any).offer.updateMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ companyId: 'c1', productId: 'p1', isDefault: true });
    expect(args.where.id).toEqual({ not: 'b' });
    expect(args.data).toEqual({ isDefault: false });
  });

  it('touches nothing when the offer is not the default', async () => {
    await clearOtherDefaults(tx, { id: 'b', productId: 'p1', companyId: 'c1', isDefault: false });
    expect((tx as any).offer.updateMany).not.toHaveBeenCalled();
  });

  it('never clears defaults of another product', async () => {
    // Two defaults across products is correct; two within one product means
    // the landing page and the order screen quote different prices.
    await clearOtherDefaults(tx, { id: 'b', productId: 'p1', companyId: 'c1', isDefault: true });
    expect((tx as any).offer.updateMany.mock.calls[0][0].where.productId).toBe('p1');
  });
});
