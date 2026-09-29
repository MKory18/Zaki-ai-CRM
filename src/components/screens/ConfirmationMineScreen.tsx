'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { humanMinutes, useElapsedMinutes } from '@/components/ui/Elapsed';
import { CustomerHistoryButton } from '@/components/orders/CustomerHistory';
import { OrderStateBadge } from '@/components/orders/OrderStateBadge';
import { ContactButtons } from '@/components/orders/ContactButtons';
import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import {
  ChangeRequestDialog,
  IssueDialog,
  PostponeDialog,
  RejectDialog,
  type ChangeRequestValue,
  type PostponeValue,
} from './confirmation/ActionDialogs';
import { raiseChangeRequest } from '@/components/orders/raiseChangeRequest';
import { AssistantDialog } from './confirmation/AssistantDialog';
import { RiAlertLine, RiChat3Line, RiCheckboxCircleLine, RiCloseCircleLine, RiCloseLine, RiLoader4Line, RiPencilLine, RiPhoneLine, RiPhoneLockLine, RiSearchLine, RiShieldFlashLine, RiSparkling2Line, RiTimerLine } from '@remixicon/react';
import { useToast } from '@/components/ui/Toast';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';

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
  const toast = useToast();
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
   * Dialling, and recording that she dialled, now both live in
   * `ContactButtons` — which does it for every screen rather than for this
   * one. A call nobody recorded is a call that did not happen as far as
   * every counter on this system is concerned, and that is true wherever
   * the call is made from.
   */
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
      toast.failed('تاريخ غير صالح');
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

  /**
   * ONE PRESS, EVEN WHEN NO APPROVAL IS OWED.
   *
   * The door decides for itself whether the raiser may also decide it and
   * the parcel is still ours — and says so with `readyToApply`. When it is
   * true, waiting for somebody to open «بانتظار التطبيق» and press a second
   * button would be the queue we just removed, wearing a different hat.
   *
   * The write still goes through the one apply path, so the money rules,
   * the seal and the audit are exactly the ones a supervisor's approval
   * would have gone through. And if that second call fails, the request is
   * sitting in «بانتظار التطبيق» — visible and applicable, never lost.
   */
  /**
   * تعديل · إلغاء · تأجيل — through the one raiser, which the order
   * screen uses too. See src/components/orders/raiseChangeRequest.ts.
   */
  const submitChange = (order: OrderRow, value: ChangeRequestValue) => {
    setDialog(null);
    void act(order.id, () => raiseChangeRequest(order.id, value, order.version));
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
        <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
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
      <ScreenTitle />
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
          {/*
            AN EMPTY LIST AND A HIDDEN ONE ARE NOT THE SAME SENTENCE.

            «لا يوجد طلب بيدك الآن» was printed whenever this list rendered
            nothing — including while the search box above it was holding
            eleven orders out of view. She types a customer's number, misses
            a digit, and the screen tells her that her desk is empty. The
            count in the heading says «0 من 11» at the same moment, so the
            screen contradicted itself.
          */}
          {inConfirmation.length === 0 && (
            <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg">
              {findOpen.trim() ? (
                <EmptyState
                  title="لا طلبَ بيدك يطابق هذا البحث"
                  why={`لا شيءَ من الـ${data.inConfirmation.length} التي بيدك يطابق «${findOpen.trim()}» — البحث يمرّ على رقم الطلب والاسم والهاتف.`}
                  action={{ label: 'امسح البحث', onClick: () => setFindOpen('') }}
                />
              ) : (
                <EmptyState
                  title="لا يوجد طلب بيدك الآن"
                  why="اسحب طلباً من مركز التأكيد. ما تسحبه يبقى لك حتى تؤكّده أو ترفضه أو يُحرَّر تلقائيّاً."
                />
              )}
            </div>
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
                    <span className={`text-xs px-2 py-0.5 rounded-md border ${RISK_LABEL[order.risk.tier].cls}`}>
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
                    <span dir="ltr">{new Date(order.postponedUntil).toLocaleDateString('ar-u-nu-latn')}</span>
                    {order.postponePreferredTime && ` · ${order.postponePreferredTime}`} · تأجيل رقم{' '}
                    {order.postponeCount}
                  </p>
                )}

                {order.risk?.requiresPrepaymentOrApproval && (
                  <p className="flex items-center gap-2 text-xs text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-2">
                    <RiShieldFlashLine className="w-4 h-4" /> عميل عالي الخطورة: يتطلب دفعاً مسبقاً أو موافقة المشرف.
                  </p>
                )}

                <footer className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--sys-border)]">
                  {/* The order she is working on, opened in the same screen
                      everyone else sees it in. She fixes what the customer
                      just told her — a wrong name, a wrong street, a second
                      unit — without leaving the queue. The fields she has no
                      authority over are not shown, and are refused by the
                      server even if they were. */}
                  <Action onClick={() => setOpenOrderId(order.id)} icon={<RiPencilLine className="w-4 h-4" />}>
                    افتح وعدّل
                  </Action>

                  {/* 1/2/3 counter — the third no-answer closes the order by rule */}
                  <Action
                    onClick={() => logAttempt(order, 'PHONE', 'NO_ANSWER')}
                    busy={busyId === order.id}
                    icon={<RiPhoneLockLine className="w-4 h-4" />}
                    danger={remaining <= 1}
                  >
                    لا يرد
                    <span className="tabular-nums" dir="ltr">
                      {' '}
                      {order.noAnswerCount}/{data.noAnswerLimit}
                    </span>
                  </Action>
                  <span className="text-xs text-[var(--sys-muted)]">
                    {remaining === 0
                      ? 'بلغ الحد'
                      : remaining === 1
                        ? 'المحاولة القادمة تُغلق الطلب تلقائياً'
                        : `متبقٍ ${remaining} محاولات قبل الإغلاق التلقائي`}
                  </span>

                  {/*
                    CALL, SMS AND WHATSAPP — THE SAME STRIP THE REST OF THE
                    PRODUCT USES.
                    Two buttons were hand-rolled here and both were poorer for
                    it: the WhatsApp one opened NOTHING — it recorded a contact
                    and left the agent to find the customer in WhatsApp
                    themselves — and there was no SMS at all, on the one screen
                    where the whole job is reaching somebody.
                    `ContactButtons` already carries the ready-made messages,
                    filtered by channel and filled with this order's own words,
                    and the tracking and couriers screens already use it. The
                    templates were never missing; this screen was not asking
                    for them.
                  */}
                  <ContactButtons
                    phone={order.customer.rawPhone}
                    context={{
                      orderNumber: order.orderNumber,
                      customerName: order.customer.fullName,
                      amount: order.totalAmount,
                      region: order.customer.city,
                    }}
                    onContacted={(method) =>
                      // A dialled call keeps the result it always had. A sent
                      // message is `MESSAGE_SENT`: filing it as «answered»
                      // would inflate the answer rate with messages nobody
                      // has replied to.
                      logAttempt(order, method, method === 'PHONE' ? 'ANSWERED' : 'MESSAGE_SENT')
                    }
                  />
                  {/*
                    IN THE ORDER THE WORK HAPPENS IN.

                    She rings, and then one of four things is true. The
                    confirmation is what most calls end in, and it was last
                    — past «تأجيل», «ألغِ», «إشكال» and «مساعدة» — so the
                    commonest press was the furthest from the thumb and sat
                    beside the one that cancels.

                    Confirm first, then postpone, then cancel. The two that
                    are neither an outcome of the call — the entry issue and
                    the assistant — come after them.
                  */}
                  <Action primary onClick={() => confirm(order)} busy={busyId === order.id} icon={<RiCheckboxCircleLine className="w-4 h-4" />}>
                    تأكيد الطلب
                  </Action>
                  <Action onClick={() => setDialog({ kind: 'postpone', order })} busy={busyId === order.id} icon={<RiTimerLine className="w-4 h-4" />}>
                    تأجيل {order.postponeCount > 0 && `(${order.postponeCount})`}
                  </Action>
                  <Action onClick={() => setDialog({ kind: 'reject', order })} busy={busyId === order.id} danger icon={<RiCloseCircleLine className="w-4 h-4" />}>
                    ألغِ
                  </Action>

                  {/* «إدخال إشكال», not «إشكال إدخال»: the button is the
                      act she performs, and the old name read as the name of
                      the thing — so it looked like a filter, not a door. */}
                  <Action onClick={() => setDialog({ kind: 'issue', order })} busy={busyId === order.id} icon={<RiAlertLine className="w-4 h-4" />}>
                    إدخال إشكال
                  </Action>

                  {/* Reads this order and this customer's history, and says
                      what it would open with. It changes nothing — every
                      button that does is on either side of it. */}
                  <Action onClick={() => setDialog({ kind: 'assist', order })} icon={<RiSparkling2Line className="w-4 h-4" />}>
                    مساعدة
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
                    <Rows
            rows={confirmed}
            keyOf={(order) => order.id}
            columns={[
              { key: 'c0', label: "الطلب", primary: true,
                render: (order) => (order.orderNumber) },
              { key: 'c1', label: "العميل", primary: true,
                render: (order) => (
                  <><span className="flex items-center gap-2">
                      {order.customer.fullName}
                      <CustomerHistoryButton
                        customerId={order.customer.id}
                        orderId={order.id}
                        previousOrders={order.previousOrders}
                      />
                    </span></>
                ) },
              { key: 'c2', label: "الهاتف",
                render: (order) => (
                  <><a href={`tel:${order.customer.rawPhone}`} className="tabular-nums hover:text-[var(--sys-primary)]">
                      {order.customer.rawPhone}
                    </a></>
                ) },
              { key: 'c3', label: "المبلغ", align: 'end',
                render: (order) => (
                  <>{order.totalAmount} {order.currency}</>
                ) },
            ]}
            /* The CONFIRMED list's own words. It used to carry the copy of
               the section above it — «اسحب طلباً من الطابور» — which is
               advice about the other list, and it said it while a search
               was hiding rows too. */
            empty={
              findDone.trim() ? (
                <EmptyState
                  title="لا طلبَ مؤكَّداً يطابق هذا البحث"
                  why={`لا شيءَ من الـ${data.confirmed.length} التي أكّدتَها يطابق «${findDone.trim()}» — البحث يمرّ على رقم الطلب والاسم والهاتف.`}
                  action={{ label: 'امسح البحث', onClick: () => setFindDone('') }}
                />
              ) : (
                <EmptyState
                  title="لم تؤكّد طلباً بعد"
                  why="ما تؤكّده يظهر هنا للقراءة — وتعديلُه بعدها يمرّ بطلبِ تعديل، لا بتحريرٍ مباشر."
                />
              )
            }
            actions={(order) => (
              <>{order.changeRequests && order.changeRequests.length > 0 ? (
                      <span className="text-xs text-[var(--sys-warning)]">طلب تعديل قيد المراجعة</span>
                    ) : (
                      <button
                        onClick={() => setDialog({ kind: 'change', order })}
                        disabled={busyId === order.id}
                        className="text-xs text-[var(--sys-primary)] hover:underline disabled:opacity-50"
                      >
                        طلب تعديل
                      </button>
                    )}</>
            )}
          />
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
      <span className="text-xs px-2 py-0.5 rounded-md border bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)] tabular-nums">
        رددت خلال {humanMinutes(took)}
      </span>
    );
  }
  if (waiting === null) return null;

  // Half an hour is the point at which a fresh order stops being fresh.
  const late = waiting >= 30;
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-md border tabular-nums ${
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
      <h2 className="text-sm font-bold text-[var(--sys-heading)]">
        {title} ({value.trim() ? `${count} من ${total}` : total})
      </h2>
      {note && <span className="text-xs text-[var(--sys-muted)]">{note}</span>}
      <div className="relative ms-auto">
        <RiSearchLine className="w-4 h-4 text-[var(--sys-muted)] absolute top-1/2 -translate-y-1/2 end-2.5" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="رقم الهاتف أو الطلب أو الاسم"
          className="h-11 md:h-8 w-56 ps-2.5 pe-8 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-xs text-[var(--sys-foreground)] focus:outline-none focus:border-[var(--sys-primary)]"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="امسح البحث"
            className="absolute top-1/2 -translate-y-1/2 start-1.5 text-[var(--sys-muted)] hover:text-[var(--sys-destructive)]"
          >
            <RiCloseLine className="w-4 h-4" />
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
      className={`min-h-11 md:min-h-0 inline-flex items-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50 ${
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
