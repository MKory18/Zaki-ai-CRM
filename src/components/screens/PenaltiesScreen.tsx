'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, RotateCcw, ShieldQuestion, X } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { userCan } from '@/lib/can';
import { useApp } from '@/context/AppContext';
import { Modal } from '@/components/ui/Modal';

/**
 * WHAT THE SYSTEM PROPOSED, AND WHAT A PERSON DECIDES.
 *
 * Every row here is money about to be taken from somebody who is not in the
 * room. So the screen is built to make waiving easy and applying deliberate:
 * the measurement is printed beside the amount, the arithmetic is shown, and
 * nothing is applied in bulk — there is no "approve all" button, because
 * approving all is exactly what a tired manager does at the end of a month.
 *
 * Waiving asks for a reason and will not proceed without one. A deduction
 * cancelled with nothing written down cannot be told apart from a favour,
 * and the person it was cancelled for is the one who suffers when somebody
 * questions it later.
 */

interface Row {
  id: string;
  kind: string;
  occurredOn: string;
  units: number;
  chargedUnits: number;
  amount: number;
  currencyCode: string;
  status: 'PROPOSED' | 'APPLIED' | 'WAIVED' | 'REVERSED';
  note: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  payslipId: string | null;
  reversesId: string | null;
  user: { id: string; name: string; role: string };
}

interface Data {
  kinds: { key: string; ar: string; unitAr: string; sourceAr: string }[];
  penalties: Row[];
}

const STATUS_AR: Record<Row['status'], { ar: string; cls: string }> = {
  PROPOSED: { ar: 'مقترح', cls: 'bg-amber-50 text-[#c07f2a] border-amber-100' },
  APPLIED: { ar: 'معتمد', cls: 'bg-[#feecee] text-[#fb323f] border-[#fecdd1]' },
  WAIVED: { ar: 'مُلغى', cls: 'bg-emerald-50 text-[#00a344] border-emerald-100' },
  REVERSED: { ar: 'مُرتجَع', cls: 'bg-[#f1f3f6] text-[#697586] border-[#e3e8ef]' },
};

const TABS = [
  { key: 'PROPOSED', ar: 'بانتظار القرار' },
  { key: 'APPLIED', ar: 'معتمدة' },
  { key: '', ar: 'الكل' },
];

