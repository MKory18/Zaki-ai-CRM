'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Barcode, Boxes, Truck, Bike, Loader2, Printer, Send, Lock, Download, Plus } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import type { DispatchSummary } from '@/lib/courier-dispatch';
import { arDateShort } from '@/lib/format';
import { LabelSizePicker, useLabelSize } from '@/components/labels/LabelSize';
import { describeRefused, openWaybills, WaybillError } from '@/components/labels/openWaybills';
import { useTell } from '@/components/ui/Confirm';
import { CreateOrderModal } from '@/components/orders/CreateOrderModal';

/**
 * /ops/batches — the handovers to the couriers.
 *
 * A batch is what actually changes hands: a courier arrives, takes these
 * twenty parcels, and signs for them. The API has always been here and no
 * screen showed it, so the handover existed in the database and nowhere a
 * person could see it.
 *
 * Nothing on this screen invents a state. A batch is READY while it is being
 * filled, SHIPPED the moment the courier takes it, and CLOSED when it is
 * settled — the same three the server knows.
 */

interface Batch {
  id: string;
  batchNumber: string;
  status: string;
  createdAt: string;
  shippedAt: string | null;
  notes: string | null;
  provider: {
    id: string; name: string; code: string; kind?: string;
    /** Whether they have a server to send to at all. */
    apiEnabled?: boolean;
  } | null;
  creator: { id: string; name: string } | null;
  _count: { orders: number };
}

const STATUS: Record<string, { ar: string; cls: string }> = {
  READY: { ar: 'قيد التجميع', cls: 'bg-[var(--sys-surface)] text-[var(--sys-info)] border-[var(--sys-border)]' },
  SHIPPED: { ar: 'سُلّمت للشركة', cls: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]' },
  CLOSED: { ar: 'مغلقة', cls: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]' },
};

