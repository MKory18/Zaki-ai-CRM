'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Loader2, PhoneOff, Timer } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * /confirmation/queue — agents see NO list: one "pull next" button and a
 * waiting counter. The server decides priority (postponed due first, then
 * oldest) and whether this agent may pull at all. Supervisors additionally
 * receive the rows, which are the same data.
 */

interface QueueResponse {
  waiting: number;
  owned: { total: number; withoutAttempt: number };
  caps: { withoutAttempt: number; total: number };
  leadDays: number;
  canPull: boolean;
  refusal: { code: string; message: string } | null;
  autoReleased: number;
  orders: {
    id: string;
    orderNumber: string;
    createdAt: string;
    confirmationStatus: string;
    postponedUntil: string | null;
    postponeCount: number;
    totalAmount: number;
    customer: { fullName: string; city: string };
    product: { name: string } | null;
  }[] | null;
}

export function ConfirmationQueueScreen() {
  const router = useRouter();
  const [data, setData] = useState<QueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiJson<QueueResponse>('/api/confirmation/queue'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الطابور');
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const pullNext = async () => {
    setPulling(true);
    setError(null);
    try {
      await apiJson('/api/confirmation/pull', { method: 'POST' });
      router.push('/confirmation/mine');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر سحب طلب');
      void load();
    } finally {
      setPulling(false);
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-white border border-[#e3e8ef] rounded-[8px] p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] flex items-center justify-center">
          <Inbox className="w-7 h-7 text-[#b8256e]" />
        </div>
        <p className="mt-4 text-4xl font-bold text-[#121926] tabular-nums">{data.waiting}</p>
        <p className="mt-1 text-sm text-[#697586]">طلب بانتظار التأكيد</p>

        <button
          onClick={pullNext}
          disabled={!data.canPull || pulling || data.waiting === 0}
          className="mt-6 px-8 py-3 rounded-[8px] bg-[#b8256e] text-white text-sm font-semibold disabled:opacity-50"
        >
          {pulling ? 'جارٍ السحب…' : 'اسحب الطلب التالي'}
        </button>

        {(error || data.refusal) && (
          <p className="mt-4 text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">
            {error ?? data.refusal?.message}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 text-right">
          <Stat
            icon={<PhoneOff className="w-4 h-4" />}
            label="لديك بلا محاولة اتصال"
            value={`${data.owned.withoutAttempt} / ${data.caps.withoutAttempt}`}
          />
          <Stat
            icon={<Timer className="w-4 h-4" />}
            label="إجمالي ما بيدك"
            value={`${data.owned.total} / ${data.caps.total}`}
          />
        </div>
        <p className="mt-4 text-xs text-[#9aa4b2]">
          الأولوية للطلبات المؤجلة المستحقة خلال {data.leadDays} يوم، ثم الأقدم. يُحرَّر أي طلب بلا محاولة اتصال بعد ٩٠
          دقيقة عمل.
        </p>
      </div>

      {data.orders && (
        <section className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
          <header className="px-4 py-3 border-b border-[#e3e8ef] text-sm font-semibold text-[#121926]">
            عرض المشرف — نفس الطلبات المنتظرة ({data.orders.length})
          </header>
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#697586] text-xs">
              <tr>
                <th className="text-right font-medium px-4 py-2">الطلب</th>
                <th className="text-right font-medium px-4 py-2">العميل</th>
                <th className="text-right font-medium px-4 py-2">الحالة</th>
                <th className="text-right font-medium px-4 py-2">التأجيلات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8ef]">
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-medium text-[#121926]" dir="ltr">{o.orderNumber}</td>
                  <td className="px-4 py-2 text-[#364152]">
                    {o.customer.fullName} · {o.customer.city}
                  </td>
                  <td className="px-4 py-2 text-[#697586]">{o.confirmationStatus}</td>
                  <td className="px-4 py-2 text-[#697586] tabular-nums">{o.postponeCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef]">
      <span className="text-[#697586]">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-[#697586] truncate">{label}</p>
        <p className="text-sm font-semibold text-[#121926] tabular-nums" dir="ltr">{value}</p>
      </div>
    </div>
  );
}
