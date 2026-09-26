'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiJson } from '@/lib/api-client';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { RiInboxLine, RiLoader4Line, RiPhoneLockLine, RiTimerFlashLine } from '@remixicon/react';

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
      <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
        <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-6 text-center">
        <div className="mx-auto w-14 h-14 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center">
          <RiInboxLine className="w-6 h-6 text-[var(--sys-primary)]" />
        </div>
        <p className="mt-4 text-4xl font-bold text-[var(--sys-heading)] tabular-nums">{data.waiting}</p>
        <p className="mt-1 text-sm text-[var(--sys-muted-foreground)]">طلب بانتظار التأكيد</p>

        <button
          onClick={pullNext}
          disabled={!data.canPull || pulling || data.waiting === 0}
          className="mt-6 px-8 py-3 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-semibold disabled:opacity-50"
        >
          {pulling ? 'جارٍ السحب…' : 'اسحب الطلب التالي'}
        </button>

        {(error || data.refusal) && (
          <p className="mt-4 text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">
            {error ?? data.refusal?.message}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 text-right">
          <Stat
            icon={<RiPhoneLockLine className="w-4 h-4" />}
            label="لديك بلا محاولة اتصال"
            value={`${data.owned.withoutAttempt} / ${data.caps.withoutAttempt}`}
          />
          <Stat
            icon={<RiTimerFlashLine className="w-4 h-4" />}
            label="إجمالي ما بيدك"
            value={`${data.owned.total} / ${data.caps.total}`}
          />
        </div>
        <p className="mt-4 text-xs text-[var(--sys-muted)]">
          الأولوية للطلبات المؤجلة المستحقة خلال {data.leadDays} يوم، ثم الأقدم. يُحرَّر أي طلب بلا محاولة اتصال بعد 90
          دقيقة عمل.
        </p>
      </div>

      {data.orders && (
        <section className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg overflow-hidden">
          <header className="px-4 py-3 border-b border-[var(--sys-border)] text-sm font-semibold text-[var(--sys-heading)]">
            عرض المشرف — نفس الطلبات المنتظرة ({data.orders.length})
          </header>
          <table className="w-full text-sm">
            <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
              <tr>
                <th className="text-right font-medium px-4 py-2">الطلب</th>
                <th className="text-right font-medium px-4 py-2">العميل</th>
                <th className="text-right font-medium px-4 py-2">الحالة</th>
                <th className="text-right font-medium px-4 py-2">التأجيلات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sys-border)]">
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-medium text-[var(--sys-heading)]" dir="ltr">{o.orderNumber}</td>
                  <td className="px-4 py-2 text-[var(--sys-foreground)]">
                    {o.customer.fullName} · {o.customer.city}
                  </td>
                  <td className="px-4 py-2 text-[var(--sys-muted-foreground)]">{o.confirmationStatus}</td>
                  <td className="px-4 py-2 text-[var(--sys-muted-foreground)] tabular-nums">{o.postponeCount}</td>
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
    <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)]">
      <ScreenTitle />

      <span className="text-[var(--sys-muted-foreground)]">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-[var(--sys-muted-foreground)] truncate">{label}</p>
        <p className="text-sm font-semibold text-[var(--sys-heading)] tabular-nums" dir="ltr">{value}</p>
      </div>
    </div>
  );
}
