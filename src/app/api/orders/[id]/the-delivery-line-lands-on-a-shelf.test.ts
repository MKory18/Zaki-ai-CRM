import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LEGACY DELIVERY DOOR WROTE A SALE INTO NO STORE.
 *
 * `PATCH /api/orders/[id]` with `status: 'DELIVERED'` deducts the units from
 * the oldest batch with stock left and writes one `InventoryMovement` of type
 * `SALE` beside it. That row carried no `storeId`.
 *
 * `/api/inventory/movements` and the ledger block in `/api/inventory` filter
 * the movement itself with `inStore(companyId, storeId)` — an EXACT match
 * (`src/lib/store-filter.ts`), which a NULL can never satisfy. So the batch
 * was decremented, the customer had the goods, and the line explaining the
 * balance came back from no store's query.
 *
 * WHERE THE STORE COMES FROM, AND WHY IT IS NOT A CHOICE:
 * `requireContext()` throws `STORE_REQUIRED` rather than returning a null
 * store, and `assertOrderAccess` (`src/lib/rbac.ts`) refuses this request
 * with a 404 unless `order.storeId === scope.storeId`. So by the time the
 * write runs, `existing.storeId` and the context `storeId` are the same
 * non-null value — proven by a guard the request has already passed, not
 * assumed. The test below pins both halves of that: the value written, and
 * that an order of another store never reaches the write at all.
 *
 * ASSERTED BY VALUE, and against the real read filter.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { db, requireContext, assertOrderAccess, authorize, can, getPermissionScope, logAudit, notify } =
  vi.hoisted(() => ({
    db: {
      order: { updateMany: vi.fn(), findUnique: vi.fn() },
      customer: { update: vi.fn() },
      productionBatch: { findFirst: vi.fn(), update: vi.fn() },
      inventoryMovement: { create: vi.fn() },
      orderStatusLog: { create: vi.fn() },
      orderActivity: { create: vi.fn() },
      $transaction: vi.fn(),
    },
    requireContext: vi.fn(),
    assertOrderAccess: vi.fn(),
    authorize: vi.fn(),
    can: vi.fn(),
    getPermissionScope: vi.fn(),
    logAudit: vi.fn(),
    notify: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/notify', () => ({ notify: (...a: unknown[]) => notify(...a) }));
vi.mock('@/lib/pii-alert', () => ({ noteCustomersHandedOut: vi.fn() }));
vi.mock('@/lib/rbac', () => ({
  assertOrderAccess: (...a: unknown[]) => assertOrderAccess(...a),
  assertOrderReadable: vi.fn(),
  orderVisibilityWhere: () => ({}),
  ORDER_ACCESS_STATUS: { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 404 },
}));
vi.mock('@/lib/authorization', () => ({
  authorize: (...a: unknown[]) => authorize(...a),
  can: (...a: unknown[]) => can(...a),
  getPermissionScope: (...a: unknown[]) => getPermissionScope(...a),
}));

import { PATCH } from './route';
/** The real filter the ledger screens use — not a restatement of it. */
import { inStore } from '@/lib/store-filter';

const ORDER = 'o-1';
const PRODUCT = 'p-cream';
const BATCH = 'b-mubarak';
const MUBARAK = 's-mubarak';
const SIHHA = 's-sihha';

/** An order of المبارك ستور, shipped and awaiting delivery. */
const orderRow = (storeId: string | null) => ({
  id: ORDER,
  orderNumber: 'ORD-1',
  companyId: 'c1',
  storeId,
  countryId: 'co1',
  customerId: 'cust-1',
  productId: PRODUCT,
  productNameSnapshot: 'كريم',
  quantity: 3,
  version: 7,
  status: 'SHIPPED',
  confirmationStatus: 'CONFIRMED',
  shippingStatus: 'SHIPPED',
  settlementStatus: 'PENDING_COLLECTION',
  shippedAt: new Date('2026-10-01'),
  deliveredAt: null,
  confirmedAt: new Date('2026-09-30'),
  totalAmount: 120,
  moderatorId: 'u2',
  lockedById: null,
  lockExpiresAt: null,
  assignedToId: 'u1',
  claimedById: 'u1',
  currentOwnerId: 'u1',
});

const deliver = (body: Record<string, unknown> = {}) =>
  PATCH(
    new Request(`http://localhost/api/orders/${ORDER}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // A company-wide-scope edit on somebody else's order demands a written
      // reason (`REASON_REQUIRED`), which is a separate rule from this one.
      body: JSON.stringify({
        status: 'DELIVERED',
        expectedVersion: 7,
        reason: 'تأكيد التسليم من المندوب',
        ...body,
      }),
    }),
    { params: Promise.resolve({ id: ORDER }) } as never
  );

/** The SALE row exactly as it reached Prisma. */
const saleRow = () => db.inventoryMovement.create.mock.calls[0][0].data as Record<string, unknown>;

/** `inStore`'s own shapes, applied for real rather than described. */
function matchesWhere(row: Record<string, unknown>, where: Record<string, any>): boolean {
  for (const [key, want] of Object.entries(where)) {
    if (want && typeof want === 'object' && Array.isArray(want.in)) {
      if (!want.in.includes(row[key])) return false;
    } else if (row[key] !== want) {
      return false;
    }
  }
  return true;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'سامر', role: 'MANAGER' },
    companyId: 'c1',
    storeId: MUBARAK,
    countryId: 'co1',
    country: { id: 'co1', code: 'SY', currencyCode: 'SYP', minorUnit: 2, allowNegativeStock: false },
  });
  assertOrderAccess.mockResolvedValue({ allowed: true, order: orderRow(MUBARAK) });
  authorize.mockReturnValue({ allowed: true });
  can.mockReturnValue(true);
  getPermissionScope.mockReturnValue({ scope: 'ALL_COMPANY' });
  logAudit.mockResolvedValue(undefined);
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.order.findUnique.mockResolvedValue(orderRow(MUBARAK));
  db.customer.update.mockResolvedValue({});
  db.productionBatch.findFirst.mockResolvedValue({ id: BATCH, quantityRemaining: 40, quantitySold: 0 });
  db.productionBatch.update.mockResolvedValue({});
  db.inventoryMovement.create.mockImplementation(async ({ data }: any) => ({ id: 'm1', ...data }));
  db.orderStatusLog.create.mockResolvedValue({});
  db.orderActivity.create.mockResolvedValue({});
});

describe('the legacy delivery door files its SALE on the order’s own shelf', () => {
  it('writes the order’s store onto the movement — the value, not the word', async () => {
    const res = await deliver();
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);

    expect(db.inventoryMovement.create).toHaveBeenCalledTimes(1);
    const row = saleRow();
    // THE VALUE. `undefined` is what this door wrote for as long as the
    // defect existed, and a revert prints exactly that here.
    expect(row.storeId).toBe(MUBARAK);
    expect(row.companyId).toBe('c1');
    expect(row.type).toBe('SALE');
    expect(row.quantity).toBe(-3);
    expect(row.batchId).toBe(BATCH);
    expect(row.referenceId).toBe(ORDER);
    expect(typeof row.storeId).toBe('string');
    expect(row.storeId).not.toBe('');
  });

  it('and that store is the one the access guard already matched the context against', async () => {
    await deliver();
    // `assertOrderAccess(id, user, { companyId, storeId })` returns NOT_FOUND
    // unless `order.storeId === scope.storeId`, so these two are one value.
    const scope = assertOrderAccess.mock.calls[0][2] as { companyId: string; storeId: string };
    expect(scope).toMatchObject({ companyId: 'c1', storeId: MUBARAK });
    expect(saleRow().storeId).toBe(scope.storeId);
  });

  it('and the row it writes is a row the ledger screen returns — before, it was not', async () => {
    await deliver();
    const row = saleRow();

    const mine = inStore('c1', MUBARAK);
    expect(matchesWhere(row, mine)).toBe(true);
    // The row as this door used to write it: the same sale, no shelf. Twenty
    // six of them are on this database.
    expect(matchesWhere({ ...row, storeId: undefined }, mine)).toBe(false);
    expect(matchesWhere({ ...row, storeId: null }, mine)).toBe(false);
    // And it is not handed to another store, which is the same rule working.
    expect(matchesWhere(row, inStore('c1', SIHHA))).toBe(false);
    // Nor to a session with no store selected, answered with the company.
    expect(matchesWhere(row, inStore('c1', null))).toBe(false);
  });

  it('and it follows the order, not a constant', async () => {
    // A session in صحة بلس delivering صحة بلس's order. Both halves move
    // together, because they are the same value.
    requireContext.mockResolvedValue({
      user: { id: 'u1', name: 'سامر', role: 'MANAGER' },
      companyId: 'c1',
      storeId: SIHHA,
      countryId: 'co1',
      country: { id: 'co1', code: 'SY', currencyCode: 'SYP', minorUnit: 2, allowNegativeStock: false },
    });
    assertOrderAccess.mockResolvedValue({ allowed: true, order: orderRow(SIHHA) });
    db.order.findUnique.mockResolvedValue(orderRow(SIHHA));

    await deliver();
    expect(saleRow().storeId).toBe(SIHHA);
    expect(matchesWhere(saleRow(), inStore('c1', SIHHA))).toBe(true);
    expect(matchesWhere(saleRow(), inStore('c1', MUBARAK))).toBe(false);
  });

  it('and an order of another store never reaches the write at all', async () => {
    // Which is why `existing.storeId` has one possible value here: the guard
    // is what makes the context store and the order's store the same fact.
    assertOrderAccess.mockResolvedValue({ allowed: false, reason: 'NOT_FOUND' });
    const res = await deliver();
    expect(res.status).toBe(404);
    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
    expect(db.productionBatch.update).not.toHaveBeenCalled();
  });

  it('and with no batch to draw from, no ledger line is written', async () => {
    // Nothing moved, so nothing is recorded. The store question does not
    // arise, and a row here would describe a deduction that never happened.
    db.productionBatch.findFirst.mockResolvedValue(null);
    expect((await deliver()).status).toBe(200);
    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });
});
