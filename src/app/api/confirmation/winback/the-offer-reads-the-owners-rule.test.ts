import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE OFFER ENFORCES THE SAME RULE THE LIST DRAWS BY.
 *
 * «شو القاعدة تبعو لاني ممكن اعدلها». The rule is the owner's now, and there
 * are two doors that read it: the list (which orders to show) and the offer
 * (whether one may be made, and for how much). A rule the list obeyed and the
 * offer did not would be a screen that promised «حتى 10٪» and a button that
 * gave 25 — so the offer re-takes the verdict, with the stored rule, at the
 * moment of the press (a row that was eligible when the screen loaded may not
 * be now).
 *
 * The money itself — the lines, `computeCod`, the order number — is held by
 * `winback-lines.test.ts` and is not touched: what changes is only WHETHER and
 * how much, never HOW it is computed.
 */

const { db, requireContext, requirePermission, logAudit, orderRefFields, stored } = vi.hoisted(() => {
  const db = {
    order: { findFirst: vi.fn(), create: vi.fn() },
    orderItem: { findMany: vi.fn(), createMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    orderStatusLog: { findFirst: vi.fn(), findMany: vi.fn() },
    orderNote: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return {
    db,
    requireContext: vi.fn(),
    requirePermission: vi.fn(),
    logAudit: vi.fn(),
    orderRefFields: vi.fn(),
    /** What `Company.settings.winback` holds right now — a claim sets it before it presses. */
    stored: { rule: null as unknown, asked: [] as string[] },
  };
});

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a), can: () => true }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/order-ref', () => ({ orderRefFields: (...a: unknown[]) => orderRefFields(...a) }));
vi.mock('@/lib/pii-alert', () => ({ noteCustomersHandedOut: vi.fn() }));
vi.mock('@/lib/winback-rule', async () => {
  const { parseWinbackRule } = await import('@/lib/winback');
  return {
    winbackRule: async (companyId: string) => {
      stored.asked.push(companyId);
      return parseWinbackRule(stored.rule);
    },
    saveWinbackRule: vi.fn(),
  };
});

import { POST } from './route';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const DAY = 86_400_000;
const user = { id: 'u-sup', name: 'مشرفة', role: 'CONFIRMATION_SUPERVISOR', status: 'ACTIVE' };
const ctx = {
  user,
  companyId: 'c1',
  storeId: 's1',
  countryId: 'co1',
  country: { id: 'co1', code: 'JO', currencyCode: 'JOD', minorUnit: 3, orderPrefix: 'ORD', allowNegativeStock: false },
};

/** ORD-2026-0052 of the measured database: 3 × 12.00, subtotal 36, nothing given yet. */
const source = (over: Record<string, unknown> = {}) => ({
  id: SOURCE_ID,
  orderNumber: 'ORD-2026-0052',
  confirmationStatus: 'REJECTED',
  rejectionReason: 'PRICE_TOO_HIGH',
  rejectionNote: null,
  shippedAt: null,
  replacedBy: null,
  replaces: null,
  createdAt: new Date(Date.now() - 50 * DAY),
  countryId: 'co1',
  storeId: 's1',
  regionId: 'r1',
  customerId: 'cust-1',
  productId: 'prod-1',
  offerId: 'off-1',
  quantity: 3,
  freeQuantity: 0,
  sellingPrice: 36,
  discountAmount: 0,
  shippingCost: 0,
  totalAmount: 36,
  currency: 'JOD',
  priceIncludesDelivery: false,
  productNameSnapshot: 'سكراب',
  productImageSnapshot: null,
  moderatorId: 'mod-1',
  estimatedCostOfGoods: 12.6,
  source: 'TikTok',
  customerNotes: null,
  ...over,
});

const offer = (discount: number) =>
  POST(
    new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: SOURCE_ID, discount }),
    })
  );
const refusal = async (res: Response) => ({ status: res.status, ...(await res.json()) });

