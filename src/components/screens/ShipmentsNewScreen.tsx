'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAsk } from '@/components/ui/Confirm';
import { apiJson } from '@/lib/api-client';
import { CustomerHistoryButton } from '@/components/orders/CustomerHistory';
import { ScreenTitle } from '@/components/shell/ScreenTitle';
import { RiAlertLine, RiArrowGoBackLine, RiLoader4Line, RiPauseCircleLine, RiTruckLine } from '@remixicon/react';
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
  shipHoldReason: string | null;
}

export function ShipmentsNewScreen() {
  const ask = useAsk();
  const toast = useToast();
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
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

  /** Hold it back from today's shipment, or put it back in the queue. */
  const toggleHold = async (row: Row) => {
    let reason: string | undefined;
    if (view !== 'held') {
      const answer = await ask({
        title: `تأجيل شحن ${row.orderNumber}؟`,
        body: 'يبقى الطلب خارج دفعات الشحن حتى تُعيده إلى الطابور.',
        confirmLabel: 'أجّل',
        input: { label: 'سبب التأجيل', placeholder: 'اختياري', multiline: true },
      });
      // Cancel means cancel. The browser prompt returned null here and the
      // hold went ahead anyway, only without a reason.
      if (answer === null) return;
      reason = answer || undefined;
    }
    setHolding(row.id);
    try {
      await apiJson('/api/ops/shipments/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          view === 'held'
            ? { orderId: row.id, release: true }
            : { orderId: row.id, reason }
        ),
      });
      await load();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر التأجيل');
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
            className="w-full h-10 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
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
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
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
                {/* Not this week, the customer said. The order is good; it
                    simply must not go out yet — and cancelling it would
                    throw away a sale and free stock he still wants. */}
                <button
                  type="button"
                  onClick={() => toggleHold(r)}
                  disabled={holding === r.id}
                  title={
                    view === 'held'
                      ? 'أعِده إلى قائمة الشحن'
                      : 'أجّله — لن يدخل أي شحنة حتى تُفرج عنه، والبضاعة تبقى محجوزة له'
                  }
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors disabled:opacity-50 ${
                    view === 'held'
                      ? 'border-[var(--sys-border)] text-[var(--sys-success)] hover:border-[var(--sys-success)]'
                      : 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:border-[var(--sys-warning)] hover:text-[var(--sys-warning)]'
                  }`}
                >
                  {holding === r.id ? (
                    <RiLoader4Line className="w-4 h-4 animate-spin" />
                  ) : view === 'held' ? (
                    <RiArrowGoBackLine className="icon-mirror w-4 h-4" />
                  ) : (
                    <RiPauseCircleLine className="w-4 h-4" />
                  )}
                  {view === 'held' ? 'أرجِعه' : 'أجّل'}
                </button>
                {r.shipHoldReason && (
                  <span
                    className="block text-xs text-[var(--sys-muted)] mt-0.5 max-w-[10rem] truncate"
                    title={r.shipHoldReason}
                  >
                    {r.shipHoldReason}
                  </span>
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
