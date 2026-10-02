import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ONE ORDER, SEVERAL LINES.
 *
 * `computeCod` has taken a list of lines since it was written, and this
 * path already wrote an `OrderItem`. What was single was the INPUT. So the
 * thing worth proving here is not that the arithmetic works — money.test.ts
 * does that — but that the basket reaches it whole: every line costed,
 * every line written, the head of the order a display choice and never the
 * money, and not one figure taken from the browser.
 */

const { db, tx } = vi.hoisted(() => {
  const tx: any = {
    order: { create: vi.fn(async ({ data }: any) => ({ ...data, id: 'o-new' })) },
    orderItem: { createMany: vi.fn(async () => ({ count: 0 })) },
    customer: { update: vi.fn() },
    orderActivity: { create: vi.fn() },
    orderStatusLog: { create: vi.fn() },
  };
  const db: any = {
    region: { findMany: vi.fn(async () => [{ id: 'r1', name: 'عمّان' }]) },
    offer: { findMany: vi.fn(async () => []) },
    order: { groupBy: vi.fn(async () => []) },
    orderChannel: { findFirst: vi.fn(async () => null) },
    store: { findFirst: vi.fn(async () => ({ priceIncludesDelivery: false })) },
    productionBatch: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
  return { db, tx };
});

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/notification', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/apps/events', () => ({ emitAppEvent: vi.fn() }));
vi.mock('@/lib/conversions/emit', () => ({ queueConversions: vi.fn() }));
vi.mock('@/lib/customer-identity', () => ({
  findOrCreateCustomer: vi.fn(async () => ({ id: 'cust-1', firstOrderDate: null })),
}));
vi.mock('@/lib/order-ref', () => ({ orderRefFields: vi.fn(async () => ({ orderNumber: 'ORD-77' })) }));
vi.mock('@/lib/blacklist', () => ({ isBlocked: vi.fn(async () => false), NEUTRAL_REFUSAL: 'x' }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn(), afterResponse: (w: () => Promise<unknown>) => { void w(); } }));

import { createPublicOrder } from './public-order';
import { STORE_TEMPLATES } from './store-templates';
import { skinToStoreTheme } from './store-skin';

const P = {
  big: { id: 'p-big', name: 'كبير', image: null, basePrice: 100 },
  small: { id: 'p-small', name: 'صغير', image: null, basePrice: 10 },
};

let scope = 0;
const surface = (products = [P.big, P.small]) => ({
  companyId: 'c1',
  store: {
    id: 'store-a',
    countryId: 'jo',
    country: { code: 'JO', currencyCode: 'JOD', orderPrefix: 'ORD', minorUnit: 3 },
  },
  products,
  landingPage: null,
  source: 'Store',
  campaignId: null,
  // A fresh scope per call: the one-order-per-phone guard is a real guard
  // and would refuse the second test otherwise.
  dedupeScope: `basket-${scope++}`,
  notice: { title: 'طلب', message: (n: string) => n },
});

const body = (over: Record<string, unknown> = {}) => ({
  full_name: 'زبون تجريبي',
  phone: '0790000000',
  address: 'شارع الاختبار، بناية ٣',
  city: 'عمّان',
  ...over,
});

const created = () => tx.order.create.mock.calls.at(-1)![0].data;
const items = () => tx.orderItem.createMany.mock.calls.at(-1)![0].data;

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations, and one describe below gives this
  // one a bundle. Put the default back so the tests do not depend on order.
  db.offer.findMany.mockImplementation(async () => []);
});

