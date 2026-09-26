'use client';

import React, { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { RiArchiveDrawerLine } from '@remixicon/react';

/**
 * Settling a parcel at the door.
 *
 * One dialog for all three outcomes, because they are the same event seen
 * from different line counts: everything taken, some taken, nothing taken.
 * Three separate buttons would invite three different fee rules.
 *
 * The fee line is stated plainly and does not move as lines are unticked,
 * because it does not move in reality — the courier travelled to that door
 * whichever lines came back.
 */

interface Line {
  id: string;
  productName: string;
  quantity: number;
  freeQuantity: number;
  unitPrice: number;
  discountShare: number;
}

export function DeliverDialog({
  order,
  onClose,
  onDone,
}: {
  order: { id: string; orderNumber: string; merchantRef: string | null; currency: string; deliveryFee?: number | null; priceIncludesDelivery?: boolean };
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [taken, setTaken] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiJson<{ order: { items: Line[] } }>(`/api/orders/${order.id}`)
      .then((d) => {
        setLines(d.order.items);
        // Everything taken is the common case; unticking is the exception.
        setTaken(Object.fromEntries(d.order.items.map((i) => [i.id, i.quantity + i.freeQuantity])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'تعذر تحميل البنود'));
  }, [order.id]);

  const fee = Number(order.deliveryFee ?? 0);
  const anyTaken = Object.values(taken).some((n) => n > 0);

  const goods = (lines ?? []).reduce((sum, l) => {
    const delivered = taken[l.id] ?? 0;
    const paid = Math.min(delivered, l.quantity);
    const discountPerUnit = l.quantity > 0 ? Number(l.discountShare) / l.quantity : 0;
    return sum + paid * (Number(l.unitPrice) - discountPerUnit);
  }, 0);

  const chargedFee = anyTaken ? fee : 0;
  const collected = order.priceIncludesDelivery ? goods : goods + chargedFee;
  const allTaken = (lines ?? []).every((l) => (taken[l.id] ?? 0) === l.quantity + l.freeQuantity);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="تسجيل التسليم"
      subtitle={`${order.merchantRef ?? order.orderNumber} — أشّر ما استلمه العميل فعلاً`}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            const res = await apiJson<{ message: string }>('/api/ops/tracking/deliver', {
              method: 'POST',
              body: JSON.stringify({
                orderId: order.id,
                lines: (lines ?? []).map((l) => ({ itemId: l.id, deliveredQty: taken[l.id] ?? 0 })),
                note: note.trim() || undefined,
              }),
            });
            onDone(res.message);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر التسجيل');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        {!lines ? (
          <p className="text-sm text-[var(--sys-muted-foreground)] py-6 text-center">جارٍ التحميل…</p>
        ) : (
          <>
            <div className="border border-[var(--sys-border)] rounded-lg divide-y divide-[var(--sys-border)]">
              {lines.map((l) => {
                const shipped = l.quantity + l.freeQuantity;
                const value = taken[l.id] ?? 0;
                return (
                  <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--sys-heading)] truncate">{l.productName}</p>
                      <p className="text-xs text-[var(--sys-muted)] tabular-nums">
                        شُحن {shipped}
                        {l.freeQuantity > 0 && ` (منها ${l.freeQuantity} هدية)`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setTaken((t) => ({ ...t, [l.id]: 0 }))}
                        className={`text-xs px-2 py-1 rounded-md border ${
                          value === 0 ? 'bg-[var(--sys-destructive-soft)] border-[var(--sys-destructive-border)] text-[var(--sys-destructive)]' : 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)]'
                        }`}
                      >
                        رفضه
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={shipped}
                        value={value}
                        onChange={(e) =>
                          setTaken((t) => ({ ...t, [l.id]: Math.max(0, Math.min(shipped, Number(e.target.value))) }))
                        }
                        className="w-16 h-8 px-2 rounded-md border border-[var(--sys-border)] text-sm text-center tabular-nums"
                        dir="ltr"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-3 space-y-1 tabular-nums">
              <p className="flex justify-between text-[var(--sys-foreground)]">
                <span>قيمة ما استُلم</span>
                <span>{Math.round(goods * 100) / 100} {order.currency}</span>
              </p>
              <p className="flex justify-between text-[var(--sys-foreground)]">
                <span>
                  أجرة التوصيل
                  {order.priceIncludesDelivery && <span className="text-[var(--sys-muted)]"> (داخلة في السعر)</span>}
                </span>
                <span>{chargedFee} {order.currency}</span>
              </p>
              <p className="flex justify-between font-semibold text-[var(--sys-heading)] border-t border-[var(--sys-border)] pt-1">
                <span>المحصَّل من العميل</span>
                <span>{Math.round(collected * 100) / 100} {order.currency}</span>
              </p>

              {!allTaken && anyTaken && (
                <p className="text-xs text-[var(--sys-warning)] pt-1">
                  الأجرة تُحتسب كاملة رغم رفض بعض البنود — المندوب قطع الطريق فعلاً.
                </p>
              )}
              {!anyTaken && (
                <p className="text-xs text-[var(--sys-destructive)] pt-1">
                  لم يُستلم شيء — سيُسجَّل الطلب مرتجعاً بلا أجرة.
                </p>
              )}
            </div>

            <p className="text-xs text-[var(--sys-muted)]">
              البنود المرفوضة لا تعود للمخزون من هنا — تُستلم وتُفحص في شاشة المرتجعات.
            </p>

            <label className="block">
              <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">ملاحظة (اختيارية)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="سبب رفض البنود مثلاً"
                className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
              />
            </label>
          </>
        )}

        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving || !lines}
            className="h-10 px-4 rounded-lg bg-[var(--sys-success)] text-[var(--sys-primary-foreground)] text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RiArchiveDrawerLine className="w-4 h-4" />
            {saving ? 'جارٍ التسجيل…' : !anyTaken ? 'تسجيل كمرتجع' : allTaken ? 'تسليم كامل' : 'تسليم جزئي'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
