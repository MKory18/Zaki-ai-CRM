'use client';

import { lateLabel } from '@/lib/transit';
import React, { useCallback, useEffect, useState } from 'react';
import { Bike, Clock, HandCoins, Loader2, Search, Truck } from 'lucide-react';
import { ContactButtons } from '@/components/orders/ContactButtons';
import { TransferDialog } from '@/components/screens/tracking/TransferDialog';
import { CollectDialog } from '@/components/screens/tracking/CollectDialog';
import { DeliverDialog } from '@/components/screens/tracking/DeliverDialog';
import { apiJson } from '@/lib/api-client';

/**
 * /ops/tracking — search by order, reference, barcode, customer or phone.
 * Days in transit and the late flag come from the API against each region's
 * own threshold. Collection status is its own column, never merged with the
 * delivery status.
 */

interface Row {
  id: string;
  orderNumber: string;
  merchantRef: string | null;
  trackingNumber: string | null;
  shippingStatus: string;
  collectionStatus: string;
  daysInTransit: number | null;
  lateThresholdDays: number;
  late: boolean;
  totalAmount: number;
  currency: string;
  deliveryFailureReason: string | null;
  customer: { fullName: string; phone: string; city: string };
  region: { name: string } | null;
  deliveryProvider: { id: string; name: string; kind?: string } | null;
  deliveryFee?: number | null;
  priceIncludesDelivery?: boolean;
  collectedAmount?: number | null;
  settlementStatus?: string;
  _count?: { deliveryAttempts: number; notes: number };
}

const STATUS_LABEL: Record<string, string> = {
  READY_FOR_PICKUP: 'بانتظار الاستلام',
  SHIPPED: 'تم الشحن',
  OUT_FOR_DELIVERY: 'خارج للتوصيل',
  FAILED_DELIVERY: 'تعذر التوصيل',
  RETURN_REQUESTED: 'طلب إرجاع',
  DELIVERED: 'تم التسليم',
  RETURNED: 'مرتجع',
};

type TaskFilter = 'all' | 'late' | 'failed' | 'returning' | 'nobarcode' | 'uncollected';

const TASK_TONE: Record<string, string> = {
  rose: 'bg-[var(--sys-destructive-soft)] border-[var(--sys-destructive-border)] text-[var(--sys-destructive)]',
  amber: 'bg-[var(--sys-warning-soft)] border-[var(--sys-warning)]/40 text-[var(--sys-warning)]',
  emerald: 'bg-[var(--sys-success-soft)] border-[var(--sys-success)]/40 text-[var(--sys-success)]',
};

const COLLECTION_LABEL: Record<string, string> = {
  NOT_APPLICABLE: 'لا ينطبق',
  PENDING: 'بانتظار',
  PENDING_COLLECTION: 'لم يُحصَّل',
  COLLECTED: 'محصَّل',
  SETTLED: 'مسوّى',
  UNSETTLED: 'غير مسوّى',
};

