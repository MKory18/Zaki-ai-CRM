import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A DELIVERY FEE THAT IS NOT A NUMBER IS REFUSED, NOT MADE FREE.
 *
 * `POST /api/orders/[id]/shipping`, action `update_tracking`, wrote
 *
 *     updateData.deliveryFee = Number(deliveryFee) || 0
 *
 * and this column is not a label. `settlement.ts` deducts it from what the
 * courier owes, `commission.ts` subtracts it before commission, and
 * `agent-custody.ts` carries it into the agent's custody figure. So a fee
 * that arrived as anything but a number was stored as **0** — free delivery
 * — and the courier statement then disagreed with the order by exactly the
 * fee, in the courier's favour, with nothing said to anybody.
 *
 * AND DELETING THE FALLBACK WOULD NOT HAVE BEEN ENOUGH, which is measured
 * rather than assumed. `Order.deliveryFee` is `Float?`, and Prisma ACCEPTS
 * `NaN` for a NULLABLE Float — it lands as NULL, and every reader above
 * spells NULL `?? 0`. Against this database, with an id that matches no row
 * so nothing could be written:
 *
 *     db.order.updateMany({ data: { deliveryFee: NaN } })          → accepted
 *     db.productionBatch.updateMany({ data: { costPerUnit: NaN } })
 *                                      → PrismaClientValidationError
 *
 * The nullable column is the lenient one. So the bare write would have
 * stored the same wrong zero by a longer road, and the only answer that
 * tells anybody anything is a 400.
 *
 * These call the real `POST` and read the `data` it handed Prisma.
 */

const {
  db, requireContext, assertOrderAccess, authorize, can, logAudit, notify,
  consumeOrderStock, emitAppEvent, queueConversions, appendDeliveryAttempt,
} = vi.hoisted(() => ({
  db: {
    order: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    orderStatusLog: { create: vi.fn() },
    orderActivity: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  requireContext: vi.fn(),
  assertOrderAccess: vi.fn(),
  authorize: vi.fn(),
  can: vi.fn(),
  logAudit: vi.fn(),
  notify: vi.fn(),
  consumeOrderStock: vi.fn(),
  emitAppEvent: vi.fn(),
  queueConversions: vi.fn(),
  appendDeliveryAttempt: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/rbac', () => ({
  ORDER_ACCESS_STATUS: { NOT_FOUND: 404, FORBIDDEN: 403 },
  assertOrderAccess: (...a: unknown[]) => assertOrderAccess(...a),
}));
vi.mock('@/lib/authorization', () => ({
  authorize: (...a: unknown[]) => authorize(...a),
  can: (...a: unknown[]) => can(...a),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/notify', () => ({ notify: (...a: unknown[]) => notify(...a) }));
vi.mock('@/lib/stock-consumption', () => ({ consumeOrderStock: (...a: unknown[]) => consumeOrderStock(...a) }));
vi.mock('@/lib/apps/events', () => ({ emitAppEvent: (...a: unknown[]) => emitAppEvent(...a) }));
vi.mock('@/lib/conversions/emit', () => ({ queueConversions: (...a: unknown[]) => queueConversions(...a) }));
vi.mock('@/lib/delivery-attempts', () => ({ appendDeliveryAttempt: (...a: unknown[]) => appendDeliveryAttempt(...a) }));

import { POST } from './[id]/shipping/route';

/** An order still before shipment, so tracking details are editable. */
const ORDER = {
  id: 'o1',
  orderNumber: 'SY-2026-0001',
  shippingStatus: 'PENDING',
  version: 4,
  trackingNumber: null,
  deliveryProviderId: null,
  storeId: 's1',
  lockedById: null,
  lockExpiresAt: null,
  totalAmount: 25_000,
  currency: 'SYP',
  priceIncludesDelivery: false,
};

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/orders/o1/shipping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'o1' }) }
  );

const tracking = (deliveryFee: unknown) =>
  post({ action: 'update_tracking', expectedVersion: 4, deliveryFee });

/** The `data` the order was updated with. */
const saved = () => db.order.updateMany.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', role: 'OPS', name: 'سامر' },
    companyId: 'c1',
    storeId: 's1',
    country: { allowNegativeStock: false, minorUnit: 2 },
  });
  assertOrderAccess.mockResolvedValue({ allowed: true, order: { ...ORDER } });
  authorize.mockReturnValue({ allowed: true });
  can.mockReturnValue(true);
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.order.findUnique.mockResolvedValue({ ...ORDER });
  db.$transaction.mockImplementation(async (fn: any) => fn({ order: db.order }));
});

