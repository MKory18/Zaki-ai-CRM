'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { HandCoins } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';

/**
 * "استلمت منه" — settling a مندوب, or a company that sends no file, by hand.
 *
 * There is no statement to import and no barcode to match on for these, so
 * settlement is a person naming the orders and the wallet. It is still the
 * same gate: the wallet movement is written on confirm and nowhere earlier,
 * and the amount defaults to the NET — what the courier hands over after
 * keeping their fee — rather than the COD the customer paid.
 */

interface Row {
  id: string;
  orderNumber: string;
  totalAmount: number;
  currency: string;
  deliveryFee?: number | null;
  customer: { fullName: string };
  deliveryProvider: { id: string; name: string; kind?: string } | null;
}

export function CollectDialog({
  orders,
  onClose,
  onDone,
}: {
  orders: Row[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [wallets, setWallets] = useState<{ id: string; name: string; currencyCode: string }[]>([]);
  const [walletId, setWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currency = orders[0]?.currency ?? '';
  const expected = useMemo(
    () =>
      Number(
        orders
          .reduce((sum, o) => sum + (Number(o.totalAmount) - Number(o.deliveryFee ?? 0)), 0)
          .toFixed(3)
      ),
    [orders]
  );

  useEffect(() => {
    apiJson<{ wallets: { id: string; name: string; currencyCode: string }[] }>('/api/finance/wallets')
      .then((d) => {
        const usable = d.wallets.filter((w) => w.currencyCode === currency);
        setWallets(usable);
        if (usable.length === 1) setWalletId(usable[0].id);
      })
      .catch(() => undefined);
  }, [currency]);

  const party = orders[0]?.deliveryProvider?.name ?? '—';
  const entered = amount === '' ? expected : Number(amount);
  const difference = Number((entered - expected).toFixed(3));

  return (
    <Modal isOpen onClose={onClose} title="استلام المبلغ" subtitle={`${party} · ${orders.length} طلب`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            const res = await apiJson<{ message: string }>('/api/ops/tracking/collect', {
              method: 'POST',
              body: JSON.stringify({
                orderIds: orders.map((o) => o.id),
                walletId,
                ...(amount !== '' ? { amount: Number(amount) } : {}),
                note: note.trim(),
              }),
            });
            onDone(res.message);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذّر التسجيل');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <div className="text-xs bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] p-3 space-y-1">
          <p className="text-[#364152]">
            المتوقَّع منه: <b className="tabular-nums">{expected} {currency}</b>
          </p>
          <p className="text-[#9aa4b2]">
            وهو صافي ما يسلّمه بعد خصم أجرة التوصيل، لا المبلغ الذي دفعه العميل.
          </p>
        </div>

        <div className="max-h-32 overflow-y-auto border border-[#e3e8ef] rounded-[8px] divide-y divide-[#e3e8ef]">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
              <span className="text-[#364152]">{o.orderNumber} · {o.customer.fullName}</span>
              <span className="tabular-nums text-[#697586]">
                {Number(o.totalAmount) - Number(o.deliveryFee ?? 0)}
              </span>
            </div>
          ))}
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">المحفظة التي دخل إليها المبلغ</span>
          <select
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm bg-white"
          >
            <option value="">اختر…</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name} — {w.currencyCode}</option>
            ))}
          </select>
          {wallets.length === 0 && (
            <span className="block text-[11px] text-[#fb323f] mt-1">
              لا توجد محفظة بعملة {currency} — أنشئ واحدة أولاً.
            </span>
          )}
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">
            المبلغ المستلم فعلياً (اتركه فارغاً إن كان مطابقاً)
          </span>
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={String(expected)}
            className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
            dir="ltr"
          />
          {difference !== 0 && (
            <span className="block text-[11px] text-[#fb323f] mt-1 tabular-nums">
              فارق {difference} عن المتوقَّع — سيُسجَّل كما هو.
            </span>
          )}
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">الملاحظة (إلزامية)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            minLength={3}
            placeholder="مثال: استلمت نقداً من المندوب"
            className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[#fb323f]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-[8px] border border-[#e3e8ef] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving || !walletId}
            className="h-9 px-4 rounded-[8px] bg-[#00a344] text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <HandCoins className="w-4 h-4" />
            {saving ? 'جارٍ التسجيل…' : 'استلمت منه'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
