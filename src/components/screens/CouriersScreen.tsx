'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bike, Check, Loader2, Pencil, Plus, Store as StoreIcon, Trash2, Truck, X } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { CourierCredentials } from '@/components/settings/CourierCredentials';
import { CourierWebhook } from '@/components/settings/CourierWebhook';
import { ContactButtons } from '@/components/orders/ContactButtons';
import { COURIER_PLATFORMS } from '@/lib/couriers';

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
  /** null = every store in the company, which is what they all were. */
  storeId?: string | null;
  store?: { name: string } | null;
  /** Which platform it ships on; null = worked by hand. */
  adapterCode?: string | null;
}

interface StoreRow {
  id: string;
  name: string;
}

export function CouriersScreen() {
  const [rows, setRows] = useState<Courier[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', phone: '', kind: 'COMPANY' as 'COMPANY' | 'AGENT', adapterCode: 'MANUAL' });
  const [accountFor, setAccountFor] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', phone: '' });
  const [note, setNote] = useState<string | null>(null);
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
    // The store list is what makes "whose courier is this?" answerable.
    apiJson<{ stores?: StoreRow[] }>('/api/geo/stores')
      .then((d) => setStores(d.stores ?? []))
      .catch(() => setStores([]));
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiJson('/api/delivery-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          kind: form.kind,
          phone: form.phone.trim() || undefined,
          adapterCode: form.adapterCode,
        }),
      });
      setForm({ name: '', code: '', phone: '', kind: 'COMPANY', adapterCode: 'MANUAL' });
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

  /**
   * Rows from before couriers had a store. They are usable by nobody, and
   * they must not vanish quietly — a courier that disappears off a screen
   * is one somebody re-creates as a duplicate a week later.
   */
  const unplaced = rows?.filter((c) => !c.storeId) ?? [];

  const placeHere = async (c: Courier) => {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/delivery-providers/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignToCurrentStore: true }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الإسناد');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (c: Courier) => {
    setEditing(c.id);
    setEdit({ name: c.name, phone: c.phone ?? '' });
    setNote(null);
  };

  const saveEdit = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/delivery-providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: edit.name.trim(),
          phone: edit.phone.trim(),
        }),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Delete asks the server, which decides. Anything with history is
   * deactivated instead and says what is holding it — the orders and
   * statements that name it are not ours to rewrite.
   */
  const remove = async (c: Courier) => {
    if (!confirm(`حذف «${c.name}»؟ إن كانت مرتبطة بطلبات أو كشوف فستُعطَّل بدل الحذف، والسجلّات القديمة تبقى كما هي.`)) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const d = await apiJson<{ deleted?: boolean; deactivated?: boolean; message?: string }>(
        `/api/delivery-providers/${c.id}`,
        { method: 'DELETE' }
      );
      setNote(d.message ?? null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحذف');
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
          {/* A courier is not a platform. "باشا" is who ships; LogesTechs is
              what they ship ON, and another courier could run on the same
              platform under a different account. An agent has neither. */}
          {form.kind !== 'AGENT' && (
            <label className="block">
              <span className="block text-xs font-medium text-[#364152] mb-1">تعمل على منصّة</span>
              <select
                value={form.adapterCode}
                onChange={(e) => setForm({ ...form, adapterCode: e.target.value })}
                className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm bg-white"
              >
                {COURIER_PLATFORMS.map((p) => (
                  <option key={p.code} value={p.code}>{p.name}</option>
                ))}
              </select>
              <span className="block text-[11px] text-[#9aa4b2] mt-1">
                {COURIER_PLATFORMS.find((p) => p.code === form.adapterCode)?.needs}
              </span>
            </label>
          )}

          <div className="flex gap-2 items-end">
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-[8px] bg-[#b8256e] text-white text-sm disabled:opacity-60">حفظ</button>
            <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 rounded-[8px] border border-[#e3e8ef] text-sm text-[#697586]">إلغاء</button>
          </div>
        </form>
      )}

      {/* What the server decided, in its words: deactivated and why, or
          really deleted. Guessing on the client would eventually disagree
          with what actually happened. */}
      {note && (
        <p className="rounded-lg border border-[#e3e8ef] bg-[#f8fafc] px-3 py-2 text-xs text-[#364152]">
          {note}
        </p>
      )}

      {unplaced.length > 0 && (
        <div className="rounded-lg border border-[#ffe7b8] bg-[#fff6e5] p-3 space-y-2">
          <p className="text-xs font-semibold text-[#c07f2a]">
            غير مُسنَدة لأي متجر — لا يمكن استعمالها حتى تُسنَد
          </p>
          {unplaced.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-[#364152]">
                {c.name} <span dir="ltr" className="text-[#9aa4b2]">({c.code})</span>
              </span>
              <button
                onClick={() => placeHere(c)}
                disabled={busy}
                className="rounded-[8px] border border-[#c07f2a]/40 bg-white px-3 py-1 text-[11px] text-[#c07f2a] hover:border-[#c07f2a] disabled:opacity-50"
              >
                أسنِدها لهذا المتجر
              </button>
            </div>
          ))}
        </div>
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
              <th className="text-right font-medium px-4 py-2"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e3e8ef]">
            {rows.filter((c) => c.storeId).map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 flex items-center gap-2 text-[#121926]">
                  {c.kind === 'AGENT' ? (
                    <Bike className="w-4 h-4 text-[#b8256e]" />
                  ) : (
                    <Truck className="w-4 h-4 text-[#697586]" />
                  )}
                  {editing === c.id ? (
                    <input
                      value={edit.name}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      className="h-8 w-40 rounded-[8px] border border-[#e3e8ef] px-2 text-sm"
                    />
                  ) : (
                    c.name
                  )}
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
                <td className="px-4 py-2 text-[#697586]">
                  <span dir="ltr" className="block">{c.code}</span>
                  {/* Which platform it runs on, under its own code — the two
                      belong together and neither is the other. */}
                  {c.adapterCode && (
                    <span dir="ltr" className="mt-0.5 block text-[10px] text-[#9aa4b2]">
                      {COURIER_PLATFORMS.find((p) => p.code === c.adapterCode)?.name ?? c.adapterCode}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-[#697586]">
                  {editing === c.id ? (
                    <input
                      value={edit.phone}
                      onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                      dir="ltr"
                      placeholder="—"
                      className="h-8 w-32 rounded-[8px] border border-[#e3e8ef] px-2 text-sm"
                    />
                  ) : c.phone ? (
                    <span className="inline-flex items-center gap-2">
                      <span dir="ltr">{c.phone}</span>
                      {/* The same buttons the customer rows use, without the
                          ready-made messages: those are written about an
                          order, and a courier's office does not have one. */}
                      <ContactButtons phone={c.phone} context={{}} compact plain />
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
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
                <td className="px-4 py-2">
                  {/* Edit and delete sit apart from the account panel: one
                      changes who this courier IS, the other changes how we
                      talk to them. */}
                  <div className="flex items-center justify-end gap-1">
                    {editing === c.id ? (
                      <>
                        <button
                          onClick={() => saveEdit(c.id)}
                          disabled={busy || !edit.name.trim()}
                          title="احفظ"
                          className="cursor-pointer rounded-lg p-1.5 text-[#00a344] hover:bg-[#e6f9ee] disabled:opacity-40"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          title="ألغِ"
                          className="cursor-pointer rounded-lg p-1.5 text-[#697586] hover:bg-[#f8fafc]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(c)}
                          title="عدّل"
                          className="cursor-pointer rounded-lg p-1.5 text-[#697586] hover:bg-[#fdf5fa] hover:text-[#b8256e]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(c)}
                          disabled={busy}
                          title="احذف"
                          className="cursor-pointer rounded-lg p-1.5 text-[#9aa4b2] hover:bg-[#feecee] hover:text-[#fb323f] disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.filter((c) => c.storeId).map((c) =>
              accountFor === c.id ? (
                <tr key={`${c.id}-account`}>
                  <td colSpan={6} className="bg-[#f8fafc] px-4 py-4 space-y-3">
                    <CourierCredentials providerId={c.id} />
                    {/* Statuses can arrive two ways; both belong to the
                        account, so both live on the account panel. */}
                    <CourierWebhook providerId={c.id} />
                  </td>
                </tr>
              ) : null
            )}
            {rows.filter((c) => c.storeId).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-[#697586]">لا توجد شركات شحن ولا مندوبون بعد.</td>
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
