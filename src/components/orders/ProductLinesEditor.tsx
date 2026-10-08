'use client';

import React from 'react';
import { onTheWire, typedFigure } from '@/lib/typed-box';
import { ProductPicker } from '@/components/ui/ProductPicker';
import { amount, type Currency } from '@/lib/format';
import { RiAddCircleLine, RiDeleteBinLine, RiSubtractLine } from '@remixicon/react';

/**
 * The products on one order.
 *
 * Shared by the quick-create form and the order screen so the two can never
 * disagree about what a line is or how its total is read. Neither of them
 * computes the order's money: they collect lines, and the server's single
 * COD function decides what the customer owes.
 *
 * A line's price box holds the TOTAL for that line's quantity, which is the
 * meaning the API has always given it — showing a per-unit price here and a
 * line total there would be two numbers for one field.
 */

/**
 * WHAT A PRICE BOX PUTS ON THE WIRE: ITS CHARACTERS, OR NOTHING AT ALL.
 *
 * The same reader `CourierFees.tsx` got in `17cbe93` and
 * `ManufacturingScreen.tsx` in `509306a`, now on the box where the number
 * is what a customer is charged.
 *
 * `price` was `Number(e.target.value) || 0`. `Number('')` is `0`, so
 * CLEARING THE BOX MADE THE LINE FREE — and it was worse than a wrong
 * figure, because the component wrote that `0` back into the box: clearing
 * «14» and typing «20» gave «120», since the box had redrawn as `0` before
 * the first keystroke landed. `0aea050` fixed exactly this for
 * `basePrice` in `ProductsScreen`; this is the same defect on the order
 * door.
 *
 * `undefined` is the answer for an empty box, and `JSON.stringify` DROPS an
 * `undefined` property — so the field is ABSENT on the wire and the door
 * decides. Both order doors declare the same rule over the same column:
 * `OrderItem.unitPrice` is `Decimal(12,2) NOT NULL` with NO DEFAULT, so
 * «nothing» is not a value the column can hold and both schemas make it
 * required — `items[].unitPrice: amount(100000)` on `POST /api/orders`,
 * `z.coerce.number().min(0)` on `PATCH /api/orders/[id]`. Absent is
 * therefore a 400 that NAMES the field («سعر الوحدة مطلوب»), which is the
 * one thing a silent zero could never be.
 *
 * AND IT IS THE CHARACTERS, NOT A NUMBER. `''` must never be sent: the
 * PATCH door reads with `z.coerce.number()` and `Number('')` is `0`, which
 * is the free line again, one layer down. A non-empty box goes as typed, so
 * the door's reader — not this component — decides what `'2,500'` means.
 * `509306a` measured that a `type="number"` box never lets a comma through
 * (the browser drops it and empties unparseable input), so the reachable
 * case is the empty box; the characters are sent anyway, because a browser
 * that pre-repairs a number is a second rule for it.
 */

/** The figure a price box holds, for the line's own echo. Never a zero it invented. */

/**
 * «قيمة البضاعة» — AN INPUT ECHO, IN ONE PLACE, AND THE JUDGEMENT IS
 * RECORDED ON PURPOSE.
 *
 * `the-frontend-invariants.test.ts` names this very sum as case 1 of its
 * three legitimate kinds of arithmetic: the total of prices a moderator is
 * typing into a form FOR AN ORDER THAT DOES NOT EXIST YET. There is no
 * server figure to render because there is nothing on the server, so it is
 * not a second copy of anything — and it is NOT the COD: no delivery fee,
 * no discount, no `priceIncludesDelivery` branch. The header above says the
 * COD is the server's, and `computeCod` remains the only thing that
 * computes it.
 *
 * It lives here and is exported because `CreateOrderModal` had the SAME
 * reduce written out again for the figure on its submit button — two copies
 * of one echo, each free to read an empty box differently.
 *
 * `undefined` RATHER THAN `0` WHEN NOTHING IS WRITTEN. Both copies were
 * `sum + (Number(l.price) || 0)`, which printed a confident «0.00 JOD»
 * over a form with every price box empty — the figure the operator then
 * believes. A partial form shows the sum of what IS written; an untouched
 * one shows a dash.
 */
