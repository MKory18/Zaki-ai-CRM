'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Target } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * WHERE THE RUNNING SPAN STANDS.
 *
 * A rule that pays on a day's count is accrued only once the day has closed,
 * so until this there was nothing to look at while it could still be
 * changed: a person worked towards a number they could not see, which is the
 * opposite of what a target is for.
 *
 * Every figure here MOVES. It is the same measure the accrual will use, over
 * the span still being worked, and it becomes money only when the span ends —
 * which the panel says out loud rather than letting it be read as earnings.
 */

interface Row {
  ruleId: string;
  ruleName: string;
  userId: string;
  userName: string;
  metricLabel: string;
  periodLabel: string;
  count: number;
  inBand: { label: string; value: number } | null;
  next: { at: number; value: number; remaining: number } | null;
  isTarget: boolean;
  goal: number | null;
  minOrders: number | null;
}

export function PeriodProgress() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    apiJson<{ rows: Row[]; note: string }>('/api/finance/commission/progress')
      .then((d) => { setRows(d.rows ?? []); setNote(d.note ?? ''); })
      .catch(() => setRows([]));
  }, []);

  if (rows !== null && rows.length === 0) return null;

  return (
    <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#e3e8ef]">
        <Target className="w-3.5 h-3.5 text-[#b8256e]" />
        <h2 className="text-sm font-medium text-[#121926]">الفترة الجارية</h2>
      </div>

      {!rows ? (
        <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[#e3e8ef]">
            {rows.map((r) => {
              const short = r.minOrders != null && r.count < r.minOrders;
              return (
                <li key={`${r.ruleId}:${r.userId}`} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-[#121926] min-w-[120px]">{r.userName}</span>
                  <span className="text-[11px] text-[#697586]">
                    {r.ruleName} · {r.metricLabel} · {r.periodLabel}
                  </span>
                  <span className="text-sm font-bold text-[#121926] tabular-nums ms-auto" dir="ltr">
                    {r.count}
                    {r.goal !== null && <span className="text-[#9aa4b2] font-normal"> / {r.goal}</span>}
                  </span>
                  {short ? (
                    <span className="text-[11px] text-[#c07f2a] whitespace-nowrap">
                      دون الحد الأدنى ({r.minOrders}) — لا تُحتسب بعد
                    </span>
                  ) : r.inBand ? (
                    <span className="text-[11px] text-[#00a344] whitespace-nowrap">
                      {r.isTarget ? `بلغ الهدف · ${r.inBand.value}` : `شريحة ${r.inBand.label} · ${r.inBand.value}`}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#9aa4b2] whitespace-nowrap">لم يبلغ أي شريحة بعد</span>
                  )}
                  {r.next && (
                    <span className="text-[11px] text-[#697586] whitespace-nowrap">
                      باقي {r.next.remaining} لـ {r.next.at}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {note && <p className="px-4 py-2 text-[11px] text-[#9aa4b2] border-t border-[#e3e8ef]">{note}</p>}
        </>
      )}
    </div>
  );
}
