'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * /settings/delivery-fees — one row per courier per region: the fee, the
 * late threshold in days, and the courier's return fee. Changing an existing
 * fee asks for a reason, which goes to the audit log. Live orders keep the
 * fee they were shipped with.
 */

interface Fee {
  id: string;
  deliveryProviderId: string;
  regionId: string;
  fee: number;
  lateThresholdDays: number;
  returnFee: number;
  isActive: boolean;
}

export function DeliveryFeesScreen() {
  const [data, setData] = useState<{ providers: { id: string; name: string }[]; regions: { id: string; name: string }[]; fees: Fee[] } | null>(null);
  const [courier, setCourier] = useState('');
  const [draft, setDraft] = useState<Record<string, { fee: string; lateThresholdDays: string; returnFee: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ providers: { id: string; name: string }[]; regions: { id: string; name: string }[]; fees: Fee[] }>(
        '/api/settings/delivery-fees'
      );
      setData(res);
      if (!courier && res.providers[0]) setCourier(res.providers[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [courier]);

  useEffect(() => {
    void load();
  }, [load]);

  const feeFor = (regionId: string) => data?.fees.find((f) => f.deliveryProviderId === courier && f.regionId === regionId);

  const save = async (regionId: string) => {
    const current = feeFor(regionId);
    const d = draft[regionId] ?? {
      fee: String(current?.fee ?? ''),
      lateThresholdDays: String(current?.lateThresholdDays ?? 3),
      returnFee: String(current?.returnFee ?? 0),
    };
    const fee = Number(d.fee);
    if (!Number.isFinite(fee)) {
      setError('أجرة غير صالحة');
      return;
    }

    // Changing an existing fee is an override: the API demands a reason.
    let reason: string | undefined;
    if (current && current.fee !== fee) {
      reason = window.prompt('سبب تعديل الأجرة (يُسجَّل في سجل التدقيق)') ?? undefined;
      if (!reason) return;
    }

    setBusy(regionId);
    setError(null);
    try {
      await apiJson('/api/settings/delivery-fees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryProviderId: courier,
          regionId,
          fee,
          lateThresholdDays: Number(d.lateThresholdDays) || 0,
          returnFee: Number(d.returnFee) || 0,
          reason,
        }),
      });
      setSaved(regionId);
      setTimeout(() => setSaved(null), 2000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(null);
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
    <div className="max-w-4xl space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="block text-xs font-medium text-[#364152] mb-1">شركة الشحن</span>
          <select value={courier} onChange={(e) => setCourier(e.target.value)} className="h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm">
            {data.providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[#697586] pb-2">
          الطلبات المشحونة تحتفظ بالأجرة وقت شحنها؛ التعديل هنا يسري على الشحنات الجديدة فقط.
        </p>
      </div>

      {data.providers.length === 0 && (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          أضف شركة شحن أولاً من شاشة شركات الشحن.
        </p>
      )}
      {data.regions.length === 0 && (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          لا توجد محافظات لهذا البلد. أضفها من البلدان والمتاجر والمحافظ.
        </p>
      )}

      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}

      {data.regions.length > 0 && courier && (
        <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#697586] text-xs">
              <tr>
                <th className="text-right font-medium px-4 py-2">المحافظة</th>
                <th className="text-right font-medium px-4 py-2">الأجرة</th>
                <th className="text-right font-medium px-4 py-2">حد التأخير (أيام)</th>
                <th className="text-right font-medium px-4 py-2">أجرة الإرجاع</th>
                <th className="text-right font-medium px-4 py-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8ef]">
              {data.regions.map((r) => {
                const current = feeFor(r.id);
                const d = draft[r.id] ?? {
                  fee: String(current?.fee ?? ''),
                  lateThresholdDays: String(current?.lateThresholdDays ?? 3),
                  returnFee: String(current?.returnFee ?? 0),
                };
                const set = (patch: Partial<typeof d>) => setDraft({ ...draft, [r.id]: { ...d, ...patch } });
                return (
                  <tr key={r.id} className={current ? '' : 'bg-[#f8fafc]/60'}>
                    <td className="px-4 py-2 text-[#121926]">{r.name}</td>
                    <td className="px-4 py-2">
                      <input value={d.fee} onChange={(e) => set({ fee: e.target.value })} type="number" min={0} step="0.001" dir="ltr" className="w-24 h-9 px-2 rounded-[8px] border border-[#e3e8ef] text-sm" />
                    </td>
                    <td className="px-4 py-2">
                      <input value={d.lateThresholdDays} onChange={(e) => set({ lateThresholdDays: e.target.value })} type="number" min={0} max={90} dir="ltr" className="w-20 h-9 px-2 rounded-[8px] border border-[#e3e8ef] text-sm" />
                    </td>
                    <td className="px-4 py-2">
                      <input value={d.returnFee} onChange={(e) => set({ returnFee: e.target.value })} type="number" min={0} step="0.001" dir="ltr" className="w-24 h-9 px-2 rounded-[8px] border border-[#e3e8ef] text-sm" />
                    </td>
                    <td className="px-4 py-2 text-left">
                      <button
                        onClick={() => save(r.id)}
                        disabled={busy === r.id}
                        className="inline-flex items-center gap-1 text-xs text-[#b8256e] hover:underline disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {saved === r.id ? 'تم الحفظ' : current ? 'تحديث' : 'إضافة'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
