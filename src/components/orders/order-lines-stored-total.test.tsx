// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * THE EDITOR OPENS ON THE STORED LINE TOTAL. ALL OF IT, INCLUDING ZERO.
 *
 * `OrderLinesCard` seeded its draft with
 * `Number(l.lineTotal) || Number(l.unitPrice) * l.quantity`. A line whose
 * total is legitimately 0 — a giveaway, or a line an order discount took to
 * zero — therefore opened priced at `unitPrice × quantity`, and that is not
 * a display bug on its own: `save()` posts the draft's `price` as the item's
 * `unitPrice`, so pressing حفظ WROTE the invented number onto the order.
 *
 * `OrderItem.lineTotal` is `numeric NOT NULL` with no default — 0 of 56 rows
 * NULL on the live database, 2026-10-03 — so a line always HAS a total and
 * there was nothing to fall back to. `Number()` stays because the detail
 * route converts only `commission` out of Decimal, so the browser receives
 * these figures as STRINGS; a stored 0 arrives as `"0"`, which `Number()`
 * turns into the falsy 0 that fired the fallback.
 *
 * HOW A 0 TOTAL IS REACHED — three ways, all open today:
 *   · `items[].unitPrice` on the PATCH schema is `z.coerce.number().min(0)`
 *     and the price box carries `min={0}`, so a clerk can type 0 outright;
 *   · `allocateDiscount` clamps the discount to the subtotal, so an order
 *     discount that MEETS a one-line order's subtotal writes `lineTotal` 0
 *     (the order's own `discountAmount` is bounded only by `max(100000)` —
 *     the subtotal guard added in `57eb1d6` is on the OFFER, not the order);
 *   · a free unit priced at 0.
 *
 * These tests read the NUMBER in the box and the NUMBER in the request body.
 * Put `|| Number(l.unitPrice) * l.quantity` back and the first reads 42
 * against 0, and the saved `unitPrice` goes out as 42.
 */

const { apiFetch, apiJson } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiJson: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch, apiJson }));
// The reason dialog belongs to `useOrderPatch`; a 200 never opens it.
vi.mock('@/components/ui/Confirm', () => ({ useAsk: () => async () => null }));
// next/image is not this test's subject.
vi.mock('@/components/ui/ProductThumb', () => ({
  ProductThumb: () => <span data-testid="thumb" />,
}));

import { OrderLinesCard } from './OrderLinesCard';

const CURRENCY = { code: 'JOD', minorUnit: 3 };

/**
 * ONE LINE, THREE UNITS, A UNIT PRICE OF 14 — AND A TOTAL OF ZERO.
 *
 * Decimals arrive as strings over the wire, so they are written as strings
 * here. 3 × 14 = 42 is the number the deleted fallback invented.
 */
const ZERO_LINE = {
  id: 'i1',
  productId: 'p1',
  productName: 'مقشر',
  quantity: 3,
  freeQuantity: 0,
  unitPrice: '14' as unknown as number,
  discountShare: '42' as unknown as number,
  lineTotal: '0' as unknown as number,
};
const INVENTED = 42;

function order(items: (typeof ZERO_LINE)[]) {
  return {
    id: 'o1',
    version: 7,
    quantity: 3,
    sellingPrice: 42,
    discountAmount: 42,
    deliveryFee: 2.5,
    priceIncludesDelivery: false,
    internalNotes: null,
    customerNotes: null,
    items,
    product: { name: 'مقشر', image: null },
    productNameSnapshot: 'مقشر',
    productImageSnapshot: null,
    offer: null,
    deliveryProvider: { id: 'dp1', name: 'شركة' },
  };
}

function draw(items = [ZERO_LINE]) {
  return render(
    <OrderLinesCard
      order={order(items)}
      currency={CURRENCY}
      canEdit
      onAcquireLock={() => {}}
      onSaved={() => {}}
    />
  );
}

/** The line-price box inside `ProductLinesEditor`, by its own placeholder. */
const priceBox = () => screen.getByPlaceholderText('سعر السطر') as HTMLInputElement;

