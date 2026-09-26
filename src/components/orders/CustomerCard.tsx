'use client';

import React, { useState } from 'react';
import { User, Pencil, History, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { useOrderPatch } from '@/components/orders/useOrderPatch';
import { useRegions } from '@/hooks/useRegions';

/**
 * Who the order goes to, and the one button that edits all of it.
 *
 * Customer details and order lines used to share a single edit form, so
 * fixing a phone number opened price and quantity fields too and every save
 * touched both. They are separate questions asked by different people at
 * different moments, so they are separate cards with their own buttons.
 *
 * The phone rule for the store's country is enforced on the server; this
 * form just shows what it says rather than guessing its own rules.
 */

interface Props {
  order: {
    id: string;
    version: number;
    regionId: string | null;
    region?: { id: string; name: string } | null;
    customer: {
      id: string;
      fullName: string;
      phone: string;
      rawPhone?: string | null;
      altPhone?: string | null;
      address?: string | null;
      city?: string | null;
      totalOrders?: number;
      deliveredOrders?: number;
      cancelledOrders?: number;
    };
  };
  /** Held by this user with a live editing lock — the server demands it. */
  canEdit: boolean;
  onAcquireLock: () => Promise<unknown> | void;
  onSaved: () => void;
  onOpenHistory: () => void;
}

export function CustomerCard({ order, canEdit, onAcquireLock, onSaved, onOpenHistory }: Props) {
  // Saves, and asks why when the server says this authority owes a reason.
  const patchOrder = useOrderPatch();
  const { regions, countryName } = useRegions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: order.customer.fullName ?? '',
    phone: order.customer.rawPhone || order.customer.phone || '',
    altPhone: order.customer.altPhone ?? '',
    regionId: order.regionId ?? '',
    address: order.customer.address ?? '',
  });

  async function openForm() {
    // The button says إغلاق once the form is open, so pressing it again has
    // to close it — it used to re-open the form onto itself and look dead.
    if (open) {
      setOpen(false);
      setError(null);
      return;
    }
    setForm({
      fullName: order.customer.fullName ?? '',
      phone: order.customer.rawPhone || order.customer.phone || '',
      altPhone: order.customer.altPhone ?? '',
      regionId: order.regionId ?? '',
      address: order.customer.address ?? '',
    });
    setError(null);
    if (!canEdit) await onAcquireLock();
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await patchOrder(order.id, {
        expectedVersion: order.version,
        customerName: form.fullName,
        customerPhone: form.phone,
        customerAltPhone: form.altPhone.trim() || null,
        customerAddress: form.address,
        regionId: form.regionId || null,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.errorAr || data.error || 'تعذر الحفظ');
      }
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  const previous = Math.max(0, (order.customer.totalOrders ?? 1) - 1);
  const inputClass =
    'w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm focus:outline-none focus:border-[var(--sys-primary)]';

  return (
    <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 shadow-card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-black text-[var(--sys-foreground)] flex items-center gap-2">
          <User className="w-4 h-4 text-[var(--sys-primary)]" />
          معلومات العميل
        </h4>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenHistory}
            className="text-caption px-2.5 py-1.5 rounded-lg border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] inline-flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5" />
            طلبات سابقة ({previous})
          </button>
          <button
            onClick={openForm}
            className="text-caption px-2.5 py-1.5 rounded-lg border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] inline-flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {open ? 'إغلاق' : 'تعديل'}
          </button>
        </div>
      </div>

      {!open ? (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Row label="الاسم" value={order.customer.fullName} />
          <Row label="رقم الهاتف" value={order.customer.rawPhone || order.customer.phone} ltr />
          <Row label="رقم إضافي" value={order.customer.altPhone || '—'} ltr />
          <Row label="المحافظة" value={order.region?.name ?? order.customer.city ?? '—'} />
          <div className="sm:col-span-2">
            <Row label="عنوان التوصيل" value={order.customer.address || '—'} />
          </div>
        </dl>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="اسم العميل">
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputClass} />
            </Field>
            <Field label="رقم الهاتف">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" className={inputClass} />
            </Field>
            <Field label="رقم إضافي (اختياري)">
              <input value={form.altPhone} onChange={(e) => setForm({ ...form, altPhone: e.target.value })} dir="ltr" className={inputClass} />
            </Field>
            <Field label={`المحافظة${countryName ? ` — ${countryName}` : ''}`}>
              <select value={form.regionId} onChange={(e) => setForm({ ...form, regionId: e.target.value })} className={inputClass}>
                <option value="">— اختر المحافظة —</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="عنوان التوصيل">
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
              </Field>
            </div>
          </div>

          {error && <p className="text-caption text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg px-2.5 py-1.5">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              حفظ بيانات العميل
            </button>
            <button onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--sys-border)] text-[var(--sys-muted-foreground)]">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-caption text-[var(--sys-muted)]">{label}</dt>
      <dd className="text-[var(--sys-heading)] font-medium" dir={ltr ? 'ltr' : undefined}>{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--sys-muted-foreground)] mb-1">{label}</span>
      {children}
    </label>
  );
}
