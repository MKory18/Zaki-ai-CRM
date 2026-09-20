'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, MessageCircle, Phone, ShieldAlert } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * /confirmation/mine — two sections: in-confirmation (workable) and
 * already-confirmed (read-only, with a change request per row).
 *
 * Every number here — COD, risk tier, attempt count — comes from the API.
 * The screen only renders and sends actions.
 */

interface RiskInfo {
  tier: 'SAFE' | 'WATCH' | 'HIGH';
  returnRate: number;
  orders: number;
  returns: number;
  requiresPrepaymentOrApproval: boolean;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  merchantRef: string | null;
  confirmationStatus: string;
  version: number;
  totalAmount: number;
  currency: string;
  postponedUntil: string | null;
  postponePreferredTime: string | null;
  postponeCount: number;
  customer: { id: string; fullName: string; phone: string; rawPhone: string; city: string; address: string };
  items: { id: string; productName: string; quantity: number; freeQuantity: number; lineTotal: number }[];
  _count: { contactAttempts: number; notes: number };
  risk?: RiskInfo | null;
  changeRequests?: { id: string }[];
}

interface MineResponse {
  leadDays: number;
  inConfirmation: OrderRow[];
  confirmed: OrderRow[];
}

const RISK_LABEL: Record<string, { text: string; cls: string }> = {
  SAFE: { text: 'خطورة منخفضة', cls: 'bg-emerald-50 text-[#00a344] border-emerald-100' },
  WATCH: { text: 'تحت المراقبة', cls: 'bg-amber-50 text-[#c07f2a] border-amber-100' },
  HIGH: { text: 'خطورة عالية', cls: 'bg-[#feecee] text-[#fb323f] border-[#fecdd1]' },
};

