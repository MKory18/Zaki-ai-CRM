import { beforeEach, describe, expect, it, vi } from 'vitest';
import { count, money as amount } from '@/lib/numeric-input';

/**
 * «THE CLIENT-CONFIRMED PAYLOAD IS NEVER TRUSTED WITH RAW VALUES (SAME
 * RULES AS POST /API/ORDERS)» — AND ON NOTATION IT WAS NOT THE SAME RULES.
 *
 * That sentence is this route's own comment, above `confirmSchema`. The
 * schema read
 *
 *     quantity:   z.coerce.number().int().min(1).max(999),
 *     finalPrice: z.coerce.number().min(0).max(100000),
 *
 * while `POST /api/orders` reads the same two columns as `count(999, 1)` and
 * `money(100000)` from `numeric-input`. `z.coerce.number()` IS `Number()`,
 * so the BOUNDS matched and the NOTATION did not: `'0x10'` was sixteen units
 * or sixteen dinars here and a 400 there.
 *
 * This matters more than on an ordinary door, because the payload is round
 * tripped through a browser: the reviewer sees a preview, the modal copies
 * the figures into `parsed`, and `parsed` comes back. Whatever the modal
 * puts in those two fields is what an order is created from.
 *
 * THE ORDER CREATED IS ASSERTED BEFORE THE STATUS.
 */

