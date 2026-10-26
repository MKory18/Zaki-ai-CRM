import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The three new doors of the campaigns screen — the dragged order, the bulk delete, «حذف المكرر» — and the one rule
 * they all keep: no order ever loses the campaign it came from.
 */

const { db, tx, requireContext, requirePermission, logAudit } = vi.hoisted(() => {
  const tx = {
    order: { updateMany: vi.fn(async () => ({ count: 7 })) },
    campaign: { update: vi.fn(), delete: vi.fn() },
  };
  return {
    tx,
    db: {
      campaign: { findMany: vi.fn(), update: vi.fn((a: unknown) => a), updateMany: vi.fn((a: unknown) => a), deleteMany: vi.fn((a: unknown) => a) },
      $transaction: vi.fn(async (arg: unknown) => (typeof arg === 'function' ? (arg as (t: unknown) => unknown)(tx) : arg)),
    },
    requireContext: vi.fn(async () => ({ user: { id: 'u1' }, companyId: 'co', storeId: 'st' })),
    requirePermission: vi.fn(async () => undefined),
    logAudit: vi.fn(),
  };
});
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext }));
vi.mock('@/lib/authorization', () => ({ requirePermission }));
vi.mock('@/lib/audit', () => ({ logAudit }));
vi.mock('@/lib/api-error', () => ({ apiErrorResponse: (e: Error) => new Response(e.message, { status: 500 }) }));

import { POST as order } from './order/route';
import { POST as bulk } from './bulk/route';
import { POST as duplicates } from './duplicates/route';

const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const post = (h: (r: Request) => Promise<Response>, body: unknown) =>
  h(new Request('http://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => vi.clearAllMocks());

describe('the dragged order', () => {
  it('position i becomes sortOrder i, all in one transaction', async () => {
    db.campaign.findMany.mockResolvedValue([{ id: U(1) }, { id: U(2) }, { id: U(3) }]);
    const res = await post(order, { ids: [U(3), U(1), U(2)] });
    expect(res.status).toBe(200);
    expect(db.campaign.update.mock.calls.map((c: any[]) => [c[0].where.id, c[0].data.sortOrder])).toEqual([[U(3), 0], [U(1), 1], [U(2), 2]]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('NEGATIVE: an id that is not this store’s refuses the whole request — nothing is half-applied', async () => {
    db.campaign.findMany.mockResolvedValue([{ id: U(1) }]);
    const res = await post(order, { ids: [U(1), U(2)] });
    expect(res.status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('the bulk delete', () => {
  it('a campaign with orders is ENDED, one without is deleted — by the single delete’s rule', async () => {
    db.campaign.findMany.mockResolvedValue([
      { id: U(1), name: 'جابت', _count: { orders: 4 } },
      { id: U(2), name: 'ما جابت', _count: { orders: 0 } },
    ]);
    const body = await (await post(bulk, { action: 'delete', ids: [U(1), U(2)] })).json();
    expect(body).toMatchObject({ deleted: 1, ended: 1 });
    expect(db.campaign.updateMany).toHaveBeenCalledWith({ where: { id: { in: [U(1)] } }, data: { status: 'ENDED' } });
    expect(db.campaign.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [U(2)] } } });
  });

  it('NEGATIVE: only this store’s campaigns are looked up', async () => {
    db.campaign.findMany.mockResolvedValue([]);
    await post(bulk, { action: 'delete', ids: [U(1)] });
    expect(db.campaign.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'co', storeId: 'st' });
  });
});

describe('«حذف المكرر»', () => {
  const store = [
    { id: U(1), name: 'كمأة سايت 1', externalId: null, productId: 'prod', landingPageId: null },
    { id: U(2), name: 'كمأة  سايت 1', externalId: 'ext-2', productId: null, landingPageId: null },
    { id: U(3), name: 'ندبات', externalId: null, productId: null, landingPageId: null },
  ];

  it('moves the old copy’s orders to the platform twin, gives the twin its product, then removes the copy', async () => {
    db.campaign.findMany.mockResolvedValue(store);
    const body = await (await post(duplicates, {})).json();
    expect(body).toMatchObject({ merged: 1, ordersMoved: 7 });
    expect(tx.order.updateMany).toHaveBeenCalledWith({ where: { companyId: 'co', campaignId: U(1) }, data: { campaignId: U(2) } });
    expect(tx.campaign.update).toHaveBeenCalledWith({ where: { id: U(2) }, data: { productId: 'prod', landingPageId: null } });
    expect(tx.campaign.delete).toHaveBeenCalledWith({ where: { id: U(1) } });
  });

  it('NEGATIVE: the orders move BEFORE the copy is removed, in the same transaction', async () => {
    db.campaign.findMany.mockResolvedValue(store);
    await post(duplicates, {});
    const moved = tx.order.updateMany.mock.invocationCallOrder[0];
    const removed = tx.campaign.delete.mock.invocationCallOrder[0];
    expect(moved).toBeLessThan(removed);
  });

  it('NEGATIVE: a campaign with no twin is never touched, and the request cannot name pairs of its own', async () => {
    db.campaign.findMany.mockResolvedValue(store);
    const body = await (await post(duplicates, { ids: [U(3)] })).json();
    expect(body).toMatchObject({ merged: 0, ordersMoved: 0 });
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('a twin that already says what it sells keeps it', async () => {
    db.campaign.findMany.mockResolvedValue([store[0], { ...store[1], productId: 'own' }]);
    await post(duplicates, {});
    expect(tx.campaign.update).not.toHaveBeenCalled();
  });
});