beforeEach(() => {
  vi.clearAllMocks();
  stored.rule = null;
  stored.asked = [];
  requireContext.mockResolvedValue(ctx);
  requirePermission.mockResolvedValue(user);
  db.order.findFirst.mockResolvedValue(source());
  // Rejected forty days ago: past the default fortnight, inside a month.
  db.orderStatusLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 40 * DAY) });
  db.orderItem.findMany.mockResolvedValue([{ productId: 'prod-1', productName: 'سكراب', quantity: 3, freeQuantity: 0, unitPrice: 12 }]);
  orderRefFields.mockResolvedValue({ orderNumber: 'ORD-2026-0057', merchantRef: 'ORD-2026-0057' });
  db.order.create.mockImplementation(async () => ({ id: 'new-order', orderNumber: 'ORD-2026-0057' }));
  db.orderItem.createMany.mockResolvedValue({ count: 1 });
  db.orderNote.create.mockResolvedValue({});
});

const nothingMade = () => expect(db.order.create).not.toHaveBeenCalled();

describe('the ceiling is the rule’s share', () => {
  it('— by default a quarter of 36: 9 is allowed, 9.01 is not, and the refusal names the ceiling', async () => {
    expect((await offer(9)).status).toBe(200);
    db.order.create.mockClear();
    const r = await refusal(await offer(9.01));
    expect(r).toMatchObject({ status: 400, code: 'DISCOUNT_TOO_LARGE', maxDiscount: 9 });
    nothingMade();
  });

  it('and a tenth means 3.6: the same discount the default allowed is now refused', async () => {
    stored.rule = { maxDiscountShare: 0.1 };
    const r = await refusal(await offer(5));
    expect(r).toMatchObject({ status: 400, code: 'DISCOUNT_TOO_LARGE', maxDiscount: 3.6 });
    nothingMade();
    expect((await offer(3.6)).status).toBe(200);
  });

  it('and half means 18', async () => {
    stored.rule = { maxDiscountShare: 0.5 };
    expect((await offer(18)).status).toBe(200);
    db.order.create.mockClear();
    expect((await offer(18.01)).status).toBe(400);
  });

  it('and nothing means a second call with NO discount: 0 is allowed, anything more is not', async () => {
    stored.rule = { maxDiscountShare: 0 };
    expect((await offer(0)).status).toBe(200);
    db.order.create.mockClear();
    expect(await refusal(await offer(0.5))).toMatchObject({ status: 400, maxDiscount: 0 });
    nothingMade();
  });

  it('and what was already given still counts against it — the rule’s share, less the carried discount', async () => {
    stored.rule = { maxDiscountShare: 0.5 };
    db.order.findFirst.mockResolvedValue(source({ discountAmount: 10 }));
    expect(await refusal(await offer(8.5))).toMatchObject({ status: 400, maxDiscount: 8 });
  });
});

describe('the cooling is the rule’s', () => {
  it('— sixty days: an order lost forty days ago is still cooling, and the refusal says sixty', async () => {
    stored.rule = { coolingDays: 60 };
    const r = await refusal(await offer(5));
    expect(r).toMatchObject({ status: 409, code: 'COOLING' });
    expect(r.error).toContain('60');
    nothingMade();
  });

  it('and thirty days: the same order is past it, and the offer is made', async () => {
    stored.rule = { coolingDays: 30 };
    expect((await offer(5)).status).toBe(200);
  });

  it('and the default is still a fortnight', async () => {
    db.orderStatusLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 13 * DAY) });
    expect(await refusal(await offer(5))).toMatchObject({ status: 409, code: 'COOLING' });
    db.orderStatusLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 15 * DAY) });
    expect((await offer(5)).status).toBe(200);
  });
});

