import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A CONFIGURED RETURN FEE OF ZERO COSTS ZERO — ON THE REPORT TOO.
 *
 * The loss report read the courier's return fee as
 * `Number(f.returnFee) || Number(f.fee)`, the same expression the returns
 * desk used until `2aa703a` deleted it there. Its own header comment said so
 * in as many words, pointing at the returns screen for the reason.
 *
 * `delivery_fees.returnFee` is `numeric NOT NULL DEFAULT 0` in the schema,
 * in the migration and in the live database, and the settings form posts 0
 * when the box is left empty. There is no «unset» state in that column: a
 * falsy value is a REAL 0, «we charge nothing to carry goods back». So `||`
 * billed the WHOLE OUTBOUND LEG a second time — once as `outbound`, once as
 * the cost of bringing the parcel back — on the report whose only job is to
 * say what an order's death cost.
 *
 * Measured on the live database 2026-10-03: of 25 active fee rows, 13 hold
 * returnFee 0 against a fee of 3, 4 or 5; 12 hold 1.5; none hold NULL.
 *
 * These tests assert the MONEY the route returns, not that a name appears.
 * Put `|| Number(f.fee)` back and the first one reads 6.5 against 2.5 and
 * the 4.00 row reads 8 against 4.
 */

const { db, requireContext, requirePermission } = vi.hoisted(() => ({
  db: {
    order: { findMany: vi.fn(), count: vi.fn() },
    deliveryFee: { findMany: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  can: () => true,
  requirePermission: (...a: unknown[]) => requirePermission(...a),
}));

import { GET } from '@/app/api/analytics/loss/route';

const COURIER = 'dp1';
const REGION = 'r1';

/** The outbound fee snapshotted on the order when it shipped. */
const OUTBOUND = 2.5;

type Fee = { fee: string; returnFee: string };

/** One returned parcel on this courier/region, against one active fee row. */
function given(row: Fee | null) {
  db.order.findMany.mockResolvedValue([
    {
      rejectionReason: null,
      deliveryFailureReason: null,
      // Not DAMAGED_PRODUCT, so the goods go back on the shelf and the only
      // money on this row is the two fees.
      returnReason: 'CUSTOMER_REFUSED',
      deliveryFee: OUTBOUND,
      productCost: 1,
      quantity: 3,
      regionId: REGION,
      deliveryProviderId: COURIER,
    },
  ]);
  db.order.count.mockResolvedValue(1);
  db.deliveryFee.findMany.mockResolvedValue(
    row ? [{ regionId: REGION, deliveryProviderId: COURIER, ...row }] : []
  );
}

/** The after-shipping money the report publishes for that one parcel. */
async function afterShippingMoney(): Promise<number> {
  const res = await GET(new Request('http://localhost/api/analytics/loss?period=all'));
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.after.money as number;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue({});
});

describe('the return fee the loss report charges', () => {
  it('charges 0 — not the 2.5 outbound fee twice — when the row says 0', async () => {
    given({ fee: '2.5', returnFee: '0' });
    // outbound 2.5 + return 0 + goods 0
    expect(await afterShippingMoney()).toBe(2.5);
  });

  /**
   * THE SHAPE OF THE 13 ROWS, by their own numbers.
   *
   * 2 rows hold fee 3, 7 hold fee 4, 4 hold fee 5 — and every one of them
   * holds returnFee 0. A parcel returned on any of them was reported at
   * outbound + that fee again.
   */
  it.each([
    { fee: '3', overstatedTo: OUTBOUND + 3 },
    { fee: '4', overstatedTo: OUTBOUND + 4 },
    { fee: '5', overstatedTo: OUTBOUND + 5 },
  ])('on a fee-$fee row it reports 2.5, not $overstatedTo', async ({ fee, overstatedTo }) => {
    given({ fee, returnFee: '0' });
    const money = await afterShippingMoney();
    expect(money).toBe(2.5);
    expect(money).not.toBe(overstatedTo);
  });

  it('still charges a return fee that IS configured — the 1.5 on 12 of the 25 rows', async () => {
    given({ fee: '2.5', returnFee: '1.5' });
    expect(await afterShippingMoney()).toBe(4);
  });

  /**
   * ABSENCE IS A MISSING ROW, not a 0 inside one — and it is handled at the
   * lookup, where it actually arises. The returns desk answers the same way
   * (`resolveDeliveryFee` returns `source: 'NONE'` with both figures 0), so
   * neither door invents a fee it cannot invoice.
   */
  it('charges nothing extra when this courier has no active row for the region', async () => {
    given(null);
    expect(await afterShippingMoney()).toBe(2.5);
  });

  /**
   * AND THE GOODS ON A DAMAGED RETURN — THIS TEST USED TO PIN THE DEFECT.
   *
   * It read `productCost: 1, quantity: 3` and expected 5.5, because the
   * branch did `Number(productCost ?? 0) * quantity` — and the comment
   * above it said so out loud: «the damaged-goods branch multiplies
   * productCost by quantity». It was describing a bug as though it were a
   * rule.
   *
   * TWO THINGS WERE WRONG WITH THE BRANCH:
   *
   *   · `productCost` is NULL on all 56 live orders — it is written only by
   *     a finance route that has no screen — so the goods on a damaged
   *     return were priced at ZERO in production, every time. The fixture
   *     hid that by supplying a value no real row has.
   *   · and both cost columns hold the WHOLE ORDER's cost, so the `×
   *     quantity` charged a three-unit order three times over.
   *
   * So the fixture is now the row a real order actually produces, and a
   * second case covers the typed column.
   */
  it('charges the estimate on a damaged return — the column a real row has', async () => {
    given({ fee: '4', returnFee: '0' });
    db.order.findMany.mockResolvedValue([
      {
        rejectionReason: null,
        deliveryFailureReason: null,
        returnReason: 'DAMAGED_PRODUCT',
        deliveryFee: OUTBOUND,
        // What every live row looks like: nobody has typed a per-order
        // cost, and the estimate was written at creation for the WHOLE
        // order (every door does `unitCost * quantity`).
        productCost: null,
        estimatedCostOfGoods: 3,
        quantity: 3,
        regionId: REGION,
        deliveryProviderId: COURIER,
      },
    ]);
    // 2.5 outbound + 0 return + 3 goods. Not 9: the estimate is already
    // the order's total.
    expect(await afterShippingMoney()).toBe(5.5);
  });

  it('and the typed figure wins when somebody has typed one — still not multiplied', async () => {
    given({ fee: '4', returnFee: '0' });
    db.order.findMany.mockResolvedValue([
      {
        rejectionReason: null,
        deliveryFailureReason: null,
        returnReason: 'DAMAGED_PRODUCT',
        deliveryFee: OUTBOUND,
        productCost: 4,
        estimatedCostOfGoods: 3,
        quantity: 3,
        regionId: REGION,
        deliveryProviderId: COURIER,
      },
    ]);
    // 2.5 + 4, not 2.5 + 12 and not 2.5 + 3.
    expect(await afterShippingMoney()).toBe(6.5);
  });

  it('and a typed ZERO is a free sample, not a missing cost', async () => {
    given({ fee: '4', returnFee: '0' });
    db.order.findMany.mockResolvedValue([
      {
        rejectionReason: null,
        deliveryFailureReason: null,
        returnReason: 'DAMAGED_PRODUCT',
        deliveryFee: OUTBOUND,
        productCost: 0,
        estimatedCostOfGoods: 3,
        quantity: 3,
        regionId: REGION,
        deliveryProviderId: COURIER,
      },
    ]);
    // The fees only. Falling through a typed 0 to the estimate would
    // charge for a gift — the `|| 0` family, closed here too.
    expect(await afterShippingMoney()).toBe(2.5);
  });
});