/** What the old line stored. */
const oldFee = (raw: unknown) => Number(raw) || 0;

describe('what the old line stored for a fee that was not a number', () => {
  it('stored free delivery for every one of these', () => {
    expect(oldFee('abc')).toBe(0);
    expect(oldFee('')).toBe(0);
    expect(oldFee('1,500')).toBe(0); // an Arabic-keyboard thousands separator
    expect(oldFee('3,5')).toBe(0);
    expect(oldFee(null)).toBe(0);
    expect(oldFee({})).toBe(0);
    expect(oldFee([])).toBe(0);
  });

  it('and the settlement arithmetic that zero produced, in money', () => {
    // A parcel collected at 25,000 with a 1,500 delivery fee: what the
    // courier owes is the collection less the fee.
    expect(25_000 - 1_500).toBe(23_500);
    // With the fee stored as the fallback's zero, the same parcel settles at
    // the full collection, and the 1,500 the courier is owed disappears.
    expect(25_000 - oldFee('1,500')).toBe(25_000);
  });
});

describe('the door refuses a fee that is not a fee', () => {
  it('answers 400 naming the field, and writes nothing', async () => {
    for (const bad of ['abc', '1,500', '3,5', '12abc', '0x10', '', '   ', {}, [], true, -1, -0.01]) {
      vi.clearAllMocks();
      assertOrderAccess.mockResolvedValue({ allowed: true, order: { ...ORDER } });
      authorize.mockReturnValue({ allowed: true });
      can.mockReturnValue(true);
      requireContext.mockResolvedValue({
        user: { id: 'u1', role: 'OPS', name: 'سامر' },
        companyId: 'c1',
        storeId: 's1',
        country: { allowNegativeStock: false, minorUnit: 2 },
      });

      const res = await tracking(bad);
      // The value first, so a restored `|| 0` prints `[0]` — free delivery.
      expect(
        db.order.updateMany.mock.calls.map((c: any) => c[0].data.deliveryFee),
        `أجرة «${String(bad)}» كُتبت`
      ).toEqual([]);
      expect(res.status, `أجرة «${String(bad)}»`).toBe(400);
      expect((await res.json()).error, `أجرة «${String(bad)}»`).toContain('رسوم التوصيل');
    }
  });

  it('and the refusal says «write a number», not «you left it empty»', async () => {
    const res = await tracking('abc');
    expect(await res.json()).toMatchObject({ error: 'رسوم التوصيل: اكتبه رقماً بالأرقام' });
  });
});

describe('and every fee that IS a fee is stored exactly as given', () => {
  it('the fee that was typed', async () => {
    expect((await tracking(1500)).status).toBe(200);
    expect(saved().deliveryFee).toBe(1500);
  });

  it('the same fee as a form string', async () => {
    expect((await tracking('1500')).status).toBe(200);
    expect(saved().deliveryFee).toBe(1500);
  });

  it('a fraction of a unit', async () => {
    expect((await tracking(1.5)).status).toBe(200);
    expect(saved().deliveryFee).toBe(1.5);
  });

  it('and a zero, because priceIncludesDelivery makes a zero fee real policy', async () => {
    expect((await tracking(0)).status).toBe(200);
    expect(saved().deliveryFee).toBe(0);
  });

  it('and a null, which is what the column’s own nullability means', async () => {
    // 30 of the 56 live orders hold NULL here: «no fee recorded».
    expect((await tracking(null)).status).toBe(200);
    expect(saved().deliveryFee).toBeNull();
  });

  it('and an absent key leaves the stored fee alone', async () => {
    const res = await post({ action: 'update_tracking', expectedVersion: 4, trackingNumber: 'TRK-9' });
    expect(res.status).toBe(200);
    expect(saved()).not.toHaveProperty('deliveryFee');
    expect(saved().trackingNumber).toBe('TRK-9');
  });
});

describe('and the route no longer carries the fallback', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/api/orders/[id]/shipping/route.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('neither coercing the fee nor falling back to zero', () => {
    expect(src).not.toMatch(/Number\(deliveryFee\)/);
    expect(src).not.toMatch(/deliveryFee[^\n]*\|\|\s*0/);
    // And not swapped for the other operator either, which would read the
    // same and store NULL instead of refusing.
    expect(src).not.toMatch(/deliveryFee[^\n]*\?\?\s*0/);
  });

  it('and reads it with the shared strict reader', () => {
    expect(src).toMatch(/from '@\/lib\/numeric-input'/);
    expect(src).toMatch(/DELIVERY_FEE\.safeParse\(\{ deliveryFee \}\)/);
  });
});
