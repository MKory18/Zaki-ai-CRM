'use client';

import React from 'react';
import { Plus, Trash2, Minus } from 'lucide-react';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { amount, type Currency } from '@/lib/format';

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

export interface DraftLine {
  key: string;
  productId: string;
  offerId: string | null;
  quantity: number;
  /** Total for this line's quantity, not per unit. */
  price: number;
}

interface ProductOption {
  id: string;
  name: string;
  image?: string | null;
  basePrice?: number;
  offers?: { id: string; name: string; quantity: number; sellingPrice: number }[];
}

export function newLine(product?: ProductOption): DraftLine {
  const offer = product?.offers?.[0];
  return {
    key: Math.random().toString(36).slice(2),
    productId: product?.id ?? '',
    offerId: offer?.id ?? null,
    quantity: offer?.quantity ?? 1,
    price: offer?.sellingPrice ?? product?.basePrice ?? 0,
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
    patch(key, {
      productId,
      offerId: offer?.id ?? null,
      quantity: offer?.quantity ?? 1,
      price: offer?.sellingPrice ?? product?.basePrice ?? 0,
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
    patch(key, { offerId, quantity: offer.quantity, price: offer.sellingPrice });
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.price) || 0), 0);
  const inputClass =
    'w-full h-9 px-2 rounded-[8px] border border-[var(--sys-border)] text-sm focus:outline-none focus:border-[var(--sys-primary)] disabled:bg-[var(--sys-surface)]';

  return (
    <div className="space-y-2">
      {lines.map((line) => {
        const product = productOf(line.productId);
        const offers = product?.offers ?? [];
        const lockedByOffer = !!line.offerId;

        return (
          <div key={line.key} className="rounded-[8px] border border-[var(--sys-border)] p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <ProductThumb src={product?.image} alt={product?.name ?? ''} size="sm" />
              <select
                value={line.productId}
                onChange={(e) => pickProduct(line.key, e.target.value)}
                disabled={disabled}
                className={`${inputClass} flex-1`}
              >
                <option value="">— اختر المنتج —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                  disabled={disabled}
                  title="احذف هذا المنتج من الطلب"
                  className="h-9 w-9 rounded-[8px] bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] shrink-0 disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4 mx-auto" />
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
                  disabled={disabled || lockedByOffer}
                  className="h-9 w-9 rounded-[8px] border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] disabled:opacity-40"
                >
                  <Minus className="w-3.5 h-3.5 mx-auto" />
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
                  disabled={disabled || lockedByOffer}
                  className="h-9 w-9 rounded-[8px] border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5 mx-auto" />
                </button>
              </div>

              <label className="flex-1">
                <input
                  type="number" min={0} step="0.01" dir="ltr"
                  value={line.price}
                  onChange={(e) => patch(line.key, { price: Number(e.target.value) || 0, offerId: null })}
                  disabled={disabled || lockedByOffer}
                  placeholder="سعر السطر"
                  className={inputClass}
                />
              </label>

              <span className="text-sm font-bold text-[var(--sys-heading)] tabular-nums shrink-0 w-24 text-end" dir="ltr">
                {amount(line.price, currency)}
              </span>
            </div>

            {lockedByOffer && (
              <p className="text-[11px] text-[var(--sys-muted)]">
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
          className="text-[11px] px-2.5 py-1.5 rounded-[8px] border border-dashed border-[var(--sys-primary)] text-[var(--sys-primary)] inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
          أضف منتجاً آخر
        </button>
        <span className="text-xs text-[var(--sys-muted-foreground)]">
          قيمة البضاعة:{' '}
          <span className="font-bold text-[var(--sys-heading)] tabular-nums" dir="ltr">{amount(total, currency)}</span>
        </span>
      </div>
    </div>
  );
}
