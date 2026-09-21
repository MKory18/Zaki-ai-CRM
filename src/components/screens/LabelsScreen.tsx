'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { LabelSizePicker, useLabelSize } from '@/components/labels/LabelSize';

/**
 * /ops/labels — filter, pick a size, print. The print link carries a signed
 * batch token; the ids never appear in the URL, and the server re-checks
 * every order before rendering.
 */

interface Row {
  id: string;
  orderNumber: string;
  merchantRef: string | null;
  trackingNumber: string | null;
  totalAmount: number;
  currency: string;
  labelPrintedAt: string | null;
  customer: { fullName: string; city: string; phone?: string | null };
  region: { name: string } | null;
  deliveryProvider: { name: string } | null;
}

export function LabelsScreen() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState({ courier: '', region: '', from: '', to: '', printed: '' });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  // The same remembered choice every other print button reads, so this
  // screen and the orders screen can never disagree about the paper.
  const labelSize = useLabelSize();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiJson<{ providers: { id: string; name: string }[]; regions: { id: string; name: string }[] }>('/api/ops/references')
      .then((d) => {
        setProviders(d.providers);
        setRegions(d.regions);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && q.set(k, v));
    try {
      const data = await apiJson<{ orders: Row[] }>(`/api/ops/labels?${q}`);
      setRows(data.orders);
      setSelected({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const openBatch = async (format?: 'csv') => {
    const orderIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (orderIds.length === 0) {
      setError('اختر طلباً واحداً على الأقل');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { printPath } = await apiJson<{ printPath: string }>('/api/ops/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds, ...labelSize.dims }),
      });
      window.open(format === 'csv' ? `${printPath}&format=csv` : printPath, '_blank', 'noopener');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر فتح الطباعة');
    } finally {
      setBusy(false);
    }
  };

  const count = Object.values(selected).filter(Boolean).length;

  return (
    <div className="max-w-5xl space-y-3">
      <div className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 grid gap-3 md:grid-cols-6">
        <Field label="شركة الشحن">
          <select value={filters.courier} onChange={(e) => setFilters({ ...filters, courier: e.target.value })} className={INPUT}>
            <option value="">الكل</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="المحافظة">
          <select value={filters.region} onChange={(e) => setFilters({ ...filters, region: e.target.value })} className={INPUT}>
            <option value="">الكل</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </Field>
        <Field label="من"><input type="date" dir="ltr" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={INPUT} /></Field>
        <Field label="إلى"><input type="date" dir="ltr" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={INPUT} /></Field>
        <Field label="حالة الطباعة">
          <select value={filters.printed} onChange={(e) => setFilters({ ...filters, printed: e.target.value })} className={INPUT}>
            <option value="">الكل</option>
            <option value="no">غير مطبوعة</option>
            <option value="yes">مطبوعة</option>
          </select>
        </Field>
        <LabelSizePicker />
      </div>

      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}

      <div className="flex gap-2">
        <button onClick={() => openBatch()} disabled={busy || count === 0} className="flex items-center gap-2 px-4 py-2 rounded-[8px] bg-[#b8256e] text-white text-sm font-medium disabled:opacity-50">
          <Printer className="w-4 h-4" /> طباعة ({count})
        </button>
        <button onClick={() => openBatch('csv')} disabled={busy || count === 0} className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[#e3e8ef] text-sm text-[#364152] disabled:opacity-50">
          <Download className="w-4 h-4" /> تصدير CSV
        </button>
      </div>

      {!rows ? (
        <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (
        <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#697586] text-xs">
              <tr>
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    aria-label="اختيار الكل"
                    onChange={(e) => setSelected(Object.fromEntries(rows.map((r) => [r.id, e.target.checked])))}
                  />
                </th>
                <th className="text-right font-medium px-3 py-2">المرجع</th>
                <th className="text-right font-medium px-3 py-2">العميل</th>
                <th className="text-right font-medium px-3 py-2">المحافظة</th>
                <th className="text-right font-medium px-3 py-2">شركة الشحن</th>
                <th className="text-right font-medium px-3 py-2">التحصيل</th>
                <th className="text-right font-medium px-3 py-2">الطباعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8ef]">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={!!selected[r.id]} onChange={(e) => setSelected({ ...selected, [r.id]: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2 font-medium text-[#121926]" dir="ltr">{r.merchantRef ?? r.orderNumber}</td>
                  <td className="px-3 py-2 text-[#364152]">{r.customer.fullName}</td>
                  <td className="px-3 py-2 text-[#697586]">{r.region?.name ?? r.customer.city}</td>
                  <td className="px-3 py-2 text-[#697586]">{r.deliveryProvider?.name ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums" dir="ltr">{r.totalAmount} {r.currency}</td>
                  <td className="px-3 py-2 text-xs text-[#697586]">
                    {r.labelPrintedAt ? new Date(r.labelPrintedAt).toLocaleDateString('ar-EG') : 'لم تُطبع'}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-[#697586]">لا توجد بوالص بهذه الفلاتر.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const INPUT = 'w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] bg-white text-sm';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[#364152] mb-1">{label}</span>
      {children}
    </label>
  );
}