/** What `save()` actually sent, parsed. */
function sentBody() {
  expect(apiFetch).toHaveBeenCalled();
  const [, init] = apiFetch.mock.calls[0] as [string, { body: string }];
  return JSON.parse(init.body) as { items: { unitPrice: number; quantity: number }[]; expectedVersion: number };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiJson.mockResolvedValue({ products: [] });
  apiFetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
});

afterEach(cleanup);

describe('a line total of zero', () => {
  it('shows 0 on the card, not 42', async () => {
    draw();
    // Scoped to the LINE's own row: 42 is also the order's selling price and
    // its discount, both of which legitimately print «42.000 JOD» in the
    // summary below. What must not say 42 is the line.
    const row = screen.getByText('مقشر').closest('div.flex.items-center') as HTMLElement;
    expect(row.textContent).toContain('0.000 JOD');
    expect(row.textContent).not.toContain('42.000 JOD');
    // And the per-unit line still reads what is stored: 3 × 14.
    expect(row.textContent).toContain('3 × 14.000 JOD');
  });

  it('opens the editor at 0, not at unitPrice × quantity', async () => {
    draw();
    await userEvent.click(screen.getByRole('button', { name: /تعديل/ }));
    await waitFor(() => expect(priceBox()).toBeTruthy());

    expect(Number(priceBox().value)).toBe(0);
    expect(Number(priceBox().value)).not.toBe(INVENTED);
  });

  it('and SAVES 0 — the fallback wrote 42 onto the order', async () => {
    draw();
    await userEvent.click(screen.getByRole('button', { name: /تعديل/ }));
    await waitFor(() => expect(priceBox()).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /حفظ بيانات الطلب/ }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const body = sentBody();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].unitPrice).toBe(0);
    expect(body.items[0].unitPrice).not.toBe(INVENTED);
    // The save is still the versioned one — the guard must not have changed
    // what the editor is for.
    expect(body.expectedVersion).toBe(7);
    expect(body.items[0].quantity).toBe(3);
  });

  /**
   * AND A LINE WITH A REAL PRICE IS UNTOUCHED, so the fix is not «always 0».
   * 2 × 12.5 stores 25, and 25 is what opens and what saves.
   */
  it('leaves a priced line exactly as it is stored', async () => {
    draw([
      {
        ...ZERO_LINE,
        quantity: 2,
        unitPrice: '12.5' as unknown as number,
        discountShare: '0' as unknown as number,
        lineTotal: '25' as unknown as number,
      },
    ]);
    await userEvent.click(screen.getByRole('button', { name: /تعديل/ }));
    await waitFor(() => expect(priceBox()).toBeTruthy());
    expect(Number(priceBox().value)).toBe(25);

    await userEvent.click(screen.getByRole('button', { name: /حفظ بيانات الطلب/ }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(sentBody().items[0].unitPrice).toBe(25);
  });

  /**
   * THE MULTIPLICATION WAS NOT A FAITHFUL COPY EITHER, which is the second
   * reason it is gone and not merely re-operatored. `unitPrice` is stored as
   * `lineTotal / quantity` rounded to two places (see `settlement.ts`), so a
   * line of 3 for 50 stores 16.67 and 3 × 16.67 is 50.01 — a fils invented
   * in a frontend, where the contract forbids computing money at all.
   */
  it('and is not reconstructed even when the product would be a fils off', async () => {
    draw([
      {
        ...ZERO_LINE,
        quantity: 3,
        unitPrice: '16.67' as unknown as number,
        discountShare: '0' as unknown as number,
        lineTotal: '50' as unknown as number,
      },
    ]);
    await userEvent.click(screen.getByRole('button', { name: /تعديل/ }));
    await waitFor(() => expect(priceBox()).toBeTruthy());
    expect(Number(priceBox().value)).toBe(50);
    expect(Number(priceBox().value)).not.toBe(50.01);
  });
});
