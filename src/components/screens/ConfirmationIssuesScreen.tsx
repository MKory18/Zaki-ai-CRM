'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, PencilLine, Ban, X } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { useRegions } from '@/hooks/useRegions';
import { arDateTime } from '@/lib/format';

/**
 * /confirmation/issues — entry issues on moderator-entered orders only.
 *
 * The agent who found the problem already named it: wrong phone, wrong
 * address, missing data. So this screen opens the very fields that reason
 * points at, pre-filled with what is currently wrong, and the moderator
 * edits them. It used to ask "ماذا تم تصحيحه؟" in a browser prompt and
 * close the issue on whatever was typed — the wrong number stayed wrong and
 * came straight back to the same agent.
 *
 * The correction saves through the ordinary order edit, so it takes the same
 * validation (a Syrian store refuses a Jordanian number), the same duplicate
 * check and the same lost-update guard as any other edit. Only then is the
 * issue closed, and the note is written from what actually changed.
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
    version: number;
    quantity: number;
    regionId: string | null;
    region: { id: string; name: string } | null;
    product: { name: string } | null;
    confirmationStatus: string;
    customer: {
      id: string;
      fullName: string;
      phone: string;
      rawPhone: string | null;
      altPhone: string | null;
      city: string;
      address: string;
    };
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

/** Which field the agent was pointing at — it opens focused and marked. */
const REASON_FIELD: Record<string, keyof Draft | null> = {
  WRONG_PHONE: 'phone',
  WRONG_ADDRESS: 'address',
  MISSING_DATA: null,
  WRONG_PRODUCT: null,
  DUPLICATE: null,
  OTHER: null,
};

interface Draft {
  fullName: string;
  phone: string;
  regionId: string;
  address: string;
}

const FIELD_LABEL: Record<keyof Draft, string> = {
  fullName: 'اسم العميل',
  phone: 'رقم الهاتف',
  regionId: 'المحافظة',
  address: 'العنوان',
};