export function TrackingScreen() {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<{ orders: Row[]; lateCount: number; dialCode?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [transferFor, setTransferFor] = useState<Row | null>(null);
  const [deliverFor, setDeliverFor] = useState<Row | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [collecting, setCollecting] = useState(false);
  const [task, setTask] = useState<TaskFilter>('all');

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (term.trim()) q.set('q', term.trim());
    if (status) q.set('status', status);
    try {
      setData(await apiJson(`/api/ops/tracking?${q}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [term, status]);

  useEffect(() => {
    void load();
  }, [load]);

  // Only a delivered parcel owes anything, and only once. A returned one
  // owes nothing; one still in transit has not been collected yet.
  // A partial delivery owes money too — the customer took some lines and paid
  // for them at the door. Leaving it out hid the only button that records the
  // cash arriving, so the debt stayed in the courier's list unclearable.
  const canCollect = (o: Row) =>
    ['DELIVERED', 'PARTIALLY_DELIVERED'].includes(o.shippingStatus) && o.settlementStatus !== 'SETTLED';

  // The work waiting in this screen, each one a thing somebody must do.
  const all = data?.orders ?? [];
  const tasks: { key: TaskFilter; label: string; rows: Row[]; tone: string }[] = [
    { key: 'late', label: 'متأخرة', rows: all.filter((o) => o.late), tone: 'rose' },
    { key: 'failed', label: 'تعذّر التوصيل', rows: all.filter((o) => o.shippingStatus === 'FAILED_DELIVERY'), tone: 'rose' },
    { key: 'returning', label: 'بانتظار الإرجاع', rows: all.filter((o) => o.shippingStatus === 'RETURN_REQUESTED'), tone: 'amber' },
    // Shipped with no barcode: the courier's statement can never be matched
    // to it, so it would silently fall out of settlement.
    { key: 'nobarcode', label: 'بلا باركود', rows: all.filter((o) => !o.trackingNumber && o.shippingStatus !== 'READY_FOR_PICKUP'), tone: 'amber' },
    { key: 'uncollected', label: 'بانتظار التحصيل', rows: all.filter(canCollect), tone: 'emerald' },
  ];
  const visible = task === 'all' ? all : (tasks.find((t) => t.key === task)?.rows ?? []);
  const collectable = visible.filter(canCollect);
  const chosen = collectable.filter((o) => selected[o.id]);
  const netOfChosen = Number(
    chosen.reduce((sum, o) => sum + (Number(o.totalAmount) - Number(o.deliveryFee ?? 0)), 0).toFixed(3)
  );

  return (
    <div className="max-w-6xl space-y-3">
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
              placeholder="رقم الطلب، المرجع، الباركود، اسم العميل أو الهاتف"
              className="w-full h-10 pr-9 pl-3 rounded-[8px] border border-[var(--sys-border)] text-sm"
            />
          </div>
        </label>
        <label>
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">الحالة</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm">
            <option value="">قيد الشحن</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
            <option value="all">الكل</option>
          </select>
        </label>
        <button type="submit" className="h-10 px-4 rounded-[8px] bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium">بحث</button>
        {data && data.lateCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-[8px] px-3 h-10">
            <Clock className="w-4 h-4" /> {data.lateCount} شحنة متأخرة
          </span>
        )}
      </form>

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-[8px] p-3">{error}</p>}
      {done && <p className="text-sm text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-success)]/30 rounded-[8px] p-3">{done}</p>}

      {data && all.length > 0 && (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setTask('all'); setSelected({}); }}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              task === 'all' ? 'bg-[var(--sys-heading)] text-[var(--sys-primary-foreground)] border-[var(--sys-heading)]' : 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)]'
            }`}
          >
            الكل {all.length}
          </button>
          {tasks.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTask(t.key); setSelected({}); }}
              disabled={t.rows.length === 0}
              className={`text-xs px-2.5 py-1 rounded-full border disabled:opacity-40 ${
                task === t.key
                  ? 'bg-[var(--sys-heading)] text-[var(--sys-primary-foreground)] border-[var(--sys-heading)]'
                  : t.rows.length > 0
                    ? TASK_TONE[t.tone]
                    : 'border-[var(--sys-border)] text-[var(--sys-muted)]'
              }`}
            >
              {t.label} {t.rows.length}
            </button>
          ))}
        </div>
      )}

      {/* Manual settlement: a مندوب — and any company that sends no file —
          has no statement to import, so collection is done by naming the
          orders here. Only delivered, unsettled ones can be chosen. */}
      {collectable.length > 0 && (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-[var(--sys-muted-foreground)]">
            {chosen.length > 0
              ? `مختار ${chosen.length} طلب · صافي ${netOfChosen}`
              : `${collectable.length} طلب مسلَّم بانتظار التحصيل اليدوي`}
          </span>
          <button
            onClick={() => setSelected(Object.fromEntries(collectable.map((o) => [o.id, true])))}
            className="text-xs text-[var(--sys-primary)] hover:underline"
          >
            اختر الكل
          </button>
          {chosen.length > 0 && (
            <>
              <button onClick={() => setSelected({})} className="text-xs text-[var(--sys-muted-foreground)] hover:underline">
                إلغاء الاختيار
              </button>
              <button
                onClick={() => setCollecting(true)}
                className="h-8 px-3 rounded-[8px] bg-[var(--sys-success)] text-[var(--sys-primary-foreground)] text-xs font-medium inline-flex items-center gap-1.5 mr-auto"
              >
                <HandCoins className="w-3.5 h-3.5" /> استلمت منه
              </button>
            </>
          )}
        </div>
      )}

      {!data ? (
        <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
              <tr>
                <th className="text-right font-medium px-3 py-2 w-8"> </th>
                <th className="text-right font-medium px-3 py-2">المرجع</th>
                <th className="text-right font-medium px-3 py-2">الباركود</th>
                <th className="text-right font-medium px-3 py-2">العميل</th>
                <th className="text-right font-medium px-3 py-2">المحافظة</th>
                <th className="text-right font-medium px-3 py-2">جهة الشحن</th>
                <th className="text-right font-medium px-3 py-2">حالة الشحن</th>
                <th className="text-right font-medium px-3 py-2">أيام الشحن</th>
                <th className="text-right font-medium px-3 py-2">المحاولات</th>
                <th className="text-right font-medium px-3 py-2">حالة التحصيل</th>
                <th className="text-right font-medium px-3 py-2">المبلغ</th>
                <th className="text-right font-medium px-3 py-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sys-border)]">
              {visible.map((o) => (
                <tr key={o.id} className={o.late ? 'bg-[var(--sys-destructive-soft)]/40' : ''}>
                  <td className="px-3 py-2">
                    {canCollect(o) ? (
                      <input
                        type="checkbox"
                        checked={!!selected[o.id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [o.id]: e.target.checked }))}
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-medium text-[var(--sys-heading)]" dir="ltr">{o.merchantRef ?? o.orderNumber}</td>
                  <td className="px-3 py-2 text-[var(--sys-muted-foreground)]" dir="ltr">{o.trackingNumber ?? '—'}</td>
                  <td className="px-3 py-2 text-[var(--sys-foreground)]">
                    <span className="block">{o.customer.fullName}</span>
                    {/* Reach the customer from the row the parcel is on: the
                        answer to "where is it" is a message, and retyping
                        the same sentence forty times a day is where the
                        wrong order number comes from. */}
                    <ContactButtons
                      compact
                      phone={o.customer.phone}
                      countryCode={data.dialCode}
                      context={{
                        orderNumber: o.merchantRef ?? o.orderNumber,
                        customerName: o.customer.fullName,
                        amount: o.totalAmount,
                        currency: o.currency,
                        courier: o.deliveryProvider?.name ?? null,
                        barcode: o.trackingNumber,
                        region: o.region?.name ?? o.customer.city,
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-[var(--sys-muted-foreground)]">{o.region?.name ?? o.customer.city}</td>
                  <td className="px-3 py-2">
                    {o.deliveryProvider ? (
                      <span className="inline-flex items-center gap-1 text-[var(--sys-foreground)]">
                        {o.deliveryProvider.kind === 'AGENT' ? (
                          <Bike className="w-3.5 h-3.5 text-[var(--sys-primary)]" />
                        ) : (
                          <Truck className="w-3.5 h-3.5 text-[var(--sys-muted)]" />
                        )}
                        {o.deliveryProvider.name}
                      </span>
                    ) : (
                      <span className="text-[var(--sys-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--sys-foreground)]">
                    {STATUS_LABEL[o.shippingStatus] ?? o.shippingStatus}
                    {o.deliveryFailureReason && <span className="block text-[11px] text-[var(--sys-destructive)]">{o.deliveryFailureReason}</span>}
                  </td>
                  <td className={`px-3 py-2 tabular-nums ${o.late ? 'text-[var(--sys-destructive)] font-semibold' : 'text-[var(--sys-foreground)]'}`}>
                    {o.daysInTransit ?? '—'}
                    {o.lateThresholdDays > 0 && <span className="text-[11px] text-[var(--sys-muted)]"> / {o.lateThresholdDays}</span>}
                    {o.late && o.daysInTransit !== null && (
                      <span className="block text-[11px] font-medium">{lateLabel(o.daysInTransit)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`tabular-nums ${(o._count?.deliveryAttempts ?? 0) > 1 ? 'text-[var(--sys-destructive)] font-semibold' : 'text-[var(--sys-muted-foreground)]'}`}>
                      {o._count?.deliveryAttempts ?? 0}
                    </span>
                    {(o._count?.notes ?? 0) > 0 && (
                      <span className="text-[var(--sys-muted)] mr-2" title={`${o._count?.notes} ملاحظة`}>
                        · {o._count?.notes} ملاحظة
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--sys-muted-foreground)]">{COLLECTION_LABEL[o.collectionStatus] ?? o.collectionStatus}</td>
                  <td className="px-3 py-2 tabular-nums" dir="ltr">{o.totalAmount} {o.currency}</td>
                  <td className="px-3 py-2 text-left whitespace-nowrap">
                    {['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.shippingStatus) && (
                      <button
                        onClick={() => setDeliverFor(o)}
                        className="text-xs text-[var(--sys-success)] hover:underline ml-3"
                        title="سجّل ما استلمه العميل فعلاً — كاملاً أو جزئياً"
                      >
                        تسجيل التسليم
                      </button>
                    )}
                    <button
                      onClick={() => setTransferFor(o)}
                      className="text-xs text-[var(--sys-primary)] hover:underline"
                      title={
                        o.deliveryProvider?.kind === 'AGENT'
                          ? 'استلام من المندوب وتحويلها لجهة أخرى'
                          : 'سحب الشحنة وإصدار طلب بديل لجهة أخرى'
                      }
                    >
                      تحويل
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-6 text-center text-sm text-[var(--sys-muted-foreground)]">لا توجد شحنات مطابقة.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {collecting && chosen.length > 0 && (
        <CollectDialog
          orders={chosen}
          onClose={() => setCollecting(false)}
          onDone={async (message) => {
            setCollecting(false);
            setSelected({});
            setDone(message);
            setError(null);
            await load();
          }}
        />
      )}

      {deliverFor && (
        <DeliverDialog
          order={deliverFor}
          onClose={() => setDeliverFor(null)}
          onDone={async (message) => {
            setDeliverFor(null);
            setDone(message);
            setError(null);
            await load();
          }}
        />
      )}

      {transferFor && (
        <TransferDialog
          order={transferFor}
          onClose={() => setTransferFor(null)}
          onDone={async (message) => {
            setTransferFor(null);
            setDone(message);
            setError(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
