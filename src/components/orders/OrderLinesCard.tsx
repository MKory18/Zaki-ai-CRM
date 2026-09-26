'use client';

import React, { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { useOrderPatch } from '@/components/orders/useOrderPatch';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { amount, type Currency } from '@/lib/format';
import { ProductLinesEditor, newLine, type DraftLine } from '@/components/orders/ProductLinesEditor';
import { RiArchiveLine, RiLoader4Line, RiPencilLine } from '@remixicon/react';


/**
 * What was ordered.
 *
 * Laid out as a list of lines even while an order can hold only one, because
 * that is what it is: the items table has always been per-line, and every
 * screen downstream — preparation, partial delivery, returns — already reads
 * it that way. Only intake and editing are still single-line, so the card is
 * ready for the rest without pretending the rest is finished.
 *
 * The shipping fee is deliberately not an input here. It follows the courier,
 * and the courier is chosen when the shipment is created; a box asking for it
 * at intake invites a number that the fee table will later contradict.
 */

interface Line {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  freeQuantity: number;
  unitPrice: number;
  discountShare: number;
  lineTotal: number;
}

interface Props {
  order: {
    id: string;
    version: number;
    quantity: number;
    sellingPrice: number;
    discountAmount: number;
    deliveryFee: number | null;
    priceIncludesDelivery: boolean;
    internalNotes: string | null;
    customerNotes: string | null;
    items?: Line[];
    product?: { name: string; image?: string | null } | null;
    productNameSnapshot?: string | null;
    productImageSnapshot?: string | null;
    offer?: { id: string; name: string; quantity: number; sellingPrice: number } | null;
    deliveryProvider?: { id: string; name: string } | null;
  };
  currency: Currency | null;
  canEdit: boolean;
  onAcquireLock: () => Promise<unknown> | void;
  onSaved: () => void;
}

export function OrderLinesCard({ order, currency, canEdit, onAcquireLock, onSaved }: Props) {
  const patchOrder = useOrderPatch();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    discountAmount: String(order.discountAmount ?? 0),
    // What the customer asked for, or what this order needs. Internal notes
    // are a thread of their own below, not a box one person overwrites.
    customerNotes: order.customerNotes ?? '',
  });
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // The catalogue is only needed once the form opens.
  useEffect(() => {
    if (!open || products.length) return;
    fetch('/api/products')
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => setProducts(d.products ?? []))
      .catch(() => setProducts([]));
  }, [open, products.length]);

  const offerName = order.offer?.name || null;
  const lines: Line[] =
    order.items?.length
      ? order.items
      : [
          {
            id: 'legacy',
            productId: '',
            productName: order.productNameSnapshot || order.product?.name || '—',
            quantity: order.quantity ?? 1,
            freeQuantity: 0,
            unitPrice: (order.sellingPrice ?? 0) / Math.max(1, order.quantity ?? 1),
            discountShare: order.discountAmount ?? 0,
            lineTotal: order.sellingPrice ?? 0,
          },
        ];

  async function openForm() {
    // The button says إغلاق once the form is open, so pressing it again has
    // to close it — it used to re-open the form onto itself and look dead.
    if (open) {
      setOpen(false);
      setError(null);
      return;
    }
    setForm({
      discountAmount: String(order.discountAmount ?? 0),
      customerNotes: order.customerNotes ?? '',
    });
    setDraft(
      lines.map((l) => ({
        key: l.id,
        productId: l.productId,
        offerId: null,
        quantity: l.quantity,
        // The editor works in line totals, as the API does.
        price: Number(l.lineTotal) || Number(l.unitPrice) * l.quantity,
      }))
    );
    setError(null);
    if (!canEdit) await onAcquireLock();
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await patchOrder(order.id, {
        expectedVersion: order.version,
        items: draft.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.price,
        })),
        discountAmount: Number(form.discountAmount),
        customerNotes: form.customerNotes.trim() || null,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.errorAr || data.error || 'تعذر الحفظ');
      }
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm focus:outline-none focus:border-[var(--sys-primary)]';

  return (
    <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 shadow-raised space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-black text-[var(--sys-foreground)] flex items-center gap-2">
          <RiArchiveLine className="w-4 h-4 text-[var(--sys-primary)]" />
          بيانات الطلب
          {offerName && (
            <span className="text-xs font-medium text-[var(--sys-primary)] bg-[var(--sys-primary-soft)] border border-[var(--sys-primary-soft)] rounded-md px-1.5 py-0.5">
              عرض: {offerName}
            </span>
          )}
        </h4>
        <button
          onClick={openForm}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] inline-flex items-center gap-1.5"
        >
          <RiPencilLine className="w-4 h-4" />
          {open ? 'إغلاق' : 'تعديل'}
        </button>
      </div>

      <div className="border border-[var(--sys-border)] rounded-lg divide-y divide-[var(--sys-border)]">
        {lines.map((line) => (
          <div key={line.id} className="flex items-center gap-3 px-3 py-2.5">
            <ProductThumb
              src={order.productImageSnapshot || order.product?.image}
              alt={line.productName}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--sys-heading)] truncate">{line.productName}</p>
              <p className="text-xs text-[var(--sys-muted)] tabular-nums" dir="ltr">
                {line.quantity} × {amount(line.unitPrice, currency)}
                {line.freeQuantity > 0 && ` + ${line.freeQuantity} هدية`}
              </p>
            </div>
            <span className="text-sm font-bold text-[var(--sys-heading)] tabular-nums shrink-0" dir="ltr">
              {amount(line.lineTotal, currency)}
            </span>
          </div>
        ))}
      </div>

      {!open && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
          <Small label="سعر البيع" value={amount(order.sellingPrice, currency)} />
          <Small label="الكمية" value={String(order.quantity)} />
          <Small label="الخصم" value={amount(order.discountAmount, currency)} />
          <Small
            label="أجرة التوصيل"
            value={
              order.deliveryProvider || Number(order.deliveryFee ?? 0)
                ? amount(order.deliveryFee ?? 0, currency)
                : 'تُحدَّد مع الشحنة'
            }
          />
        </dl>
      )}

      {order.priceIncludesDelivery && !open && (
        <p className="text-xs text-[var(--sys-muted)]">سعر البيع شامل التوصيل.</p>
      )}

      {order.customerNotes && !open && (
        <p className="text-xs text-[var(--sys-warning)] bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/40 rounded-lg px-2.5 py-1.5 whitespace-pre-line">
          <span className="text-[var(--sys-warning)]">ملاحظات الطلب: </span>
          {order.customerNotes}
        </p>
      )}

      {open && (
        <div className="space-y-3">
          <ProductLinesEditor
            lines={draft}
            products={products}
            currency={currency}
            onChange={setDraft}
            disabled={busy}
          />

          <label className="block max-w-xs">
            <span className="block text-xs font-medium text-[var(--sys-muted-foreground)] mb-1">الخصم على الطلب</span>
            <input
              type="number" min="0" step="0.01" dir="ltr"
              value={form.discountAmount}
              onChange={(e) => setForm({ ...form, discountAmount: e.target.value })}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-[var(--sys-muted-foreground)] mb-1">ملاحظات الطلب</span>
            <textarea
              rows={2}
              value={form.customerNotes}
              onChange={(e) => setForm({ ...form, customerNotes: e.target.value })}
              placeholder="ما طلبه العميل: وقت التوصيل المفضل، تفاصيل العنوان…"
              className="w-full px-3 py-2 rounded-lg border border-[var(--sys-border)] text-sm focus:outline-none focus:border-[var(--sys-primary)]"
            />
          </label>

          <p className="text-xs text-[var(--sys-muted)]">
            أجرة التوصيل لا تُكتب هنا — تُحسب من جدول الأجور حين يُسند الطلب لشركة شحن.
          </p>

          {error && <p className="text-xs text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg px-2.5 py-1.5">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy && <RiLoader4Line className="w-4 h-4 animate-spin" />}
              حفظ بيانات الطلب
            </button>
            <button onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--sys-border)] text-[var(--sys-muted-foreground)]">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--sys-muted)]">{label}</dt>
      <dd className="text-[var(--sys-heading)] font-medium tabular-nums" dir="ltr">{value}</dd>
    </div>
  );
}
