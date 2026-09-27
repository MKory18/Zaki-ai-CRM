'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiJson } from '@/lib/api-client';
import { CourierNotifyDialog, type CourierAsk } from '@/components/orders/CourierNotifyDialog';
import { ChangeRequestReview } from '@/components/orders/ChangeRequestReview';
import { useConfirm, useTell } from '@/components/ui/Confirm';
import { changeFieldLabel } from '@/lib/change-request-fields';
import { deriveCoreState } from '@/lib/order-state';
import { OrderStateChip } from '@/components/ui/StatusChip';
import { ROLE_LABELS, type UserRole } from '@/types/auth';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { RiArrowGoBackLine, RiArrowLeftLine, RiCheckboxCircleLine, RiFileEditLine, RiLoader4Line } from '@remixicon/react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

/**
 * /control/change-requests — the review queue, in its two halves.
 *
 * «بانتظار القرار»: somebody asked; somebody who can still reach the order
 * decides. Deciding opens the same dialog the packing line uses — a second
 * decision dialog would have been a second set of rules to keep in step.
 *
 * «بانتظار التطبيق»: decided, and not yet carried out. This half did not
 * exist. An approval recorded the decision and changed nothing on the
 * order, and on a sealed order — waybill printed, or on a van — the edit
 * that should have followed was refused by the very seal the request had
 * been raised to get past. Approved requests sat there, looking done.
 *
 * Applying sends the request's id and nothing else: the values are the
 * approved ones, taken on the server, and the edit runs through the order's
 * own money path.
 */

interface ChangeRequest {
  id: string;
  reason: string;
  status: string;
  blocking: boolean;
  createdAt: string;
  slaDueAt: string | null;
  overdue: boolean;
  decisionNote: string | null;
  requestedByName: string | null;
  requestedRole: string;
  /** Raised by the person reading the screen. */
  isMine: boolean;
  changes: Record<string, { from?: string | number | null; to: string | number | null }>;
  order: {
    id: string;
    orderNumber: string;
    confirmationStatus: string;
    shippingStatus: string;
    customer: { fullName: string; phone: string };
  };
}

type Tab = 'PENDING' | 'AWAITING_APPLY';

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

