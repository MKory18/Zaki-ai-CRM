'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * /confirmation/issues — entry issues on moderator-entered orders only.
 * Correct and return to the queue, or void (owner only). An issue is never
 * counted as a cancellation, and the order keeps its original created_at.
 */

interface Issue {
  id: string;
  reason: string;
  note: string | null;
  status: string;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    createdAt: string;
    source: string;
    confirmationStatus: string;
    customer: { fullName: string; phone: string; city: string; address: string };
    moderator: { id: string; name: string } | null;
  };
}

const REASON_LABEL: Record<string, string> = {
  WRONG_PHONE: 'رقم خاطئ',
  WRONG_ADDRESS: 'عنوان خاطئ',
  WRONG_PRODUCT: 'منتج خاطئ',
  MISSING_DATA: 'بيانات ناقصة',
  DUPLICATE: 'طلب مكرر',
  OTHER: 'أخرى',
};

export function ConfirmationIssuesScreen() {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ issues: Issue[] }>('/api/confirmation/issues');
      setIssues(res.issues);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (issue: Issue, action: 'correct' | 'void') => {
    const note = window.prompt(action === 'correct' ? 'ماذا تم تصحيحه؟' : 'سبب الإبطال');
    if (action === 'void' && !note) return;
    setBusy(issue.id);
    setError(null);
    try {
      await apiJson(`/api/confirmation/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: note ?? undefined }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تنفيذ الإجراء');
    } finally {
      setBusy(null);
    }
  };

  if (!issues) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-3">
      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}

      {issues.length === 0 && (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          لا توجد إشكالات مفتوحة.
        </p>
      )}

      {issues.map((issue) => (
        <article key={issue.id} className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 space-y-2">
          <header className="flex flex-wrap items-center gap-2">
            <span className="w-8 h-8 rounded-[8px] bg-[#feecee] border border-[#fecdd1] flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-[#fb323f]" />
            </span>
            <span className="font-semibold text-[#121926]" dir="ltr">{issue.order.orderNumber}</span>
            <span className="text-xs px-2 py-0.5 rounded-[6px] bg-[#f8fafc] border border-[#e3e8ef] text-[#364152]">
              {REASON_LABEL[issue.reason] ?? issue.reason}
            </span>
            <span className="mr-auto text-xs text-[#697586]">
              المودريتور: {issue.order.moderator?.name ?? '—'}
            </span>
          </header>

          <p className="text-sm text-[#364152]">
            {issue.order.customer.fullName} · <span dir="ltr">{issue.order.customer.phone}</span> ·{' '}
            {issue.order.customer.city}
          </p>
          <p className="text-xs text-[#697586]">{issue.order.customer.address}</p>
          {issue.note && <p className="text-sm text-[#121926] bg-[#f8fafc] rounded-[8px] p-2">{issue.note}</p>}
          <p className="text-[11px] text-[#9aa4b2]">
            تاريخ إنشاء الطلب الأصلي:{' '}
            <span dir="ltr">{new Date(issue.order.createdAt).toLocaleString('ar-EG')}</span> — لا يتغير بعد التصحيح.
          </p>

          <footer className="flex gap-2 pt-2 border-t border-[#e3e8ef]">
            <button
              onClick={() => decide(issue, 'correct')}
              disabled={busy === issue.id}
              className="px-3 py-1.5 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium disabled:opacity-50"
            >
              تم التصحيح — أعده للطابور
            </button>
            <button
              onClick={() => decide(issue, 'void')}
              disabled={busy === issue.id}
              className="px-3 py-1.5 rounded-[8px] border border-[#e3e8ef] text-xs text-[#697586] hover:text-[#fb323f] disabled:opacity-50"
            >
              إبطال الطلب (المالك فقط)
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}
