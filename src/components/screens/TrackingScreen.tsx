'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bike, Clock, Loader2, Search, Truck } from 'lucide-react';
import { TransferDialog } from '@/components/screens/tracking/TransferDialog';
import { apiJson } from '@/lib/api-client';

/**
 * /ops/tracking — search by order, reference, barcode, customer or phone.
 * Days in transit and the late flag come from the API against each region's
 * own threshold. Collection status is its own column, never merged with the
 * delivery status.
 */

interface Row {
  id: string;
  orderNumber: string;
  merchantRef: string | null;
  trackingNumber: string | null;
  shippingStatus: string;
  collectionStatus: string;
  daysInTransit: number | null;
  lateThresholdDays: number;
  late: boolean;
  totalAmount: number;
  currency: string;
  deliveryFailureReason: string | null;
  customer: { fullName: string; phone: string; city: string };
  region: { name: string } | null;
  deliveryProvider: { id: string; name: string; kind?: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  READY_FOR_PICKUP: 'بانتظار الاستلام',
  SHIPPED: 'تم الشحن',
  OUT_FOR_DELIVERY: 'خارج للتوصيل',
  FAILED_DELIVERY: 'تعذر التوصيل',
  RETURN_REQUESTED: 'طلب إرجاع',
  DELIVERED: 'تم التسليم',
  RETURNED: 'مرتجع',
};

const COLLECTION_LABEL: Record<string, string> = {
  NOT_APPLICABLE: 'لا ينطبق',
  PENDING: 'بانتظار',
  PENDING_COLLECTION: 'لم يُحصَّل',
  COLLECTED: 'محصَّل',
  SETTLED: 'مسوّى',
  UNSETTLED: 'غير مسوّى',
};

export function TrackingScreen() {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<{ orders: Row[]; lateCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [transferFor, setTransferFor] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (term.trim()) q.set('q', term.trim());
    if (status) q.set('status', status);
    try {
      setData(await apiJson(`/api/ops/tracking?${q}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [term, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-6xl space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 flex flex-wrap gap-3 items-end"
      >
        <label className="flex-1 min-w-[220px]">
          <span className="block text-xs font-medium text-[#364152] mb-1">بحث</span>
          <div className="relative">
            <Search className="w-4 h-4 text-[#9aa4b2] absolute right-3 top-3" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="رقم الطلب، المرجع، الباركود، اسم العميل أو الهاتف"
              className="w-full h-10 pr-9 pl-3 rounded-[8px] border border-[#e3e8ef] text-sm"
            />
          </div>
        </label>
        <label>
          <span className="block text-xs font-medium text-[#364152] mb-1">الحالة</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm">
            <option value="">قيد الشحن</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
            <option value="all">الكل</option>
          </select>
        </label>
        <button type="submit" className="h-10 px-4 rounded-[8px] bg-[#b8256e] text-white text-sm font-medium">بحث</button>
        {data && data.lateCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] px-3 h-10">
            <Clock className="w-4 h-4" /> {data.lateCount} شحنة متأخرة
          </span>
        )}
      </form>

      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}
      {done && <p className="text-sm text-[#00a344] bg-emerald-50 border border-emerald-100 rounded-[8px] p-3">{done}</p>}

      {!data ? (
        <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (
        <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#697586] text-xs">
              <tr>
                <th className="text-right font-medium px-3 py-2">المرجع</th>
                <th className="text-right font-medium px-3 py-2">الباركود</th>
                <th className="text-right font-medium px-3 py-2">العميل</th>
                <th className="text-right font-medium px-3 py-2">المحافظة</th>
                <th className="text-right font-medium px-3 py-2">جهة الشحن</th>
                <th className="text-right font-medium px-3 py-2">حالة الشحن</th>
                <th className="text-right font-medium px-3 py-2">أيام الشحن</th>
                <th className="text-right font-medium px-3 py-2">حالة التحصيل</th>
                <th className="text-right font-medium px-3 py-2">المبلغ</th>
                <th className="text-right font-medium px-3 py-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8ef]">
              {data.orders.map((o) => (
                <tr key={o.id} className={o.late ? 'bg-[#feecee]/40' : ''}>
                  <td className="px-3 py-2 font-medium text-[#121926]" dir="ltr">{o.merchantRef ?? o.orderNumber}</td>
                  <td className="px-3 py-2 text-[#697586]" dir="ltr">{o.trackingNumber ?? '—'}</td>
                  <td className="px-3 py-2 text-[#364152]">{o.customer.fullName}</td>
                  <td className="px-3 py-2 text-[#697586]">{o.region?.name ?? o.customer.city}</td>
                  <td className="px-3 py-2">
                    {o.deliveryProvider ? (
                      <span className="inline-flex items-center gap-1 text-[#364152]">
                        {o.deliveryProvider.kind === 'AGENT' ? (
                          <Bike className="w-3.5 h-3.5 text-[#b8256e]" />
                        ) : (
                          <Truck className="w-3.5 h-3.5 text-[#9aa4b2]" />
                        )}
                        {o.deliveryProvider.name}
                      </span>
                    ) : (
                      <span className="text-[#9aa4b2]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[#364152]">
                    {STATUS_LABEL[o.shippingStatus] ?? o.shippingStatus}
                    {o.deliveryFailureReason && <span className="block text-[11px] text-[#fb323f]">{o.deliveryFailureReason}</span>}
                  </td>
                  <td className={`px-3 py-2 tabular-nums ${o.late ? 'text-[#fb323f] font-semibold' : 'text-[#364152]'}`}>
                    {o.daysInTransit ?? '—'}
                    {o.lateThresholdDays > 0 && <span className="text-[11px] text-[#9aa4b2]"> / {o.lateThresholdDays}</span>}
                  </td>
                  <td className="px-3 py-2 text-[#697586]">{COLLECTION_LABEL[o.collectionStatus] ?? o.collectionStatus}</td>
                  <td className="px-3 py-2 tabular-nums" dir="ltr">{o.totalAmount} {o.currency}</td>
                  <td className="px-3 py-2 text-left whitespace-nowrap">
                    <button
                      onClick={() => setTransferFor(o)}
                      className="text-xs text-[#b8256e] hover:underline"
                      title={
                        o.deliveryProvider?.kind === 'AGENT'
                          ? 'استلام من المندوب وتحويلها لجهة أخرى'
                          : 'سحب الشحنة وإصدار طلب بديل لجهة أخرى'
                      }
                    >
                      تحويل
                    </button>
                  </td>
                </tr>
              ))}
              {data.orders.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-sm text-[#697586]">لا توجد شحنات مطابقة.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {transferFor && (
        <TransferDialog
          order={transferFor}
          onClose={() => setTransferFor(null)}
          onDone={async (message) => {
            setTransferFor(null);
            setDone(message);
            setError(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
