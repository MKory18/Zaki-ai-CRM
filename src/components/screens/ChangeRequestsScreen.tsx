'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { FilePen, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * /control/change-requests — the review queue. Approving records the
 * decision and unblocks the order; the approved fields are then applied
 * through the order's own APIs, never copied blindly here. An overdue SLA
 * is flagged, never auto-approved.
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
  changes: Record<string, { to: string | number | null }>;
  order: {
    id: string;
    orderNumber: string;
    confirmationStatus: string;
    shippingStatus: string;
    customer: { fullName: string; phone: string };
  };
}

export function ChangeRequestsScreen() {
  const [requests, setRequests] = useState<ChangeRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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

  const decide = async (request: ChangeRequest, decision: 'APPROVED' | 'REJECTED') => {
    const note = window.prompt(decision === 'APPROVED' ? 'ملاحظة الاعتماد (اختياري)' : 'سبب الرفض (إلزامي)');
    if (decision === 'REJECTED' && !note) return;
    setBusy(request.id);
    setError(null);
    try {
      await apiJson(`/api/control/change-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: note ?? undefined }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ القرار');
    } finally {
      setBusy(null);
    }
  };

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

      {requests.map((r) => (
        <article key={r.id} className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 space-y-2">
          <header className="flex flex-wrap items-center gap-2">
            <span className="w-8 h-8 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] flex items-center justify-center">
              <FilePen className="w-4 h-4 text-[#b8256e]" />
            </span>
            <span className="font-semibold text-[#121926]" dir="ltr">{r.order.orderNumber}</span>
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
              {r.requestedByName ?? '—'} · {r.requestedRole}
            </span>
          </header>

          <p className="text-sm text-[#121926]">{r.reason}</p>
          <ul className="text-xs text-[#697586] space-y-0.5">
            {Object.entries(r.changes ?? {}).map(([field, value]) => (
              <li key={field} dir="ltr">
                {field}: {String(value?.to ?? '—')}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[#697586]">
            {r.order.customer.fullName} · <span dir="ltr">{r.order.customer.phone}</span> ·{' '}
            {r.order.confirmationStatus} / {r.order.shippingStatus}
          </p>

          <footer className="flex gap-2 pt-2 border-t border-[#e3e8ef]">
            <button
              onClick={() => decide(r, 'APPROVED')}
              disabled={busy === r.id}
              className="px-3 py-1.5 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium disabled:opacity-50"
            >
              اعتماد
            </button>
            <button
              onClick={() => decide(r, 'REJECTED')}
              disabled={busy === r.id}
              className="px-3 py-1.5 rounded-[8px] border border-[#e3e8ef] text-xs text-[#697586] hover:text-[#fb323f] disabled:opacity-50"
            >
              رفض
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}
