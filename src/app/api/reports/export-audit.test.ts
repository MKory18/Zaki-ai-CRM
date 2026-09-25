import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TEN THOUSAND NAMES AND PHONE NUMBERS CAN LEAVE IN ONE CLICK.
 *
 * The CSV is the largest door in the system: it carries every customer's
 * name and raw phone number, up to ten thousand rows, straight into a
 * file on a personal phone. The permission was checked and the rate was
 * limited, and then nothing anywhere recorded that it had happened — so
 * "who took the customer list" had no answer, and asking the question was
 * pointless.
 *
 * The second half of this file is the harder rule: the record of the
 * export must not itself become a copy of the export.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: { order: { count: vi.fn(), findMany: vi.fn() } },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: vi.fn(() => true),
  getPermissionScope: vi.fn(() => ({ scope: 'ALL' })),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { GET } from './export/route';

const CUSTOMER = { fullName: 'سلمى عبد الله', rawPhone: '0790000000', phone: '962790000000', city: 'إربد' };

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    companyId: 'c1',
    storeId: 's1',
    user: { id: 'u1', role: 'ADMIN', status: 'ACTIVE', permissions: [] },
  });
  requirePermission.mockResolvedValue(undefined);
  db.order.count.mockResolvedValue(3);
  db.order.findMany.mockResolvedValue([
    { orderNumber: 'SY-2026-0001', createdAt: new Date(), customer: CUSTOMER, quantity: 1, sellingPrice: 10, totalAmount: 10, status: 'NEW', source: 'MANUAL' },
  ]);
});

/** A fresh query string per call so the shared rate limiter is not the thing under test. */
let n = 0;
const run = (extra = '') => GET(new Request(`http://localhost/api/reports/export?from=2026-09-01&to=2026-09-20&_=${n++}${extra}`));

describe('an export leaves a mark', () => {
  it('records that one happened, with who and how many', async () => {
    await run();
    expect(logAudit).toHaveBeenCalledTimes(1);
    const row = logAudit.mock.calls[0][0];
    expect(row.action).toBe('ORDERS_EXPORTED');
    expect(row.userId).toBe('u1');
    expect(row.companyId).toBe('c1');
    expect(row.newData.rows).toBe(3);
  });

  it('and says which window and which filters, so an odd one is recognisable', async () => {
    await run('&status=DELIVERED&courierId=cour-1');
    const { newData } = logAudit.mock.calls[0][0];
    expect(newData.from).toBeTruthy();
    expect(newData.to).toBeTruthy();
    expect(newData.filters.status).toBe('DELIVERED');
    expect(newData.filters.courierId).toBe('cour-1');
  });

  it('still hands over the file — the record is not a gate', async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SY-2026-0001');
  });
});

/**
 * THE GUARDS.
 */
describe('the record is not a second copy of what left', () => {
  it('contains no customer name, phone or city', async () => {
    await run();
    const serialised = JSON.stringify(logAudit.mock.calls[0][0]);
    expect(serialised).not.toContain(CUSTOMER.fullName);
    expect(serialised).not.toContain(CUSTOMER.rawPhone);
    expect(serialised).not.toContain(CUSTOMER.phone);
    expect(serialised).not.toContain(CUSTOMER.city);
  });

  it('and no order rows at all, however the export grows', async () => {
    await run();
    const { newData } = logAudit.mock.calls[0][0];
    // A count and a description of the query. Never the answer to it.
    expect(Object.keys(newData).sort()).toEqual(['filters', 'from', 'handPicked', 'rows', 'to', 'withContact']);
  });

  it('writes nothing when the export is refused for being too large', async () => {
    db.order.count.mockResolvedValue(10_001);
    const res = await run();
    expect(res.status).toBe(400);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('and nothing when the permission is missing — it never gets that far', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden'));
    await run();
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
