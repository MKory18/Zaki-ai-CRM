import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ db: {} }));

import { offerInputSchema, clearOtherDefaults, liveOfferWhere, toOfferView } from './offers';

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

  /**
   * THE RULE THAT CHANGED. A typed «was» price used to be shown as typed —
   * and the offers screen filled it in from `basePrice × (quantity + free)`,
   * so the saving a customer read was arithmetic about a price the shop had
   * never charged. Evidence now, or nothing.
   */
  it('shows nothing when no delivered order supports it', () => {
    expect(toOfferView(base).compareAtPrice).toBeNull();
    expect(toOfferView(base, undefined).compareAtPrice).toBeNull();
  });

  it('shows the evidenced price when orders support it', () => {
    expect(toOfferView(base, 120).compareAtPrice).toBe(120);
  });

  /** The seller's number is a ceiling. It may be lower; it may never be higher. */
  it('never shows more of a saving than the orders prove', () => {
    expect(toOfferView({ ...base, compareAtPrice: 200 }, 120).compareAtPrice).toBe(120);
  });

  it('honours a claim below the evidence', () => {
    expect(toOfferView({ ...base, compareAtPrice: 115 }, 120).compareAtPrice).toBe(115);
  });

  it('hides a "was" price that is not above the price', () => {
    // 108 was 108 is not a saving; it is a lie with extra steps.
    expect(toOfferView({ ...base, compareAtPrice: 108 }, 108).compareAtPrice).toBeNull();
    expect(toOfferView({ ...base, compareAtPrice: 90 }, 90).compareAtPrice).toBeNull();
  });

  /** A claim with no number at all still shows the evidence. */
  it('needs no claim to show what really happened', () => {
    expect(toOfferView({ ...base, compareAtPrice: null }, 120).compareAtPrice).toBe(120);
  });

  it('carries the ending, so the countdown has one source', () => {
    const ends = new Date('2026-10-01T00:00:00.000Z');
    expect(toOfferView({ ...base, endsAt: ends }).endsAt).toBe(ends);
    expect(toOfferView(base).endsAt).toBeNull();
  });
});

describe('what «on sale right now» means', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');

  /**
   * ONE PREDICATE. Three reads used to spell `status: 'ACTIVE'` themselves —
   * this one and the two in storefront.ts — so adding an ending would have
   * been three edits, and the forgotten one would have gone on selling a
   * bundle that had finished.
   */
  it('is active, and either endless or not yet over', () => {
    expect(liveOfferWhere(now)).toEqual({
      status: 'ACTIVE',
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    });
  });

  it('asks the database, not the page', () => {
    // A finished offer must be unreachable by guessing its id, the same way
    // an inactive one is — so the rule is a `where`, never a filter after.
    expect(Object.keys(liveOfferWhere(now))).toEqual(['status', 'OR']);
  });
});

describe('an ending must be one', () => {
  const ok = { name: 'عرض', sellingPrice: 20 };

  it('accepts no ending at all', () => {
    expect(offerInputSchema.parse(ok).endsAt).toBeUndefined();
  });

  it('accepts an ending', () => {
    const parsed = offerInputSchema.parse({ ...ok, endsAt: '2026-12-31T21:00:00.000Z' });
    expect(parsed.endsAt).toBeInstanceOf(Date);
  });

  it('refuses something that is not a moment', () => {
    expect(offerInputSchema.safeParse({ ...ok, endsAt: 'قريباً' }).success).toBe(false);
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
