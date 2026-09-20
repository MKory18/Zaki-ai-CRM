'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * /confirmation/postponed — order, customer, due date, days remaining,
 * preferred time, reason and postpone count. Only rows the server marks
 * actionable (due within the lead days) can be worked on.
 */

interface Row {
  id: string;
  orderNumber: string;
  totalAmount: number;
  currency: string;
  dueAt: string | null;
  daysRemaining: number | null;
  postponePreferredTime: string | null;
  postponeCount: number;
  followUpReason: string | null;
  actionable: boolean;
  customer: { fullName: string; phone: string; city: string };
  claimer: { id: string; name: string } | null;
}

export function ConfirmationPostponedScreen() {
  const [data, setData] = useState<{ leadDays: number; orders: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ leadDays: number; orders: Row[] }>('/api/confirmation/postponed')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'تعذر التحميل'));
  }, []);

  if (error) {
    return <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>;
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-3">
      <p className="text-sm text-[#697586]">
        القابل للعمل عليه: المستحق خلال {data.leadDays} يوم أو المتأخر. الباقي للعرض فقط.
      </p>
      <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f8fafc] text-[#697586] text-xs">
            <tr>
              <th className="text-right font-medium px-4 py-2">الطلب</th>
              <th className="text-right font-medium px-4 py-2">العميل</th>
              <th className="text-right font-medium px-4 py-2">تاريخ الاستحقاق</th>
              <th className="text-right font-medium px-4 py-2">المتبقي</th>
              <th className="text-right font-medium px-4 py-2">الوقت المفضّل</th>
              <th className="text-right font-medium px-4 py-2">السبب</th>
              <th className="text-right font-medium px-4 py-2">مرات التأجيل</th>
              <th className="text-right font-medium px-4 py-2">الموظف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e3e8ef]">
            {data.orders.map((o) => (
              <tr key={o.id} className={o.actionable ? '' : 'opacity-50'}>
                <td className="px-4 py-2 font-medium text-[#121926]" dir="ltr">{o.orderNumber}</td>
                <td className="px-4 py-2 text-[#364152]">
                  {o.customer.fullName} · {o.customer.city}
                </td>
                <td className="px-4 py-2 text-[#364152]" dir="ltr">
                  {o.dueAt ? new Date(o.dueAt).toLocaleDateString('ar-EG') : '—'}
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {o.daysRemaining === null ? (
                    '—'
                  ) : o.daysRemaining < 0 ? (
                    <span className="text-[#fb323f]">متأخر {Math.abs(o.daysRemaining)} يوم</span>
                  ) : (
                    `${o.daysRemaining} يوم`
                  )}
                </td>
                <td className="px-4 py-2 text-[#697586]">{o.postponePreferredTime ?? '—'}</td>
                <td className="px-4 py-2 text-[#697586]">{o.followUpReason ?? '—'}</td>
                <td className="px-4 py-2 tabular-nums text-[#364152]">{o.postponeCount}</td>
                <td className="px-4 py-2 text-[#697586]">{o.claimer?.name ?? '—'}</td>
              </tr>
            ))}
            {data.orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-[#697586]">
                  لا توجد طلبات مؤجلة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