describe('the reasons are the rule’s', () => {
  it('— «سبب آخر» is not called by default, and is once the owner switches it on', async () => {
    db.order.findFirst.mockResolvedValue(source({ rejectionReason: 'OTHER' }));
    expect(await refusal(await offer(5))).toMatchObject({ status: 409, code: 'REASON_NOT_WINBACK' });
    nothingMade();
    stored.rule = { reasons: ['PRICE_TOO_HIGH', 'OTHER'] };
    expect((await offer(5)).status).toBe(200);
  });

  it('and a reason the owner switched OFF is refused at the door, though the screen listed it a minute ago', async () => {
    stored.rule = { reasons: ['CUSTOMER_CHANGED_MIND'] };
    expect(await refusal(await offer(5))).toMatchObject({ status: 409, code: 'REASON_NOT_WINBACK' });
  });

  it.each(['DUPLICATE_ORDER', 'WRONG_NUMBER', 'FAKE_ORDER', 'MODERATOR_DATA_ERROR'])('— «%s» is refused whatever is stored', async (reason) => {
    db.order.findFirst.mockResolvedValue(source({ rejectionReason: reason }));
    // Even a document stored by hand that lists it: the reader drops it, and the verdict would refuse it anyway.
    stored.rule = { reasons: [reason, 'PRICE_TOO_HIGH', 'OTHER'] };
    expect(await refusal(await offer(5))).toMatchObject({ status: 409, code: 'REASON_NOT_WINBACK' });
    nothingMade();
  });

  it('and a shipped parcel, an order already offered and a second chance stay refused under any rule', async () => {
    stored.rule = { reasons: ['PRICE_TOO_HIGH', 'OTHER', 'CUSTOMER_DOES_NOT_WANT_PRODUCT', 'OUT_OF_SERVICE_AREA'], coolingDays: 1, maxDiscountShare: 0.5 };
    db.order.findFirst.mockResolvedValue(source({ shippedAt: new Date() }));
    expect(await refusal(await offer(1))).toMatchObject({ status: 409, code: 'ALREADY_SHIPPED' });
    db.order.findFirst.mockResolvedValue(source({ replacedBy: { orderNumber: 'ORD-9' } }));
    expect(await refusal(await offer(1))).toMatchObject({ status: 409, code: 'ALREADY_OFFERED' });
    db.order.findFirst.mockResolvedValue(source({ replaces: { orderNumber: 'ORD-1' } }));
    expect(await refusal(await offer(1))).toMatchObject({ status: 409, code: 'ALREADY_A_SECOND_CHANCE' });
    nothingMade();
  });
});

describe('the look-back is the rule’s — and now the offer has one', () => {
  it('— an order the screen would never have listed (made 200 days ago) is refused by default: «TOO_OLD»', async () => {
    db.order.findFirst.mockResolvedValue(source({ createdAt: new Date(Date.now() - 200 * DAY) }));
    const r = await refusal(await offer(5));
    expect(r).toMatchObject({ status: 409, code: 'TOO_OLD' });
    expect(r.error).toContain('120');
    nothingMade();
  });

  it('and the owner who reads further back may make it: a look-back of 365 admits it', async () => {
    db.order.findFirst.mockResolvedValue(source({ createdAt: new Date(Date.now() - 200 * DAY) }));
    stored.rule = { lookbackDays: 365 };
    expect((await offer(5)).status).toBe(200);
  });
});

describe('and it is the same reader as the list', () => {
  it('— the offer asks for the rule of the company the context names', async () => {
    await offer(5);
    expect(stored.asked).toEqual(['c1']);
  });

  it('and both doors read the rule through the one function, never a constant of their own', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/confirmation/winback/route.ts'), 'utf8');
    expect((route.match(/winbackRule\(companyId\)/g) ?? []).length).toBe(2); // the list, and the offer
    expect(route).not.toMatch(/WINBACK_COOLING_DAYS|WINBACK_MAX_DISCOUNT_SHARE|LOOKBACK_DAYS\s*=/);
    expect(route).toContain('winbackVerdict(');
    expect(route).toContain('rule.maxDiscountShare');
  });
});
