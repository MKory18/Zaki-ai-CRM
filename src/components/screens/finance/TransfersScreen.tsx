'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Repeat } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { readTransfer, transferRefusal, type TransferSide } from '@/lib/transfer-kind';
import { ScreenTitle } from '@/components/shell/ScreenTitle';

/**
 * /finance/transfers — moving money between wallets. One transfer writes two
 * movements in a single transaction, so a transfer can never leave one side
 * recorded and the other not. Across currencies the rate used is stored with
 * the transfer, not recomputed later.
 */

interface WalletRow {
  id: string;
  name: string;
  currencyCode: string;
  isActive: boolean;
  balance: number;
  countryId: string;
  storeId: string | null;
  store: { id: string; name: string } | null;
  country: { id: string; name: string };
}

interface TransferRow {
  id: string;
  amountOut: number;
  amountIn: number;
  exchangeRate: number;
  note: string | null;
  createdAt: string;
  kindLabel?: string;
  from: { id: string; name: string; currencyCode: string; store?: { name: string } | null } | null;
  to: { id: string; name: string; currencyCode: string; store?: { name: string } | null } | null;
}

/** A wallet row, as the reader of the three transfer kinds needs it. */
const asSide = (w: WalletRow): TransferSide => ({
  id: w.id,
  name: w.name,
  currencyCode: w.currencyCode,
  storeId: w.storeId,
  countryId: w.countryId,
  storeName: w.store?.name ?? null,
  countryName: w.country?.name ?? null,
});

