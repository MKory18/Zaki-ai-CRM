import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DOOR THAT ANSWERS «خلال كم».
 *
 * Thin by design — the arithmetic is `delivery-time.ts` and is guarded in
 * `a-street-is-not-a-governorate`. Two things about the DOOR are not thin:
 *
 *   THE GOVERNORATE'S NAME IS READ FROM THE DATABASE, never taken from the
 *   query. The name is what strips the repeated prefix off a stored address,
 *   so it decides which street the address folds to — a caller who could
 *   supply it could make «عمّان الصويفية» fold to «الصويفية» or to «عمّان
 *   الصويفية» at will, and read a different shop's window out of the same
 *   map by picking the folding.
 *
 *   AND THE REGION IS SCOPED TO THE COMPANY. An id from another company's
 *   country must find nothing and fall back, not name a region.
 *
 *   NOTHING IS AN ANSWER. Below the sample floor the door says so in words
 *   rather than returning a figure the data cannot support.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { db, requireContext } = vi.hoisted(() => ({
  db: { region: { findFirst: vi.fn() }, order: { findMany: vi.fn() } },
  requireContext: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));

import { GET } from './route';

const T0 = new Date('2026-09-01T00:00:00.000Z').getTime();
const took = (days: number, address: string | null) => ({
  regionId: 'r-amman',
  shippedAt: new Date(T0),
  deliveredAt: new Date(T0 + days * 86_400_000),
  customer: address === null ? null : { address },
  region: { name: 'عمّان' },
});
const many = (n: number, f: () => unknown) => Array.from({ length: n }, f);

const ask = (qs: string) =>
  GET(new Request(`http://localhost/api/orders/eta?${qs}`)).then(async (r) => ({
    status: r.status,
    body: await r.json(),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ companyId: 'c1', storeId: 's1' });
  db.region.findFirst.mockResolvedValue({ id: 'r-amman', name: 'عمّان' });
  db.order.findMany.mockResolvedValue([]);
});

describe('the door answers with the finest grain it has', () => {
  it('names the address when the address has been delivered to enough', async () => {
    db.order.findMany.mockResolvedValue([
      ...many(20, () => took(6, 'جبل الحسين')),
      ...many(5, () => took(1, 'الصويفية')),
    ]);
    const { status, body } = await ask('regionId=r-amman&address=الصويفية');
    expect(status).toBe(200);
    expect(body.level).toBe('address');
    expect(body.levelAr).toBe('لهذا العنوان');
    expect(body.window.medianDays).toBe(1);
    expect(body.window.samples).toBe(5);
    expect(body.ar).toContain('يصل عادةً');
  });

  it('and falls back to the governorate for a street it has not learned', async () => {
    db.order.findMany.mockResolvedValue(many(20, () => took(6, 'جبل الحسين')));
    const { body } = await ask('regionId=r-amman&address=شارع لم يُسلَّم إليه قطّ');
    expect(body.level).toBe('region');
    expect(body.window.medianDays).toBe(6);
  });

  it('and says nothing — in words — when the shop has learned nothing', async () => {
    const { status, body } = await ask('regionId=r-amman&address=الصويفية');
    expect(status).toBe(200);
    expect(body.window).toBeNull();
    expect(body.ar).toBeNull();
    expect(body.level).toBeNull();
    expect(body.reason, 'رفضٌ بلا سبب').toContain('كافية');
  });
});

describe('the governorate name is the server’s, not the caller’s', () => {
  it('reads the region row and scopes it to the company', async () => {
    db.order.findMany.mockResolvedValue(many(6, () => took(2, 'الصويفية')));
    await ask('regionId=r-amman&address=الصويفية');
    expect(db.region.findFirst).toHaveBeenCalledTimes(1);
    const where = db.region.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('r-amman');
    /*
     * The company must be IN the filter. Asserted on the serialised shape
     * rather than on a key name, because a `where` that merely mentions
     * `companyId` under a key nothing joins on would satisfy a name check
     * — that exact mistake has been made in this repository before.
     */
    expect(JSON.stringify(where), 'الاستعلامُ غيرُ مقيَّدٍ بالشركة').toContain('"companyId":"c1"');
  });

  it('and a governorate the company cannot see does not name a window', async () => {
    db.region.findFirst.mockResolvedValue(null);
    db.order.findMany.mockResolvedValue([
      ...many(20, () => took(6, 'جبل الحسين')),
      ...many(5, () => took(1, 'الصويفية')),
    ]);
    const { body } = await ask('regionId=r-other-company&address=الصويفية');
    /*
     * Not the region's, not the address's — the country's, which is the
     * only claim that survives not knowing where they live.
     */
    expect(body.level).toBe('country');
  });

  it('and no address asked about gives the governorate, not an address guess', async () => {
    db.order.findMany.mockResolvedValue([
      ...many(20, () => took(6, 'جبل الحسين')),
      ...many(5, () => took(1, 'الصويفية')),
    ]);
    const { body } = await ask('regionId=r-amman');
    expect(body.level).toBe('region');
    expect(body.window.medianDays).toBe(6);
  });

  it('and an empty address is the same as none', async () => {
    db.order.findMany.mockResolvedValue(many(20, () => took(6, 'جبل الحسين')));
    const { body } = await ask('regionId=r-amman&address=%20%20');
    expect(body.level).toBe('region');
  });

  it('and no governorate at all is still answered, from the country', async () => {
    db.order.findMany.mockResolvedValue(many(20, () => took(6, 'جبل الحسين')));
    const { body } = await ask('address=الصويفية');
    expect(db.region.findFirst, 'سأل عن محافظةٍ لم تُطلَب').not.toHaveBeenCalled();
    expect(body.level).toBe('country');
  });
});
