import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A COUNTRY'S CURRENCY IS CORRECTABLE — UNTIL IT HAS MONEY IN IT.
 *
 * It could be set only at creation (and the entry screen's own table gave
 * LYD and TND two decimals instead of three). Now it can be corrected in
 * the country panel, until the first order: after that every order, fee
 * and statement is written in it.
 */

const { db } = vi.hoisted(() => ({
  db: { country: { findFirst: vi.fn(), update: vi.fn() }, order: { count: vi.fn() } },
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: async () => ({ user: { id: 'u1' }, companyId: 'c1' }) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));

import { PATCH } from './route';

const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'k1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  db.country.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    where.id === 'k1' ? { id: 'k1', code: 'LY', currencyCode: 'LYD', minorUnit: 2 } : null
  );
  db.country.update.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'k1', ...(data as object) }));
});

describe('correcting the currency', () => {
  it('is allowed while the country has no orders', async () => {
    db.order.count.mockResolvedValue(0);
    const res = await patch({ minorUnit: 3 });
    expect(res.status).toBe(200);
    expect(db.country.update).toHaveBeenCalledWith(expect.objectContaining({ data: { minorUnit: 3 } }));
  });

  it('is refused once an order exists — the money already counted would be relabelled', async () => {
    db.order.count.mockResolvedValue(4);
    for (const body of [{ minorUnit: 3 }, { currencyCode: 'USD' }, { currencyCode: 'USD', minorUnit: 2 }]) {
      const res = await patch(body);
      expect(res.status).toBe(409);
    }
    expect(db.country.update).not.toHaveBeenCalled();
    expect(db.order.count.mock.calls[0][0].where).toEqual({ companyId: 'c1', countryId: 'k1' });
  });

  it('other settings never ask about orders', async () => {
    await patch({ orderPrefix: 'LY' });
    expect(db.order.count).not.toHaveBeenCalled();
    expect(db.country.update).toHaveBeenCalled();
  });

  it('sending the SAME currency is not a change', async () => {
    await patch({ currencyCode: 'LYD', minorUnit: 2 });
    expect(db.order.count).not.toHaveBeenCalled();
  });
});
