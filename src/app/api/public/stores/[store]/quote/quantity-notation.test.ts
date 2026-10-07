import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * HOW MANY, ON A PUBLIC DOOR — AND WHETHER THE ORDER DOOR AGREES.
 *
 * This door read `Math.trunc(Number(r.quantity))`, and `Number()` is open:
 * `'0x10'` → 16, `true` → 1, `['5']` → 5.
 *
 * THE WORRY WORTH NAMING, AND THE ANSWER. 81f1cdd made this door quote the
 * same money the order door charges, so a quantity read differently here
 * would be a quote that does not match the sale. Checked, not assumed: at
 * 9f15044 the order door read the SAME field as
 * `z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY)`
 * (`lib/landing-order-schema.ts`), and `z.coerce.number()` IS `Number()` —
 * so on NOTATION the two doors already AGREED, both reading `'0x10'` as 16.
 * The notation defect never produced a quote/sale mismatch; it produced the
 * same wrong figure at both ends. Both doors read strictly now, so the
 * agreement holds in the other direction, and the last block below runs the
 * order door's REAL schema so that stays measured rather than remembered.
 *
 * WHERE THEY STILL DISAGREE is the edge, and it is deliberate on this side:
 * asked 150, this door clamps and prices 99 while the order door answers
 * 400; asked 2.5, this door prices 2 while `.int()` answers 400. Clamping
 * follows the rule `numeric-input.ts` writes down — this door WRITES
 * NOTHING and reports the figure it used in `lines[].quantity`, so the
 * shopper can see what they are being quoted for. Closing the gap means
 * changing the order door's schema, which is not this file.
 */

const { db, getStorefront } = vi.hoisted(() => ({
  db: {
    product: { findMany: vi.fn() },
    offer: { findMany: vi.fn() },
    order: { groupBy: vi.fn(async () => []) },
    country: { findUnique: vi.fn() },
  },
  getStorefront: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/storefront', () => ({ getStorefront: (...a: unknown[]) => getStorefront(...a) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true }), getClientIp: () => '1.1.1.1' }));

import { POST } from './route';
import { MAX_LINE_QUANTITY } from '@/lib/cart';
import { buildPublicOrderSchema } from '@/lib/landing-order-schema';

const P = { id: 'p-a', name: 'منتج أ', image: null, basePrice: 10 };

const quote = (items: unknown[]) =>
  POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ items }) }), {
    params: Promise.resolve({ store: 'sehha' }),
  });

const priced = async (items: unknown[]) => {
  const res = await quote(items);
  const json = (await res.json()) as {
    lines: { productId: string; quantity: number }[];
    subtotal: number;
    pieces: number;
  };
  expect(res.status, JSON.stringify(json)).toBe(200);
  return json;
};

beforeEach(() => {
  vi.clearAllMocks();
  getStorefront.mockResolvedValue({
    id: 'store-a',
    slug: 'sehha',
    companyId: 'c1',
    countryId: 'jo',
    currencyCode: 'JOD',
  });
  db.product.findMany.mockResolvedValue([P]);
  db.offer.findMany.mockImplementation(async () => []);
  db.order.groupBy.mockResolvedValue([]);
  db.country.findUnique.mockResolvedValue({ currencyCode: 'JOD', minorUnit: 3 });
});