export function goodsTotal(lines: DraftLine[]): number | undefined {
  const figures = lines
    .map((l) => typedFigure(l.price))
    .filter((p): p is number => p !== undefined);
  return figures.length === 0 ? undefined : figures.reduce((sum, p) => sum + p, 0);
}

export interface DraftLine {
  key: string;
  productId: string;
  offerId: string | null;
  quantity: number;
  /**
   * THE CHARACTERS IN THE LINE-TOTAL BOX, or `undefined` for an empty one.
   * Total for this line's quantity, not per unit.
   *
   * A string rather than a number so that «I have not written a price» is
   * sayable at all, and so the characters reach the door's own reader. Every
   * caller already sends it straight through as `unitPrice`, so `undefined`
   * leaves the key off the request without a caller having to know why.
   */
  price: string | undefined;
}

interface ProductOption {
  id: string;
  name: string;
  image?: string | null;
  basePrice?: number;
  offers?: { id: string; name: string; quantity: number; sellingPrice: number }[];
}

/**
 * A LINE'S OPENING PRICE IS A REAL PRICE OR AN EMPTY BOX — NEVER A `0`.
 *
 * `offer?.sellingPrice ?? product?.basePrice ?? 0` ended in an invented
 * zero, and that last branch is the one `newLine()` with no product takes:
 * both the dialog's first line and every «أضف منتجاً آخر» opened holding a
 * price of nothing-at-all, drawn as `0`. Pressing حفظ on it sent a free
 * line — a real order line at no charge, which the door is obliged to
 * accept because `min(0)` and a giveaway line is legitimate.
 *
 * So the price is the offer's, or the product's own base price, or the box
 * is EMPTY. There is no third number in this file: the only figures it can
 * put in a box came from the catalogue.
 */
export function newLine(product?: ProductOption): DraftLine {
  const offer = product?.offers?.[0];
  const seed = offer?.sellingPrice ?? product?.basePrice;
  return {
    key: Math.random().toString(36).slice(2),
    productId: product?.id ?? '',
    offerId: offer?.id ?? null,
    quantity: offer?.quantity ?? 1,
    price: seed === undefined ? undefined : String(seed),
  };
}

