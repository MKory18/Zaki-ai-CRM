'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2, Plus, Store } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { CURRENCIES, currencyLabel, minorUnitFor } from '@/lib/currencies';
import { StorefrontSettings } from '@/components/settings/StorefrontSettings';
import { STORE_TYPE_LABEL, storeTypeLabel } from '@/lib/store-types';

/**
 * /settings/geo — countries, their stores and their regions in one screen.
 * Everything a store inherits (currency, minor unit, work hours, weekend
 * days, order prefix, negative stock) is set here on the country, never on
 * the store. Nothing is deleted: countries deactivate, stores pause.
 */

interface StoreRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  logo?: string | null;
}
interface CountryRow {
  id: string;
  code: string;
  name: string;
  currencyCode: string;
  minorUnit: number;
  workHoursStart: string;
  workHoursEnd: string;
  weekendDays: number[];
  timezone: string;
  orderPrefix: string;
  allowNegativeStock: boolean;
  isActive: boolean;
  stores: StoreRow[];
  _count: { regions: number };
}

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function GeoSettingsScreen() {
  const [countries, setCountries] = useState<CountryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [adding, setAdding] = useState<'country' | string | null>(null);
  const [storefrontFor, setStorefrontFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ countries: CountryRow[] }>('/api/geo/countries');
      setCountries(res.countries);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل البلدان');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ?store=<id> — the storefronts screen's "settings" link opens that
  // store's panel directly instead of dropping the owner at the top.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('store');
    if (wanted) setStorefrontFor(wanted);
  }, []);

  const patchCountry = async (id: string, data: Record<string, unknown>) => {
    setError(null);
    try {
      await apiJson(`/api/geo/countries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      await load();
    } catch (e: any) {
      setError(e?.message || 'تعذر الحفظ');
    }
  };

  const patchStore = async (id: string, data: Record<string, unknown>) => {
    setError(null);
    try {
      await apiJson(`/api/geo/stores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      await load();
    } catch (e: any) {
      setError(e?.message || 'تعذر الحفظ');
    }
  };

  if (!countries) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#121926]">البلدان والمتاجر</h1>
          <p className="text-sm text-[#697586] mt-1">المتجر يرث كل الإعدادات من بلده.</p>
        </div>
        <button
          onClick={() => setAdding('country')}
          className="flex items-center gap-2 px-4 py-2 rounded-[8px] bg-[#b8256e] text-white text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> بلد جديد
        </button>
      </div>

      {error && (
        <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>
      )}

      {adding === 'country' && (
        <AddCountry
          onCancel={() => setAdding(null)}
          onDone={async () => {
            setAdding(null);
            await load();
          }}
        />
      )}

      {countries.map((c) => (
        <section key={c.id} className="bg-white border border-[#e3e8ef] rounded-[8px]">
          <header className="flex items-center gap-3 p-4 border-b border-[#e3e8ef]">
            <span className="w-10 h-10 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] flex items-center justify-center">
              <Globe className="w-5 h-5 text-[#b8256e]" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#121926]">
                {c.name} <span className="text-xs text-[#9aa4b2]" dir="ltr">{c.code}</span>
              </p>
              <p className="text-xs text-[#697586]">
                {c.currencyCode} · {c.minorUnit} خانات · {c.stores.length} متجر · {c._count.regions} محافظة
                {!c.isActive && <span className="text-[#fb323f]"> · غير مفعّل</span>}
              </p>
            </div>
            <button
              onClick={() => setOpenCountry(openCountry === c.id ? null : c.id)}
              className="text-xs text-[#697586] hover:text-[#b8256e]"
            >
              {openCountry === c.id ? 'إخفاء' : 'الإعدادات'}
            </button>
          </header>

          {openCountry === c.id && (
            <div className="p-4 grid gap-3 md:grid-cols-2 border-b border-[#e3e8ef] bg-[#f8fafc]">
              <TimeField label="بداية الدوام" value={c.workHoursStart} onSave={(v) => patchCountry(c.id, { workHoursStart: v })} />
              <TimeField label="نهاية الدوام" value={c.workHoursEnd} onSave={(v) => patchCountry(c.id, { workHoursEnd: v })} />
              <div className="md:col-span-2">
                <p className="text-xs font-medium text-[#364152] mb-2">أيام العطلة</p>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d, i) => {
                    const on = c.weekendDays.includes(i);
                    return (
                      <button
                        key={d}
                        onClick={() =>
                          patchCountry(c.id, {
                            weekendDays: on ? c.weekendDays.filter((x) => x !== i) : [...c.weekendDays, i],
                          })
                        }
                        className={`px-3 py-1.5 rounded-[8px] text-xs border ${
                          on ? 'bg-[#b8256e] text-white border-[#b8256e]' : 'bg-white text-[#364152] border-[#e3e8ef]'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              <TextField label="بادئة رقم الطلب" value={c.orderPrefix} dir="ltr" onSave={(v) => patchCountry(c.id, { orderPrefix: v.toUpperCase() })} />
              <TextField label="المنطقة الزمنية" value={c.timezone} dir="ltr" onSave={(v) => patchCountry(c.id, { timezone: v })} />
              <label className="flex items-center gap-2 text-sm text-[#364152]">
                <input
                  type="checkbox"
                  checked={c.allowNegativeStock}
                  onChange={(e) => patchCountry(c.id, { allowNegativeStock: e.target.checked })}
                />
                السماح بالمخزون السالب (يُطبّق عند إنشاء الشحنة)
              </label>
              <label className="flex items-center gap-2 text-sm text-[#364152]">
                <input type="checkbox" checked={c.isActive} onChange={(e) => patchCountry(c.id, { isActive: e.target.checked })} />
                البلد مفعّل
              </label>
              <div className="md:col-span-2">
                <Regions countryId={c.id} />
              </div>
            </div>
          )}

          <ul className="divide-y divide-[#e3e8ef]">
            {c.stores.map((s) => (
              <React.Fragment key={s.id}>
              <li className="flex items-center gap-3 p-4">
                <span className="w-8 h-8 rounded-[8px] bg-[#f8fafc] border border-[#e3e8ef] flex items-center justify-center overflow-hidden">
                  {s.logo ? (
                    <img src={s.logo} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <Store className="w-4 h-4 text-[#697586]" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#121926]">{s.name}</p>
                  <p className="text-xs text-[#697586]" dir="ltr">
                    /{s.slug} · {storeTypeLabel(s.type)}
                  </p>
                </div>
                <button
                  onClick={() => setStorefrontFor((cur) => (cur === s.id ? null : s.id))}
                  className={`text-xs px-3 py-1.5 rounded-[8px] border ${
                    storefrontFor === s.id
                      ? 'border-[#b8256e] text-[#b8256e] bg-[#fdf2f8]'
                      : 'border-[#e3e8ef] text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e]'
                  }`}
                >
                  الواجهة والشعار
                </button>
                <button
                  onClick={() => patchStore(s.id, { status: s.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })}
                  className={`text-xs px-3 py-1.5 rounded-[8px] border ${
                    s.status === 'ACTIVE'
                      ? 'border-[#e3e8ef] text-[#697586] hover:text-[#fb323f]'
                      : 'border-[#fecdd1] bg-[#feecee] text-[#fb323f]'
                  }`}
                >
                  {s.status === 'ACTIVE' ? 'إيقاف مؤقت' : 'تفعيل'}
                </button>
              </li>
              {/* Directly under its own store. It used to render after the
                  LAST store of the country, and nothing ever opened it: the
                  state existed, the button that set it did not, so the
                  storefront's theme, phone, domain — and now its logo —
                  could not be reached from anywhere. */}
              {storefrontFor === s.id && (
                <li className="bg-[#f8fafc] p-4">
                  <StorefrontSettings store={s as never} onSaved={load} />
                </li>
              )}
              </React.Fragment>
            ))}
            <li className="p-3">
              {adding === c.id ? (
                <AddStore
                  countryId={c.id}
                  currencyCode={c.currencyCode}
                  minorUnit={c.minorUnit}
                  onCancel={() => setAdding(null)}
                  onDone={async () => {
                    setAdding(null);
                    await load();
                  }}
                />
              ) : (
                <button
                  onClick={() => setAdding(c.id)}
                  className="w-full flex items-center justify-center gap-2 p-2 rounded-[8px] border border-dashed border-[#e3e8ef] text-sm text-[#697586] hover:border-[#b8256e] hover:text-[#b8256e]"
                >
                  <Plus className="w-4 h-4" /> متجر في {c.name}
                </button>
              )}
            </li>
          </ul>
        </section>
      ))}
    </div>
  );
}

function Regions({ countryId }: { countryId: string }) {
  const [regions, setRegions] = useState<{ id: string; name: string }[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ regions: { id: string; name: string }[] }>(`/api/geo/countries/${countryId}/regions`);
      setRegions(res.regions);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل المحافظات');
    }
  }, [countryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await apiJson(`/api/geo/countries/${countryId}/regions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      setName('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'تعذر الإضافة');
    }
  };

  return (
    <div className="bg-white border border-[#e3e8ef] rounded-[8px] p-3">
      <p className="text-xs font-medium text-[#364152] mb-2">المحافظات</p>
      {error && <p className="text-xs text-[#fb323f] mb-2">{error}</p>}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(regions ?? []).map((r) => (
          <span key={r.id} className="px-2.5 py-1 rounded-[6px] bg-[#f8fafc] border border-[#e3e8ef] text-xs text-[#364152]">
            {r.name}
          </span>
        ))}
        {regions?.length === 0 && <span className="text-xs text-[#9aa4b2]">لا توجد محافظات بعد.</span>}
      </div>
      <form onSubmit={add} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم المحافظة"
          className="flex-1 h-9 px-3 rounded-[8px] border border-[#e3e8ef] text-sm focus:outline-none focus:border-[#b8256e]"
        />
        <button type="submit" className="px-3 h-9 rounded-[8px] bg-[#121926] text-white text-xs">
          إضافة
        </button>
      </form>
    </div>
  );
}

function AddCountry({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ code: '', name: '', currencyCode: '', minorUnit: '' });
  const [other, setOther] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Choosing the currency sets its decimals. They were two separate boxes
   * with the decimals starting at 2, so a JOD country left at the default
   * rounded every amount it ever touched to the wrong unit.
   */
  function pickCurrency(code: string) {
    if (code === '__other') {
      setOther(true);
      setForm({ ...form, currencyCode: '', minorUnit: '' });
      return;
    }
    setOther(false);
    const minor = minorUnitFor(code);
    setForm({ ...form, currencyCode: code, minorUnit: minor === null ? '' : String(minor) });
  }

  // Both are required by the server; the button says so before it does.
  const ready =
    form.name.trim().length >= 2 &&
    /^[A-Za-z]{2}$/.test(form.code.trim()) &&
    /^[A-Za-z]{3}$/.test(form.currencyCode.trim()) &&
    form.minorUnit !== '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson('/api/geo/countries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          currencyCode: form.currencyCode.trim().toUpperCase(),
          minorUnit: Number(form.minorUnit),
        }),
      });
      onDone();
    } catch (e: any) {
      setError(e?.message || 'تعذر إضافة البلد');
    } finally {
      setBusy(false);
    }
  };

  const official = minorUnitFor(form.currencyCode);

  return (
    <form onSubmit={submit} className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 grid gap-3 md:grid-cols-4">
      {error && <p className="md:col-span-4 text-sm text-[#fb323f]">{error}</p>}
      <Input label="الاسم" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
      <Input label="الرمز (حرفان)" value={form.code} onChange={(v) => setForm({ ...form, code: v })} dir="ltr" />

      <label className="block">
        <span className="block text-xs font-medium text-[#364152] mb-1">
          العملة <span className="text-[#fb323f]">*</span>
        </span>
        <select
          required
          value={other ? '__other' : form.currencyCode}
          onChange={(e) => pickCurrency(e.target.value)}
          className={SELECT}
        >
          <option value="" disabled>
            اختر العملة
          </option>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.ar} ({c.code})
            </option>
          ))}
          <option value="__other">عملة أخرى…</option>
        </select>
        {other && (
          <input
            autoFocus
            required
            dir="ltr"
            maxLength={3}
            placeholder="ISO — مثل GBP"
            value={form.currencyCode}
            onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })}
            className={`${SELECT} mt-2`}
          />
        )}
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-[#364152] mb-1">
          الخانات العشرية <span className="text-[#fb323f]">*</span>
        </span>
        <select
          required
          value={form.minorUnit}
          onChange={(e) => setForm({ ...form, minorUnit: e.target.value })}
          className={SELECT}
        >
          <option value="" disabled>
            —
          </option>
          {[0, 1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
              {official === n ? ' — الرسمي' : ''}
            </option>
          ))}
        </select>
        {/* Said when it differs, because this number decides how every
            amount in the country is rounded. */}
        {official !== null && form.minorUnit !== '' && Number(form.minorUnit) !== official && (
          <span className="mt-1 block text-[11px] text-[#c07f2a]">
            الرسمي لـ {form.currencyCode} هو {official} — كل مبلغ في هذا البلد سيُقرَّب على ما تختاره.
          </span>
        )}
      </label>

      <div className="md:col-span-4 flex gap-2">
        <button
          type="submit"
          disabled={busy || !ready}
          className="px-4 py-2 rounded-[8px] bg-[#b8256e] text-white text-sm disabled:opacity-60"
        >
          {busy ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-[8px] border border-[#e3e8ef] text-sm text-[#697586]">
          إلغاء
        </button>
      </div>
    </form>
  );
}

