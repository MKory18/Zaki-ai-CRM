'use client';

import React, { useEffect, useState } from 'react';
import { Package, Pencil, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { amount, type Currency } from '@/lib/format';
import { ProductLinesEditor, newLine, type DraftLine } from '@/components/orders/ProductLinesEditor';


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
    landingPageOffer?: { name: string } | null;
    deliveryProvider?: { id: string; name: string } | null;
  };
  currency: Currency | null;
  canEdit: boolean;
  onAcquireLock: () => Promise<unknown> | void;
  onSaved: () => void;
}

export function OrderLinesCard({ order, currency, canEdit, onAcquireLock, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    discountAmount: String(order.discountAmount ?? 0),
    internalNotes: order.internalNotes ?? '',
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

  const offerName = order.landingPageOffer?.name || order.offer?.name || null;
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
    setForm({
      discountAmount: String(order.discountAmount ?? 0),
      internalNotes: order.internalNotes ?? '',
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
      await apiJson(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: order.version,
          items: draft.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.price,
          })),
          discountAmount: Number(form.discountAmount),
          internalNotes: form.internalNotes.trim() || null,
        }),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'w-full h-9 px-3 rounded-[8px] border border-[#e3e8ef] text-sm focus:outline-none focus:border-[#b8256e]';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-black text-slate-700 flex items-center gap-2">
          <Package className="w-4 h-4 text-[#b8256e]" />
          بيانات الطلب
          {offerName && (
            <span className="text-[10px] font-medium text-[#b8256e] bg-[#fdf5fa] border border-[#f2c9dd] rounded-md px-1.5 py-0.5">
              عرض: {offerName}
            </span>
          )}
        </h4>
        <button
          onClick={openForm}
          className="text-[11px] px-2.5 py-1.5 rounded-[8px] border border-[#e3e8ef] text-slate-600 hover:text-[#b8256e] inline-flex items-center gap-1.5"
        >
          <Pencil className="w-3.5 h-3.5" />
          {open ? 'إغلاق' : 'تعديل'}
        </button>
      </div>

      <div className="border border-[#e3e8ef] rounded-[8px] divide-y divide-[#e3e8ef]">
        {lines.map((line) => (
          <div key={line.id} className="flex items-center gap-3 px-3 py-2.5">
            <ProductThumb
              src={order.productImageSnapshot || order.product?.image}
              alt={line.productName}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{line.productName}</p>
              <p className="text-[11px] text-slate-400 tabular-nums" dir="ltr">
                {line.quantity} × {amount(line.unitPrice, currency)}
                {line.freeQuantity > 0 && ` + ${line.freeQuantity} هدية`}
              </p>
            </div>
            <span className="text-sm font-bold text-slate-900 tabular-nums shrink-0" dir="ltr">
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
        <p className="text-[11px] text-slate-400">سعر البيع شامل التوصيل.</p>
      )}

      {(order.internalNotes || order.customerNotes) && !open && (
        <div className="space-y-1.5">
          {order.customerNotes && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-[8px] px-2.5 py-1.5">
              <span className="text-amber-700">ملاحظة العميل: </span>
              {order.customerNotes}
            </p>
          )}
          {order.internalNotes && (
            <p className="text-xs text-slate-600 bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] px-2.5 py-1.5 whitespace-pre-line">
              <span className="text-slate-400">ملاحظات داخلية: </span>
              {order.internalNotes}
            </p>
          )}
        </div>
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
            <span className="block text-xs font-medium text-slate-600 mb-1">الخصم على الطلب</span>
            <input
              type="number" min="0" step="0.01" dir="ltr"
              value={form.discountAmount}
              onChange={(e) => setForm({ ...form, discountAmount: e.target.value })}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">ملاحظات داخلية</span>
            <textarea
              rows={2}
              value={form.internalNotes}
              onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
              placeholder="ما يحتاج من يكمل هذا الطلب أن يعرفه"
              className="w-full px-3 py-2 rounded-[8px] border border-[#e3e8ef] text-sm focus:outline-none focus:border-[#b8256e]"
            />
          </label>

          <p className="text-[11px] text-slate-400">
            أجرة التوصيل لا تُكتب هنا — تُحسب من جدول الأجور حين يُسند الطلب لشركة شحن.
          </p>

          {error && <p className="text-[11px] text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] px-2.5 py-1.5">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-[8px] bg-[#b8256e] text-white font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              حفظ بيانات الطلب
            </button>
            <button onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 rounded-[8px] border border-[#e3e8ef] text-slate-600">
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
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className="text-slate-900 font-medium tabular-nums" dir="ltr">{value}</dd>
    </div>
  );
}
