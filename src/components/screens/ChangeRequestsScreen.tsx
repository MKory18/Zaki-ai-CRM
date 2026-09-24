'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FilePen, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { ChangeRequestReview } from '@/components/orders/ChangeRequestReview';
import { changeFieldLabel } from '@/lib/change-request-fields';
import { deriveCoreState, STATE_LABEL_AR } from '@/lib/order-state';
import { ROLE_LABELS, type UserRole } from '@/types/auth';

/**
 * /control/change-requests — the review queue.
 *
 * Deciding opens the same dialog the packing line uses. This screen used to
 * decide through `window.prompt` — a grey system box asking for a reason
 * that went straight into the audit log, with no before-and-after, no order
 * details, and a Cancel button that looked like the one that mattered. A
 * second decision dialog would have been a second set of rules to keep in
 * step, so there is one, opened from both places.
 *
 * Approving records the decision and unblocks the order; the approved
 * fields are then applied through the order's own money path, never copied
 * blindly. An overdue SLA is flagged, never auto-approved.
 */

interface ChangeRequest {
  id: string;
  reason: string;
  status: string;
  blocking: boolean;
  createdAt: string;
  slaDueAt: string | null;
  overdue: boolean;
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

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

export function ChangeRequestsScreen() {
  const [requests, setRequests] = useState<ChangeRequest[] | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ requests: ChangeRequest[] }>('/api/control/change-requests?status=PENDING');
      setRequests(res.requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!requests) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-3">
      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}

      {requests.length === 0 && (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          لا توجد طلبات تعديل قيد المراجعة.
        </p>
      )}

      {requests.map((r) => {
        const role = ROLE_LABELS[r.requestedRole as UserRole]?.ar ?? r.requestedRole;
        const state = STATE_LABEL_AR[deriveCoreState(r.order)];
        return (
          <article key={r.id} className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 space-y-3">
            <header className="flex flex-wrap items-center gap-2">
              <span className="w-8 h-8 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] flex items-center justify-center">
                <FilePen className="w-4 h-4 text-[#b8256e]" />
              </span>
              <span className="font-semibold text-[#121926]" dir="ltr">{r.order.orderNumber}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-[6px] bg-[#f1f5f9] text-[#475467]">{state}</span>
              {r.blocking && (
                <span className="text-[11px] px-2 py-0.5 rounded-[6px] bg-[#feecee] border border-[#fecdd1] text-[#fb323f]">
                  يوقف تقدّم الطلب
                </span>
              )}
              {r.overdue && (
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

            <p className="text-xs text-[#697586]">
              {r.order.customer.fullName} · <span dir="ltr">{r.order.customer.phone}</span>
            </p>

            <footer className="flex pt-2 border-t border-[#e3e8ef]">
              <button
                onClick={() => setReviewing(r.id)}
                className="px-4 py-1.5 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium"
              >
                مراجعة واتخاذ القرار
              </button>
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
