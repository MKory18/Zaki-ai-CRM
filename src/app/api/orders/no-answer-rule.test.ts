import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The 1/2/3 no-answer rule: the third no-answer closes the order under its
 * own distinct reason — it is never recorded as a customer rejection.
 */

const { db, requireContext, assertOrderAccess, logAudit } = vi.hoisted(() => ({
  db: {
    orderContactAttempt: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    order: { update: vi.fn() },
    orderStatusLog: { create: vi.fn() },
    orderNote: { create: vi.fn() },
    orderItem: { updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(db)),
  },
  requireContext: vi.fn(),
  assertOrderAccess: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('./db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/rbac', () => ({ assertOrderAccess: (...a: unknown[]) => assertOrderAccess(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/authorization', () => ({ can: () => true, authorize: () => ({ allowed: true }) }));

import { POST } from '@/app/api/orders/[id]/contact-attempts/route';

const params = { params: Promise.resolve({ id: 'o1' }) };
const attempt = (result: string) =>
  new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactMethod: 'PHONE', result }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'Agent', role: 'CONFIRMATION_AGENT', status: 'ACTIVE' },
    companyId: 'c1', storeId: 's1',
  });
  assertOrderAccess.mockResolvedValue({
    allowed: true,
    order: { id: 'o1', confirmationStatus: 'IN_PROGRESS', nextFollowUpAt: null, followUpStatus: null },
  });
  db.orderContactAttempt.findFirst.mockResolvedValue({ attemptNumber: 1 });
  db.orderContactAttempt.create.mockResolvedValue({ id: 'a1', attemptNumber: 2 });
  db.orderItem.updateMany.mockResolvedValue({ count: 0 });
});

describe('no-answer counter', () => {
  it('leaves the order open on the second no-answer', async () => {
    db.orderContactAttempt.count.mockResolvedValue(2);
    const res = await POST(attempt('NO_ANSWER'), params);
    const data = await res.json();
    expect(data.autoClosed).toBe(false);
    expect(data.noAnswerCount).toBe(2);
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it('closes the order on the third, with its own reason and no commission', async () => {
    db.orderContactAttempt.count.mockResolvedValue(3);
    const res = await POST(attempt('NO_ANSWER'), params);
    const data = await res.json();
    expect(data.autoClosed).toBe(true);

    const update = db.order.update.mock.calls[0][0].data;
    expect(update.rejectionReason).toBe('NO_ANSWER_3_ATTEMPTS');
    expect(update.confirmationStatus).toBe('CANCELLED');
    expect(update.moderatorCommission).toBe(0);
    // The reservation is released in the same transaction.
    expect(db.orderItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: 'o1', reservedQty: { gt: 0 } } })
    );
  });

  it('does not close on an answered call, whatever the count', async () => {
    db.orderContactAttempt.count.mockResolvedValue(5);
    const res = await POST(attempt('ANSWERED'), params);
    expect((await res.json()).autoClosed).toBe(false);
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it('never re-closes an order that already reached a terminal status', async () => {
    assertOrderAccess.mockResolvedValue({
      allowed: true,
      order: { id: 'o1', confirmationStatus: 'CONFIRMED', nextFollowUpAt: null, followUpStatus: null },
    });
    db.orderContactAttempt.count.mockResolvedValue(4);
    const res = await POST(attempt('NO_ANSWER'), params);
    expect((await res.json()).autoClosed).toBe(false);
    expect(db.order.update).not.toHaveBeenCalled();
  });
});