describe('a basket of several things', () => {
  const twoProducts = { items: [{ productId: 'p-big', quantity: 1 }, { productId: 'p-small', quantity: 2 }] };

  it('becomes ONE order', async () => {
    const r = await createPublicOrder(surface() as never, body(twoProducts));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(tx.order.create).toHaveBeenCalledTimes(1);
  });

  it('with a line for every thing in it', async () => {
    await createPublicOrder(surface() as never, body(twoProducts));
    expect(items()).toHaveLength(2);
    expect(items().map((i: any) => [i.productId, i.quantity])).toEqual([
      ['p-big', 1],
      ['p-small', 2],
    ]);
  });

  it('and a total that is the whole basket', async () => {
    await createPublicOrder(surface() as never, body(twoProducts));
    // 100 + 2 × 10, no delivery fee configured in this harness.
    expect(created().totalAmount).toBe(120);
  });

  /**
   * THE HEAD IS A DISPLAY CHOICE. An order row has one cell for a product
   * and cannot show two, so it shows the largest line — and `totalAmount`
   * stays the whole order, which is what makes that safe.
   */
  it('shows the largest line in the row, whatever order it arrived in', async () => {
    await createPublicOrder(
      surface() as never,
      body({ items: [{ productId: 'p-small', quantity: 2 }, { productId: 'p-big', quantity: 1 }] })
    );
    expect(created().productId).toBe('p-big');
    expect(created().productNameSnapshot).toBe('كبير');
    expect(created().totalAmount).toBe(120);
  });

  /**
   * Costing the head alone would understate the goods on every order with
   * more than one thing in it — which is every order the cart exists for.
   */
  it('costs every line, not the one the row shows', async () => {
    await createPublicOrder(surface() as never, body(twoProducts));
    // No costed stock on hand in this harness, so the honest answer is zero
    // — but it is a zero reached by summing three units, not by skipping two.
    expect(created().estimatedCostOfGoods).toBe(0);
    expect(db.productionBatch.findMany).toHaveBeenCalledTimes(2);
  });

  it('asks each distinct product what it cost exactly once', async () => {
    await createPublicOrder(
      surface() as never,
      body({ items: [{ productId: 'p-big', quantity: 1 }, { productId: 'p-big', quantity: 3 }] })
    );
    expect(db.productionBatch.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('what the browser may decide', () => {
  it('nothing about a price', async () => {
    await createPublicOrder(
      surface() as never,
      body({ items: [{ productId: 'p-big', quantity: 1, price: 1, unitPrice: 1, total: 1 }] })
    );
    // The product's own base price, read on the server.
    expect(created().totalAmount).toBe(100);
    expect(items()[0].unitPrice).toBe(100);
  });

  it('and nothing about a product this door does not sell', async () => {
    const r = await createPublicOrder(
      surface([P.big]) as never,
      body({ items: [{ productId: 'p-small', quantity: 1 }] })
    );
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toMatch(/لم يعد متاحاً/);
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  /** A basket and a single choice both sent: the basket is the order. */
  it('a basket beats a lone offerId — two answers would be two orders', async () => {
    await createPublicOrder(
      surface() as never,
      body({ offerId: 'o-ignored', items: [{ productId: 'p-small', quantity: 1 }] })
    );
    expect(created().productId).toBe('p-small');
    expect(created().offerId).toBeNull();
  });
});

describe('a bundle asked for twice', () => {
  beforeEach(() => {
    db.offer.findMany.mockImplementation(async ({ where }: any) =>
      where.productId === 'p-big'
        ? [{
            id: 'off-3', name: 'ثلاث قطع', quantity: 3, freeQuantity: 1,
            sellingPrice: 240, compareAtPrice: null, isDefault: true,
            deliveryIncluded: false, endsAt: null,
          }]
        : []
    );
  });

  it('is pieces, not picks', async () => {
    await createPublicOrder(
      surface([P.big]) as never,
      body({ items: [{ productId: 'p-big', offerId: 'off-3', quantity: 2 }] })
    );
    // Two of a «٣ قطع + ١ مجاناً» bundle: six paid pieces and two gifts.
    expect(items()[0].quantity).toBe(6);
    expect(items()[0].freeQuantity).toBe(2);
    // And the unit price is the bundle's total divided once, on the server.
    expect(items()[0].unitPrice).toBe(80);
    expect(created().totalAmount).toBe(480);
  });
});

describe('the door that sells one thing is untouched', () => {
  it('still writes one line, and the order is that line', async () => {
    const r = await createPublicOrder(surface([P.big]) as never, body());
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(items()).toHaveLength(1);
    expect(created().productId).toBe('p-big');
    expect(created().quantity).toBe(1);
    expect(created().sellingPrice).toBe(100);
    expect(created().totalAmount).toBe(100);
  });
});

/**
 * THE SAME ORDER, UNDER EVERY ONE OF THE TEN TEMPLATES.
 *
 * «يثبت إن السلة والـCOD والطلب المخزّن والأحداث متطابقة مهما كان القالب».
 *
 * The architectural half of this claim is held elsewhere: no module that
 * decides money imports anything that knows what the shop looks like (see
 * every-template.test.ts). That guard reads imports, and an import list is
 * not the same thing as behaviour — the STORE ROW is shared between the
 * look and the order path, so «the pricer does not import the theme» does
 * not prove «the order path does not read `store.theme`».
 *
 * So this runs the real order, ten times, with a real template on the row
 * each time, and compares what was stored. A byte-identical order under
 * ten different looks is the claim the brief actually makes.
 */
describe('a basket priced under each of the ten templates', () => {
  const twoProducts = { items: [{ productId: 'p-big', quantity: 1 }, { productId: 'p-small', quantity: 2 }] };

  /** The same surface, wearing one template. */
  const wearing = (skinId: string) => {
    const skin = STORE_TEMPLATES.find((t) => t.id === skinId)!;
    const s = surface();
    return {
      ...s,
      store: {
        ...s.store,
        // Exactly what installing that template writes onto the row.
        theme: JSON.stringify({ ...skinToStoreTheme(skin), template: skin.id }),
      },
    };
  };

  /** Everything the order path decided, with the fields that must vary removed. */
  const decided = () => {
    const order = { ...created() };
    // These differ by design between runs: a new order number and a new
    // customer dedupe scope are not what «متطابقة» is about.
    delete order.orderNumber;
    return { order, items: items() };
  };

  it('stores the same order, whichever template the shop wears', async () => {
    const results: string[] = [];
    for (const skin of STORE_TEMPLATES) {
      await createPublicOrder(wearing(skin.id) as never, body(twoProducts));
      results.push(JSON.stringify(decided()));
    }
    expect(results).toHaveLength(10);
    // Every one identical to the first — the comparison the brief asks for.
    for (let i = 1; i < results.length; i++) {
      expect(results[i], STORE_TEMPLATES[i].id).toBe(results[0]);
    }
  });

  it('and the comparison is of something, not of two empty objects', async () => {
    await createPublicOrder(wearing('lab') as never, body(twoProducts));
    const { order, items: lines } = decided();
    // The figures the claim is about: a line for every thing in the basket,
    // and the cash the courier collects. There is no separate `codAmount`
    // — `totalAmount` IS `computeCod`'s answer, which is the point of there
    // being one COD function.
    expect(lines).toHaveLength(2);
    expect(Number(order.totalAmount)).toBeGreaterThan(0);
    expect(Number(order.totalAmount)).toBe(
      lines.reduce((sum: number, l: { quantity: number; unitPrice: number; freeQuantity?: number }) =>
        sum + (l.quantity - (l.freeQuantity ?? 0)) * l.unitPrice, 0)
    );
  });

  it('and no template leaked a field of its own into the order', async () => {
    await createPublicOrder(wearing('souq') as never, body(twoProducts));
    const keys = Object.keys(created());
    for (const look of ['theme', 'template', 'accent', 'layout', 'colors', 'mood']) {
      expect(keys, look).not.toContain(look);
    }
  });
});
