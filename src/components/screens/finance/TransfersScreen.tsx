'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Repeat } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

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
}

interface TransferRow {
  id: string;
  amountOut: number;
  amountIn: number;
  exchangeRate: number;
  note: string | null;
  createdAt: string;
  from: { id: string; name: string; currencyCode: string } | null;
  to: { id: string; name: string; currencyCode: string } | null;
}

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
        apiJson<{ wallets: WalletRow[] }>('/api/finance/wallets'),
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
  const crossCurrency = !!from && !!to && from.currencyCode !== to.currencyCode;
  const amountIn = crossCurrency && rate && amountOut ? Number(amountOut) * Number(rate) : Number(amountOut || 0);

  return (
    <div className="max-w-5xl space-y-3">
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
              }),
            });
            setDone('تم التحويل — سُجِّلت حركتان: صادر من المحفظة الأولى ووارد إلى الثانية');
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
        className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="block text-xs font-medium text-[#364152] mb-1">من محفظة</span>
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm bg-white"
            >
              <option value="">اختر…</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {w.balance} {w.currencyCode}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="block text-xs font-medium text-[#364152] mb-1">إلى محفظة</span>
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm bg-white"
            >
              <option value="">اختر…</option>
              {wallets
                .filter((w) => w.id !== fromId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {w.balance} {w.currencyCode}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="block text-xs font-medium text-[#364152] mb-1">
              المبلغ الصادر {from ? `(${from.currencyCode})` : ''}
            </span>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={amountOut}
              onChange={(e) => setAmountOut(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
              dir="ltr"
            />
          </label>

          {crossCurrency && (
            <label>
              <span className="block text-xs font-medium text-[#364152] mb-1">
                سعر الصرف ({from?.currencyCode} → {to?.currencyCode})
              </span>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
                dir="ltr"
              />
            </label>
          )}
        </div>

        {from && to && amountOut && (
          <p className="text-sm text-[#364152] bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] p-3 flex items-center gap-2 flex-wrap">
            <span className="tabular-nums">{amountOut} {from.currencyCode}</span>
            <ArrowLeft className="w-4 h-4 text-[#9aa4b2]" />
            <span className="tabular-nums font-medium">
              {crossCurrency && !rate ? '— (أدخل سعر الصرف)' : `${amountIn} ${to.currencyCode}`}
            </span>
          </p>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">الملاحظة (إلزامية)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            minLength={3}
            placeholder="سبب التحويل"
            className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[#fb323f]">{error}</p>}
        {done && <p className="text-sm text-[#00a344]">{done}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="h-10 px-4 rounded-[8px] bg-[#b8256e] text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
            تحويل
          </button>
        </div>
      </form>

      <div className="bg-white border border-[#e3e8ef] rounded-[8px] overflow-hidden">
        <h2 className="text-sm font-medium text-[#121926] px-4 py-3 border-b border-[#e3e8ef]">آخر التحويلات</h2>
        {!rows ? (
          <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-12">
            <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[#697586] py-10 text-center">لا تحويلات بعد.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#697586] text-xs">
              <tr>
                <th className="text-right font-medium px-3 py-2">التاريخ</th>
                <th className="text-right font-medium px-3 py-2">من</th>
                <th className="text-right font-medium px-3 py-2">إلى</th>
                <th className="text-right font-medium px-3 py-2">الصادر</th>
                <th className="text-right font-medium px-3 py-2">الوارد</th>
                <th className="text-right font-medium px-3 py-2">السعر</th>
                <th className="text-right font-medium px-3 py-2">الملاحظة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e8ef]">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 text-xs text-[#697586] whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-3 py-2 text-[#364152]">{t.from?.name ?? '—'}</td>
                  <td className="px-3 py-2 text-[#364152]">{t.to?.name ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums text-[#fb323f]">{t.amountOut} {t.from?.currencyCode}</td>
                  <td className="px-3 py-2 tabular-nums text-[#00a344]">{t.amountIn} {t.to?.currencyCode}</td>
                  <td className="px-3 py-2 tabular-nums text-xs text-[#697586]">{t.exchangeRate}</td>
                  <td className="px-3 py-2 text-xs text-[#697586]">{t.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