export function ProductLinesEditor({
  lines,
  products,
  currency,
  onChange,
  disabled,
}: {
  lines: DraftLine[];
  products: ProductOption[];
  currency: Currency | null;
  onChange: (lines: DraftLine[]) => void;
  disabled?: boolean;
}) {
  const productOf = (id: string) => products.find((p) => p.id === id);

  function patch(key: string, next: Partial<DraftLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...next } : l)));
  }

  /** Picking a product adopts its first offer — that is the offer's job. */
  function pickProduct(key: string, productId: string) {
    const product = productOf(productId);
    const offer = product?.offers?.[0];
    // Same rule as `newLine`: a catalogue figure, or an empty box. The
    // trailing `?? 0` here put a free line under a product that has neither
    // an offer nor a base price.
    const seed = offer?.sellingPrice ?? product?.basePrice;
    patch(key, {
      productId,
      offerId: offer?.id ?? null,
      quantity: offer?.quantity ?? 1,
      price: seed === undefined ? undefined : String(seed),
    });
  }

  /** An offer fixes the quantity and the price of its line. */
  function pickOffer(key: string, offerId: string) {
    const line = lines.find((l) => l.key === key);
    const offer = productOf(line?.productId ?? '')?.offers?.find((o) => o.id === offerId);
    if (!offer) {
      patch(key, { offerId: null });
      return;
    }
    patch(key, { offerId, quantity: offer.quantity, price: String(offer.sellingPrice) });
  }

  const total = goodsTotal(lines);
  const inputClass =
    'w-full h-10 px-2 rounded-lg border border-[var(--sys-border)] text-sm focus:outline-none focus:border-[var(--sys-primary)] disabled:bg-[var(--sys-surface)]';

  return (
    <div className="space-y-2">
      {lines.map((line) => {
        const product = productOf(line.productId);
        const offers = product?.offers ?? [];
        const lockedByOffer = !!line.offerId;
        /** The figure this line's box holds, or nothing — never an invented 0. */
        const lineFigure = typedFigure(line.price);

        return (
          <div key={line.key} className="rounded-lg border border-[var(--sys-border)] p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              {/* SEARCHABLE, because a native dropdown of a hundred
                  products is a scroll, not a choice. Reported from two
                  screens — the new order and the return — and both come
                  through this one editor. See ui/ProductPicker. */}
              <ProductPicker
                products={products}
                value={line.productId}
                onChange={(id) => pickProduct(line.key, id)}
                disabled={disabled}
                className="flex-1"
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                  disabled={disabled}
                  aria-label="احذف هذا المنتج من الطلب" title="احذف هذا المنتج من الطلب"
                  className="h-11 md:h-9 w-9 rounded-lg bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] shrink-0 disabled:opacity-40"
                >
                  <RiDeleteBinLine className="w-4 h-4 mx-auto" />
                </button>
              )}
            </div>

            {offers.length > 0 && (
              <select
                value={line.offerId ?? ''}
                onChange={(e) => pickOffer(line.key, e.target.value)}
                disabled={disabled}
                className={inputClass}
              >
                <option value="">بلا عرض — سعر مباشر</option>
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.quantity} × {amount(o.sellingPrice, currency)})
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => patch(line.key, { quantity: Math.max(1, line.quantity - 1), offerId: null })}
                  aria-label="أنقص الكمية"
                  title="أنقص الكمية"
                  disabled={disabled || lockedByOffer}
                  className="h-11 md:h-9 w-9 rounded-lg border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] disabled:opacity-40"
                >
                  <RiSubtractLine className="w-4 h-4 mx-auto" />
                </button>
                <input
                  type="number" min={1} dir="ltr"
                  value={line.quantity}
                  onChange={(e) => patch(line.key, { quantity: Math.max(1, Number(e.target.value) || 1), offerId: null })}
                  disabled={disabled || lockedByOffer}
                  className={`${inputClass} w-16 text-center`}
                />
                <button
                  type="button"
                  onClick={() => patch(line.key, { quantity: line.quantity + 1, offerId: null })}
                  aria-label="زد الكمية"
                  title="زد الكمية"
                  disabled={disabled || lockedByOffer}
                  className="h-11 md:h-9 w-9 rounded-lg border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] disabled:opacity-40"
                >
                  <RiAddCircleLine className="w-4 h-4 mx-auto" />
                </button>
              </div>

              <label className="flex-1">
                <input
                  type="number" min={0} step="0.01" dir="ltr"
                  // THE BOX HOLDS WHAT WAS TYPED, including nothing at all.
                  // `value={line.price}` over a numeric state is what redrew
                  // a cleared box as `0`, so «14» cleared and retyped as
                  // «20» came out «120».
                  value={line.price ?? ''}
                  onChange={(e) => patch(line.key, { price: onTheWire(e.target.value), offerId: null })}
                  disabled={disabled || lockedByOffer}
                  placeholder="سعر السطر"
                  className={inputClass}
                />
              </label>

              <span className="text-sm font-bold text-[var(--sys-heading)] tabular-nums shrink-0 w-24 text-end" dir="ltr">
                {/* An unwritten price is a dash, not «0.00». A confident zero
                    beside an empty box is the figure the operator believes. */}
                {lineFigure === undefined ? '—' : amount(lineFigure, currency)}
              </span>
            </div>

            {lockedByOffer && (
              <p className="text-xs text-[var(--sys-muted)]">
                الكمية والسعر من العرض — غيّرهما بإلغاء العرض من القائمة أعلاه.
              </p>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => onChange([...lines, newLine()])}
          disabled={disabled}
          className="min-h-11 md:min-h-0 inline-flex items-center text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--sys-primary)] text-[var(--sys-primary)] inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <RiAddCircleLine className="w-4 h-4" />
          أضف منتجاً آخر
        </button>
        <span className="text-xs text-[var(--sys-muted-foreground)]">
          قيمة البضاعة:{' '}
          <span className="font-bold text-[var(--sys-heading)] tabular-nums" dir="ltr">
            {total === undefined ? '—' : amount(total, currency)}
          </span>
        </span>
      </div>
    </div>
  );
}
