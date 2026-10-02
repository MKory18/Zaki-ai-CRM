'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { RiInboxUnarchiveLine, RiLoader4Line } from '@remixicon/react';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';
import { arDate } from '@/lib/format';

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Named, because handing an order to the pool has to reload the list it
  // just left — an inline effect body cannot be called a second time.
  //
  // Declared ABOVE `toQueue`, which calls it. The other way round, `toQueue`
  // closed over a `const` that was still in its temporal dead zone at the
  // point of the reference, and React Compiler would not reorder the two to
  // find out whether that was safe — it gave up on the whole component
  // ("Compilation Skipped: existing memoization could not be preserved"),
  // so every row of this screen lost memoization to a declaration order
  // that was never meaningful.
  const load = useCallback(
    () =>
      apiJson<{ leadDays: number; orders: Row[] }>('/api/confirmation/postponed')
        .then(setData)
        .catch((e) => setError(e instanceof Error ? e.message : 'تعذر التحميل')),
    []
  );

  /** Hands it to the pool, still postponed. The list reloads without it. */
  const toQueue = async (o: Row) => {
    setBusyId(o.id);
    setError(null);
    setDone(null);
    try {
      await apiJson('/api/confirmation/postponed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: o.id }),
      });
      setDone(`${o.orderNumber} في الطابور — ما زال مؤجَّلاً، وأوّل من يسحب يراه كذلك`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّرت الإعادة إلى الطابور');
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

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
        القابل للعمل عليه: المستحق خلال {data.leadDays} يوم أو المتأخر. الباقي للعرض فقط —
        وما حان موعدُه يمكن إعادتُه إلى الطابور ليسحبه أوّلُ من يفرغ، ويبقى مؤجَّلاً كما هو.
      </p>

      {done && (
        <p className="rounded-lg border border-[var(--sys-success)]/40 bg-[var(--sys-success-soft)] p-2.5 text-sm text-[var(--sys-success)]">
          {done}
        </p>
      )}
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
                <span dir="ltr">{arDate(o.dueAt)}</span>
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
            /**
             * THE ONE ACTION THIS SCREEN WAS MISSING.
             *
             * A postponed order KEEPS ITS CLAIM, which is right while the date
             * is far off — the agent who spoke to the customer should be the
             * one to ring back — and wrong the moment it comes due: if she is
             * off that day the order sits where nobody else can reach it,
             * because the pool only takes unclaimed orders.
             *
             * It only appears on a row that is `actionable` — the server's own
             * word for «due within the lead days». A button on an order due in
             * three weeks would break the one promise the postpone was made to
             * keep.
             *
             * And it does NOT mark the order new: it stays postponed, with its
             * date and its count, so whoever pulls it next opens it knowing
             * this customer asked for Thursday and has asked twice.
             */
            {
              key: 'queue',
              label: 'إلى الطابور',
              render: (o) =>
                o.actionable ? (
                  <button
                    type="button"
                    onClick={() => void toQueue(o)}
                    disabled={busyId === o.id}
                    title="أعِدْه إلى الطابور ليسحبه أوّل من يفرغ"
                    className="min-h-11 md:min-h-0 inline-flex items-center gap-1.5 rounded-lg border border-[var(--sys-warning)] bg-[var(--sys-warning-soft)] px-2.5 py-1 text-xs font-bold text-[var(--sys-warning)] transition-colors hover:bg-[var(--sys-warning)]/20 disabled:opacity-40"
                  >
                    {busyId === o.id ? (
                      <RiLoader4Line className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <RiInboxUnarchiveLine className="h-4 w-4" aria-hidden />
                    )}
                    إلى الطابور
                  </button>
                ) : (
                  <span className="text-xs text-[var(--sys-muted)]">—</span>
                ),
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
