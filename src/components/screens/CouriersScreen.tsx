'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bike, Loader2, Plus, Truck } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { CourierCredentials } from '@/components/settings/CourierCredentials';

/**
 * /settings/couriers — the shipping companies themselves. Their per-region
 * fees live in /settings/delivery-fees; a courier without fee rows cannot
 * ship, and the shipment screen says so.
 */

interface Courier {
  id: string;
  name: string;
  code: string;
  kind?: 'COMPANY' | 'AGENT';
  phone: string | null;
  email: string | null;
  isActive: boolean;
}

export function CouriersScreen() {
  const [rows, setRows] = useState<Courier[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', phone: '', kind: 'COMPANY' as 'COMPANY' | 'AGENT' });
  const [accountFor, setAccountFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ providers?: Courier[]; deliveryProviders?: Courier[] }>('/api/delivery-providers');
      setRows(data.providers ?? data.deliveryProviders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiJson('/api/delivery-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), code: form.code.trim().toUpperCase(), kind: form.kind, phone: form.phone.trim() || undefined }),
      });
      setForm({ name: '', code: '', phone: '', kind: 'COMPANY' });
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الإضافة');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (courier: Courier) => {
    setBusy(true);
    try {
      await apiJson(`/api/delivery-providers/${courier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !courier.isActive }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحديث');
    } finally {
      setBusy(false);
    }
  };

  if (!rows) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#697586]">
          أجور التوصيل لكل محافظة تُضبط من{' '}
          <Link href="/settings/delivery-fees" className="text-[#b8256e] hover:underline">أجور التوصيل</Link>.
        </p>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-[8px] bg-[#b8256e] text-white text-sm font-medium">
          <Plus className="w-4 h-4" /> شركة شحن أو مندوب
        </button>
      </div>

      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}

      {adding && (
        <form onSubmit={create} className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 grid gap-3 md:grid-cols-4">
          <Field label="الاسم" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="الرمز" value={form.code} onChange={(v) => setForm({ ...form, code: v })} dir="ltr" />
          <Field label="الهاتف" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} dir="ltr" required={false} />
          <label className="block">
            <span className="block text-xs font-medium text-[#364152] mb-1">النوع</span>
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as 'COMPANY' | 'AGENT' })}
              className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm bg-white"
            >
              <option value="COMPANY">شركة شحن</option>
              <option value="AGENT">مندوب</option>
            </select>
            <span className="block text-[11px] text-[#9aa4b2] mt-1">
              المندوب فوري وتسويته يدوية، وهو الوحيد الذي يمكن سحب الشحنة منه مباشرة.
            </span>
          </label>
          <div className="flex gap-2 items-end">
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-[8px] bg-[#b8256e] text-white text-sm disabled:opacity-60">حفظ</button>
            <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 rounded-[8px] border border-[#e3e8ef] text-sm text-[#697586]">إلغاء</button>
          </div>
        </form>
      )}

      <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f8fafc] text-[#697586] text-xs">
            <tr>
              <th className="text-right font-medium px-4 py-2">الجهة</th>
              <th className="text-right font-medium px-4 py-2">النوع</th>
              <th className="text-right font-medium px-4 py-2">الرمز</th>
              <th className="text-right font-medium px-4 py-2">الهاتف</th>
              <th className="text-right font-medium px-4 py-2">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e3e8ef]">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 flex items-center gap-2 text-[#121926]">
                  {c.kind === 'AGENT' ? (
                    <Bike className="w-4 h-4 text-[#b8256e]" />
                  ) : (
                    <Truck className="w-4 h-4 text-[#697586]" />
                  )}
                  {c.name}
                </td>
                <td className="px-4 py-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                    c.kind === 'AGENT'
                      ? 'bg-[#fdf2f7] border-[#f8c4dd] text-[#b8256e]'
                      : 'bg-[#f8fafc] border-[#e3e8ef] text-[#697586]'
                  }`}>
                    {c.kind === 'AGENT' ? 'مندوب' : 'شركة شحن'}
                  </span>
                </td>
                <td className="px-4 py-2 text-[#697586]" dir="ltr">{c.code}</td>
                <td className="px-4 py-2 text-[#697586]" dir="ltr">{c.phone ?? '—'}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggle(c)} disabled={busy} className={`text-xs px-3 py-1 rounded-[8px] border ${c.isActive ? 'border-[#e3e8ef] text-[#00a344]' : 'border-[#fecdd1] bg-[#feecee] text-[#fb323f]'}`}>
                      {c.isActive ? 'نشطة' : 'موقوفة'}
                    </button>
                    {/* An agent has no platform account: he is a person with a
                        motorbike, settled by hand. Only a company has a login. */}
                    {c.kind !== 'AGENT' && (
                      <button
                        onClick={() => setAccountFor(accountFor === c.id ? null : c.id)}
                        className="rounded-[8px] border border-[#e3e8ef] px-3 py-1 text-xs text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e]"
                      >
                        الحساب والتكامل
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.map((c) =>
              accountFor === c.id ? (
                <tr key={`${c.id}-account`}>
                  <td colSpan={5} className="bg-[#f8fafc] px-4 py-4">
                    <CourierCredentials providerId={c.id} />
                  </td>
                </tr>
              ) : null
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-[#697586]">لا توجد شركات شحن ولا مندوبون بعد.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  dir,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir?: 'ltr' | 'rtl';
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[#364152] mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={dir}
        required={required}
        className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] bg-white text-sm"
      />
    </label>
  );
}
