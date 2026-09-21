'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, PauseCircle, RotateCcw, Truck } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { CustomerHistoryButton } from '@/components/orders/CustomerHistory';

/**
 * /ops/shipments/new — pick a courier, filter, review each row's COD and its
 * blocking warnings, then create the shipment. Select-all skips blocked rows;
 * soft warnings need an explicit acknowledgement per order; hard blocks land
 * in the exceptions panel and never produce a shipment row.
 */

interface Block { code: string; message: string; hard: boolean }
interface Row {
  id: string;
  orderNumber: string;
  merchantRef: string | null;
  customer: { id: string; fullName: string; phone: string; city: string };
  previousOrders: number;
  region: { id: string; name: string } | null;
  items: { productName: string; quantity: number; freeQuantity: number }[];
  cod: { subtotal: number; discount: number; deliveryFee: number; cod: number; currency: string; feeSource: string };
  blocks: Block[];
  selectable: boolean;
  hardBlocked: boolean;
  shipHoldUntil: string | null;
  shipHoldReason: string | null;
}

export function ShipmentsNewScreen() {
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState({ courier: '', region: '', from: '', to: '' });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [exceptions, setExceptions] = useState<{ orderNumber: string; reasons: string[] }[]>([]);
  /** Looking at what is ready, or at what is being held back. */
  const [view, setView] = useState<'ready' | 'held'>('ready');
  const [holding, setHolding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ providers: { id: string; name: string }[]; regions: { id: string; name: string }[] }>(
      '/api/ops/references'
    )
      .then((d) => {
        setProviders(d.providers);
        setRegions(d.regions);
      })
      .catch(() => undefined);
  }, []);

  /** Hold it back from today's shipment, or put it back in the queue. */
  const toggleHold = async (row: Row) => {
    setHolding(row.id);
    setError(null);
    try {
      await apiJson('/api/ops/shipments/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          view === 'held'
            ? { orderId: row.id, release: true }
            : { orderId: row.id, reason: window.prompt('سبب التأجيل (اختياري):') ?? undefined }
        ),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التأجيل');
    } finally {
      setHolding(null);
    }
  };

  const load = useCallback(async () => {
    setError(null);
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && q.set(k, v));
    if (view === 'held') q.set('held', 'only');
    try {
      const data = await apiJson<{ orders: Row[] }>(`/api/ops/shipments?${q}`);
      setRows(data.orders);
      setSelected({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [filters, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleAll = () => {
    if (!rows) return;
    const allSelected = rows.filter((r) => r.selectable).every((r) => selected[r.id]);
    const next: Record<string, boolean> = {};
    // Select-all skips blocked rows by design.
    for (const row of rows) if (row.selectable) next[row.id] = !allSelected;
    setSelected(next);
  };

  const create = async () => {
    const orderIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (orderIds.length === 0 || !filters.courier) {
      setError('اختر شركة الشحن وطلباً واحداً على الأقل');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ batch: { batchNumber: string }; shipped: number; exceptions: { orderNumber: string; reasons: string[] }[] }>(
        '/api/ops/shipments',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deliveryProviderId: filters.courier,
            orderIds,
            acknowledgedOrderIds: orderIds.filter((id) => acknowledged[id]),
          }),
        }
      );
      setDone(`تم إنشاء الدفعة ${res.batch.batchNumber} بـ ${res.shipped} طلب`);
      setExceptions(res.exceptions);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء الشحنة');
    } finally {
      setBusy(false);
    }
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="max-w-5xl space-y-3">
      <div className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 grid gap-3 md:grid-cols-5">
        <Select label="شركة الشحن (للشحنة)" value={filters.courier} onChange={(v) => setFilters({ ...filters, courier: v })} options={providers.map((p) => ({ value: p.id, label: p.name }))} />
        <Select label="المحافظة" value={filters.region} onChange={(v) => setFilters({ ...filters, region: v })} options={regions.map((r) => ({ value: r.id, label: r.name }))} />
        <DateField label="من" value={filters.from} onChange={(v) => setFilters({ ...filters, from: v })} />
        <DateField label="إلى" value={filters.to} onChange={(v) => setFilters({ ...filters, to: v })} />
        <div className="self-end">
          <button
            onClick={create}
            disabled={busy || selectedCount === 0}
            className="w-full h-10 rounded-[8px] bg-[#b8256e] text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'جارٍ الإنشاء…' : `إنشاء شحنة (${selectedCount})`}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}
      {done && <p className="text-sm text-[#00a344] bg-emerald-50 border border-emerald-100 rounded-[8px] p-3">{done}</p>}

      {exceptions.length > 0 && (
        <section className="bg-white border border-[#fecdd1] rounded-[8px] p-4">
          <h3 className="text-sm font-bold text-[#fb323f] mb-2">طلبات لم تُشحن ({exceptions.length})</h3>
          <ul className="text-xs text-[#364152] space-y-1">
            {exceptions.map((e) => (
              <li key={e.orderNumber}>
                <span dir="ltr">{e.orderNumber}</span> — {e.reasons.join(' · ')}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!rows ? (
        <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (
        <>
        <div className="flex gap-1.5 mb-2">
        {([['ready', 'جاهزة للشحن'], ['held', 'مؤجَّلة']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
              view === k
                ? 'bg-[#b8256e] text-white border-[#b8256e]'
                : 'bg-white text-[#364152] border-[#e3e8ef] hover:border-[#b8256e]/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#697586] text-xs">
              <tr>
                <th className="px-3 py-2 w-10">
                  <input type="checkbox" onChange={toggleAll} aria-label="اختيار الكل" />
                </th>
                <th className="text-right font-medium px-3 py-2">الطلب</th>
                <th className="text-right font-medium px-3 py-2">العميل</th>
                <th className="text-right font-medium px-3 py-2">المحافظة</th>
                <th className="text-right font-medium px-3 py-2">تفصيل التحصيل</th>
                <th className="text-right font-medium px-3 py-2">تنبيهات</th>
                <th className="text-right font-medium px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8ef]">
              {rows.map((r) => (
                <tr key={r.id} className={r.hardBlocked ? 'bg-[#feecee]/40' : ''}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!!selected[r.id]}
                      disabled={r.hardBlocked}
                      onChange={(e) => setSelected({ ...selected, [r.id]: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-[#121926]" dir="ltr">{r.orderNumber}</td>
                  <td className="px-3 py-2 text-[#364152]">
                    <span className="flex items-center gap-2">
                      {r.customer.fullName}
                      <CustomerHistoryButton customerId={r.customer.id} orderId={r.id} previousOrders={r.previousOrders} />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#697586]">{r.region?.name ?? r.customer.city}</td>
                  <td className="px-3 py-2 text-xs text-[#364152]" dir="ltr">
                    {r.cod.subtotal} − {r.cod.discount} + {r.cod.deliveryFee} ={' '}
                    <strong className="tabular-nums">{r.cod.cod} {r.cod.currency}</strong>
                    {r.cod.feeSource === 'NONE' && <span className="text-[#fb323f]"> (بلا أجرة)</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.blocks.length === 0 ? (
                      <span className="text-xs text-[#00a344]">جاهز</span>
                    ) : (
                      <div className="space-y-1">
                        {r.blocks.map((b) => (
                          <p key={b.code} className={`text-xs flex items-center gap-1 ${b.hard ? 'text-[#fb323f]' : 'text-[#c07f2a]'}`}>
                            <AlertTriangle className="w-3 h-3" /> {b.message}
                          </p>
                        ))}
                        {!r.hardBlocked && (
                          <label className="flex items-center gap-1 text-[11px] text-[#697586]">
                            <input
                              type="checkbox"
                              checked={!!acknowledged[r.id]}
                              onChange={(e) => setAcknowledged({ ...acknowledged, [r.id]: e.target.checked })}
                            />
                            أقرّ بالتنبيه وأتابع
                          </label>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {/* Not this week, the customer said. The order is good;
                        it simply must not go out yet — and cancelling it
                        would throw away a sale and free stock he still
                        wants. */}
                    <button
                      type="button"
                      onClick={() => toggleHold(r)}
                      disabled={holding === r.id}
                      title={
                        view === 'held'
                          ? 'أعِده إلى قائمة الشحن'
                          : 'أجّله — لن يدخل أي شحنة حتى تُفرج عنه، والبضاعة تبقى محجوزة له'
                      }
                      className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg border transition-colors disabled:opacity-50 ${
                        view === 'held'
                          ? 'border-[#e3e8ef] text-[#00a344] hover:border-[#00a344]'
                          : 'border-[#e3e8ef] text-[#697586] hover:border-[#c07f2a] hover:text-[#c07f2a]'
                      }`}
                    >
                      {holding === r.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : view === 'held' ? (
                        <RotateCcw className="w-3 h-3" />
                      ) : (
                        <PauseCircle className="w-3 h-3" />
                      )}
                      {view === 'held' ? 'أرجِعه' : 'أجّل'}
                    </button>
                    {r.shipHoldReason && (
                      <span className="block text-[10px] text-[#9aa4b2] mt-0.5 max-w-[10rem] truncate" title={r.shipHoldReason}>
                        {r.shipHoldReason}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-[#697586]">
                    <Truck className="w-5 h-5 mx-auto mb-2 text-[#9aa4b2]" />
                    لا توجد طلبات مؤكدة جاهزة للشحن بهذه الفلاتر.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[#364152] mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] bg-white text-sm"
      >
        <option value="">الكل</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[#364152] mb-1">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] bg-white text-sm"
      />
    </label>
  );
}
