import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * THE DOOR-SIDE DELIVERY RECORDS THE KNOCK — TESTED, NOT ASSERTED.
 *
 * A source-level guard was written for this first and it was VACUOUS: it
 * checked that the file contained the words `appendDeliveryAttempt`, which
 * `if (false) await appendDeliveryAttempt(...)` also contains. The mutation
 * run said MISSED, which is the only reason it is a real test now.
 *
 * `recordPartialDelivery` takes its transaction as a parameter, so the whole
 * thing can be exercised against a fake one.
 */

vi.mock('./stock-consumption', () => ({
  consumeOrderStock: vi.fn(async () => ({ taken: 0, short: 0, alreadyDone: false })),
}));
vi.mock('./delivery-attempts', () => ({
  appendDeliveryAttempt: vi.fn(async () => ({ id: 'attempt-1', attemptNumber: 1 })),
}));

import { recordPartialDelivery } from './partial-delivery';
import { appendDeliveryAttempt } from './delivery-attempts';

const line = (id: string, qty: number) => ({
  id, productId: `p-${id}`, productName: `منتج ${id}`,
  quantity: qty, freeQuantity: 0, unitPrice: 10, discountShare: 0,
});

function fakeTx(items: ReturnType<typeof line>[]) {
  return {
    order: {
      findFirst: vi.fn(async () => ({
        id: 'order-1',
        orderNumber: 'ORD-1',
        shippingStatus: 'OUT_FOR_DELIVERY',
        deliveryFee: 5,
        priceIncludesDelivery: false,
        collectedAmount: null,
        deliveryProviderId: 'courier-1',
        items,
      })),
      update: vi.fn(async () => ({})),
    },
    orderItem: { update: vi.fn(async () => ({})) },
    orderActivity: { create: vi.fn(async () => ({})) },
  } as never;
}

const run = (items: ReturnType<typeof line>[], lines: { itemId: string; deliveredQty: number }[]) =>
  recordPartialDelivery(fakeTx(items), {
    companyId: 'co-1',
    orderId: 'order-1',
    lines,
    minorUnit: 2,
    userId: 'user-1',
    note: 'عند الباب',
  });

const lastCall = () => (appendDeliveryAttempt as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![1] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a delivery recorded at the door', () => {
  it('writes the attempt — the whole order handed over', async () => {
    const out = await run([line('i1', 2)], [{ itemId: 'i1', deliveredQty: 2 }]);
    expect(out.status).toBe('DELIVERED');
    expect(appendDeliveryAttempt).toHaveBeenCalledTimes(1);
    expect(lastCall()).toMatchObject({ result: 'DELIVERED', failureReason: null, orderId: 'order-1' });
  });

  it('writes a partial one as a partial one — the code the list was missing', async () => {
    const out = await run(
      [line('i1', 2), line('i2', 1)],
      [{ itemId: 'i1', deliveredQty: 2 }, { itemId: 'i2', deliveredQty: 0 }]
    );
    expect(out.status).toBe('PARTIALLY_DELIVERED');
    expect(lastCall()).toMatchObject({ result: 'PARTIALLY_DELIVERED', failureReason: null });
  });

  /**
   * REFUSING EVERYTHING IS A FAILED ATTEMPT WITH A REASON.
   *
   * Not a «returned» attempt. The parcel coming back is what happens next,
   * at a warehouse; what happened at the door is that somebody would not
   * take it — and that distinction is the whole reason the result vocabulary
   * no longer carries reasons of its own.
   */
  it('writes a refusal as a failure whose reason is the refusal', async () => {
    const out = await run([line('i1', 2)], [{ itemId: 'i1', deliveredQty: 0 }]);
    expect(out.status).toBe('RETURNED');
    expect(lastCall()).toMatchObject({ result: 'FAILED', failureReason: 'CUSTOMER_REFUSED' });
  });

  /**
   * AND IT NAMES THE COURIER.
   *
   * «Which courier needs two knocks» cannot be asked of rows that do not say
   * whose knock it was. The order's provider was not even selected by this
   * query before.
   */
  it('names the courier who stood at the door', async () => {
    await run([line('i1', 1)], [{ itemId: 'i1', deliveredQty: 1 }]);
    expect(lastCall()).toMatchObject({ deliveryProviderId: 'courier-1', userId: 'user-1' });
  });
});
