'use client';

import React, { useEffect, useState } from 'react';
import { History, Loader2, ShieldAlert } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { OrderStateBadge } from './OrderStateBadge';
import { arDate, arDateShort } from '@/lib/format';

/**
 * "Has this customer ordered before?" — a small counter next to the order
 * that opens the customer's history and, for the current order, its merged
 * timeline. The customer is company-wide, so the history crosses stores:
 * an order returned elsewhere is still a returned order.
 */

interface HistoryOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  state: string;
  totalAmount: number;
  currency: string;
  rejectionReason: string | null;
  returnReason: string | null;
  store: { name: string } | null;
  items: { productName: string; quantity: number; freeQuantity: number }[];
}

interface HistoryResponse {
  customer: { fullName: string; rawPhone: string; totalOrders: number; deliveredOrders: number; cancelledOrders: number };
  risk: { tier: 'SAFE' | 'WATCH' | 'HIGH'; returnRate: number; orders: number; returns: number; requiresPrepaymentOrApproval: boolean };
  orders: HistoryOrder[];
}

interface TimelineResponse {
  state: string;
  events: { id: string; kind: string; at: string; title: string; detail?: string | null; actorName?: string | null }[];
}

const RISK: Record<string, { text: string; cls: string }> = {
  SAFE: { text: 'خطورة منخفضة', cls: 'bg-emerald-50 text-[#00a344] border-emerald-100' },
  WATCH: { text: 'تحت المراقبة', cls: 'bg-amber-50 text-[#c07f2a] border-amber-100' },
  HIGH: { text: 'خطورة عالية', cls: 'bg-[#feecee] text-[#fb323f] border-[#fecdd1]' },
};

/** Small counter button: "سجل 3". Renders nothing distracting at zero. */
export function CustomerHistoryButton({
  customerId,
  orderId,
  previousOrders,
  label = 'السجل',
}: {
  customerId: string;
  orderId?: string;
  previousOrders: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={previousOrders > 0 ? `${previousOrders} طلب سابق لهذا العميل` : 'عميل جديد — لا طلبات سابقة'}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] border text-[11px] ${
          previousOrders > 0
            ? 'bg-[#f8fafc] border-[#e3e8ef] text-[#364152] hover:border-[#b8256e]'
            : 'bg-white border-[#e3e8ef] text-[#9aa4b2] hover:border-[#b8256e]'
        }`}
      >
        <History className="w-3 h-3" />
        {label}
        <span className="tabular-nums" dir="ltr">{previousOrders}</span>
      </button>

      {open && <CustomerHistoryModal customerId={customerId} orderId={orderId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function CustomerHistoryModal({
  customerId,
  orderId,
  onClose,
}: {
  customerId: string;
  orderId?: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'history' | 'timeline'>(orderId ? 'timeline' : 'history');
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = orderId ? `?exclude=${orderId}` : '';
    apiJson<HistoryResponse>(`/api/customers/${customerId}/history${q}`)
      .then(setHistory)
      .catch((e) => setError(e instanceof Error ? e.message : 'تعذر تحميل السجل'));
    if (orderId) {
      apiJson<TimelineResponse>(`/api/orders/${orderId}/timeline`)
        .then(setTimeline)
        .catch(() => undefined);
    }
  }, [customerId, orderId]);

  return (
    <Modal isOpen onClose={onClose} title="سجل العميل والطلب" subtitle={history?.customer.fullName} maxWidth="2xl">
      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3 mb-3">{error}</p>}

      {history && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className={`text-[11px] px-2 py-0.5 rounded-[6px] border ${RISK[history.risk.tier].cls}`}>
            {RISK[history.risk.tier].text} · {Math.round(history.risk.returnRate * 100)}% مرتجع من {history.risk.orders} طلب
          </span>
          <span className="text-xs text-[#697586]">
            إجمالي {history.customer.totalOrders} · مسلّم {history.customer.deliveredOrders} · ملغى{' '}
            {history.customer.cancelledOrders}
          </span>
          {history.risk.requiresPrepaymentOrApproval && (
            <span className="flex items-center gap-1 text-[11px] text-[#fb323f]">
              <ShieldAlert className="w-3 h-3" /> يتطلب دفعاً مسبقاً أو موافقة مشرف
            </span>
          )}
        </div>
      )}

      {orderId && (
        <div className="flex gap-2 mb-3 border-b border-[#e3e8ef]">
          <Tab active={tab === 'timeline'} onClick={() => setTab('timeline')}>
            سجل الطلب {timeline ? `(${timeline.events.length})` : ''}
          </Tab>
          <Tab active={tab === 'history'} onClick={() => setTab('history')}>
            طلبات سابقة {history ? `(${history.orders.length})` : ''}
          </Tab>
        </div>
      )}

      {!history && !timeline ? (
        <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-10">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : tab === 'timeline' && orderId ? (
        <ol className="space-y-2">
          {timeline?.events.length === 0 && <p className="text-sm text-[#697586]">لا توجد أحداث بعد.</p>}
          {timeline?.events.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="text-[11px] text-[#9aa4b2] whitespace-nowrap pt-0.5" dir="ltr">
                {arDateShort(e.at)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[#121926]">{e.title}</span>
                {e.detail && <span className="block text-xs text-[#697586] break-words">{e.detail}</span>}
                {e.actorName && <span className="block text-[11px] text-[#9aa4b2]">{e.actorName}</span>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="space-y-2">
          {history?.orders.length === 0 && (
            <p className="text-sm text-[#697586]">لا توجد طلبات سابقة لهذا العميل.</p>
          )}
          {history?.orders.map((o) => (
            <article key={o.id} className="border border-[#e3e8ef] rounded-[8px] p-3">
              <header className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-[#121926]" dir="ltr">{o.orderNumber}</span>
                <OrderStateBadge state={o.state} />
                <span className="text-xs text-[#697586]" dir="ltr">
                  {arDate(o.createdAt)}
                </span>
                {o.store && <span className="text-xs text-[#9aa4b2]">{o.store.name}</span>}
                <span className="mr-auto tabular-nums text-[#121926]" dir="ltr">
                  {o.totalAmount} {o.currency}
                </span>
              </header>
              <p className="mt-1 text-xs text-[#697586]">
                {o.items.map((i) => `${i.productName} × ${i.quantity + i.freeQuantity}`).join(' · ')}
              </p>
              {(o.rejectionReason || o.returnReason) && (
                <p className="mt-1 text-[11px] text-[#fb323f]">{o.returnReason ?? o.rejectionReason}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm border-b-2 -mb-px ${
        active ? 'border-[#b8256e] text-[#b8256e] font-medium' : 'border-transparent text-[#697586]'
      }`}
    >
      {children}
    </button>
  );
}