export function ConfirmationIssuesScreen() {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const { regions, countryName } = useRegions();

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

  function openCorrection(issue: Issue) {
    setError(null);
    setVoiding(null);
    setEditing(issue.id);
    setDraft({
      fullName: issue.order.customer.fullName ?? '',
      phone: issue.order.customer.rawPhone || issue.order.customer.phone || '',
      regionId: issue.order.regionId ?? '',
      address: issue.order.customer.address ?? '',
    });
  }

  /** What the moderator actually changed, in words, for the order's history. */
  function changeSummary(issue: Issue, d: Draft): string[] {
    const before = {
      fullName: issue.order.customer.fullName ?? '',
      phone: issue.order.customer.rawPhone || issue.order.customer.phone || '',
      regionId: issue.order.regionId ?? '',
      address: issue.order.customer.address ?? '',
    };
    const nameOf = (id: string) => regions.find((r) => r.id === id)?.name ?? '—';
    const out: string[] = [];
    for (const key of Object.keys(before) as (keyof Draft)[]) {
      if (before[key] === d[key]) continue;
      const from = key === 'regionId' ? nameOf(before[key]) : before[key] || '—';
      const to = key === 'regionId' ? nameOf(d[key]) : d[key] || '—';
      out.push(`${FIELD_LABEL[key]}: ${from} ← ${to}`);
    }
    return out;
  }

  async function saveCorrection(issue: Issue) {
    if (!draft) return;
    const changes = changeSummary(issue, draft);
    if (changes.length === 0) {
      setError('لم تُعدّل أي بيانات — صحّح ما أشار إليه موظف التأكيد أولاً.');
      return;
    }
    setBusy(issue.id);
    setError(null);
    try {
      // 1. The correction itself, through the ordinary order edit: phone rule,
      //    duplicate check and version guard all apply here and nowhere else.
      await apiJson(`/api/orders/${issue.order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: issue.order.version,
          customerName: draft.fullName,
          customerPhone: draft.phone,
          customerAddress: draft.address,
          regionId: draft.regionId || null,
        }),
      });

      // 2. Only once the data is actually fixed does the issue close. If this
      //    fails the correction still stands and the issue stays visible —
      //    the safe direction to fail in.
      await apiJson(`/api/confirmation/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'correct', note: changes.join(' · ') }),
      });

      setEditing(null);
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ التصحيح');
    } finally {
      setBusy(null);
    }
  }

  async function confirmVoid(issue: Issue) {
    if (!voidReason.trim()) {
      setError('سبب الإبطال مطلوب.');
      return;
    }
    setBusy(issue.id);
    setError(null);
    try {
      await apiJson(`/api/confirmation/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void', note: voidReason.trim() }),
      });
      setVoiding(null);
      setVoidReason('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الإبطال');
    } finally {
      setBusy(null);
    }
  }

  if (!issues) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const inputClass =
    'w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm focus:outline-none focus:border-[#b8256e]';
  const flaggedClass =
    'w-full h-10 px-3 rounded-[8px] border-2 border-[#fb323f] bg-[#fff7f7] text-sm focus:outline-none';

  return (
    <div className="max-w-4xl space-y-3">
      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}

      {issues.length === 0 && (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          لا توجد إشكالات مفتوحة.
        </p>
      )}

      {issues.map((issue) => {
        const flagged = REASON_FIELD[issue.reason] ?? null;
        const isEditing = editing === issue.id;
        const isVoiding = voiding === issue.id;

        return (
          <article key={issue.id} className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 space-y-2">
            <header className="flex flex-wrap items-center gap-2">
              <span className="w-8 h-8 rounded-[8px] bg-[#feecee] border border-[#fecdd1] flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-[#fb323f]" />
              </span>
              <span className="font-semibold text-[#121926]" dir="ltr">{issue.order.orderNumber}</span>
              <span className="text-xs px-2 py-0.5 rounded-[6px] bg-[#feecee] border border-[#fecdd1] text-[#fb323f] font-medium">
                {REASON_LABEL[issue.reason] ?? issue.reason}
              </span>
              <span className="mr-auto text-xs text-[#697586]">
                المودريتور: {issue.order.moderator?.name ?? '—'}
              </span>
            </header>

            {!isEditing && (
              <>
                <p className="text-sm text-[#364152]">
                  {issue.order.customer.fullName} ·{' '}
                  <span dir="ltr">{issue.order.customer.rawPhone || issue.order.customer.phone}</span> ·{' '}
                  {issue.order.region?.name ?? issue.order.customer.city}
                </p>
                <p className="text-xs text-[#697586]">{issue.order.customer.address}</p>
                {issue.order.product && (
                  <p className="text-xs text-[#9aa4b2]">
                    {issue.order.product.name} × {issue.order.quantity}
                  </p>
                )}
              </>
            )}

            {issue.note && (
              <p className="text-sm text-[#121926] bg-[#f8fafc] rounded-[8px] p-2">
                <span className="text-[#697586]">ملاحظة موظف التأكيد: </span>
                {issue.note}
              </p>
            )}

            {isEditing && draft && (
              <div className="rounded-[8px] border border-[#e3e8ef] bg-[#f8fafc] p-3 space-y-3">
                <p className="text-xs text-[#697586]">
                  صحّح البيانات هنا — الحقل المؤشَّر بالأحمر هو ما أبلغ عنه موظف التأكيد.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-medium text-[#364152] mb-1">{FIELD_LABEL.fullName}</span>
                    <input
                      value={draft.fullName}
                      onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                      className={flagged === 'fullName' ? flaggedClass : inputClass}
                    />
                  </label>

                  <label className="block">
                    <span className="block text-xs font-medium text-[#364152] mb-1">{FIELD_LABEL.phone}</span>
                    <input
                      value={draft.phone}
                      onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                      dir="ltr"
                      autoFocus={flagged === 'phone'}
                      className={flagged === 'phone' ? flaggedClass : inputClass}
                    />
                  </label>

                  <label className="block">
                    <span className="block text-xs font-medium text-[#364152] mb-1">
                      {FIELD_LABEL.regionId}
                      {countryName ? ` — ${countryName}` : ''}
                    </span>
                    <select
                      value={draft.regionId}
                      onChange={(e) => setDraft({ ...draft, regionId: e.target.value })}
                      className={flagged === 'address' ? flaggedClass : inputClass}
                    >
                      <option value="">— اختر المحافظة —</option>
                      {regions.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="block text-xs font-medium text-[#364152] mb-1">{FIELD_LABEL.address}</span>
                    <input
                      value={draft.address}
                      onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                      autoFocus={flagged === 'address'}
                      className={flagged === 'address' ? flaggedClass : inputClass}
                    />
                  </label>
                </div>

                {changeSummary(issue, draft).length > 0 && (
                  <div className="text-[11px] text-[#364152] bg-white border border-[#e3e8ef] rounded-[8px] p-2 space-y-0.5">
                    <p className="text-[#697586]">سيُسجَّل في الطلب:</p>
                    {changeSummary(issue, draft).map((line) => (
                      <p key={line} dir="rtl">• {line}</p>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => saveCorrection(issue)}
                    disabled={busy === issue.id}
                    className="px-3 py-1.5 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium disabled:opacity-50"
                  >
                    {busy === issue.id ? 'جارٍ الحفظ…' : 'احفظ التصحيح وأعده للطابور'}
                  </button>
                  <button
                    onClick={() => { setEditing(null); setDraft(null); setError(null); }}
                    className="px-3 py-1.5 rounded-[8px] border border-[#e3e8ef] text-xs text-[#697586]"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            {isVoiding && (
              <div className="rounded-[8px] border border-[#fecdd1] bg-[#fff7f7] p-3 space-y-2">
                <label className="block">
                  <span className="block text-xs font-medium text-[#364152] mb-1">سبب الإبطال</span>
                  <input
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    autoFocus
                    placeholder="طلب وهمي، مكرر…"
                    className={inputClass}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmVoid(issue)}
                    disabled={busy === issue.id}
                    className="px-3 py-1.5 rounded-[8px] bg-[#fb323f] text-white text-xs font-medium disabled:opacity-50"
                  >
                    تأكيد الإبطال
                  </button>
                  <button
                    onClick={() => { setVoiding(null); setVoidReason(''); setError(null); }}
                    className="px-3 py-1.5 rounded-[8px] border border-[#e3e8ef] text-xs text-[#697586]"
                  >
                    تراجع
                  </button>
                </div>
              </div>
            )}

            <p className="text-[11px] text-[#9aa4b2]">
              تاريخ إنشاء الطلب الأصلي:{' '}
              <span>{arDateTime(issue.order.createdAt)}</span> — لا يتغير بعد التصحيح.
            </p>

            {!isEditing && !isVoiding && (
              <footer className="flex gap-2 pt-2 border-t border-[#e3e8ef]">
                <button
                  onClick={() => openCorrection(issue)}
                  className="px-3 py-1.5 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <PencilLine className="w-3.5 h-3.5" />
                  صحّح البيانات
                </button>
                <button
                  onClick={() => { setVoiding(issue.id); setVoidReason(''); setError(null); }}
                  className="px-3 py-1.5 rounded-[8px] border border-[#e3e8ef] text-xs text-[#697586] hover:text-[#fb323f] inline-flex items-center gap-1.5"
                >
                  <Ban className="w-3.5 h-3.5" />
                  إبطال الطلب (المالك فقط)
                </button>
              </footer>
            )}
          </article>
        );
      })}
    </div>
  );
}