const {
  db, requireContext, requirePermission, activeBlock, findOrCreateCustomer,
  orderRefFields, productCost, resolveRegionId, logAudit, notify, parseOrderText, matchProduct,
} = vi.hoisted(() => ({
  db: {
    product: { findFirst: vi.fn(), findMany: vi.fn() },
    user: { findFirst: vi.fn() },
    order: { create: vi.fn() },
    orderItem: { create: vi.fn() },
    customer: { update: vi.fn() },
    orderActivity: { create: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  activeBlock: vi.fn(),
  findOrCreateCustomer: vi.fn(),
  orderRefFields: vi.fn(),
  productCost: vi.fn(),
  resolveRegionId: vi.fn(),
  logAudit: vi.fn(),
  notify: vi.fn(),
  parseOrderText: vi.fn(),
  matchProduct: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/blacklist', () => ({ activeBlock: (...a: unknown[]) => activeBlock(...a) }));
vi.mock('@/lib/customer-identity', () => ({
  findOrCreateCustomer: (...a: unknown[]) => findOrCreateCustomer(...a),
}));
vi.mock('@/lib/order-ref', () => ({ orderRefFields: (...a: unknown[]) => orderRefFields(...a) }));
vi.mock('@/lib/product-cost', () => ({ productCost: (...a: unknown[]) => productCost(...a) }));
vi.mock('@/lib/regions', () => ({ resolveRegionId: (...a: unknown[]) => resolveRegionId(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/notify', () => ({ notify: (...a: unknown[]) => notify(...a) }));
vi.mock('@/lib/offers', () => ({ activeOffersFor: vi.fn(async () => []) }));
vi.mock('@/lib/order-parser', () => ({
  parseOrderText: (...a: unknown[]) => parseOrderText(...a),
  matchProduct: (...a: unknown[]) => matchProduct(...a),
  normalizeArabic: (s: string) => s,
}));

import { POST } from './route';

const PRODUCT_ID = 'prod-000000001';

const GOOD = {
  customerName: 'سارة علي',
  phone: '0791234567',
  address: 'عمّان، الدوّار السابع',
  governorate: 'عمّان',
  productId: PRODUCT_ID,
  quantity: 2,
  finalPrice: 25_000,
};

const confirm = (parsed: Record<string, unknown>) =>
  POST(
    new Request('http://localhost/api/orders/ai-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true, parsed: { ...GOOD, ...parsed } }),
    })
  );

/** The `data` of the order that was created — or undefined if none was. */
const created = (): Record<string, any> | undefined => db.order.create.mock.calls[0]?.[0]?.data;

/** One column of it, as a string a failure message can print. */
const stored = (column: string): string | undefined => {
  const v = created()?.[column];
  return v === undefined || v === null ? undefined : String(v);
};

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'هدى', role: 'CONFIRMATION_AGENT' },
    companyId: 'c1',
    storeId: 's1',
    countryId: 'co1',
    country: { id: 'co1', code: 'JO', minorUnit: 2, currencyCode: 'JOD', orderPrefix: 'ORD' },
  });
  requirePermission.mockResolvedValue(undefined);
  activeBlock.mockResolvedValue(null);
  findOrCreateCustomer.mockResolvedValue({ id: 'cu1', city: 'عمّان', firstOrderDate: null });
  db.product.findFirst.mockResolvedValue({
    id: PRODUCT_ID, name: 'كريم مرطّب', image: null, basePrice: 14, batches: [],
  });
  productCost.mockResolvedValue({ average: 7 });
  orderRefFields.mockResolvedValue({ orderNumber: 'ORD-2026-0001' });
  resolveRegionId.mockResolvedValue('r1');
  db.order.create.mockImplementation(async (args: any) => ({ id: 'o1', ...args.data }));
  db.orderItem.create.mockResolvedValue({});
  db.customer.update.mockResolvedValue({});
  db.orderActivity.create.mockResolvedValue({});
});

describe('the confirmed payload, and what the create door would have said to it', () => {
  it('a quantity in a base notation creates no order, where it made one of sixteen', async () => {
    const res = await confirm({ quantity: '0x10' });

    expect(stored('quantity'), 'كميّةٌ ست عشريّةٌ أنشأت طلباً').toBeUndefined();
    expect(created(), 'طلبٌ أُنشِئَ بكميّةٍ لم يَكتُبْها أحد').toBeUndefined();
    expect(res.status).toBe(400);
    // And the create door agrees, which is the whole point of the change.
    expect(count(999, 1).safeParse('0x10').success).toBe(false);
  });

  it('and a price in one creates no order either', async () => {
    const res = await confirm({ finalPrice: '0x10' });

    expect(stored('sellingPrice'), 'سعرٌ ست عشريٌّ صار سعرَ طلب').toBeUndefined();
    expect(created()).toBeUndefined();
    expect(res.status).toBe(400);
    expect(amount(100_000).safeParse('0x10').success).toBe(false);
  });

  it('nor does the binary or the octal one', async () => {
    for (const notation of ['0b11', '0o17', '0X10', '0B11']) {
      vi.clearAllMocks();
      requireContext.mockResolvedValue({
        user: { id: 'u1', name: 'هدى', role: 'CONFIRMATION_AGENT' },
        companyId: 'c1', storeId: 's1', countryId: 'co1',
        country: { id: 'co1', code: 'JO', minorUnit: 2, currencyCode: 'JOD', orderPrefix: 'ORD' },
      });
      requirePermission.mockResolvedValue(undefined);
      const res = await confirm({ quantity: notation });
      expect(stored('quantity'), `«${notation}» → ${Number(notation)} وحدةً`).toBeUndefined();
      expect(res.status, notation).toBe(400);
    }
  });

  it('and a real payload still creates the order with the figures it carried', async () => {
    const res = await confirm({});

    expect(stored('quantity'), 'طلبٌ صحيحٌ لم يُنشَأ').toBe('2');
    expect(stored('sellingPrice')).toBe('25000');
    expect(stored('totalAmount')).toBe('25000');
    expect(res.status).toBe(200);
  });

  it('and a price typed as a form string is still a price', async () => {
    const res = await confirm({ finalPrice: '25000.50' });
    expect(stored('sellingPrice')).toBe('25000.5');
    expect(res.status).toBe(200);
  });

  /**
   * WHAT THIS CHANGE DOES TO THE PENDING DECISION AT `p.finalPrice ||
   * product.basePrice`, WHICH IS NOT TOUCHED HERE.
   *
   * Before: `''`, `null`, `[]`, `false` and `'   '` all arrived as `0`
   * through `z.coerce.number()`, and every one of them fell through the
   * `||` to the base price silently. After: every one of them is a 400, and
   * the ONLY value that can still reach the `||` falsy is a well-formed,
   * deliberate `0`. So the open question narrows from «what should happen
   * when the figure is unreadable» — answered: a 400 — to the single
   * remaining one: «does a reviewer who types 0 mean free, or mean use the
   * base price?». That is the owner's to answer, and it is now the only
   * thing that branch decides.
   */
  it('and the only value that can still reach the base-price fallback is a deliberate zero', async () => {
    for (const value of ['', '   ', null, [], false, true, ['5'], {}]) {
      vi.clearAllMocks();
      requireContext.mockResolvedValue({
        user: { id: 'u1', name: 'هدى', role: 'CONFIRMATION_AGENT' },
        companyId: 'c1', storeId: 's1', countryId: 'co1',
        country: { id: 'co1', code: 'JO', minorUnit: 2, currencyCode: 'JOD', orderPrefix: 'ORD' },
      });
      requirePermission.mockResolvedValue(undefined);
      const res = await confirm({ finalPrice: value });
      expect(created(), `سعرٌ «${String(value)}» أنشأ طلباً`).toBeUndefined();
      expect(res.status, `finalPrice=${String(value)}`).toBe(400);
    }

    // And the zero itself: accepted by the schema, and the branch this test
    // does NOT change then substitutes the base price. Recorded as the
    // CURRENT behaviour so that deciding it is deliberate.
    vi.clearAllMocks();
    requireContext.mockResolvedValue({
      user: { id: 'u1', name: 'هدى', role: 'CONFIRMATION_AGENT' },
      companyId: 'c1', storeId: 's1', countryId: 'co1',
      country: { id: 'co1', code: 'JO', minorUnit: 2, currencyCode: 'JOD', orderPrefix: 'ORD' },
    });
    requirePermission.mockResolvedValue(undefined);
    activeBlock.mockResolvedValue(null);
    findOrCreateCustomer.mockResolvedValue({ id: 'cu1', city: 'عمّان', firstOrderDate: null });
    db.product.findFirst.mockResolvedValue({
      id: PRODUCT_ID, name: 'كريم مرطّب', image: null, basePrice: 14, batches: [],
    });
    productCost.mockResolvedValue({ average: 7 });
    orderRefFields.mockResolvedValue({ orderNumber: 'ORD-2026-0001' });
    resolveRegionId.mockResolvedValue('r1');
    db.order.create.mockImplementation(async (args: any) => ({ id: 'o1', ...args.data }));

    const zero = await confirm({ finalPrice: 0 });
    expect(amount(100_000).safeParse(0).success, 'a typed zero is a price').toBe(true);
    expect(stored('sellingPrice'), 'صفرٌ مقصودٌ لا يَصِلُ الفرعَ المعلَّق').toBe('14');
    expect(zero.status).toBe(200);
  });
});
