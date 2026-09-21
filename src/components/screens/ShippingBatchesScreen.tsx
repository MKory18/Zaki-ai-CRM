'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Barcode, Boxes, Truck, Bike, Loader2, Printer, Send, Lock } from 'lucide-react';
import { apiJson, apiFetch } from '@/lib/api-client';
import type { DispatchSummary } from '@/lib/courier-dispatch';
import { arDateShort } from '@/lib/format';
import { LabelSizePicker, useLabelSize } from '@/components/labels/LabelSize';

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
  provider: { id: string; name: string; code: string; kind?: string } | null;
  creator: { id: string; name: string } | null;
  _count: { orders: number };
}

const STATUS: Record<string, { ar: string; cls: string }> = {
  READY: { ar: 'قيد التجميع', cls: 'bg-[#eef4ff] text-[#2563eb] border-[#c7dbff]' },
  SHIPPED: { ar: 'سُلّمت للشركة', cls: 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]' },
  CLOSED: { ar: 'مغلقة', cls: 'bg-[#f8fafc] text-[#697586] border-[#e3e8ef]' },
};

export function ShippingBatchesScreen() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'all' | 'READY' | 'SHIPPED' | 'CLOSED'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ batchId: string; summary: DispatchSummary } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const labelSize = useLabelSize();

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

  /** Every waybill in the batch, on one print run, on this device's paper. */
  async function printBatch(batch: Batch) {
    setBusy(batch.id);
    setError(null);
    try {
      const detail = await apiJson<{ batch: { orders: { id: string }[] } }>(
        `/api/shipping-batches/${batch.id}`
      );
      const orderIds = (detail.batch?.orders ?? []).map((o) => o.id);
      if (orderIds.length === 0) {
        setError('لا طلبات في هذه الدفعة');
        return;
      }
      const res = await apiFetch('/api/ops/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds, ...labelSize.dims }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.errorAr || data.error || 'تعذر تجهيز البوالص');
      window.open(data.printPath, '_blank');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الطباعة');
    } finally {
      setBusy(null);
    }
  }

  if (!batches) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
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
        <h1 className="text-2xl font-bold text-[#121926] flex items-center gap-2">
          <Boxes className="w-6 h-6 text-[#b8256e]" />
          دفعات الشحن
        </h1>
        <p className="text-xs text-[#697586] mt-1">
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
                ? 'bg-[#b8256e] text-white border-[#b8256e]'
                : 'bg-white text-[#364152] border-[#e3e8ef] hover:border-[#b8256e]/40'
            }`}
          >
            {label}
          </button>
        ))}
        {/* The paper every «طباعة بوالص الدفعة» below will use. */}
        <LabelSizePicker compact className="ms-auto flex items-center" />
      </div>

      {error && (
        <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          لا دفعات هنا. تُنشأ الدفعة من شاشة «إنشاء شحنة» عند تسليم الطلبات لشركة.
        </p>
      ) : (
        <ul className="bg-white border border-[#e3e8ef] rounded-[8px] divide-y divide-[#e3e8ef]">
          {shown.map((b) => {
            const tone = STATUS[b.status] ?? STATUS.CLOSED;
            return (
              <li key={b.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#121926] text-sm" dir="ltr">{b.batchNumber}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-[6px] border ${tone.cls}`}>{tone.ar}</span>

                  {b.provider && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#697586]">
                      {b.provider.kind === 'AGENT' ? (
                        <Bike className="w-3 h-3 text-[#b8256e]" />
                      ) : (
                        <Truck className="w-3 h-3 text-[#9aa4b2]" />
                      )}
                      {b.provider.name}
                    </span>
                  )}

                  <span className="text-[11px] text-[#9aa4b2] tabular-nums">
                    {b._count.orders} طلب
                  </span>

                  <span className="ms-auto text-[11px] text-[#9aa4b2]">
                    {b.shippedAt ? `سُلّمت ${arDateShort(b.shippedAt)}` : `أُنشئت ${arDateShort(b.createdAt)}`}
                    {b.creator?.name && ` · ${b.creator.name}`}
                  </span>
                </div>

                {b.notes && <p className="text-[11px] text-[#697586]">{b.notes}</p>}

                {result?.batchId === b.id && (
                  <div className="rounded-[8px] border border-[#e3e8ef] bg-[#f8fafc] p-2.5 space-y-1">
                    <p className="text-[11px] font-bold text-[#121926]">
                      رُحّل {result.summary.sent}
                      {result.summary.skipped > 0 && ` · تُخطّي ${result.summary.skipped}`}
                      {result.summary.failed > 0 && ` · فشل ${result.summary.failed}`}
                    </p>
                    {result.summary.outcomes
                      .filter((o) => !o.ok)
                      .map((o) => (
                        <p key={o.orderId} className="text-[10.5px] text-[#697586]">
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
                      <p className="text-[10.5px] text-[#15803d]">
                        الباركودات محفوظة على الطلبات — تظهر على البوليصة وتُتابَع بها الحالة.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    onClick={() => printBatch(b)}
                    disabled={busy === b.id || b._count.orders === 0}
                    className="text-[11px] px-2.5 py-1.5 rounded-[8px] border border-[#e3e8ef] text-[#697586] hover:text-[#b8256e] inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {busy === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                    طباعة بوالص الدفعة
                  </button>

                  {/* Send the orders to the courier and take their barcodes.
                      Separate from marking the batch handed over: one is a
                      call to their server, the other is our own record, and
                      a courier's API being down must not stop a warehouse
                      from closing a batch. */}
                  {b.status === 'READY' && (
                    <button
                      onClick={() => dispatch(b)}
                      disabled={busy === b.id || b._count.orders === 0}
                      className="text-[11px] px-2.5 py-1.5 rounded-[8px] border border-[#b8256e] text-[#b8256e] font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {busy === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Barcode className="w-3.5 h-3.5" />}
                      رحّل إلى الشركة واجلب الباركود
                    </button>
                  )}

                  {b.status === 'READY' && (
                    <button
                      onClick={() => setStatus(b, 'SHIPPED')}
                      disabled={busy === b.id}
                      className="text-[11px] px-2.5 py-1.5 rounded-[8px] bg-[#b8256e] text-white font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      سُلّمت للشركة
                    </button>
                  )}

                  {b.status === 'SHIPPED' && (
                    <button
                      onClick={() => setStatus(b, 'CLOSED')}
                      disabled={busy === b.id}
                      className="text-[11px] px-2.5 py-1.5 rounded-[8px] border border-[#e3e8ef] text-[#697586] hover:text-[#121926] inline-flex items-center gap-1.5 disabled:opacity-50"
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
    </div>
  );
}
