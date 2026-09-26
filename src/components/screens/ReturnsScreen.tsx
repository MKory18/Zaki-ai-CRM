'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { ScanButton } from '@/components/scan/ScanButton';
import { RiInboxUnarchiveLine, RiQrScan2Line } from '@remixicon/react';
import { useToast } from '@/components/ui/Toast';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';

/**
 * /ops/returns — scan or pick a returned shipment, then record the physical
 * receipt. Missing units are computed by the server, and nothing enters stock
 * before the count-and-inspect acknowledgement.
 */

interface Row {
  id: string;
  orderNumber: string;
  merchantRef: string | null;
  trackingNumber: string | null;
  shippingStatus: string;
  returnReason: string | null;
  expectedQty: number;
  customer: { fullName: string; phone?: string | null };
  region: { name: string } | null;
  deliveryProvider: { name: string } | null;
  items: { productName: string; quantity: number; freeQuantity: number }[];
}

export function ReturnsScreen() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const raw = term.trim();
      const q = raw ? `?q=${encodeURIComponent(raw)}` : '';
      const data = await apiJson<{ orders: Row[] }>(`/api/ops/returns${q}`);
      setRows(data.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [term]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-5xl space-y-3">
      <ScreenTitle />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 flex gap-3 items-end"
      >
        <label className="flex-1">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">امسح الباركود أو اكتب المرجع</span>
          <div className="relative">
            <RiQrScan2Line className="w-4 h-4 text-[var(--sys-muted)] absolute right-3 top-3" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              autoFocus
              placeholder="امسح الباركود هنا"
              className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--sys-border)] text-sm"
              dir="ltr"
            />
          </div>
        </label>
        <button type="submit" className="h-10 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium">بحث</button>
        {/* A phone is the scanner a warehouse already owns. It keeps
            scanning: a returned pallet is twenty parcels, not one. */}
        <ScanButton
          title="امسح بوليصة المرتجع"
          continuous
          onScan={(code) => {
            // Putting it in the box IS the search — the effect below
            // already reloads whenever the term changes, so there is one
            // request and one code path, the same one a typed search takes.
            setTerm(code);
            return code;
          }}
        />
      </form>

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>}
      {done && <p className="text-sm text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-success)]/30 rounded-lg p-3">{done}</p>}

      {!rows ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-3">
          {/* A returns clerk reads this at the door with a parcel in one
              hand. Six columns on a phone is unreadable; the card leads
              with the reference on the label and whose parcel it is. */}
          <Rows
            rows={rows}
            keyOf={(r) => r.id}
            columns={[
              {
                key: 'ref',
                label: 'المرجع',
                primary: true,
                render: (r) => (
                  <span className="font-medium text-[var(--sys-heading)]" dir="ltr">
                    {r.merchantRef ?? r.orderNumber}
                  </span>
                ),
              },
              { key: 'customer', label: 'العميل', primary: true, render: (r) => r.customer.fullName },
              { key: 'courier', label: 'شركة الشحن', render: (r) => r.deliveryProvider?.name ?? '—' },
              { key: 'reason', label: 'السبب', render: (r) => r.returnReason ?? '—' },
              {
                key: 'qty',
                label: 'المشحون',
                align: 'end',
                render: (r) => <span className="tabular-nums">{r.expectedQty}</span>,
              },
            ]}
            actions={(r) => (
              <button
                onClick={() => setActive(r)}
                className="text-xs font-semibold text-[var(--sys-primary)] hover:underline"
              >
                استلام
              </button>
            )}
            empty={
              <EmptyState
                icon={RiInboxUnarchiveLine}
                title="لا مرتجعات بانتظار الاستلام"
                why="المرتجع يظهر هنا حين تُعلن شركةُ الشحن فشلَ التسليم أو إرجاعَ الطرد. فراغُ القائمة يعني أنّ لا طردَ في طريق العودة."
              />
            }
          />
        </div>
      )}

      {active && (
        <ReceiveDialog
          order={active}
          onClose={() => setActive(null)}
          onDone={async (message) => {
            setActive(null);
            setDone(message);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ReceiveDialog({
  order,
  onClose,
  onDone,
}: {
  order: Row;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const toast = useToast();
  const [received, setReceived] = useState(order.expectedQty);
  const [damaged, setDamaged] = useState(0);
  const [courierFee, setCourierFee] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = Math.max(0, order.expectedQty - received - damaged);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiJson<{ missingQty: number; courierFeeAmount: number }>('/api/ops/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          receivedQty: received,
          damagedQty: damaged,
          countedAndInspected: acknowledged,
          chargeCourierFee: courierFee,
          note: note || undefined,
        }),
      });
      onDone(
        `تم استلام ${order.merchantRef ?? order.orderNumber}: سليم ${received}، تالف ${damaged}، ناقص ${res.missingQty}` +
          (res.courierFeeAmount ? ` — أجرة إرجاع ${res.courierFeeAmount}` : '')
      );
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر حفظ الاستلام');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="استلام مرتجع" subtitle={order.merchantRef ?? order.orderNumber} maxWidth="sm">
      <form onSubmit={submit} className="space-y-3">
        {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-2">{error}</p>}

        <ul className="text-xs text-[var(--sys-muted-foreground)] bg-[var(--sys-surface)] rounded-lg p-2 space-y-0.5">
          {order.items.map((i, idx) => (
            <li key={idx}>
              {i.productName} × {i.quantity + i.freeQuantity}
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-3 gap-3">
          <Num label="سليم" value={received} onChange={setReceived} max={order.expectedQty} />
          <Num label="تالف" value={damaged} onChange={setDamaged} max={order.expectedQty} />
          <div>
            <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">ناقص (محسوب)</span>
            <p className={`h-10 flex items-center px-3 rounded-lg border text-sm tabular-nums ${missing > 0 ? 'border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)]' : 'border-[var(--sys-border)] bg-[var(--sys-surface)] text-[var(--sys-foreground)]'}`} dir="ltr">
              {missing}
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--sys-foreground)]">
          <input type="checkbox" checked={courierFee} onChange={(e) => setCourierFee(e.target.checked)} />
          احتساب أجرة إرجاع لشركة الشحن (تُؤخذ من جدول الأجور)
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">ملاحظة (اختياري)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm" />
        </label>

        <label className="flex items-start gap-2 text-sm text-[var(--sys-heading)] bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/30 rounded-lg p-2">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1" />
          <span>أقرّ بأنني عددت البضاعة وفحصتها. لا تدخل البضاعة للمخزون قبل هذا الإقرار.</span>
        </label>

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={busy || !acknowledged} className="px-4 py-2 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50">
            {busy ? 'جارٍ الحفظ…' : 'تأكيد الاستلام'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-[var(--sys-border)] text-sm text-[var(--sys-muted-foreground)]">إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}

function Num({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value))))}
        dir="ltr"
        className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
      />
    </label>
  );
}
