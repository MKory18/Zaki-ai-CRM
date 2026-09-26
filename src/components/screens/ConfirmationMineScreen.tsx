'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, MessageCircle, Pencil, Phone, PhoneOff, Search, ShieldAlert, Sparkles, X, XCircle } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { humanMinutes, useElapsedMinutes } from '@/components/ui/Elapsed';
import { CustomerHistoryButton } from '@/components/orders/CustomerHistory';
import { OrderStateBadge } from '@/components/orders/OrderStateBadge';
import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import {
  ChangeRequestDialog,
  IssueDialog,
  PostponeDialog,
  RejectDialog,
  type PostponeValue,
} from './confirmation/ActionDialogs';
import { AssistantDialog } from './confirmation/AssistantDialog';

/**
 * /confirmation/mine — two sections: in-confirmation (workable) and
 * already-confirmed (read-only, with a change request per row).
 *
 * Every number here — COD, risk tier, attempt counter — comes from the API.
 * The screen renders and sends; it never decides.
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
  state: string;
  previousOrders: number;
  version: number;
  totalAmount: number;
  currency: string;
  claimedAt: string | null;
  /** First thing she did about this order; null means it is still waiting. */
  firstActionAt: string | null;
  postponedUntil: string | null;
  postponePreferredTime: string | null;
  postponeCount: number;
  noAnswerCount: number;
  customer: { id: string; fullName: string; phone: string; rawPhone: string; city: string; address: string };
  items: { id: string; productName: string; quantity: number; freeQuantity: number; lineTotal: number }[];
  _count: { contactAttempts: number; notes: number };
  risk?: RiskInfo | null;
  changeRequests?: { id: string }[];
}

interface MineResponse {
  leadDays: number;
  /** Postponed to a later day — off her desk, not gone. */
  waitingLater: number;
  noAnswerLimit: number;
  /** The server's clock, so a wrong clock on her machine changes nothing. */
  serverNow: string;
  inConfirmation: OrderRow[];
  confirmed: OrderRow[];
}

