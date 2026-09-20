import { beforeEach, describe, expect, it, vi } from 'vitest';

/** One merged history: every event table in one chronological list. */

const { db } = vi.hoisted(() => ({
  db: {
    orderStatusLog: { findMany: vi.fn() },
    orderClaimHistory: { findMany: vi.fn() },
    orderContactAttempt: { findMany: vi.fn() },
    deliveryAttempt: { findMany: vi.fn() },
    orderNote: { findMany: vi.fn() },
    orderActivity: { findMany: vi.fn() },
    orderChangeRequest: { findMany: vi.fn() },
    orderIssue: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { orderTimeline } from './order-timeline';

const at = (iso: string) => new Date(iso);

beforeEach(() => {
  vi.clearAllMocks();
  for (const table of [
    db.orderStatusLog, db.orderClaimHistory, db.orderContactAttempt, db.deliveryAttempt,
    db.orderNote, db.orderActivity, db.orderChangeRequest, db.orderIssue,
  ]) {
    table.findMany.mockResolvedValue([]);
  }
  db.user.findMany.mockResolvedValue([{ id: 'u1', name: 'سارة' }]);
});

describe('orderTimeline', () => {
  it('merges every source and sorts oldest first', async () => {
    db.orderStatusLog.findMany.mockResolvedValue([
      { id: 's1', createdAt: at('2026-09-02T10:00:00Z'), statusType: 'CONFIRMATION', previousValue: 'NEW', newValue: 'CONFIRMED', changedById: 'u1', note: null },
    ]);
    db.orderClaimHistory.findMany.mockResolvedValue([
      { id: 'c1', createdAt: at('2026-09-01T10:00:00Z'), action: 'CLAIMED', userId: 'u1', reason: 'PULL_NEXT' },
    ]);
    db.orderContactAttempt.findMany.mockResolvedValue([
      { id: 't1', createdAt: at('2026-09-01T11:00:00Z'), attemptNumber: 1, contactMethod: 'PHONE', result: 'ANSWERED', employeeId: 'u1', note: null },
    ]);
    db.orderNote.findMany.mockResolvedValue([
      { id: 'n1', createdAt: at('2026-09-03T09:00:00Z'), kind: 'follow_up', body: 'العميل طلب التأجيل', authorId: 'u1' },
    ]);

    const events = await orderTimeline(db as never, 'o1');
    expect(events.map((e) => e.kind)).toEqual(['OWNERSHIP', 'CONTACT', 'STATUS', 'NOTE']);
    expect(events[0].actorName).toBe('سارة');
    expect(events[2].title).toContain('CONFIRMED');
  });

  it('does not repeat a status change that the activity log also holds', async () => {
    db.orderStatusLog.findMany.mockResolvedValue([
      { id: 's1', createdAt: at('2026-09-02T10:00:00Z'), statusType: 'SHIPPING', previousValue: 'NOT_READY', newValue: 'SHIPPED', changedById: 'u1', note: null },
    ]);
    db.orderActivity.findMany.mockResolvedValue([
      { id: 'a1', createdAt: at('2026-09-02T10:00:00Z'), action: 'STATUS_CHANGED', userId: 'u1', metadata: null },
      { id: 'a2', createdAt: at('2026-09-02T10:05:00Z'), action: 'ORDER_UPDATED', userId: 'u1', metadata: null },
    ]);

    const events = await orderTimeline(db as never, 'o1');
    expect(events.filter((e) => e.kind === 'STATUS')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'ACTIVITY').map((e) => e.title)).toEqual(['ORDER_UPDATED']);
  });

  it('is empty, not broken, for an order with no events', async () => {
    await expect(orderTimeline(db as never, 'o1')).resolves.toEqual([]);
  });
});