export function PenaltiesScreen() {
  const { currentUser } = useApp();
  const mayDecide = userCan(currentUser, 'penalties.decide');
  const [tab, setTab] = useState('PROPOSED');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ row: Row; action: 'waive' | 'reverse' } | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await apiJson<Data>(`/api/team/penalties${tab ? `?status=${tab}` : ''}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (row: Row, action: 'apply' | 'waive' | 'reverse', note?: string) => {
    setBusy(row.id);
    setError(null);
    try {
      await apiJson('/api/team/penalties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ penaltyId: row.id, action, note }),
      });
      setAsking(null);
      setReason('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التنفيذ');
    } finally {
      setBusy(null);
    }
  };

  const kindAr = (key: string) => data?.kinds.find((k) => k.key === key)?.ar ?? key;
  const unitAr = (key: string) => data?.kinds.find((k) => k.key === key)?.unitAr ?? '';

  return (
    <div className="max-w-4xl space-y-3" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-[#121926]">
          <ShieldQuestion className="h-5 w-5 text-[#b8256e]" /> الخصومات
        </h1>
        <p className="mt-0.5 text-xs leading-relaxed text-[#697586]">
          النظام يقترح، وأنت تقرّر. لا خصم يصير مالاً بلا قرار إنسان — ولا يُقترح خصمٌ على وصولٍ
          مُقدَّر من أول طلب لمسه الموظف، لأنه حدٌّ أعلى لا قياس.
        </p>
      </div>

      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`h-8 flex-1 rounded-[8px] border text-xs font-medium ${
              tab === t.key ? 'border-[#b8256e] bg-[#fdf2f8] text-[#b8256e]' : 'border-[#e3e8ef] text-[#364152]'
            }`}
          >
            {t.ar}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg border border-[#fecdd1] bg-[#feecee] p-2.5 text-xs text-[#fb323f]">{error}</p>}

      {!data ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-[#697586]">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
        </p>
      ) : data.penalties.length === 0 ? (
        <p className="rounded-[8px] border border-[#e3e8ef] bg-white p-8 text-center text-sm text-[#697586]">
          لا خصومات هنا.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.penalties.map((row) => {
            const st = STATUS_AR[row.status];
            return (
              <li key={row.id} className="rounded-[8px] border border-[#e3e8ef] bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-[#121926]">{row.user.name}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] ${st.cls}`}>{st.ar}</span>
                </div>

                <p className="mt-1 text-xs text-[#364152]">
                  {kindAr(row.kind)} ·{' '}
                  <span className="tabular-nums" dir="ltr">
                    {row.occurredOn.slice(0, 10)}
                  </span>
                </p>

                {/* The arithmetic, printed. Nobody should have to trust a
                    number that took money from somebody. */}
                <p className="mt-1 text-[11px] text-[#697586]">
                  <span className="tabular-nums">{row.units}</span> {unitAr(row.kind)} ·{' '}
                  المحتسَب <span className="tabular-nums">{row.chargedUnits}</span> ·{' '}
                  <span className="font-semibold tabular-nums text-[#121926]" dir="ltr">
                    {row.amount} {row.currencyCode}
                  </span>
                </p>

                {row.decisionNote && (
                  <p className="mt-1 rounded bg-[#f8fafc] px-2 py-1 text-[11px] text-[#697586]">
                    السبب: {row.decisionNote}
                  </p>
                )}

                {mayDecide && (row.status === 'PROPOSED' || row.status === 'APPLIED') && (
                  <div className="mt-2 flex flex-wrap gap-2 border-t border-[#e3e8ef] pt-2">
                    {row.status === 'PROPOSED' && (
                      <>
                        <button
                          type="button"
                          disabled={busy === row.id}
                          onClick={() => decide(row, 'apply')}
                          className="flex items-center gap-1 rounded-[8px] border border-[#fecdd1] bg-[#feecee] px-2.5 py-1 text-[11px] font-medium text-[#fb323f] disabled:opacity-60"
                        >
                          <Check className="h-3 w-3" /> اعتمد الخصم
                        </button>
                        <button
                          type="button"
                          disabled={busy === row.id}
                          onClick={() => setAsking({ row, action: 'waive' })}
                          className="flex items-center gap-1 rounded-[8px] border border-[#e3e8ef] px-2.5 py-1 text-[11px] text-[#364152] disabled:opacity-60"
                        >
                          <X className="h-3 w-3" /> ألغِ
                        </button>
                      </>
                    )}
                    {row.status === 'APPLIED' && !row.payslipId && (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => setAsking({ row, action: 'reverse' })}
                        className="flex items-center gap-1 rounded-[8px] border border-[#e3e8ef] px-2.5 py-1 text-[11px] text-[#364152] disabled:opacity-60"
                      >
                        <RotateCcw className="h-3 w-3" /> ارتجاع
                      </button>
                    )}
                    {row.status === 'APPLIED' && row.payslipId && (
                      <span className="text-[10px] text-[#9aa4b2]">
                        سُوّي مع صرفية — تصحيحه حركة جديدة لا تعديل للماضي.
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* A reason, always. The service refuses without one; asking here
          means the person is told before they press, not after. */}
      {asking && (
        <Modal
          isOpen
          onClose={() => {
            setAsking(null);
            setReason('');
          }}
          title={asking.action === 'waive' ? 'إلغاء الخصم' : 'ارتجاع الخصم'}
          subtitle={asking.row.user.name}
          maxWidth="md"
        >
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-[#697586]">
              اكتب السبب. خصمٌ يُلغى بلا سبب مكتوب لا يُفرَّق عن محاباة — والمتضرّر هو من أُلغي
              الخصم عنه حين يسأل أحدٌ لاحقاً.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              autoFocus
              className="w-full rounded-lg border border-[#e3e8ef] px-2 py-2 text-xs text-[#364152] outline-none focus:border-[#b8256e]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!reason.trim() || busy === asking.row.id}
                onClick={() => decide(asking.row, asking.action, reason.trim())}
                className="rounded-[8px] bg-[#b8256e] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy === asking.row.id ? 'جارٍ…' : 'تأكيد'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAsking(null);
                  setReason('');
                }}
                className="rounded-[8px] border border-[#e3e8ef] px-4 py-2 text-xs text-[#697586]"
              >
                تراجع
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
