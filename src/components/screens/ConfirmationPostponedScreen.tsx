'use client';

import React, { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { RiLoader4Line } from '@remixicon/react';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';

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
    return <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>;
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
        <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-3">
      <ScreenTitle />

      <p className="text-sm text-[var(--sys-muted-foreground)]">
        القابل للعمل عليه: المستحق خلال {data.leadDays} يوم أو المتأخر. الباقي للعرض فقط.
      </p>
      <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg overflow-hidden">
        {/* Eight columns on a 375px screen is every cell wrapped to four
            lines and one row filling the phone. The same definition draws
            a table on a desk and a card in a hand — and the card leads
            with what somebody scans for: the order, and who it is for. */}
        <Rows
          rows={data.orders}
          keyOf={(o) => o.id}
          alert={(o) => o.daysRemaining !== null && o.daysRemaining < 0}
          columns={[
            {
              key: 'order',
              label: 'الطلب',
              primary: true,
              render: (o) => (
                <span className="font-medium text-[var(--sys-heading)]" dir="ltr">{o.orderNumber}</span>
              ),
            },
            {
              key: 'customer',
              label: 'العميل',
              primary: true,
              render: (o) => `${o.customer.fullName} · ${o.customer.city}`,
            },
            {
              key: 'due',
              label: 'تاريخ الاستحقاق',
              render: (o) => (
                <span dir="ltr">{o.dueAt ? new Date(o.dueAt).toLocaleDateString('ar-u-nu-latn') : '—'}</span>
              ),
            },
            {
              key: 'left',
              label: 'المتبقي',
              render: (o) =>
                o.daysRemaining === null ? (
                  '—'
                ) : o.daysRemaining < 0 ? (
                  <span className="tabular-nums text-[var(--sys-destructive)]">
                    متأخر {Math.abs(o.daysRemaining)} يوم
                  </span>
                ) : (
                  <span className="tabular-nums">{o.daysRemaining} يوم</span>
                ),
            },
            { key: 'time', label: 'الوقت المفضّل', render: (o) => o.postponePreferredTime ?? '—' },
            { key: 'reason', label: 'السبب', render: (o) => o.followUpReason ?? '—' },
            {
              key: 'count',
              label: 'مرات التأجيل',
              align: 'end',
              render: (o) => <span className="tabular-nums">{o.postponeCount}</span>,
            },
            // The agent's own name is on a desk's table; on a card it is
            // one more labelled line between her and the phone number.
            { key: 'agent', label: 'الموظف', hideOnPhone: true, render: (o) => o.claimer?.name ?? '—' },
          ]}
          empty={
            <EmptyState
              title="لا طلبات مؤجلة"
              why="التأجيل يضع الطلب هنا حتى موعده. فراغُ القائمة يعني أنّ لا طلبَ أُجِّل، أو أنّ كلّ ما أُجِّل حلّ موعدُه وعاد إلى الطابور."
            />
          }
        />
      </div>
    </div>
  );
}