export function ConfirmationMineScreen() {
  const [data, setData] = useState<MineResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiJson<MineResponse>('/api/confirmation/mine'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تنفيذ الإجراء');
    } finally {
      setBusyId(null);
    }
  };

  const logAttempt = (order: OrderRow, method: 'PHONE' | 'WHATSAPP' | 'SMS', result: string) =>
    act(order.id, () =>
      apiJson(`/api/orders/${order.id}/contact-attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactMethod: method, result }),
      })
    );

  const confirm = (order: OrderRow) =>
    act(order.id, () =>
      apiJson(`/api/orders/${order.id}/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Optimistic concurrency: the version the screen loaded.
        body: JSON.stringify({ action: 'confirm', expectedVersion: order.version }),
      })
    );

  const postpone = (order: OrderRow) => {
    const date = window.prompt('تاريخ التأجيل (YYYY-MM-DD)');
    if (!date) return;
    const preferredTime = window.prompt('الوقت المفضّل للعميل (اختياري)') ?? '';
    const at = new Date(`${date}T10:00:00`);
    if (Number.isNaN(at.getTime())) {
      setError('تاريخ غير صالح');
      return;
    }
    return act(order.id, () =>
      apiJson(`/api/orders/${order.id}/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule_follow_up',
          nextFollowUpAt: at.toISOString(),
          followUpReason: 'POSTPONED',
          preferredTime,
          expectedVersion: order.version,
        }),
      })
    );
  };

  const raiseIssue = (order: OrderRow) => {
    const note = window.prompt('ما المشكلة في بيانات الإدخال؟');
    if (!note) return;
    return act(order.id, () =>
      apiJson('/api/confirmation/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, reason: 'MISSING_DATA', note }),
      })
    );
  };

  const requestChange = (order: OrderRow) => {
    const reason = window.prompt('ما التعديل المطلوب على هذا الطلب المؤكد؟');
    if (!reason) return;
    return act(order.id, () =>
      apiJson(`/api/orders/${order.id}/change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, changes: { customerNotes: { to: reason } } }),
      })
    );
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {error && (
        <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>
      )}

      <section>
        <h2 className="text-sm font-bold text-[#121926] mb-3">قيد التأكيد ({data.inConfirmation.length})</h2>
        <div className="space-y-3">
          {data.inConfirmation.length === 0 && (
            <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
              لا يوجد طلب بيدك الآن. اسحب طلباً من مركز التأكيد.
            </p>
          )}
          {data.inConfirmation.map((order) => (
            <article key={order.id} className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 space-y-3">
              <header className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[#121926]" dir="ltr">{order.orderNumber}</span>
                <span className="text-xs text-[#697586]">{order.confirmationStatus}</span>
                {order.risk && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-[6px] border ${RISK_LABEL[order.risk.tier].cls}`}>
                    {RISK_LABEL[order.risk.tier].text} · {Math.round(order.risk.returnRate * 100)}% مرتجع من{' '}
                    {order.risk.orders} طلب
                  </span>
                )}
                <span className="mr-auto text-sm font-semibold text-[#121926] tabular-nums" dir="ltr">
                  {order.totalAmount} {order.currency}
                </span>
              </header>

              <div className="text-sm text-[#364152]">
                {order.customer.fullName} · <span dir="ltr">{order.customer.rawPhone}</span> · {order.customer.city}
                <p className="text-xs text-[#697586] mt-1">{order.customer.address}</p>
              </div>

              <ul className="text-xs text-[#697586] space-y-0.5">
                {order.items.map((it) => (
                  <li key={it.id}>
                    {it.productName} × {it.quantity}
                    {it.freeQuantity > 0 && ` (+${it.freeQuantity} هدية)`}
                  </li>
                ))}
              </ul>

              {order.risk?.requiresPrepaymentOrApproval && (
                <p className="flex items-center gap-2 text-xs text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-2">
                  <ShieldAlert className="w-4 h-4" /> عميل عالي الخطورة: يتطلب دفعاً مسبقاً أو موافقة المشرف.
                </p>
              )}

              <footer className="flex flex-wrap gap-2 pt-1 border-t border-[#e3e8ef]">
                <Action onClick={() => logAttempt(order, 'PHONE', 'ANSWERED')} busy={busyId === order.id} icon={<Phone className="w-3.5 h-3.5" />}>
                  رد على الاتصال
                </Action>
                <Action onClick={() => logAttempt(order, 'PHONE', 'NO_ANSWER')} busy={busyId === order.id}>
                  لا يرد ({order._count.contactAttempts})
                </Action>
                <Action onClick={() => logAttempt(order, 'WHATSAPP', 'ANSWERED')} busy={busyId === order.id} icon={<MessageCircle className="w-3.5 h-3.5" />}>
                  واتساب
                </Action>
                <Action onClick={() => postpone(order)} busy={busyId === order.id} icon={<Clock className="w-3.5 h-3.5" />}>
                  تأجيل {order.postponeCount > 0 && `(${order.postponeCount})`}
                </Action>
                <Action onClick={() => raiseIssue(order)} busy={busyId === order.id} icon={<AlertTriangle className="w-3.5 h-3.5" />}>
                  إشكال إدخال
                </Action>
                <Action primary onClick={() => confirm(order)} busy={busyId === order.id} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
                  تأكيد الطلب
                </Action>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold text-[#121926] mb-3">مؤكدة ({data.confirmed.length})</h2>
        <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#697586] text-xs">
              <tr>
                <th className="text-right font-medium px-4 py-2">الطلب</th>
                <th className="text-right font-medium px-4 py-2">العميل</th>
                <th className="text-right font-medium px-4 py-2">المبلغ</th>
                <th className="text-right font-medium px-4 py-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8ef]">
              {data.confirmed.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-2 font-medium text-[#121926]" dir="ltr">{order.orderNumber}</td>
                  <td className="px-4 py-2 text-[#364152]">{order.customer.fullName}</td>
                  <td className="px-4 py-2 tabular-nums text-[#364152]" dir="ltr">
                    {order.totalAmount} {order.currency}
                  </td>
                  <td className="px-4 py-2 text-left">
                    {order.changeRequests && order.changeRequests.length > 0 ? (
                      <span className="text-xs text-[#c07f2a]">طلب تعديل قيد المراجعة</span>
                    ) : (
                      <button
                        onClick={() => requestChange(order)}
                        disabled={busyId === order.id}
                        className="text-xs text-[#b8256e] hover:underline disabled:opacity-50"
                      >
                        طلب تعديل
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {data.confirmed.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-[#697586]">
                    لا توجد طلبات مؤكدة بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Action({
  children,
  onClick,
  busy,
  primary,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  primary?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium border disabled:opacity-50 ${
        primary
          ? 'bg-[#b8256e] text-white border-[#b8256e]'
          : 'bg-white text-[#364152] border-[#e3e8ef] hover:border-[#b8256e]'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