const SELECT =
  'w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] bg-white text-sm focus:outline-none focus:border-[#b8256e]';

function AddStore({
  countryId,
  currencyCode,
  minorUnit,
  onCancel,
  onDone,
}: {
  countryId: string;
  currencyCode: string;
  minorUnit: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ name: '', slug: '', type: 'MULTI_PRODUCT' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiJson('/api/geo/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryId, name: form.name.trim(), slug: form.slug.trim().toLowerCase(), type: form.type }),
      });
      onDone();
    } catch (e: any) {
      setError(e?.message || 'تعذر إضافة المتجر');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-3 p-3 bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px]">
      {error && <p className="md:col-span-3 text-sm text-[#fb323f]">{error}</p>}
      {/* What the store takes from its country, said at the moment it is
          created — not left to be discovered on the first order. The wallet
          is the one exception, and the line says where that is chosen. */}
      <p className="md:col-span-3 rounded-lg bg-white border border-[#e3e8ef] px-3 py-2 text-xs text-[#364152]">
        العملة: <b>{currencyLabel(currencyCode)}</b> · {minorUnit} خانات عشرية — موروثة من البلد ولا تُغيَّر هنا.
        <span className="block mt-0.5 text-[#697586]">
          عملة المحفظة تُختار منفصلة عند إنشائها من المال ← المحافظ والحركات.
        </span>
      </p>
      <Input label="اسم المتجر" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
      <Input label="المعرّف" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} dir="ltr" />
      <label className="block">
        <span className="block text-xs font-medium text-[#364152] mb-1">النوع</span>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] bg-white text-sm"
        >
          <option value="MULTI_PRODUCT">متعدد المنتجات</option>
          <option value="SINGLE_PRODUCT">{STORE_TYPE_LABEL.SINGLE_PRODUCT}</option>
        </select>
      </label>
      <div className="md:col-span-3 flex gap-2">
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-[8px] bg-[#b8256e] text-white text-sm disabled:opacity-60">
          {busy ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-[8px] border border-[#e3e8ef] text-sm text-[#697586]">
          إلغاء
        </button>
      </div>
    </form>
  );
}

function Input({
  label,
  value,
  onChange,
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[#364152] mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={dir}
        required
        className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] bg-white text-sm focus:outline-none focus:border-[#b8256e]"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  dir,
  onSave,
}: {
  label: string;
  value: string;
  dir?: 'ltr' | 'rtl';
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[#364152] mb-1">{label}</span>
      <input
        value={v}
        dir={dir}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] bg-white text-sm focus:outline-none focus:border-[#b8256e]"
      />
    </label>
  );
}

function TimeField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[#364152] mb-1">{label}</span>
      <input
        type="time"
        defaultValue={value}
        onBlur={(e) => e.target.value !== value && onSave(e.target.value)}
        dir="ltr"
        className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] bg-white text-sm focus:outline-none focus:border-[#b8256e]"
      />
    </label>
  );
}