export function TransfersScreen() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [rows, setRows] = useState<TransferRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([
        // Every wallet in the company: a transfer between stores, or
        // between countries, has to see both ends of itself.
        apiJson<{ wallets: WalletRow[] }>('/api/finance/wallets?scope=transfer'),
        apiJson<{ transfers: TransferRow[] }>('/api/finance/transfers'),
      ]);
      setWallets(w.wallets.filter((x) => x.isActive));
      setRows(t.transfers);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const from = wallets.find((w) => w.id === fromId);
  const to = wallets.find((w) => w.id === toId);

  /**
   * The wallets grouped the way the money is actually arranged: country,
   * then store, then the wallets in it. The picker is the only place this
   * shape needs to exist — it makes which of the three transfers you are
   * about to do visible before you have chosen anything.
   */
  const grouped = wallets.reduce<Map<string, Map<string, WalletRow[]>>>((acc, w) => {
    const country = w.country?.name ?? '—';
    const store = w.store?.name ?? 'بلا متجر';
    if (!acc.has(country)) acc.set(country, new Map());
    const byStore = acc.get(country)!;
    if (!byStore.has(store)) byStore.set(store, []);
    byStore.get(store)!.push(w);
    return acc;
  }, new Map());

  const options = (exclude?: string) =>
    [...grouped].map(([country, byStore]) =>
      [...byStore].map(([store, ws]) => {
        const shown = ws.filter((w) => w.id !== exclude);
        if (shown.length === 0) return null;
        return (
          <optgroup key={`${country}/${store}`} label={`${country} · ${store}`}>
            {shown.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} — {w.balance} {w.currencyCode}
              </option>
            ))}
          </optgroup>
        );
      })
    );

  /** What this pair of wallets IS. Read here, and checked again server-side. */
  const reading = from && to ? readTransfer(asSide(from), asSide(to)) : null;
  const refusal = from && to ? transferRefusal(asSide(from), asSide(to)) : null;
  const crossCurrency = !!reading?.needsRate;
  const amountIn = crossCurrency && rate && amountOut ? Number(amountOut) * Number(rate) : Number(amountOut || 0);

  return (
    <div className="max-w-5xl space-y-3">
      <ScreenTitle />

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          setDone(null);
          try {
            await apiJson('/api/finance/transfers', {
              method: 'POST',
              body: JSON.stringify({
                fromWalletId: fromId,
                toWalletId: toId,
                amountOut: Number(amountOut),
                ...(crossCurrency ? { exchangeRate: Number(rate) } : {}),
                note: note.trim(),
                // What the screen told the person they were doing. If the
                // server reads it differently, it refuses rather than
                // recording something nobody can explain later.
                expectKind: reading?.kind,
              }),
            });
            setDone(`تم ${reading?.label ?? 'التحويل'} — سُجِّلت حركتان: صادر من الأولى ووارد إلى الثانية`);
            setAmountOut('');
            setRate('');
            setNote('');
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر التحويل');
          } finally {
            setSaving(false);
          }
        }}
        className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-4 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">من محفظة</span>
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm bg-[var(--sys-card)]"
            >
              <option value="">اختر…</option>
              {options(toId)}
            </select>
          </label>

          <label>
            <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">إلى محفظة</span>
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm bg-[var(--sys-card)]"
            >
              <option value="">اختر…</option>
              {options(fromId)}
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">
              المبلغ الصادر {from ? `(${from.currencyCode})` : ''}
            </span>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={amountOut}
              onChange={(e) => setAmountOut(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm"
              dir="ltr"
            />
          </label>

          {crossCurrency && (
            <label>
              <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">
                سعر الصرف ({from?.currencyCode} → {to?.currencyCode})
              </span>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm"
                dir="ltr"
              />
            </label>
          )}
        </div>

        {from && to && amountOut && (
          <p className="text-sm text-[var(--sys-foreground)] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-[8px] p-3 flex items-center gap-2 flex-wrap">
            <span className="tabular-nums">{amountOut} {from.currencyCode}</span>
            <ArrowLeft className="w-4 h-4 text-[var(--sys-muted)]" />
            <span className="tabular-nums font-medium">
              {crossCurrency && !rate ? '— (أدخل سعر الصرف)' : `${amountIn} ${to.currencyCode}`}
            </span>
          </p>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">الملاحظة (إلزامية)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            minLength={3}
            placeholder="سبب التحويل"
            className="w-full h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}
        {done && <p className="text-sm text-[var(--sys-success)]">{done}</p>}

        <div className="flex justify-end">
          {/* What you are about to do, said before you do it. The three
              transfers are three different acts — one crosses two sets of
              books, one crosses a currency as well — so the screen names the
              one in front of you rather than making you pick it first. */}
          {reading && !refusal && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] px-3 py-2">
              <span className="rounded-full bg-[var(--sys-primary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--sys-primary-foreground)]">
                {reading.label}
              </span>
              <span className="text-xs text-[var(--sys-foreground)]">{reading.detail}</span>
            </div>
          )}

          {refusal && (
            <p className="rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] px-3 py-2 text-xs text-[var(--sys-destructive)]">
              {refusal}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !!refusal}
            className="h-10 px-4 rounded-[8px] bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
            تحويل
          </button>
        </div>
      </form>

      <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] overflow-hidden">
        <h2 className="text-sm font-medium text-[var(--sys-heading)] px-4 py-3 border-b border-[var(--sys-border)]">آخر التحويلات</h2>
        {!rows ? (
          <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-12">
            <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--sys-muted-foreground)] py-10 text-center">لا تحويلات بعد.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
              <tr>
                <th className="text-right font-medium px-3 py-2">التاريخ</th>
                <th className="text-right font-medium px-3 py-2">النوع</th>
                <th className="text-right font-medium px-3 py-2">من</th>
                <th className="text-right font-medium px-3 py-2">إلى</th>
                <th className="text-right font-medium px-3 py-2">الصادر</th>
                <th className="text-right font-medium px-3 py-2">الوارد</th>
                <th className="text-right font-medium px-3 py-2">السعر</th>
                <th className="text-right font-medium px-3 py-2">الملاحظة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sys-border)]">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)] whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  {/* As RECORDED, not re-read now: a wallet moved to another
                      store since must not change what this transfer was. */}
                  <td className="px-3 py-2">
                    <span className="rounded-full border border-[var(--sys-border)] bg-[var(--sys-surface)] px-2 py-0.5 text-[10px] text-[var(--sys-foreground)] whitespace-nowrap">
                      {t.kindLabel ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[var(--sys-foreground)]">
                    {t.from?.name ?? '—'}
                    {t.from?.store && (
                      <span className="block text-[10px] text-[var(--sys-muted)]">{t.from.store.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--sys-foreground)]">
                    {t.to?.name ?? '—'}
                    {t.to?.store && (
                      <span className="block text-[10px] text-[var(--sys-muted)]">{t.to.store.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[var(--sys-destructive)]">{t.amountOut} {t.from?.currencyCode}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--sys-success)]">{t.amountIn} {t.to?.currencyCode}</td>
                  <td className="px-3 py-2 tabular-nums text-xs text-[var(--sys-muted-foreground)]">{t.exchangeRate}</td>
                  <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)]">{t.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
