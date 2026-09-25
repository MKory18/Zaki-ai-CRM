'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgePercent, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * /control/discount-alerts — what was given away, and by whom.
 *
 * One discount is a judgement call. The same person discounting every order
 * is a pattern, and a pattern is only visible when the discounts are read
 * together — so the per-person summary comes first and the orders second.
 *
 * Nothing is approved or reversed here. It is a place to look; the
 * correction happens on the order itself.
 */

interface Row {
  id: string;
  orderNumber: string;
  merchantRef: string | null;
  createdAt: string;
  customerName: string | null;
  discount: number;
  total: number;
  share: number;
  notable: boolean;
  currency: string;
  byName: string | null;
  confirmationStatus: string;
}

interface Person {
  id: string | null;
  name: string;
  orders: number;
  total: number;
  biggestShare: number;
}

interface Payload {
  days: number;
  currency: string;
  notableThreshold: number;
  totals: { orders: number; discount: number; notable: number };
  byPerson: Person[];
  orders: Row[];
}

export function DiscountAlertsScreen() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyNotable, setOnlyNotable] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await apiJson<Payload>(`/api/control/discount-alerts?days=${days}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = (data?.orders ?? []).filter((r) => (onlyNotable ? r.notable : true));

  return (
    <div className="max-w-6xl space-y-3">
      <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-4 flex flex-wrap gap-3 items-end">
        <label>
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">المدة</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm bg-[var(--sys-card)]"
          >
            <option value={7}>آخر ٧ أيام</option>
            <option value={30}>آخر ٣٠ يوماً</option>
            <option value={90}>آخر ٩٠ يوماً</option>
          </select>
        </label>
        {data && (
          <label className="flex items-center gap-2 h-10 text-sm text-[var(--sys-foreground)]">
            <input type="checkbox" checked={onlyNotable} onChange={(e) => setOnlyNotable(e.target.checked)} />
            الخصومات الكبيرة فقط (فوق {data.notableThreshold}%)
            {data.totals.notable > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] text-[var(--sys-destructive)] tabular-nums">
                {data.totals.notable}
              </span>
            )}
          </label>
        )}
      </div>

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-[8px] p-3">{error}</p>}

      {!data ? (
        <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : data.totals.orders === 0 ? (
        <p className="text-sm text-[var(--sys-muted-foreground)] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-6 text-center">
          <BadgePercent className="w-5 h-5 mx-auto mb-2 text-[var(--sys-muted)]" />
          لا خصومات في هذه المدة.
        </p>
      ) : (
        <>
          <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-4">
            <p className="text-sm text-[var(--sys-foreground)] tabular-nums">
              <b>{data.totals.orders}</b> طلباً بخصم، بإجمالي{' '}
              <b className="text-[var(--sys-destructive)]">{data.totals.discount} {data.currency}</b>
              {data.totals.notable > 0 && (
                <span className="text-[var(--sys-destructive)]">
                  {' '}— منها <b>{data.totals.notable}</b> فوق {data.notableThreshold}%
                </span>
              )}
            </p>
          </div>

          <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] overflow-hidden">
            <h2 className="text-sm font-medium text-[var(--sys-heading)] px-4 py-3 border-b border-[var(--sys-border)]">حسب الموظف</h2>
            <table className="w-full text-sm">
              <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
                <tr>
                  <th className="text-right font-medium px-3 py-2">الموظف</th>
                  <th className="text-right font-medium px-3 py-2">عدد الطلبات</th>
                  <th className="text-right font-medium px-3 py-2">إجمالي الخصم</th>
                  <th className="text-right font-medium px-3 py-2">أكبر نسبة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sys-border)]">
                {data.byPerson.map((p) => (
                  <tr key={p.id ?? 'unknown'}>
                    <td className="px-3 py-2 text-[var(--sys-heading)]">{p.name}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--sys-foreground)]">{p.orders}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--sys-destructive)] font-medium">
                      {p.total} {data.currency}
                    </td>
                    <td
                      className={`px-3 py-2 tabular-nums ${
                        p.biggestShare >= data.notableThreshold ? 'text-[var(--sys-destructive)] font-semibold' : 'text-[var(--sys-muted-foreground)]'
                      }`}
                    >
                      {p.biggestShare}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] overflow-hidden">
            <h2 className="text-sm font-medium text-[var(--sys-heading)] px-4 py-3 border-b border-[var(--sys-border)]">
              الطلبات ({rows.length})
            </h2>
            <table className="w-full text-sm">
              <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
                <tr>
                  <th className="text-right font-medium px-3 py-2">الطلب</th>
                  <th className="text-right font-medium px-3 py-2">العميل</th>
                  <th className="text-right font-medium px-3 py-2">الخصم</th>
                  <th className="text-right font-medium px-3 py-2">النسبة</th>
                  <th className="text-right font-medium px-3 py-2">الإجمالي بعده</th>
                  <th className="text-right font-medium px-3 py-2">منحه</th>
                  <th className="text-right font-medium px-3 py-2">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sys-border)]">
                {rows.map((r) => (
                  <tr key={r.id} className={r.notable ? 'bg-[var(--sys-destructive-soft)]/40' : undefined}>
                    <td className="px-3 py-2">
                      <a href={`/orders?highlight=${r.id}`} className="text-[var(--sys-primary)] hover:underline" dir="ltr">
                        {r.merchantRef ?? r.orderNumber}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-[var(--sys-foreground)]">{r.customerName ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--sys-destructive)] font-medium">
                      {r.discount} {r.currency}
                    </td>
                    <td className={`px-3 py-2 tabular-nums ${r.notable ? 'text-[var(--sys-destructive)] font-semibold' : 'text-[var(--sys-muted-foreground)]'}`}>
                      {r.notable && <AlertTriangle className="w-3 h-3 inline ml-1 align-[-1px]" />}
                      {r.share}%
                    </td>
                    <td className="px-3 py-2 tabular-nums text-[var(--sys-foreground)]">{r.total}</td>
                    <td className="px-3 py-2 text-[var(--sys-muted-foreground)]">{r.byName ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)] whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString('ar', { dateStyle: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
