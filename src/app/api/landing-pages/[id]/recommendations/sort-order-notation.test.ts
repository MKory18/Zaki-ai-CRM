import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE UPSELL'S POSITION — THE SAME HABIT, THE SAME TWO DOORS.
 *
 * Both recommendation doors declared
 * `sortOrder: z.coerce.number().int().min(0).max(999)`, and
 * `z.coerce.number()` IS `Number()`: `'0x10'` → 16, `''`/`null`/`[]` → 0,
 * `true` → 1, `['5']` → 5.
 *
 * Harmless on this column — it reorders what a shopper is offered and
 * nothing is counted from it. Changed so that `z.coerce.number()` is not the
 * shape the next developer copies out of this file onto a column that holds
 * money, which is exactly how the base-price defect of 9f15044 got there.
 *
 * The window 0…999 does not move, so none of these tests claims it did.
 * Each asserts THE ROW HANDED TO PRISMA before the status code.
 */

const { db } = vi.hoisted(() => ({
  db: {
    landingPage: { findFirst: vi.fn() },
    product: { findFirst: vi.fn() },
    landingPageRecommendation: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({
  requireContext: async () => ({ user: { id: 'admin' }, companyId: 'c1', storeId: 's1' }),
}));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));

import { POST } from './route';
import { PATCH } from './[recId]/route';

const PRODUCT = '22222222-2222-4222-8222-222222222222';

const post = (body: unknown) =>
  POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'lp1' }),
  });

const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'lp1', recId: 'rec1' }),
  });

const created = () => db.landingPageRecommendation.create.mock.calls.map((c) => c[0].data.sortOrder);
const updated = () => db.landingPageRecommendation.update.mock.calls.map((c) => c[0].data.sortOrder);

beforeEach(() => {
  vi.clearAllMocks();
  db.landingPage.findFirst.mockResolvedValue({ id: 'lp1' });
  db.product.findFirst.mockResolvedValue({ id: PRODUCT });
  db.landingPageRecommendation.findFirst.mockResolvedValue({ id: 'rec1', sortOrder: 5, isActive: true });
  db.landingPageRecommendation.create.mockResolvedValue({ id: 'rec-new' });
  db.landingPageRecommendation.update.mockResolvedValue({ id: 'rec1' });
});

const PREFIXED = [
  ['0x10', 16],
  ['0b11', 3],
  ['0o17', 15],
] as const;

describe('adding an upsell: a position written in another notation is refused', () => {
  it.each(PREFIXED)('refuses «%s», which Number() reads as %i', async (typed, wouldStore) => {
    expect(Number(typed), 'the hazard is measured at the door, not remembered').toBe(wouldStore);
    const res = await post({ productId: PRODUCT, sortOrder: typed });
    expect(
      created(),
      `«${typed}» was handed to Prisma as a position; Number() reads it as ${wouldStore}`
    ).toEqual([]);
    expect(res.status).toBe(400);
  });

  it("refuses the empty box, though Number('') is 0", async () => {
    expect(Number('')).toBe(0);
    const res = await post({ productId: PRODUCT, sortOrder: '' });
    expect(created()).toEqual([]);
    expect(res.status).toBe(400);
  });

  it('refuses null, though Number(null) is 0', async () => {
    expect(Number(null)).toBe(0);
    const res = await post({ productId: PRODUCT, sortOrder: null });
    expect(created()).toEqual([]);
    expect(res.status).toBe(400);
  });

  it('refuses true, though Number(true) is 1', async () => {
    expect(Number(true)).toBe(1);
    const res = await post({ productId: PRODUCT, sortOrder: true });
    expect(created()).toEqual([]);
    expect(res.status).toBe(400);
  });

  it('refuses before the product is even looked up — nothing is asked of the database', async () => {
    const res = await post({ productId: PRODUCT, sortOrder: '0x10' });
    expect(res.status).toBe(400);
    expect(db.product.findFirst).not.toHaveBeenCalled();
    expect(db.landingPageRecommendation.create).not.toHaveBeenCalled();
  });

  it('stores the position that was typed, and a numeric string from a form', async () => {
    expect((await post({ productId: PRODUCT, sortOrder: 4 })).status).toBe(201);
    expect(created()).toEqual([4]);
    db.landingPageRecommendation.create.mockClear();
    expect((await post({ productId: PRODUCT, sortOrder: '4' })).status).toBe(201);
    expect(created()).toEqual([4]);
  });

  it('keeps the default of zero when no position was sent at all', async () => {
    const res = await post({ productId: PRODUCT });
    expect(res.status).toBe(201);
    expect(created()).toEqual([0]);
  });

  it('keeps the window it always had: 999 stores, 1000 does not', async () => {
    expect((await post({ productId: PRODUCT, sortOrder: 999 })).status).toBe(201);
    expect(created()).toEqual([999]);
    db.landingPageRecommendation.create.mockClear();
    expect((await post({ productId: PRODUCT, sortOrder: 1000 })).status).toBe(400);
    expect(created()).toEqual([]);
  });
});

describe('reordering an upsell: the stored position survives a bad one', () => {
  it.each(PREFIXED)('refuses «%s» rather than overwriting 5 with %i', async (typed, wouldStore) => {
    expect(Number(typed)).toBe(wouldStore);
    const res = await patch({ sortOrder: typed });
    expect(
      updated(),
      `the stored 5 would have been overwritten; Number() reads «${typed}» as ${wouldStore}`
    ).toEqual([]);
    expect(res.status).toBe(400);
  });

  it('writes the position that was typed', async () => {
    const res = await patch({ sortOrder: 1 });
    expect(res.status).toBe(200);
    expect(updated()).toEqual([1]);
  });

  /**
   * dad59c9's defect, on this door: `.default()` surviving a PATCH turns «I
   * did not send sortOrder» into «put it at the top». The field is
   * `.optional()` with no default, so an un-sent position stays absent.
   */
  it('sends no sortOrder at all when the request never mentions it', async () => {
    const res = await patch({ isActive: false });
    expect(res.status).toBe(200);
    expect(db.landingPageRecommendation.update.mock.calls[0][0].data).not.toHaveProperty('sortOrder');
  });

  it('refuses before the recommendation row is even looked up', async () => {
    const res = await patch({ sortOrder: '0x10' });
    expect(res.status).toBe(400);
    expect(db.landingPageRecommendation.findFirst).not.toHaveBeenCalled();
    expect(db.landingPageRecommendation.update).not.toHaveBeenCalled();
  });
});
