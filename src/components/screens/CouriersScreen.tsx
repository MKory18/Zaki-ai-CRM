'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '@/components/ui/Confirm';
import Link from 'next/link';
import { apiJson } from '@/lib/api-client';
import { CourierCredentials } from '@/components/settings/CourierCredentials';
import { CourierWebhook } from '@/components/settings/CourierWebhook';
import { ContactButtons } from '@/components/orders/ContactButtons';
import { COURIER_PLATFORMS } from '@/lib/couriers';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { RiAddCircleLine, RiCheckLine, RiCloseLine, RiDeleteBinLine, RiEBike2Line, RiLoader4Line, RiPencilLine, RiTruckLine } from '@remixicon/react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

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
  const ask = useConfirm();
  const toast = useToast();
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
      toast.failed(e instanceof Error ? e.message : 'تعذر الإضافة');
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
      toast.failed(e instanceof Error ? e.message : 'تعذر التحديث');
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
    try {
      await apiJson(`/api/delivery-providers/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignToCurrentStore: true }),
      });
      await load();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر الإسناد');
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
      toast.failed(e instanceof Error ? e.message : 'تعذر الحفظ');
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
    const ok = await ask({
      title: `حذف «${c.name}»؟`,
      body: 'إن كانت مرتبطة بطلبات أو كشوف فستُعطَّل بدل الحذف، والسجلّات القديمة تبقى كما هي.',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setNote(null);
    try {
      const d = await apiJson<{ deleted?: boolean; deactivated?: boolean; message?: string }>(
        `/api/delivery-providers/${c.id}`,
        { method: 'DELETE' }
      );
      setNote(d.message ?? null);
      await load();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر الحذف');
    } finally {
      setBusy(false);
    }
  };

  if (!rows) {
    return (
      <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
        <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-3">
      <ScreenTitle />

      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--sys-muted-foreground)]">
          أجور التوصيل لكل محافظة تُضبط من{' '}
          <Link href="/settings/delivery-fees" className="text-[var(--sys-primary)] hover:underline">أجور التوصيل</Link>.
        </p>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium">
          <RiAddCircleLine className="w-4 h-4" /> شركة شحن أو مندوب
        </button>
      </div>

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>}

      {adding && (
        <form onSubmit={create} className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 grid gap-3 md:grid-cols-4">
          <Field label="الاسم" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="الرمز" value={form.code} onChange={(v) => setForm({ ...form, code: v })} dir="ltr" />
          <Field label="الهاتف" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} dir="ltr" required={false} />
          <label className="block">
            <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">النوع</span>
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as 'COMPANY' | 'AGENT' })}
              className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm bg-[var(--sys-card)]"
            >
              <option value="COMPANY">شركة شحن</option>
              <option value="AGENT">مندوب</option>
            </select>
            <span className="block text-xs text-[var(--sys-muted)] mt-1">
              المندوب فوري وتسويته يدوية، وهو الوحيد الذي يمكن سحب الشحنة منه مباشرة.
            </span>
          </label>
          {/* A courier is not a platform. "باشا" is who ships; LogesTechs is
              what they ship ON, and another courier could run on the same
              platform under a different account. An agent has neither. */}
          {form.kind !== 'AGENT' && (
            <label className="block">
              <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">تعمل على منصّة</span>
              <select
                value={form.adapterCode}
                onChange={(e) => setForm({ ...form, adapterCode: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm bg-[var(--sys-card)]"
              >
                {COURIER_PLATFORMS.map((p) => (
                  <option key={p.code} value={p.code}>{p.name}</option>
                ))}
              </select>
              <span className="block text-xs text-[var(--sys-muted)] mt-1">
                {COURIER_PLATFORMS.find((p) => p.code === form.adapterCode)?.needs}
              </span>
            </label>
          )}

          <div className="flex gap-2 items-end">
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm disabled:opacity-60">حفظ</button>
            <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg border border-[var(--sys-border)] text-sm text-[var(--sys-muted-foreground)]">إلغاء</button>
          </div>
        </form>
      )}

      {/* What the server decided, in its words: deactivated and why, or
          really deleted. Guessing on the client would eventually disagree
          with what actually happened. */}
      {note && (
        <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] px-3 py-2 text-xs text-[var(--sys-foreground)]">
          {note}
        </p>
      )}

      {unplaced.length > 0 && (
        <div className="rounded-lg border border-[var(--sys-warning)] bg-[var(--sys-warning-soft)] p-3 space-y-2">
          <p className="text-xs font-semibold text-[var(--sys-warning)]">
            غير مُسنَدة لأي متجر — لا يمكن استعمالها حتى تُسنَد
          </p>
          {unplaced.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-[var(--sys-foreground)]">
                {c.name} <span dir="ltr" className="text-[var(--sys-muted)]">({c.code})</span>
              </span>
              <button
                onClick={() => placeHere(c)}
                disabled={busy}
                className="rounded-lg border border-[var(--sys-warning)]/40 bg-[var(--sys-card)] px-3 py-1 text-xs text-[var(--sys-warning)] hover:border-[var(--sys-warning)] disabled:opacity-50"
              >
                أسنِدها لهذا المتجر
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
            <tr>
              <th className="text-right font-medium px-4 py-2">الجهة</th>
              <th className="text-right font-medium px-4 py-2">النوع</th>
              <th className="text-right font-medium px-4 py-2">الرمز</th>
              <th className="text-right font-medium px-4 py-2">الهاتف</th>
              <th className="text-right font-medium px-4 py-2">الحالة</th>
              <th className="text-right font-medium px-4 py-2"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--sys-border)]">
            {rows.filter((c) => c.storeId).map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 flex items-center gap-2 text-[var(--sys-heading)]">
                  {c.kind === 'AGENT' ? (
                    <RiEBike2Line className="w-4 h-4 text-[var(--sys-primary)]" />
                  ) : (
                    <RiTruckLine className="w-4 h-4 text-[var(--sys-muted-foreground)]" />
                  )}
                  {editing === c.id ? (
                    <input
                      value={edit.name}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      className="h-8 w-40 rounded-lg border border-[var(--sys-border)] px-2 text-sm"
                    />
                  ) : (
                    c.name
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    c.kind === 'AGENT'
                      ? 'bg-[var(--sys-primary-soft)] border-[var(--sys-primary-soft)] text-[var(--sys-primary)]'
                      : 'bg-[var(--sys-surface)] border-[var(--sys-border)] text-[var(--sys-muted-foreground)]'
                  }`}>
                    {c.kind === 'AGENT' ? 'مندوب' : 'شركة شحن'}
                  </span>
                </td>
                <td className="px-4 py-2 text-[var(--sys-muted-foreground)]">
                  <span dir="ltr" className="block">{c.code}</span>
                  {/* Which platform it runs on, under its own code — the two
                      belong together and neither is the other. */}
                  {c.adapterCode && (
                    <span dir="ltr" className="mt-0.5 block text-xs text-[var(--sys-muted)]">
                      {COURIER_PLATFORMS.find((p) => p.code === c.adapterCode)?.name ?? c.adapterCode}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-[var(--sys-muted-foreground)]">
                  {editing === c.id ? (
                    <input
                      value={edit.phone}
                      onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                      dir="ltr"
                      placeholder="—"
                      className="h-8 w-32 rounded-lg border border-[var(--sys-border)] px-2 text-sm"
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
                    <button onClick={() => toggle(c)} disabled={busy} className={`text-xs px-3 py-1 rounded-lg border ${c.isActive ? 'border-[var(--sys-border)] text-[var(--sys-success)]' : 'border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)]'}`}>
                      {c.isActive ? 'نشطة' : 'موقوفة'}
                    </button>
                    {/* An agent has no platform account: he is a person with a
                        motorbike, settled by hand. Only a company has a login. */}
                    {c.kind !== 'AGENT' && (
                      <button
                        onClick={() => setAccountFor(accountFor === c.id ? null : c.id)}
                        className="rounded-lg border border-[var(--sys-border)] px-3 py-1 text-xs text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
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
                          className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-success)] hover:bg-[var(--sys-success-soft)] disabled:opacity-40"
                        >
                          <RiCheckLine className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          title="ألغِ"
                          className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)]"
                        >
                          <RiCloseLine className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(c)}
                          title="عدّل"
                          className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-primary)]"
                        >
                          <RiPencilLine className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(c)}
                          disabled={busy}
                          title="احذف"
                          className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-muted)] hover:bg-[var(--sys-destructive-soft)] hover:text-[var(--sys-destructive)] disabled:opacity-40"
                        >
                          <RiDeleteBinLine className="h-4 w-4" />
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
                  <td colSpan={6} className="bg-[var(--sys-surface)] px-4 py-4 space-y-3">
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
                <td colSpan={6} className="p-0">
                  <EmptyState
                    title="لا شركةَ شحنٍ لهذا المتجر بعد"
                    why="بلا شركةِ شحنٍ لا يمكن تجهيز شحنة ولا طباعة بوليصة. أضِف واحدةً من النموذج أعلاه، أو انسخ شركةً معرَّفةً على مستوى البلد."
                  />
                </td>
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
      <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={dir}
        required={required}
        className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-sm"
      />
    </label>
  );
}