export function ChangeRequestsScreen() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('PENDING');
  const [lists, setLists] = useState<Record<Tab, ChangeRequest[]> | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  /** The request whose parcel is already with the courier, and what to send them. */
  const [courierFor, setCourierFor] = useState<{ request: ChangeRequest; ask: CourierAsk } | null>(null);
  const confirm = useConfirm();
  const tell = useTell();

  const load = useCallback(async () => {
    try {
      // Both at once: the tab counts are the point, so a decision that just
      // moved a request from one list to the other shows on both.
      const [pending, awaiting] = await Promise.all([
        apiJson<{ requests: ChangeRequest[] }>('/api/control/change-requests?status=PENDING'),
        apiJson<{ requests: ChangeRequest[] }>('/api/control/change-requests?status=AWAITING_APPLY'),
      ]);
      setLists({ PENDING: pending.requests, AWAITING_APPLY: awaiting.requests });
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * TAKE BACK A REQUEST YOU RAISED.
   *
   * A pending request is not inert: a blocking one stops the order from
   * moving forward, and any pending one refuses a second request on the same
   * order. So the corrected request could not be raised until somebody else
   * cleared the wrong one.
   */
  async function withdraw(r: ChangeRequest) {
    const ok = await confirm({
      title: `اسحب طلبك على ${r.order.orderNumber}؟`,
      body: 'يُلغى الطلب ويعود الطلبُ إلى التقدّم الطبيعي، ويمكنك رفعُ طلبٍ مصحَّح بعده. يُسجَّل السحب على الطلب.',
      confirmLabel: 'اسحبه',
      tone: 'danger',
    });
    if (!ok) return;

    setWithdrawing(r.id);
    try {
      await apiJson(`/api/control/change-requests/${r.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      await tell({
        title: 'تعذر سحب الطلب',
        body: e instanceof Error ? e.message : 'حدث خطأ',
        tone: 'danger',
      });
    } finally {
      setWithdrawing(null);
    }
  }

  async function apply(r: ChangeRequest) {
    const lines = Object.entries(r.changes ?? {})
      .map(([f, v]) => `${changeFieldLabel(f)}: ${v?.from !== undefined ? `${show(v.from)} ← ` : ''}${show(v?.to)}`)
      .join('\n');
    const ok = await confirm({
      title: `تطبيق التعديل على ${r.order.orderNumber}؟`,
      body: `${lines}\n\nيُكتب على الطلب بالقيم المعتمدة كما هي، ويُسجَّل في سجل التدقيق مع سببه.`,
      confirmLabel: 'طبّق',
    });
    if (!ok) return;

    await send(r, false);
  }

  /**
   * THE WRITE, AND THE ONE THING THAT CAN STOP IT.
   *
   * `apiFetch` rather than `apiJson`, because the refusal that matters here
   * carries a body — which action, which courier, and the sentence to send
   * them — and `apiJson` throws away everything but the message.
   *
   * `courierNotified` is not a permission. It is a person saying the parcel's
   * holder has been told, and the server records that on the order with their
   * name before it writes anything.
   */
  async function send(r: ChangeRequest, courierNotified: boolean) {
    setApplying(r.id);
    try {
      const res = await apiFetch(`/api/orders/${r.order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // The id, and nothing else that is a field of the order. The server
        // rebuilds the edit from what was approved.
        body: JSON.stringify({ changeRequestId: r.id, ...(courierNotified ? { courierNotified } : {}) }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (body?.code === 'COURIER_ACTION_REQUIRED') {
          setCourierFor({
            request: r,
            ask: {
              action: body.action ?? 'CONTACT_CHANGE',
              reason: body.errorAr ?? body.error ?? '',
              message: body.message ?? '',
              courier: body.courier ?? null,
            },
          });
          return;
        }
        throw new Error(body?.errorAr || body?.error || 'تعذر تطبيق التعديل');
      }

      setCourierFor(null);
      await load();
    } catch (e) {
      await tell({
        title: 'تعذر تطبيق التعديل',
        body: e instanceof Error ? e.message : 'حدث خطأ',
        tone: 'danger',
      });
    } finally {
      setApplying(null);
    }
  }

  if (!lists) {
    return (
      <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
        <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const rows = lists[tab];

  return (
    <div className="max-w-4xl space-y-3">
      <ScreenTitle />


      <div className="flex gap-1 rounded-lg bg-[var(--sys-surface-strong)] p-0.5 w-fit">
        {(
          [
            ['PENDING', 'بانتظار القرار'],
            ['AWAITING_APPLY', 'بانتظار التطبيق'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`min-h-11 md:min-h-0 inline-flex items-center flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === key ? 'bg-[var(--sys-card)] text-[var(--sys-primary)] shadow-raised' : 'text-[var(--sys-muted-foreground)] hover:text-[var(--sys-foreground)]'
            }`}
          >
            {label}
            <span
              className={`tabular-nums rounded-lg px-1.5 text-xs ${
                lists[key].length > 0 ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)]' : 'bg-[var(--sys-border)] text-[var(--sys-muted-foreground)]'
              }`}
            >
              {lists[key].length}
            </span>
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)]">
          <EmptyState
            title={tab === 'PENDING' ? 'لا طلبَ تعديلٍ ينتظر المراجعة' : 'لا تعديلَ معتمَداً ينتظر التطبيق'}
            why={
              tab === 'PENDING'
                ? 'الطلب المؤكَّد للقراءة فقط بالنسبة للموظّف: تغييرُه يمرّ من هنا. فراغُ القائمة يعني أنّ لا أحد طلب تغييراً.'
                : 'ما يُعتمد هنا يُطبَّق على الطلب مباشرةً. فراغُ القائمة يعني أنّ كلّ ما اعتُمد طُبِّق.'
            }
          />
        </div>
      )}

      {rows.map((r) => {
        const role = ROLE_LABELS[r.requestedRole as UserRole]?.ar ?? r.requestedRole;
        const state = deriveCoreState(r.order);
        return (
          <article key={r.id} className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 space-y-3">
            <header className="flex flex-wrap items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center">
                {tab === 'PENDING' ? (
                  <RiFileEditLine className="w-4 h-4 text-[var(--sys-primary)]" />
                ) : (
                  <RiCheckboxCircleLine className="w-4 h-4 text-[var(--sys-success)]" />
                )}
              </span>
              <span className="font-semibold text-[var(--sys-heading)]" dir="ltr">{r.order.orderNumber}</span>
              {/* The one chip. Drawn here by hand it was always grey, so a
                  cancelled order and a delivered one looked the same. */}
              <OrderStateChip state={state} />
              {tab === 'PENDING' && r.blocking && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] text-[var(--sys-destructive)]">
                  يوقف تقدّم الطلب
                </span>
              )}
              {tab === 'PENDING' && r.overdue && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/30 text-[var(--sys-warning)]">
                  تجاوز مهلة المراجعة
                </span>
              )}
              <span className="mr-auto text-xs text-[var(--sys-muted-foreground)]">
                {r.requestedByName ?? '—'} · {role}
              </span>
            </header>

            <p className="text-sm text-[var(--sys-heading)]">{r.reason}</p>

            {/* What changes, in words the person deciding reads: the field's
                Arabic name, and the value before and after. */}
            <ul className="rounded-lg border border-[var(--sys-border)] divide-y divide-[var(--sys-border)]">
              {Object.entries(r.changes ?? {}).map(([field, value]) => (
                <li key={field} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                  <span className="w-28 shrink-0 font-semibold text-[var(--sys-muted-foreground)]">{changeFieldLabel(field)}</span>
                  {value?.from !== undefined && (
                    <>
                      <span className="text-[var(--sys-muted)] line-through">{show(value.from)}</span>
                      <RiArrowLeftLine className="icon-mirror w-4 h-4 text-[var(--sys-primary)] shrink-0" />
                    </>
                  )}
                  <span className="font-semibold text-[var(--sys-heading)]">{show(value?.to)}</span>
                </li>
              ))}
            </ul>

            {tab === 'AWAITING_APPLY' && r.decisionNote && (
              <p className="text-xs text-[var(--sys-foreground)] bg-[var(--sys-success-soft)] rounded-lg px-3 py-2">
                <b className="text-[var(--sys-success)]">القرار:</b> {r.decisionNote}
              </p>
            )}

            <p className="text-xs text-[var(--sys-muted-foreground)]">
              {r.order.customer.fullName} · <span dir="ltr">{r.order.customer.phone}</span>
            </p>

            <footer className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--sys-border)]">
              {tab === 'PENDING' ? (
                /* Nobody decides their own request — the route refuses it,
                   and a button that always fails teaches people the screen
                   is lying. What she has on her own row is the withdrawal. */
                r.isMine ? (
                  <>
                    <button
                      onClick={() => void withdraw(r)}
                      disabled={withdrawing === r.id}
                      className="min-h-11 md:min-h-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-[var(--sys-border)] text-[var(--sys-foreground)] text-xs font-medium transition-colors hover:border-[var(--sys-destructive-border)] hover:text-[var(--sys-destructive)] disabled:opacity-50"
                    >
                      {withdrawing === r.id ? (
                        <RiLoader4Line className="w-4 h-4 animate-spin" />
                      ) : (
                        <RiArrowGoBackLine className="icon-mirror w-4 h-4" />
                      )}
                      اسحب طلبي
                    </button>
                    <span className="text-xs text-[var(--sys-muted-foreground)]">
                      طلبُك — ينتظر قرارَ من يستطيع الوصولَ إلى الطلب، ويصلك القرارُ إشعاراً.
                    </span>
                  </>
                ) : (
                  <button
                    onClick={() => setReviewing(r.id)}
                    className="min-h-11 md:min-h-0 inline-flex items-center px-4 py-1.5 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium"
                  >
                    مراجعة واتخاذ القرار
                  </button>
                )
              ) : (
                <button
                  onClick={() => void apply(r)}
                  disabled={applying === r.id}
                  className="min-h-11 md:min-h-0 inline-flex items-center flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--sys-success)] text-[var(--sys-primary-foreground)] text-xs font-medium disabled:opacity-50"
                >
                  {applying === r.id && <RiLoader4Line className="w-4 h-4 animate-spin" />}
                  طبّق التعديل على الطلب
                </button>
              )}
            </footer>
          </article>
        );
      })}

      {courierFor && (
        <CourierNotifyDialog
          orderNumber={courierFor.request.order.orderNumber}
          ask={courierFor.ask}
          busy={applying === courierFor.request.id}
          onClose={() => setCourierFor(null)}
          onNotified={() => void send(courierFor.request, true)}
        />
      )}

      {reviewing && (
        <ChangeRequestReview
          requestId={reviewing}
          onClose={() => setReviewing(null)}
          onDecided={() => void load()}
        />
      )}
    </div>
  );
}