export function ShippingBatchesScreen() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'all' | 'READY' | 'SHIPPED' | 'CLOSED'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const tell = useTell();
  const [result, setResult] = useState<{ batchId: string; summary: DispatchSummary } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const labelSize = useLabelSize();
  // Somebody phoned and ordered. There is nothing to confirm — the call WAS
  // the confirmation — so the order goes straight to the packing line.
  const [addingOrder, setAddingOrder] = useState(false);
  const [addNotice, setAddNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ batches: Batch[]; pagination: { total: number } }>(
        '/api/shipping-batches?limit=100'
      );
      setBatches(res.batches);
      setTotal(res.pagination?.total ?? res.batches.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(batch: Batch, status: 'SHIPPED' | 'CLOSED') {
    setBusy(batch.id);
    setError(null);
    try {
      await apiJson(`/api/shipping-batches/${batch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحديث');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Hand this batch's orders to the courier and take back their barcodes.
   *
   * Reported per order, because twenty orders where three fail is seventeen
   * parcels that must still ship — and the three need the courier's own
   * words about why, not a single red line.
   */
  async function dispatch(batch: Batch) {
    setBusy(batch.id);
    setError(null);
    setResult(null);
    try {
      const summary = await apiJson<DispatchSummary>(`/api/ops/shipments/${batch.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setResult({ batchId: batch.id, summary });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الترحيل');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Create the order, then confirm it through the ORDINARY confirmation
   * endpoint.
   *
   * Not a second confirmation path: that one reserves the stock, stamps who
   * confirmed and when, and writes the status log. Re-implementing any of
   * that here would be a copy that drifts, and the first thing to drift
   * would be the reservation — which is how a shelf ends up promising units
   * it does not have.
   */
  async function addConfirmedOrder(order?: { id: string; orderNumber?: string }) {
    await load();
    if (!order?.id) return;
    try {
      const fresh = await apiJson<{ order: { version: number } }>(`/api/orders/${order.id}`);
      await apiJson(`/api/orders/${order.id}/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', expectedVersion: fresh.order.version }),
      });
      setAddNotice(`تم إنشاء ${order.orderNumber ?? 'الطلب'} وتأكيده — صار في شاشة التجهيز.`);
    } catch (e) {
      // The order exists either way; say so plainly rather than leaving
      // somebody to wonder whether it was created at all.
      setError(
        `أُنشئ ${order.orderNumber ?? 'الطلب'} لكن تعذّر تأكيده تلقائياً: ${
          e instanceof Error ? e.message : ''
        } — أكّده من شاشة الطلبات.`
      );
    }
  }

  /**
   * Every waybill in the batch, on one print run, on this device's paper —
   * or the same batch as the CSV some couriers take as a bulk upload
   * instead of paper. The CSV used to live on a separate labels screen; it
   * moved here with the printing rather than being lost with it.
   */
  async function printBatch(batch: Batch, mode: 'print' | 'pdf' | 'csv' = 'print') {
    setBusy(batch.id);
    setError(null);
    try {
      // The batch by id: its token no longer carries a list of order ids,
      // so a batch past two hundred orders prints like any other.
      const out = await openWaybills({ batchId: batch.id, ...labelSize.dims }, mode);
      if (out.refused.length) {
        void tell({
          title: `جُهِّزت ${out.count} بوليصة، ولم تُجهَّز ${out.refused.length}`,
          body: `لا يُطبع إلا طلب مؤكَّد له شركة شحن:\n${describeRefused(out.refused)}`,
        });
      }
    } catch (e) {
      if (e instanceof WaybillError && e.refused.length) {
        void tell({ title: e.message, body: describeRefused(e.refused), tone: 'danger' });
      } else {
        setError(e instanceof Error ? e.message : 'تعذر الطباعة');
      }
    } finally {
      setBusy(null);
    }
  }

  if (!batches) {
    return (
      <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const shown = filter === 'all' ? batches : batches.filter((b) => b.status === filter);
  const counts = {
    READY: batches.filter((b) => b.status === 'READY').length,
    SHIPPED: batches.filter((b) => b.status === 'SHIPPED').length,
    CLOSED: batches.filter((b) => b.status === 'CLOSED').length,
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--sys-heading)] flex items-center gap-2">
          <Boxes className="w-6 h-6 text-[var(--sys-primary)]" />
          دفعات الشحن
        </h1>
        <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">
          ما يتسلّمه المندوب دفعةً واحدة — تُجمَّع، تُسلَّم، ثم تُغلق بعد التسوية.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {([
          ['all', `الكل (${total})`],
          ['READY', `قيد التجميع (${counts.READY})`],
          ['SHIPPED', `سُلّمت (${counts.SHIPPED})`],
          ['CLOSED', `مغلقة (${counts.CLOSED})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
              filter === key
                ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] border-[var(--sys-primary)]'
                : 'bg-[var(--sys-card)] text-[var(--sys-foreground)] border-[var(--sys-border)] hover:border-[var(--sys-primary)]/40'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setAddingOrder(true)}
          className="ms-auto inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-[11px] font-semibold hover:bg-[var(--sys-primary)]"
          title="زبون اتصل وطلب — يُنشأ مؤكداً ويذهب مباشرة إلى التجهيز"
        >
          <Plus className="w-3.5 h-3.5" />
          أضف طلباً مؤكداً
        </button>

        {/* The paper every «طباعة بوالص الدفعة» below will use. */}
        <LabelSizePicker compact className="flex items-center" />
      </div>

      {addNotice && (
        <p className="text-sm text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-success)]/30 rounded-[8px] p-3">
          {addNotice}
        </p>
      )}

      {error && (
        <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-[8px] p-3">{error}</p>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--sys-muted-foreground)] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-6 text-center">
          لا دفعات هنا. تُنشأ الدفعة من شاشة «إنشاء شحنة» عند تسليم الطلبات لشركة.
        </p>
      ) : (
        <ul className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] divide-y divide-[var(--sys-border)]">
          {shown.map((b) => {
            const tone = STATUS[b.status] ?? STATUS.CLOSED;
            return (
              <li key={b.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[var(--sys-heading)] text-sm" dir="ltr">{b.batchNumber}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-[6px] border ${tone.cls}`}>{tone.ar}</span>

                  {b.provider && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--sys-muted-foreground)]">
                      {b.provider.kind === 'AGENT' ? (
                        <Bike className="w-3 h-3 text-[var(--sys-primary)]" />
                      ) : (
                        <Truck className="w-3 h-3 text-[var(--sys-muted)]" />
                      )}
                      {b.provider.name}
                    </span>
                  )}

                  <span className="text-[11px] text-[var(--sys-muted)] tabular-nums">
                    {b._count.orders} طلب
                  </span>

                  <span className="ms-auto text-[11px] text-[var(--sys-muted)]">
                    {b.shippedAt ? `سُلّمت ${arDateShort(b.shippedAt)}` : `أُنشئت ${arDateShort(b.createdAt)}`}
                    {b.creator?.name && ` · ${b.creator.name}`}
                  </span>
                </div>

                {b.notes && <p className="text-[11px] text-[var(--sys-muted-foreground)]">{b.notes}</p>}

                {result?.batchId === b.id && (
                  <div className="rounded-[8px] border border-[var(--sys-border)] bg-[var(--sys-surface)] p-2.5 space-y-1">
                    <p className="text-[11px] font-bold text-[var(--sys-heading)]">
                      رُحّل {result.summary.sent}
                      {result.summary.skipped > 0 && ` · تُخطّي ${result.summary.skipped}`}
                      {result.summary.failed > 0 && ` · فشل ${result.summary.failed}`}
                    </p>
                    {result.summary.outcomes
                      .filter((o) => !o.ok)
                      .map((o) => (
                        <p key={o.orderId} className="text-[10.5px] text-[var(--sys-muted-foreground)]">
                          <span className="font-mono" dir="ltr">{o.orderNumber}</span>
                          {' — '}
                          {o.skipped === 'ALREADY_SENT'
                            ? 'له باركود أصلاً'
                            : o.skipped === 'NOT_AUTOMATED'
                              ? 'شركة يدوية — لا API'
                              : o.skipped === 'NO_PROVIDER'
                                ? 'بلا شركة شحن'
                                : o.error}
                        </p>
                      ))}
                    {result.summary.outcomes.filter((o) => o.ok).length > 0 && (
                      <p className="text-[10.5px] text-[var(--sys-success)]">
                        الباركودات محفوظة على الطلبات — تظهر على البوليصة وتُتابَع بها الحالة.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    onClick={() => printBatch(b)}
                    disabled={busy === b.id || b._count.orders === 0}
                    className="text-[11px] px-2.5 py-1.5 rounded-[8px] border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {busy === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                    طباعة بوالص الدفعة
                  </button>

                  <button
                    onClick={() => printBatch(b, 'pdf')}
                    disabled={busy === b.id || b._count.orders === 0}
                    title="نفس البوالص كملف PDF — الحفظ لا يعلّم الطلبات مطبوعة"
                    className="text-[11px] px-2.5 py-1.5 rounded-[8px] border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PDF
                  </button>

                  <button
                    onClick={() => printBatch(b, 'csv')}
                    disabled={busy === b.id || b._count.orders === 0}
                    title="ملف للرفع الجماعي عند شركات الشحن التي تقبله بدل الورق"
                    className="text-[11px] px-2.5 py-1.5 rounded-[8px] border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>

                  {/* Send the orders to the courier and take their barcodes.
                      Separate from marking the batch handed over: one is a
                      call to their server, the other is our own record, and
                      a courier's API being down must not stop a warehouse
                      from closing a batch. */}
                  {/* Only for a courier that HAS a server. A manual one was
                      offered this button too: it called out, every order came
                      back "skipped — not automated", and nothing happened.
                      The parcels are real, the waybills are ours to print,
                      and the barcode is typed in when they hand one over. */}
                  {b.status === 'READY' && b.provider?.apiEnabled && (
                    <button
                      onClick={() => dispatch(b)}
                      disabled={busy === b.id || b._count.orders === 0}
                      className="text-[11px] px-2.5 py-1.5 rounded-[8px] border border-[var(--sys-primary)] text-[var(--sys-primary)] font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {busy === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Barcode className="w-3.5 h-3.5" />}
                      رحّل إلى الشركة واجلب الباركود
                    </button>
                  )}

                  {b.status === 'READY' && b.provider && !b.provider.apiEnabled && (
                    <span
                      title="هذه الشركة غير مربوطة بنظامها — البوليصة تُطبع من عندنا والباركود يُدخَل يدوياً عند استلامه."
                      className="inline-flex items-center gap-1 rounded-[8px] border border-[var(--sys-border)] bg-[var(--sys-surface)] px-2.5 py-1.5 text-[11px] text-[var(--sys-muted-foreground)]"
                    >
                      <Barcode className="h-3.5 w-3.5" />
                      يدوية — اطبع البوالص
                    </span>
                  )}

                  {b.status === 'READY' && (
                    <button
                      onClick={() => setStatus(b, 'SHIPPED')}
                      disabled={busy === b.id}
                      className="text-[11px] px-2.5 py-1.5 rounded-[8px] bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      سُلّمت للشركة
                    </button>
                  )}

                  {b.status === 'SHIPPED' && (
                    <button
                      onClick={() => setStatus(b, 'CLOSED')}
                      disabled={busy === b.id}
                      className="text-[11px] px-2.5 py-1.5 rounded-[8px] border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-heading)] inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      أغلق الدفعة
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    <CreateOrderModal
        isOpen={addingOrder}
        onClose={() => setAddingOrder(false)}
        onSuccess={addConfirmedOrder}
      />
    </div>
  );
}
