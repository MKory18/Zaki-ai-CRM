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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE WIRE NOW CARRIES CHARACTERS, AND THE TWO BODY ASSERTIONS SAY SO.
 *
 * `ProductLinesEditor`'s price box was `Number(e.target.value) || 0`, so a
 * CLEARED box was a free line and the component redrew the cleared box as
 * `0`. Saying «I wrote nothing» needs a third state, so `DraftLine.price`
 * holds the box's characters or `undefined`, and `JSON.stringify` drops the
 * `undefined` — see that file's header. `unitPrice` therefore goes out as
 * `'0'` and `'25'` rather than `0` and `25`, which `z.coerce.number()` at
 * the PATCH door reads as the same two numbers.
 *
 * Both assertions below check the CHARACTERS AND their numeric reading, so
 * the guard did not get weaker: restoring the fallback still fails them,
 * with `'42'` and 42.
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
  return JSON.parse(init.body) as {
    items: { unitPrice: string; quantity: number }[];
    expectedVersion: number;
  };
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
    // The characters the box held, and the number the door will read.
    expect(body.items[0].unitPrice).toBe('0');
    expect(Number(body.items[0].unitPrice)).toBe(0);
    expect(Number(body.items[0].unitPrice)).not.toBe(INVENTED);
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
    expect(sentBody().items[0].unitPrice).toBe('25');
    expect(Number(sentBody().items[0].unitPrice)).toBe(25);
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

/**
 * AN ORDER WITH NO LINES SAYS SO, RATHER THAN BEING GIVEN ONE.
 *
 * The card built a synthetic line when `order.items` was empty, priced at
 * `sellingPrice / quantity` — rounded by nothing, against the server's
 * `lineTotal / quantity` to two places. `the-frontend-invariants.test.ts`
 * carried it on its DIVERGED list with the disagreement measured (3 units
 * over 50: server 16.67, card 50.01) and the remedy stated: delete the
 * branch.
 *
 * MEASURED BEFORE DELETING: 0 of 56 orders on this database have no items,
 * so nothing a person looks at today changes. What goes is a second copy of
 * a money rule, waiting for the day something makes a lineless order and
 * prints a figure nobody can trace.
 *
 * The fixture below is the shape that made the divergence visible — 3 units
 * for 50 — so a restored branch dies on the number rather than on a layout.
 */
describe('an order with no lines at all', () => {
  const uneven = () =>
    render(
      <OrderLinesCard
        order={{ ...order([]), items: [], quantity: 3, sellingPrice: 50 }}
        currency={CURRENCY}
        canEdit
        onAcquireLock={() => {}}
        onSaved={() => {}}
      />
    );

  it('prints no invented unit price — 16.667 is nobody’s figure', () => {
    uneven();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('16.66');
    expect(text).not.toContain('16.67');
    // And no «3 ×» row at all, because there is no line to multiply.
    expect(text).not.toMatch(/3\s*×/);
  });

  it('and says in a sentence that there are none', () => {
    uneven();
    expect(document.body.textContent).toContain('لا أسطرَ مسجَّلةٌ على هذا الطلب');
  });

  it('while the order’s own figures, which the server holds, are still shown', () => {
    // Nothing a reader needs is lost: the summary below the list carries the
    // selling price and the quantity exactly as the server sent them.
    uneven();
    const text = document.body.textContent ?? '';
    expect(text).toContain('سعر البيع');
    expect(text).toContain('الكمية');
  });
});
