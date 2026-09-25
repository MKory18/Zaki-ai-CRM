'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bike, Truck } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';

/**
 * Moving a parcel to another courier, from the tracking screen.
 *
 * The screen states the consequence before you commit, because the two moves
 * are not equivalent: away from a مندوب the same order simply changes hands,
 * away from a company the parcel is recalled and a REPLACEMENT order is
 * raised that re-enters preparation. The server decides which applies; this
 * only has to say so plainly first.
 */

interface Provider {
  id: string;
  name: string;
  kind?: string;
}

export function TransferDialog({
  order,
  onClose,
  onDone,
}: {
  order: {
    id: string;
    orderNumber: string;
    merchantRef: string | null;
    deliveryProvider: { id: string; name: string; kind?: string } | null;
  };
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiJson<{ providers: Provider[] }>('/api/ops/references')
      .then((d) => setProviders(d.providers.filter((p) => p.id !== order.deliveryProvider?.id)))
      .catch(() => undefined);
  }, [order.deliveryProvider?.id]);

  const fromAgent = order.deliveryProvider?.kind === 'AGENT';
  const to = providers.find((p) => p.id === target);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="تحويل الشحنة"
      subtitle={`${order.merchantRef ?? order.orderNumber} — حالياً مع ${order.deliveryProvider?.name ?? 'لا أحد'}`}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            const res = await apiJson<{ message: string }>('/api/ops/tracking/transfer', {
              method: 'POST',
              body: JSON.stringify({ orderId: order.id, toProviderId: target, note: note.trim() || undefined }),
            });
            onDone(res.message);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر التحويل');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <div
          className={`text-xs rounded-lg p-3 border ${
            fromAgent
              ? 'bg-[var(--sys-success-soft)] border-[var(--sys-success)]/40 text-[var(--sys-success)]'
              : 'bg-[var(--sys-warning-soft)] border-[var(--sys-warning)]/40 text-[var(--sys-warning)]'
          }`}
        >
          {fromAgent ? (
            <>
              المندوب فوري: بمجرد التحويل تُسجَّل الشحنة <b>مستلمة منه</b>، ويبقى الطلب بنفس رقمه
              ويُسنَد للجهة الجديدة مباشرة.
            </>
          ) : (
            <span className="flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                لا يمكن تبديل شركة الشحن بعد الإسناد. سيُطلب <b>إرجاع الشحنة</b> من الشركة الحالية،
                ويُنشأ <b>طلب بديل</b> يدخل تجهيز الشحنة ليُسنَد من جديد. الطلب الأصلي يبقى بسجله
                وباركوده لأنه سيظهر في كشف الشركة.
              </span>
            </span>
          )}
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">الجهة الجديدة</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm bg-[var(--sys-card)]"
          >
            <option value="">اختر…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.kind === 'AGENT' ? 'مندوب' : 'شركة شحن'}
              </option>
            ))}
          </select>
        </label>

        {to && (
          <p className="text-xs text-[var(--sys-muted-foreground)] flex items-center gap-1.5">
            {to.kind === 'AGENT' ? <Bike className="w-3.5 h-3.5 text-[var(--sys-primary)]" /> : <Truck className="w-3.5 h-3.5" />}
            ستذهب إلى {to.name}
          </p>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">ملاحظة (اختيارية)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="سبب التحويل"
            className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving || !target}
            className="h-9 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'جارٍ التحويل…' : fromAgent ? 'استلام وتحويل' : 'سحب وإصدار بديل'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