const RISK_LABEL: Record<string, { text: string; cls: string }> = {
  SAFE: { text: 'خطورة منخفضة', cls: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[var(--sys-success)]/30' },
  WATCH: { text: 'تحت المراقبة', cls: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/30' },
  HIGH: { text: 'خطورة عالية', cls: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]' },
};

type DialogState =
  | { kind: 'postpone' | 'issue' | 'change' | 'reject' | 'assist'; order: OrderRow }
  | null;

export function ConfirmationMineScreen() {
  const [data, setData] = useState<MineResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  // Searching her own desk, not the whole store: she has a customer on the
  // phone reading out a number, and scrolling for it is the slow way.
  const [findOpen, setFindOpen] = useState('');
  const [findDone, setFindDone] = useState('');

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
      const result = await fn();
      await load();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تنفيذ الإجراء');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Dial, and record that she dialled.
   *
   * The phone is a link so the desk phone or the handset takes over, and
   * the attempt is logged in the same click — a call nobody recorded is a
   * call that did not happen as far as every counter on this system is
   * concerned.
   */
  const callCustomer = (order: OrderRow) => {
    window.location.href = `tel:${order.customer.rawPhone}`;
    void logAttempt(order, 'PHONE', 'ANSWERED');
  };

  const logAttempt = (order: OrderRow, method: 'PHONE' | 'WHATSAPP' | 'SMS', result: string) =>
    act(order.id, async () => {
      const res = await apiJson<{ autoClosed: boolean; noAnswerCount: number }>(
        `/api/orders/${order.id}/contact-attempts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactMethod: method, result }),
        }
      );
      setNotice(
        res.autoClosed
          ? `أُغلق الطلب ${order.orderNumber} تلقائياً بعد ${res.noAnswerCount} محاولات بلا رد.`
          : null
      );
      return res;
    });

  const confirm = (order: OrderRow) =>
    act(order.id, () =>
      apiJson(`/api/orders/${order.id}/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Optimistic concurrency: the version the screen loaded.
        body: JSON.stringify({ action: 'confirm', expectedVersion: order.version }),
      })
    );

  const submitPostpone = (order: OrderRow, value: PostponeValue) => {
    const at = new Date(`${value.date}T10:00:00`);
    if (Number.isNaN(at.getTime())) {
      setError('تاريخ غير صالح');
      return;
    }
    setDialog(null);
    void act(order.id, () =>
      apiJson(`/api/orders/${order.id}/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule_follow_up',
          nextFollowUpAt: at.toISOString(),
          followUpReason: value.reason,
          preferredTime: value.preferredTime,
          note: value.note || undefined,
          expectedVersion: order.version,
        }),
      })
    );
  };

  const submitIssue = (order: OrderRow, value: { reason: string; note: string }) => {
    setDialog(null);
    void act(order.id, () =>
      apiJson('/api/confirmation/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, reason: value.reason, note: value.note || undefined }),
      })
    );
  };

  /** The customer said no. Through the same rejection path as everywhere. */
  const submitReject = (order: OrderRow, value: { rejectionReason: string; note: string }) => {
    setDialog(null);
    void act(order.id, () =>
      apiJson(`/api/orders/${order.id}/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          rejectionReason: value.rejectionReason,
          rejectionNote: value.note || undefined,
          note: value.note || undefined,
          expectedVersion: order.version,
        }),
      })
    );
  };

  const submitChange = (order: OrderRow, value: { field: string; to: string; reason: string }) => {
    setDialog(null);
    void act(order.id, () =>
      apiJson(`/api/orders/${order.id}/change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: value.reason, changes: { [value.field]: { to: value.to } } }),
      })
    );
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  // Digits only, both sides: she types 0999 or 999 and the stored number
  // may be either. Matching on the bare digits means the shape of the
  // number — leading zero, country code, spaces — never hides a match.
  const digits = (v: string) => v.replace(/\D/g, '');
  const matches = (order: OrderRow, term: string) => {
    const q = term.trim();
    if (!q) return true;
    const d = digits(q);
    if (d && (digits(order.customer.rawPhone).includes(d) || digits(order.customer.phone).includes(d))) return true;
    if (digits(order.orderNumber).includes(d) && d) return true;
    const text = q.toLowerCase();
    return (
      order.orderNumber.toLowerCase().includes(text) ||
      order.customer.fullName.toLowerCase().includes(text)
    );
  };
  const inConfirmation = data.inConfirmation.filter((o) => matches(o, findOpen));
  const confirmed = data.confirmed.filter((o) => matches(o, findDone));

  return (
    <div className="space-y-6 max-w-5xl">
      {error && (
        <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>
      )}
      {notice && (
        <p className="text-sm text-[var(--sys-warning)] bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/30 rounded-lg p-3">{notice}</p>
      )}

      <section>
        <SectionHead
          title="قيد التأكيد"
          count={inConfirmation.length}
          total={data.inConfirmation.length}
          value={findOpen}
          onChange={setFindOpen}
          note={
            data.waitingLater > 0
              ? `و${data.waitingLater} مؤجّلة ليوم لاحق — تعود إلى هنا في موعدها`
              : undefined
          }
        />
        <div className="space-y-3">
          {inConfirmation.length === 0 && (
            <p className="text-sm text-[var(--sys-muted-foreground)] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-6 text-center">
              لا يوجد طلب بيدك الآن. اسحب طلباً من مركز التأكيد.
            </p>
          )}
          {inConfirmation.map((order) => {
            const remaining = Math.max(0, data.noAnswerLimit - order.noAnswerCount);
            return (
              <article key={order.id} className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 space-y-3">
                <header className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--sys-heading)]" dir="ltr">{order.orderNumber}</span>
                  <OrderStateBadge state={order.state} />
                  <CustomerHistoryButton
                    customerId={order.customer.id}
                    orderId={order.id}
                    previousOrders={order.previousOrders}
                  />
                  {order.risk && (
                    <span className={`text-caption px-2 py-0.5 rounded-md border ${RISK_LABEL[order.risk.tier].cls}`}>
                      {RISK_LABEL[order.risk.tier].text} · {Math.round(order.risk.returnRate * 100)}% مرتجع من{' '}
                      {order.risk.orders} طلب
                    </span>
                  )}
                  <ResponseClock
                    claimedAt={order.claimedAt}
                    firstActionAt={order.firstActionAt}
                    serverNow={data.serverNow}
                  />
                  <span className="mr-auto text-sm font-semibold text-[var(--sys-heading)] tabular-nums" dir="ltr">
                    {order.totalAmount} {order.currency}
                  </span>
                </header>

                <div className="text-sm text-[var(--sys-foreground)]">
                  {order.customer.fullName} · <span dir="ltr">{order.customer.rawPhone}</span> · {order.customer.city}
                  <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">{order.customer.address}</p>
                </div>

                <ul className="text-xs text-[var(--sys-muted-foreground)] space-y-0.5">
                  {order.items.map((it) => (
                    <li key={it.id}>
                      {it.productName} × {it.quantity}
                      {it.freeQuantity > 0 && ` (+${it.freeQuantity} هدية)`}
                    </li>
                  ))}
                </ul>

                {order.postponedUntil && (
                  <p className="text-xs text-[var(--sys-warning)]">
                    مؤجل حتى{' '}
                    <span dir="ltr">{new Date(order.postponedUntil).toLocaleDateString('ar-EG')}</span>
                    {order.postponePreferredTime && ` · ${order.postponePreferredTime}`} · تأجيل رقم{' '}
                    {order.postponeCount}
                  </p>
                )}

                {order.risk?.requiresPrepaymentOrApproval && (
                  <p className="flex items-center gap-2 text-xs text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-2">
                    <ShieldAlert className="w-4 h-4" /> عميل عالي الخطورة: يتطلب دفعاً مسبقاً أو موافقة المشرف.
                  </p>
                )}

                <footer className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--sys-border)]">
                  {/* The order she is working on, opened in the same screen
                      everyone else sees it in. She fixes what the customer
                      just told her — a wrong name, a wrong street, a second
                      unit — without leaving the queue. The fields she has no
                      authority over are not shown, and are refused by the
                      server even if they were. */}
                  <Action onClick={() => setOpenOrderId(order.id)} icon={<Pencil className="w-3.5 h-3.5" />}>
                    افتح وعدّل
                  </Action>

                  {/* 1/2/3 counter — the third no-answer closes the order by rule */}
                  <Action
                    onClick={() => logAttempt(order, 'PHONE', 'NO_ANSWER')}
                    busy={busyId === order.id}
                    icon={<PhoneOff className="w-3.5 h-3.5" />}
                    danger={remaining <= 1}
                  >
                    لا يرد
                    <span className="tabular-nums" dir="ltr">
                      {' '}
                      {order.noAnswerCount}/{data.noAnswerLimit}
                    </span>
                  </Action>
                  <span className="text-caption text-[var(--sys-muted)]">
                    {remaining === 0
                      ? 'بلغ الحد'
                      : remaining === 1
                        ? 'المحاولة القادمة تُغلق الطلب تلقائياً'
                        : `متبقٍ ${remaining} محاولات قبل الإغلاق التلقائي`}
                  </span>

                  <Action onClick={() => callCustomer(order)} busy={busyId === order.id} icon={<Phone className="w-3.5 h-3.5" />}>
                    اتصال
                  </Action>

                  <Action onClick={() => logAttempt(order, 'WHATSAPP', 'ANSWERED')} busy={busyId === order.id} icon={<MessageCircle className="w-3.5 h-3.5" />}>
                    واتساب
                  </Action>
                  <Action onClick={() => setDialog({ kind: 'postpone', order })} busy={busyId === order.id} icon={<Clock className="w-3.5 h-3.5" />}>
                    تأجيل {order.postponeCount > 0 && `(${order.postponeCount})`}
                  </Action>
                  <Action onClick={() => setDialog({ kind: 'reject', order })} busy={busyId === order.id} danger icon={<XCircle className="w-3.5 h-3.5" />}>
                    ألغِ
                  </Action>

                  <Action onClick={() => setDialog({ kind: 'issue', order })} busy={busyId === order.id} icon={<AlertTriangle className="w-3.5 h-3.5" />}>
                    إشكال إدخال
                  </Action>

                  {/* Reads this order and this customer's history, and says
                      what it would open with. It changes nothing — every
                      button that does is on either side of it. */}
                  <Action onClick={() => setDialog({ kind: 'assist', order })} icon={<Sparkles className="w-3.5 h-3.5" />}>
                    مساعدة
                  </Action>
                  <Action primary onClick={() => confirm(order)} busy={busyId === order.id} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
                    تأكيد الطلب
                  </Action>
                </footer>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <SectionHead
          title="مؤكدة"
          count={confirmed.length}
          total={data.confirmed.length}
          value={findDone}
          onChange={setFindDone}
        />
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
              <tr>
                <th className="text-right font-medium px-4 py-2">الطلب</th>
                <th className="text-right font-medium px-4 py-2">العميل</th>
                <th className="text-right font-medium px-4 py-2">الهاتف</th>
                <th className="text-right font-medium px-4 py-2">المبلغ</th>
                <th className="text-right font-medium px-4 py-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sys-border)]">
              {confirmed.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-2 font-medium text-[var(--sys-heading)]" dir="ltr">{order.orderNumber}</td>
                  <td className="px-4 py-2 text-[var(--sys-foreground)]">
                    <span className="flex items-center gap-2">
                      {order.customer.fullName}
                      <CustomerHistoryButton
                        customerId={order.customer.id}
                        orderId={order.id}
                        previousOrders={order.previousOrders}
                      />
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[var(--sys-foreground)]" dir="ltr">
                    <a href={`tel:${order.customer.rawPhone}`} className="tabular-nums hover:text-[var(--sys-primary)]">
                      {order.customer.rawPhone}
                    </a>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-[var(--sys-foreground)]" dir="ltr">
                    {order.totalAmount} {order.currency}
                  </td>
                  <td className="px-4 py-2 text-left">
                    {order.changeRequests && order.changeRequests.length > 0 ? (
                      <span className="text-xs text-[var(--sys-warning)]">طلب تعديل قيد المراجعة</span>
                    ) : (
                      <button
                        onClick={() => setDialog({ kind: 'change', order })}
                        disabled={busyId === order.id}
                        className="text-xs text-[var(--sys-primary)] hover:underline disabled:opacity-50"
                      >
                        طلب تعديل
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {confirmed.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-[var(--sys-muted-foreground)]">
                    لا توجد طلبات مؤكدة بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {dialog?.kind === 'postpone' && (
        <PostponeDialog
          open
          orderNumber={dialog.order.orderNumber}
          postponeCount={dialog.order.postponeCount}
          busy={busyId === dialog.order.id}
          onClose={() => setDialog(null)}
          onSubmit={(value) => submitPostpone(dialog.order, value)}
        />
      )}
      {dialog?.kind === 'issue' && (
        <IssueDialog
          open
          orderNumber={dialog.order.orderNumber}
          busy={busyId === dialog.order.id}
          onClose={() => setDialog(null)}
          onSubmit={(value) => submitIssue(dialog.order, value)}
        />
      )}
      {dialog?.kind === 'reject' && (
        <RejectDialog
          open
          orderNumber={dialog.order.orderNumber}
          busy={busyId === dialog.order.id}
          onClose={() => setDialog(null)}
          onSubmit={(value) => submitReject(dialog.order, value)}
        />
      )}
      {dialog?.kind === 'assist' && (
        <AssistantDialog
          orderId={dialog.order.id}
          orderNumber={dialog.order.orderNumber}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'change' && (
        <ChangeRequestDialog
          open
          orderNumber={dialog.order.orderNumber}
          busy={busyId === dialog.order.id}
          onClose={() => setDialog(null)}
          onSubmit={(value) => submitChange(dialog.order, value)}
        />
      )}

      {/* The same modal the rest of the system opens an order in — not a
          second, smaller copy that would drift from it. */}
      {openOrderId && (
        <OrderDetailModal
          isOpen
          orderId={openOrderId}
          onClose={() => setOpenOrderId(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}

/**
 * How long this order has been waiting on her.
 *
 * An order pulled from the pool and not yet called is the most expensive
 * thing on this desk: the customer is still warm, and nobody else can take
 * it. Once she has done something, the clock stops and reports what it took
 * — a record, not a nag.
 */
function ResponseClock({
  claimedAt,
  firstActionAt,
  serverNow,
}: {
  claimedAt: string | null;
  firstActionAt: string | null;
  serverNow: string;
}) {
  const waiting = useElapsedMinutes(firstActionAt ? null : claimedAt, serverNow);

  if (firstActionAt && claimedAt) {
    const took = Math.max(0, Math.round((+new Date(firstActionAt) - +new Date(claimedAt)) / 60000));
    return (
      <span className="text-caption px-2 py-0.5 rounded-md border bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)] tabular-nums">
        رددت خلال {humanMinutes(took)}
      </span>
    );
  }
  if (waiting === null) return null;

  // Half an hour is the point at which a fresh order stops being fresh.
  const late = waiting >= 30;
  return (
    <span
      className={`text-caption px-2 py-0.5 rounded-md border tabular-nums ${
        late
          ? 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]'
          : 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/30'
      }`}
    >
      بانتظار أول اتصال منذ {humanMinutes(waiting)}
    </span>
  );
}

/**
 * A section's title, its count, and a box to find one row in it.
 *
 * The count says "3 of 12" while a search is running, because a filtered
 * list that says 3 with no context reads as "you only have three".
 */
function SectionHead({
  title,
  count,
  total,
  value,
  onChange,
  note,
}: {
  title: string;
  count: number;
  total: number;
  value: string;
  onChange: (v: string) => void;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <ScreenTitle />

      <h2 className="text-sm font-bold text-[var(--sys-heading)]">
        {title} ({value.trim() ? `${count} من ${total}` : total})
      </h2>
      {note && <span className="text-caption text-[var(--sys-muted)]">{note}</span>}
      <div className="relative ms-auto">
        <Search className="w-3.5 h-3.5 text-[var(--sys-muted)] absolute top-1/2 -translate-y-1/2 end-2.5" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="رقم الهاتف أو الطلب أو الاسم"
          className="h-8 w-56 ps-2.5 pe-8 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-caption text-[var(--sys-foreground)] focus:outline-none focus:border-[var(--sys-primary)]"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="امسح البحث"
            className="absolute top-1/2 -translate-y-1/2 start-1.5 text-[var(--sys-muted)] hover:text-[var(--sys-destructive)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Action({
  children,
  onClick,
  busy,
  primary,
  danger,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  primary?: boolean;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50 ${
        primary
          ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] border-[var(--sys-primary)]'
          : danger
            ? 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]'
            : 'bg-[var(--sys-card)] text-[var(--sys-foreground)] border-[var(--sys-border)] hover:border-[var(--sys-primary)]'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
