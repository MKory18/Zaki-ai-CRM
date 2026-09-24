'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, FilePen, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { ChangeRequestReview } from '@/components/orders/ChangeRequestReview';
import { useConfirm, useTell } from '@/components/ui/Confirm';
import { changeFieldLabel } from '@/lib/change-request-fields';
import { deriveCoreState, STATE_LABEL_AR } from '@/lib/order-state';
import { ROLE_LABELS, type UserRole } from '@/types/auth';

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
  const [tab, setTab] = useState<Tab>('PENDING');
  const [lists, setLists] = useState<Record<Tab, ChangeRequest[]> | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

    setApplying(r.id);
    try {
      await apiJson(`/api/orders/${r.order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // The id, and nothing else. The server rebuilds the edit from what
        // was approved; it refuses anything sent alongside.
        body: JSON.stringify({ changeRequestId: r.id }),
      });
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
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const rows = lists[tab];

  return (
    <div className="max-w-4xl space-y-3">
      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}

      <div className="flex gap-1 rounded-lg bg-[#eef2f6] p-0.5 w-fit">
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
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === key ? 'bg-white text-[#b8256e] shadow-sm' : 'text-[#697586] hover:text-[#364152]'
            }`}
          >
            {label}
            <span
              className={`tabular-nums rounded px-1.5 text-[10px] ${
                lists[key].length > 0 ? 'bg-[#b8256e] text-white' : 'bg-[#dde3ea] text-[#697586]'
              }`}
            >
              {lists[key].length}
            </span>
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          {tab === 'PENDING' ? 'لا توجد طلبات تعديل قيد المراجعة.' : 'لا تعديلات معتمدة بانتظار التطبيق.'}
        </p>
      )}

      {rows.map((r) => {
        const role = ROLE_LABELS[r.requestedRole as UserRole]?.ar ?? r.requestedRole;
        const state = STATE_LABEL_AR[deriveCoreState(r.order)];
        return (
          <article key={r.id} className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 space-y-3">
            <header className="flex flex-wrap items-center gap-2">
              <span className="w-8 h-8 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] flex items-center justify-center">
                {tab === 'PENDING' ? (
                  <FilePen className="w-4 h-4 text-[#b8256e]" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#00994d]" />
                )}
              </span>
              <span className="font-semibold text-[#121926]" dir="ltr">{r.order.orderNumber}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-[6px] bg-[#f1f5f9] text-[#475467]">{state}</span>
              {tab === 'PENDING' && r.blocking && (
                <span className="text-[11px] px-2 py-0.5 rounded-[6px] bg-[#feecee] border border-[#fecdd1] text-[#fb323f]">
                  يوقف تقدّم الطلب
                </span>
              )}
              {tab === 'PENDING' && r.overdue && (
                <span className="text-[11px] px-2 py-0.5 rounded-[6px] bg-amber-50 border border-amber-100 text-[#c07f2a]">
                  تجاوز مهلة المراجعة
                </span>
              )}
              <span className="mr-auto text-xs text-[#697586]">
                {r.requestedByName ?? '—'} · {role}
              </span>
            </header>

            <p className="text-sm text-[#121926]">{r.reason}</p>

            {/* What changes, in words the person deciding reads: the field's
                Arabic name, and the value before and after. */}
            <ul className="rounded-lg border border-[#e3e8ef] divide-y divide-[#e3e8ef]">
              {Object.entries(r.changes ?? {}).map(([field, value]) => (
                <li key={field} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                  <span className="w-28 shrink-0 font-semibold text-[#697586]">{changeFieldLabel(field)}</span>
                  {value?.from !== undefined && (
                    <>
                      <span className="text-[#9aa4b2] line-through">{show(value.from)}</span>
                      <ArrowLeft className="w-3.5 h-3.5 text-[#b8256e] shrink-0" />
                    </>
                  )}
                  <span className="font-semibold text-[#121926]">{show(value?.to)}</span>
                </li>
              ))}
            </ul>

            {tab === 'AWAITING_APPLY' && r.decisionNote && (
              <p className="text-xs text-[#364152] bg-[#e6f9ee] rounded-lg px-3 py-2">
                <b className="text-[#00994d]">القرار:</b> {r.decisionNote}
              </p>
            )}

            <p className="text-xs text-[#697586]">
              {r.order.customer.fullName} · <span dir="ltr">{r.order.customer.phone}</span>
            </p>

            <footer className="flex pt-2 border-t border-[#e3e8ef]">
              {tab === 'PENDING' ? (
                <button
                  onClick={() => setReviewing(r.id)}
                  className="px-4 py-1.5 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium"
                >
                  مراجعة واتخاذ القرار
                </button>
              ) : (
                <button
                  onClick={() => void apply(r)}
                  disabled={applying === r.id}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-[8px] bg-[#00994d] text-white text-xs font-medium disabled:opacity-50"
                >
                  {applying === r.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  طبّق التعديل على الطلب
                </button>
              )}
            </footer>
          </article>
        );
      })}

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
