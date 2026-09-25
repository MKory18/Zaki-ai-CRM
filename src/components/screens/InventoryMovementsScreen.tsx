'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Search } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { ScreenTitle } from '@/components/shell/ScreenTitle';

/**
 * /inventory/movements — how the stock got to where it is.
 *
 * A ledger, read by hunting: filter to one product or one kind of movement
 * rather than scrolling. Nothing is editable, because a movement is never
 * edited — a wrong one is corrected by another movement the other way, the
 * same rule the wallet ledger follows.
 */

interface Movement {
  id: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string | null } | null;
  batchNumber: string | null;
  createdByName: string | null;
}

const TYPE_AR: Record<string, string> = {
  PRODUCTION: 'إدخال / إنتاج',
  SALE: 'بيع',
  RETURN: 'مرتجع',
  MANUAL_ADJUSTMENT: 'تسوية يدوية',
  DAMAGE: 'تالف',
  TRANSFER: 'نقل',
};

export function InventoryMovementsScreen() {
  const [data, setData] = useState<{ movements: Movement[]; types: { type: string; count: number }[]; hasMore: boolean } | null>(null);
  const [term, setTerm] = useState('');
  const [type, setType] = useState('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const q = new URLSearchParams();
    if (term.trim()) q.set('q', term.trim());
    if (type !== 'all') q.set('type', type);
    try {
      setData(await apiJson(`/api/inventory/movements?${q}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [term, type]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-6xl space-y-3">
      <ScreenTitle />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-4 flex flex-wrap gap-3 items-end"
      >
        <label className="flex-1 min-w-[220px]">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">بحث</span>
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--sys-muted)] absolute right-3 top-3" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="اسم المنتج، الرمز، رقم الدفعة أو السبب"
              className="w-full h-10 pr-9 pl-3 rounded-[8px] border border-[var(--sys-border)] text-sm"
            />
          </div>
        </label>
        <label>
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">النوع</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm bg-[var(--sys-card)]"
          >
            <option value="all">الكل</option>
            {(data?.types ?? []).map((t) => (
              <option key={t.type} value={t.type}>
                {TYPE_AR[t.type] ?? t.type} ({t.count})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 px-4 rounded-[8px] bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium">بحث</button>
      </form>

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-[8px] p-3">{error}</p>}

      {!data ? (
        <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : data.movements.length === 0 ? (
        <p className="text-sm text-[var(--sys-muted-foreground)] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-6 text-center">
          لا حركات مطابقة.
        </p>
      ) : (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
              <tr>
                <th className="text-right font-medium px-3 py-2">التاريخ</th>
                <th className="text-right font-medium px-3 py-2">المنتج</th>
                <th className="text-right font-medium px-3 py-2">النوع</th>
                <th className="text-right font-medium px-3 py-2">الكمية</th>
                <th className="text-right font-medium px-3 py-2">الرصيد بعدها</th>
                <th className="text-right font-medium px-3 py-2">الدفعة</th>
                <th className="text-right font-medium px-3 py-2">السبب</th>
                <th className="text-right font-medium px-3 py-2">سجّلها</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sys-border)]">
              {data.movements.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)] whitespace-nowrap">
                    {new Date(m.createdAt).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-3 py-2 text-[var(--sys-heading)]">
                    {m.product?.name ?? '—'}
                    {m.product?.sku && <span className="block text-[11px] text-[var(--sys-muted)]" dir="ltr">{m.product.sku}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)]">{TYPE_AR[m.type] ?? m.type}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1 tabular-nums font-medium ${
                        m.quantity >= 0 ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'
                      }`}
                    >
                      {m.quantity >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {Math.abs(m.quantity)}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[var(--sys-foreground)]">{m.balanceAfter}</td>
                  <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)]" dir="ltr">{m.batchNumber ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)]">{m.reason ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)]">{m.createdByName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.hasMore && (
            <p className="text-xs text-[var(--sys-muted)] px-3 py-2 border-t border-[var(--sys-border)]">
              تُعرض أحدث الحركات — ضيّق البحث لرؤية أقدم منها.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
