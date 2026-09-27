'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAsk } from '@/components/ui/Confirm';
import { apiJson } from '@/lib/api-client';
import { CustomerHistoryButton } from '@/components/orders/CustomerHistory';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { RiAlertLine, RiArrowGoBackLine, RiCloseCircleLine, RiLoader4Line, RiPauseCircleLine, RiTruckLine } from '@remixicon/react';
import { RejectDialog } from '@/components/screens/confirmation/ActionDialogs';
import { DelayShipmentDialog, type DelayChoice } from '@/components/ops/DelayShipmentDialog';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';

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
  /** Why the order can no longer be stood down, from the server's own guard. */
  standDownBlocked: { code: string; message: string } | null;
  shipHoldReason: string | null;
}

export function ShipmentsNewScreen() {
  const ask = useAsk();
  const toast = useToast();
  const confirm = useConfirm();
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  /** The row whose cancellation is being given a reason. */
  const [cancelling, setCancelling] = useState<Row | null>(null);
  /** The row whose delay is being chosen — one dialog, two ways out. */
  const [delaying, setDelaying] = useState<Row | null>(null);
  const [standingDown, setStandingDown] = useState<string | null>(null);
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

  /**
   * THE ORDER STOPS, NOT ONLY THE SHIPMENT.
   *
   * Different from the hold beside it, and the difference is the whole point:
   * a HOLD keeps the order confirmed with its stock reserved, for when we
   * cannot ship today and the customer still wants it. This is for when the
   * ORDER has to stop — the confirmation is undone, the stock goes back on
   * the shelf, and the order returns to the people whose job is talking to
   * customers.
   */
  const standDown = async (
    row: Row,
    body: { outcome: 'POSTPONE'; until: string } | { outcome: 'CANCEL'; reason: string; note: string }
  ) => {
    setStandingDown(row.id);
    try {
      await apiJson('/api/ops/shipments/stand-down', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: row.id, ...body }),
      });
      toast.done(
        body.outcome === 'POSTPONE'
          ? `${row.orderNumber} عاد إلى المتابعة — وبضاعته رجعت للبيع`
          : `${row.orderNumber} أُلغي — وبضاعته رجعت للبيع`
      );
      await load();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذّر التنفيذ');
    } finally {
      setStandingDown(null);
    }
  };

  /**
   * NOT SHIPPING TODAY — and the dialog asked which kind.
   *
   * Both outcomes now carry a date, because the two ways of losing an order
   * on this screen were both dateless: the hold stored the year 2999 when
   * nobody typed one, and «للمتابعة» was a second button saying the same
   * word as the first.
   */
  const delay = async (row: Row, choice: DelayChoice) => {
    setHolding(row.id);
    try {
      if (choice.kind === 'HOLD') {
        await apiJson('/api/ops/shipments/hold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: row.id, until: choice.until, reason: choice.reason }),
        });
        toast.done(`${row.orderNumber} محجوزٌ له حتى ${choice.until.slice(0, 10)}`);
      } else {
        await apiJson('/api/ops/shipments/stand-down', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: row.id,
            outcome: 'POSTPONE',
            until: choice.until,
            note: choice.reason,
          }),
        });
        toast.done(`${row.orderNumber} عاد إلى المتابعة — وبضاعته رجعت للبيع`);
      }
      setDelaying(null);
      await load();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذّر التنفيذ');
    } finally {
      setHolding(null);
    }
  };

  /** Lifting a hold is the only half of it that carries no date. */
  const releaseHold = async (row: Row) => {
    setHolding(row.id);
    try {
      await apiJson('/api/ops/shipments/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: row.id, release: true }),
      });
      await load();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر التنفيذ');
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

  const create = async () => {
    const orderIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (orderIds.length === 0 || !filters.courier) {
      toast.failed('اختر شركة الشحن وطلباً واحداً على الأقل');
      return;
    }
    /**
     * ASKED BEFORE, BECAUSE THERE IS NO AFTER.
     *
     * This books the selected orders with a courier, opens a batch and
     * commits their delivery fees. There is no endpoint that undoes it —
     * the domain forbids deleting a financial record, and a reversal is a
     * separate movement somebody has to write.
     *
     * Every other bulk action that changes money or state in this product
     * asks first (collect, deliver, transfer are all dialogs). This one
     * fired on a single click, and the only thing standing between a
     * mis-tap and thirty booked parcels was the person's own attention.
     *
     * The count and the courier are in the question, because «هل أنت
     * متأكّد» is a question nobody reads.
     */
    const courierName = providers.find((c) => c.id === filters.courier)?.name ?? 'شركة الشحن';
    const ok = await confirm({
      title: `شحن ${orderIds.length} طلباً مع ${courierName}؟`,
      body: 'تُحجز لدى الشركة وتُحمَّل أجورُها، ولا تراجع بعدها — الإلغاء حركةٌ منفصلة.',
      confirmLabel: 'أنشئ الشحنة',
    });
    if (!ok) return;

    setBusy(true);
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
      toast.failed(e instanceof Error ? e.message : 'تعذر إنشاء الشحنة');
    } finally {
      setBusy(false);
    }
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="max-w-5xl space-y-3">
      <ScreenTitle />

      <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 grid gap-3 md:grid-cols-5">
        <Select label="شركة الشحن (للشحنة)" value={filters.courier} onChange={(v) => setFilters({ ...filters, courier: v })} options={providers.map((p) => ({ value: p.id, label: p.name }))} />
        <Select label="المحافظة" value={filters.region} onChange={(v) => setFilters({ ...filters, region: v })} options={regions.map((r) => ({ value: r.id, label: r.name }))} />
        <DateField label="من" value={filters.from} onChange={(v) => setFilters({ ...filters, from: v })} />
        <DateField label="إلى" value={filters.to} onChange={(v) => setFilters({ ...filters, to: v })} />
        <div className="self-end">
          <button
            onClick={create}
            disabled={busy || selectedCount === 0}
            className="w-full h-11 md:h-10 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'جارٍ الإنشاء…' : `إنشاء شحنة (${selectedCount})`}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>}
      {done && <p className="text-sm text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-success)]/30 rounded-lg p-3">{done}</p>}

      {exceptions.length > 0 && (
        <section className="bg-[var(--sys-card)] border border-[var(--sys-destructive-border)] rounded-lg p-4">
          <h3 className="text-sm font-bold text-[var(--sys-destructive)] mb-2">طلبات لم تُشحن ({exceptions.length})</h3>
          <ul className="text-xs text-[var(--sys-foreground)] space-y-1">
            {exceptions.map((e) => (
              <li key={e.orderNumber}>
                <span dir="ltr">{e.orderNumber}</span> — {e.reasons.join(' · ')}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!rows ? (
        <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
          <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (
        <>
        <div className="flex gap-1.5 mb-2">
        {([['ready', 'جاهزة للشحن'], ['held', 'مؤجَّلة']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            className={`min-h-11 md:min-h-0 inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              view === k
                ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] border-[var(--sys-primary)]'
                : 'bg-[var(--sys-card)] text-[var(--sys-foreground)] border-[var(--sys-border)] hover:border-[var(--sys-primary)]/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg overflow-hidden">
          {/* The picking list: seven columns, read on a phone at the
              packing bench. `selection` puts the checkbox where a thumb is
              — in the card's heading — instead of in a first column
              somebody has to aim at. */}
          <Rows
            rows={rows}
            keyOf={(r) => r.id}
            alert={(r) => r.hardBlocked}
            selection={{
              // A hard-blocked order has no checkbox rather than one that
              // refuses: a control that cannot work is worse than none.
              canSelect: (r) => !r.hardBlocked,
              isSelected: (r) => !!selected[r.id],
              onToggle: (r, next) => setSelected({ ...selected, [r.id]: next }),
              onToggleAll: (next) => {
                const all: Record<string, boolean> = {};
                // Select-all skips blocked rows by design.
                for (const row of rows) if (row.selectable) all[row.id] = next;
                setSelected(all);
              },
            }}
            columns={[
              {
                key: 'order',
                label: 'الطلب',
                primary: true,
                render: (r) => (
                  <span className="font-medium text-[var(--sys-heading)]" dir="ltr">{r.orderNumber}</span>
                ),
              },
              {
                key: 'customer',
                label: 'العميل',
                primary: true,
                render: (r) => (
                  <span className="flex items-center gap-2">
                    {r.customer.fullName}
                    <CustomerHistoryButton
                      customerId={r.customer.id}
                      orderId={r.id}
                      previousOrders={r.previousOrders}
                    />
                  </span>
                ),
              },
              { key: 'region', label: 'المحافظة', render: (r) => r.region?.name ?? r.customer.city },
              {
                key: 'cod',
                label: 'تفصيل التحصيل',
                render: (r) => (
                  <span className="text-xs" dir="ltr">
                    {r.cod.subtotal} − {r.cod.discount} + {r.cod.deliveryFee} ={' '}
                    <strong className="tabular-nums">
                      {r.cod.cod} {r.cod.currency}
                    </strong>
                    {r.cod.feeSource === 'NONE' && (
                      <span className="text-[var(--sys-destructive)]"> (بلا أجرة)</span>
                    )}
                  </span>
                ),
              },
              {
                key: 'blocks',
                label: 'تنبيهات',
                render: (r) =>
                  r.blocks.length === 0 ? (
                    <span className="text-xs text-[var(--sys-success)]">جاهز</span>
                  ) : (
                    <span className="block space-y-1">
                      {r.blocks.map((b) => (
                        <span
                          key={b.code}
                          className={`text-xs flex items-center gap-1 ${
                            b.hard ? 'text-[var(--sys-destructive)]' : 'text-[var(--sys-warning)]'
                          }`}
                        >
                          <RiAlertLine className="w-4 h-4" /> {b.message}
                        </span>
                      ))}
                      {!r.hardBlocked && (
                        <label className="flex items-center gap-1 text-xs text-[var(--sys-muted-foreground)]">
                          <input
                            type="checkbox"
                            checked={!!acknowledged[r.id]}
                            onChange={(e) => setAcknowledged({ ...acknowledged, [r.id]: e.target.checked })}
                          />
                          أقرّ بالتنبيه وأتابع
                        </label>
                      )}
                    </span>
                  ),
              },
            ]}
            actions={(r) => (
              <span className="whitespace-nowrap">
                {/*
                  ONE CONTROL FOR «NOT TODAY».
                  There used to be two, «أجّل» and «للمتابعة», and both read
                  as postponing. The first asked for a reason and never a
                  date — a missing date stored the year 2999, so the order
                  left the shipment list and nothing brought it back. The
                  choice between keeping the goods reserved and letting them
                  go is real, but it belongs in a sentence at the moment of
                  choosing, not in two button labels to be decoded first.
                */}
                {view === 'held' ? (
                  <button
                    type="button"
                    onClick={() => void releaseHold(r)}
                    disabled={holding === r.id}
                    title="أعِده إلى قائمة الشحن"
                    className="min-h-11 md:min-h-0 inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-[var(--sys-border)] text-[var(--sys-success)] transition-colors hover:border-[var(--sys-success)] disabled:opacity-50"
                  >
                    {holding === r.id ? (
                      <RiLoader4Line className="w-4 h-4 animate-spin" />
                    ) : (
                      <RiArrowGoBackLine className="icon-mirror w-4 h-4" />
                    )}
                    أرجِعه
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDelaying(r)}
                    disabled={holding === r.id}
                    title="لن يُشحن اليوم — تختار بعدها: تحجز له بضاعته، أم يعود إلى المتابعة"
                    className="min-h-11 md:min-h-0 inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] transition-colors hover:border-[var(--sys-warning)] hover:text-[var(--sys-warning)] disabled:opacity-50"
                  >
                    {holding === r.id ? (
                      <RiLoader4Line className="w-4 h-4 animate-spin" />
                    ) : (
                      <RiPauseCircleLine className="w-4 h-4" />
                    )}
                    أجّل
                  </button>
                )}
                {r.shipHoldReason && (
                  <span
                    className="block text-xs text-[var(--sys-muted)] mt-0.5 max-w-[10rem] truncate"
                    title={r.shipHoldReason}
                  >
                    {r.shipHoldReason}
                  </span>
                )}

                {/* It is over. The reason comes from the same structured list
                    every other cancellation uses — one with no reason is one
                    nothing can be learned from. */}
                {view !== 'held' && (
                  <button
                    type="button"
                    onClick={() => setCancelling(r)}
                    disabled={standingDown === r.id}
                    title="ألغِ الطلب — تعود بضاعتُه للبيع"
                    className="min-h-11 md:min-h-0 ms-1 inline-flex items-center gap-1 rounded-md border border-[var(--sys-border)] px-2 py-1 text-xs text-[var(--sys-muted-foreground)] transition-colors hover:border-[var(--sys-destructive-border)] hover:text-[var(--sys-destructive)] disabled:opacity-50"
                  >
                    <RiCloseCircleLine className="w-4 h-4" aria-hidden />
                    ألغِ
                  </button>
                )}
              </span>
            )}
            empty={
              <EmptyState
                icon={RiTruckLine}
                title="لا طلبات جاهزة للشحن بهذه الفلاتر"
                why="الطلب يصل هنا بعد تأكيده وتجهيزه. إن كنت تنتظر طلباً، فراجع الفلاتر أعلاه أو شاشةَ التجهيز."
              />
            }
          />
        </div>
        </>
      )}

      {/*
        THE SAME REASON DIALOG THE CONFIRMATION TEAM USES.
        Not a second one written here: a cancellation's reason is read by the
        report that says why orders are lost, and two pickers offering two
        lists is how that report comes to compare things that were never the
        same question.
      */}
      {delaying && (
        <DelayShipmentDialog
          orderNumber={delaying.orderNumber}
          busy={holding === delaying.id}
          standDownBlocked={delaying.standDownBlocked}
          onClose={() => setDelaying(null)}
          onChoose={(choice) => void delay(delaying, choice)}
        />
      )}

      <RejectDialog
        open={!!cancelling}
        orderNumber={cancelling?.orderNumber ?? ''}
        busy={standingDown === cancelling?.id}
        onClose={() => setCancelling(null)}
        onSubmit={({ rejectionReason, note }) => {
          const row = cancelling;
          setCancelling(null);
          if (row) void standDown(row, { outcome: 'CANCEL', reason: rejectionReason, note });
        }}
      />
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
      <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-sm"
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
      <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        className="w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-sm"
      />
    </label>
  );
}