describe('a count written in another notation is dropped, not priced', () => {
  const PREFIXED = [
    ['0x10', 16],
    ['0X10', 16],
    ['0b11', 3],
    ['0o17', 15],
  ] as const;

  it.each(PREFIXED)('«%s» no longer becomes a basket of %i', async (typed, wouldPrice) => {
    expect(Number(typed), 'the hazard is measured at the door, not remembered').toBe(wouldPrice);
    const q = await priced([{ productId: P.id, quantity: typed }]);
    expect(
      q.lines.map((l) => l.quantity),
      `«${typed}» would have been quoted as ${wouldPrice} pieces at ${wouldPrice * P.basePrice}`
    ).toEqual([]);
    expect(q.subtotal).toBe(0);
    expect(q.pieces).toBe(0);
    // Dropped, not refused: this door's own contract is that an empty basket
    // is an empty basket, not an error.
    expect(q.lines).toEqual([]);
  });

  it('true no longer becomes one of something', async () => {
    expect(Number(true)).toBe(1);
    const q = await priced([{ productId: P.id, quantity: true }]);
    expect(q.lines.map((l) => l.quantity)).toEqual([]);
    expect(q.subtotal).toBe(0);
  });

  it("a one-element array no longer becomes five, though Number(['5']) is 5", async () => {
    expect(Number(['5'])).toBe(5);
    const q = await priced([{ productId: P.id, quantity: ['5'] }]);
    expect(q.lines.map((l) => l.quantity)).toEqual([]);
  });

  it('an Arabic-Indic numeral is dropped, as it always was', async () => {
    expect(Number('٣')).toBeNaN();
    const q = await priced([{ productId: P.id, quantity: '٣' }]);
    expect(q.lines).toEqual([]);
  });

  it('one bad line does not take the good ones with it', async () => {
    db.product.findMany.mockResolvedValue([P, { ...P, id: 'p-b', name: 'منتج ب' }]);
    const q = await priced([
      { productId: P.id, quantity: '0x10' },
      { productId: 'p-b', quantity: 2 },
    ]);
    expect(q.lines.map((l) => [l.productId, l.quantity])).toEqual([['p-b', 2]]);
  });
});

describe('what a real cart sends is untouched', () => {
  it('prices a number', async () => {
    const q = await priced([{ productId: P.id, quantity: 3 }]);
    expect(q.lines.map((l) => l.quantity)).toEqual([3]);
    expect(q.subtotal).toBe(30);
  });

  it('prices a numeric string', async () => {
    const q = await priced([{ productId: P.id, quantity: '3' }]);
    expect(q.lines.map((l) => l.quantity)).toEqual([3]);
  });

  it('still truncates a fraction rather than dropping the line', async () => {
    const q = await priced([{ productId: P.id, quantity: 2.7 }]);
    expect(q.lines.map((l) => l.quantity)).toEqual([2]);
  });

  it('still clamps above the cap rather than dropping the line — and REPORTS the clamp', async () => {
    const q = await priced([{ productId: P.id, quantity: 150 }]);
    expect(q.lines.map((l) => l.quantity)).toEqual([MAX_LINE_QUANTITY]);
    // The clamped figure comes back in the answer, which is the whole reason
    // clamping is allowed here and refused on a price.
    expect(q.pieces).toBe(MAX_LINE_QUANTITY);
  });

  it('drops a zero or a negative, as it always did', async () => {
    expect((await priced([{ productId: P.id, quantity: 0 }])).lines).toEqual([]);
    expect((await priced([{ productId: P.id, quantity: -2 }])).lines).toEqual([]);
  });
});

/**
 * THE TWO DOORS, SIDE BY SIDE, ON THE SAME STRINGS.
 *
 * The order door's REAL schema is built and run here, so «do they read the
 * same field the same way» is a fact in the suite rather than a claim in a
 * comment — which is the exact failure 81f1cdd had to come back and fix.
 */
describe('the quote door and the order door, on the same quantity', () => {
  /** `z.coerce.number()` as the order door used to spell it, at 9f15044. */
  const asItWas = z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY);

  const orderReads = (quantity: unknown) => {
    const parsed = buildPublicOrderSchema({ countryCode: 'JO', regions: [] }).safeParse({
      full_name: 'سارة علي',
      phone: '0791234567',
      address: 'عمّان، الدوّار السابع',
      city: 'عمّان',
      items: [{ productId: P.id, quantity }],
    });
    if (!parsed.success) return 'REFUSED';
    return parsed.data.items?.[0].quantity;
  };

  it('both doors read a plain count the same way', () => {
    expect(orderReads(3)).toBe(3);
    expect(orderReads('3')).toBe(3);
  });

  it('the order door AS IT STOOD also read «0x10» as 16 — notation was never a quote/sale mismatch', () => {
    const was = asItWas.safeParse('0x10');
    expect(
      was.success && was.data,
      'z.coerce.number() is Number(): the old order door agreed with the old quote door, at 16'
    ).toBe(16);
  });

  it('and the order door refuses it now too, so the two agree strictly', () => {
    expect(orderReads('0x10')).toBe('REFUSED');
  });

  it('here is where they still differ, deliberately: this door clamps where the order door refuses', () => {
    expect(orderReads(150)).toBe('REFUSED');
    expect(orderReads(2.5)).toBe('REFUSED');
    expect(orderReads(0)).toBe('REFUSED');
  });
});
