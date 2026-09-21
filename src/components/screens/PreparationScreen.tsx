'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, Loader2, PackageCheck } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { ChangeRequestReview } from '@/components/orders/ChangeRequestReview';
import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { RejectDialog } from '@/components/screens/confirmation/ActionDialogs';
import { Pencil, XCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';

/**
 * /ops/preparation — grouped BY PRODUCT, collapsible. Orders, required,
 * available and shortage all come from the API; the screen adds nothing.
 */

interface Line {
  orderId: string;
  orderNumber: string;
  customerName: string;
  regionName: string | null;
  pendingChangeRequestId: string | null;
  quantity: number;
  freeQuantity: number;
  reservedQty: number;
  shippingStatus: string;
}

interface Group {
  productId: string;
  productName: string;
  orders: number;
  required: number;
  available: number;
  shortage: number;
  lines: Line[];
}

export function PreparationScreen() {
  const [data, setData] = useState<{ allowNegativeStock: boolean; totals: { products: number; orders: number; shortages: number }; groups: Group[] } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  // A request waiting on an order is the one thing the packer must see
  // before the box is taped.
  const [reviewing, setReviewing] = useState<string | null>(null);
  // The customer rings while the box is being packed: change it, or stop
  // it. Both have to be reachable from the row the packer is looking at,
  // not from a screen somebody has to go and find.
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<{ id: string; orderNumber: string } | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Who is standing at this screen.
   *
   * It is the packing line, and the person on it is a warehouse hand who
   * holds seven permissions — all of them about stock and preparation, none
   * about orders. Cancelling a customer's order was never their job, and
   * the customer's phone number is redacted from their view on purpose.
   *
   * So the two controls appear for whoever ALSO has the authority: a
   * supervisor or an owner looking at the same screen. Showing them to the
   * packer would be two buttons that can only ever produce a red error.
   */
  const { currentUser } = useApp();
  const perms = currentUser?.permissions ?? [];
  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN';
  const mayOpenOrder = isAdmin || perms.includes('orders.view');
  const mayCancel = isAdmin || perms.includes('orders.unlock');

  const load = useCallback(async () => {
    try {
      setData(await apiJson('/api/ops/preparation'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>;
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <Kpi label="منتجات للتجهيز" value={data.totals.products} />
        <Kpi label="طلبات" value={data.totals.orders} />
        <Kpi label="نواقص" value={data.totals.shortages} danger={data.totals.shortages > 0} />
        <span className="text-xs text-[#697586] self-center">
          {data.allowNegativeStock ? 'المخزون السالب مسموح مع تنبيه' : 'المخزون السالب ممنوع — النقص يمنع الشحن'}
        </span>
      </div>

      {data.groups.length === 0 && (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          لا توجد طلبات مؤكدة بانتظار التجهيز.
        </p>
      )}

      {data.groups.map((g) => (
        <section key={g.productId} className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
          <button
            onClick={() => setOpen((o) => ({ ...o, [g.productId]: !o[g.productId] }))}
            className="w-full flex items-center gap-3 p-4 text-right hover:bg-[#f8fafc]"
          >
            <span className="w-9 h-9 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] flex items-center justify-center">
              <PackageCheck className="w-4 h-4 text-[#b8256e]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-[#121926] truncate">{g.productName}</span>
              <span className="block text-xs text-[#697586]">
                {g.orders} طلب · مطلوب {g.required} · متاح {g.available}
                {g.shortage > 0 && <span className="text-[#fb323f]"> · نقص {g.shortage}</span>}
              </span>
            </span>
            {open[g.productId] ? <ChevronDown className="w-4 h-4 text-[#697586]" /> : <ChevronLeft className="w-4 h-4 text-[#697586]" />}
          </button>

          {open[g.productId] && (
            <table className="w-full text-sm border-t border-[#e3e8ef]">
              <thead className="bg-[#f8fafc] text-[#697586] text-xs">
                <tr>
                  <th className="text-right font-medium px-4 py-2">الطلب</th>
                  <th className="text-right font-medium px-4 py-2">العميل</th>
                  <th className="text-right font-medium px-4 py-2">المحافظة</th>
                  <th className="text-right font-medium px-4 py-2">الكمية</th>
                  <th className="text-right font-medium px-4 py-2">محجوز</th>
                  <th className="text-right font-medium px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e3e8ef]">
                {g.lines.map((l) => (
                  <tr key={l.orderId}>
                    <td className="px-4 py-2 font-medium text-[#121926]" dir="ltr">{l.orderNumber}</td>
                    <td className="px-4 py-2 text-[#364152]">{l.customerName}</td>
                    <td className="px-4 py-2 text-[#697586]">{l.regionName ?? '—'}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {l.quantity}
                      {l.freeQuantity > 0 && ` (+${l.freeQuantity})`}
                    </td>
                    <td className={`px-4 py-2 tabular-nums ${l.reservedQty >= l.quantity + l.freeQuantity ? 'text-[#00a344]' : 'text-[#fb323f]'}`}>
                      {l.reservedQty}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {mayOpenOrder && (
                        <button
                          type="button"
                          onClick={() => setOpenOrderId(l.orderId)}
                          title="افتح الطلب وعدّله — ما لم تكن بوليصته قد طُبعت"
                          className="p-1 rounded-lg text-[#9aa4b2] hover:text-[#b8256e] hover:bg-[#fdf5fa]"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {mayCancel && (
                        <button
                          type="button"
                          onClick={() => setCancelling({ id: l.orderId, orderNumber: l.orderNumber })}
                          title="ألغِ الطلب — يعود المحجوز من بضاعته إلى المخزون"
                          className="p-1 rounded-lg text-[#9aa4b2] hover:text-[#fb323f] hover:bg-[#feecee]"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {l.pendingChangeRequestId && (
                        <button
                          type="button"
                          onClick={() => setReviewing(l.pendingChangeRequestId!)}
                          title="طلب تعديل بانتظار البتّ — راجعه قبل التغليف"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-[11px] font-semibold text-[#c07f2a] hover:border-[#c07f2a]"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#c07f2a] animate-pulse" aria-hidden />
                          طلب تعديل
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      {openOrderId && (
        <OrderDetailModal
          isOpen
          orderId={openOrderId}
          onClose={() => setOpenOrderId(null)}
          onRefresh={load}
        />
      )}

      {cancelling && (
        <RejectDialog
          open
          orderNumber={cancelling.orderNumber}
          busy={busy}
          onClose={() => setCancelling(null)}
          onSubmit={async (value) => {
            setBusy(true);
            setError(null);
            try {
              // Through the ordinary cancellation path: it checks whether
              // the parcel can still be taken off the shelf, releases the
              // reservation, and records who stopped it.
              const fresh = await apiJson<{ order: { version: number } }>(`/api/orders/${cancelling.id}`);
              await apiJson(`/api/orders/${cancelling.id}/confirmation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'cancel',
                  note: `${value.rejectionReason}${value.note ? ` — ${value.note}` : ''}`,
                  expectedVersion: fresh.order.version,
                }),
              });
              setCancelling(null);
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'تعذر الإلغاء');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {reviewing && (
        <ChangeRequestReview
          requestId={reviewing}
          onClose={() => setReviewing(null)}
          onDecided={load}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`px-4 py-2 rounded-[8px] border ${danger ? 'bg-[#feecee] border-[#fecdd1]' : 'bg-white border-[#e3e8ef]'}`}>
      <p className="text-xs text-[#697586]">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${danger ? 'text-[#fb323f]' : 'text-[#121926]'}`}>{value}</p>
    </div>
  );
}
