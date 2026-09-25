'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Wallet as WalletIcon } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { apiJson } from '@/lib/api-client';

/**
 * HANDING OVER THE MONEY.
 *
 * Two currencies meet here and they are not one question. The person earned
 * in theirs — an Egyptian moderator counts in pounds. The wallet pays in
 * its own, and there may be no pound wallet at all.
 *
 * So the owner picks the wallet the cash really leaves and writes the rate
 * themselves, and the dialog shows what will leave BEFORE they confirm:
 * a rate typed the wrong way round is the difference between paying ten
 * dinars and paying twenty-four thousand, and it must be visible while it
 * can still be changed.
 */

interface Owed {
  currencyCode: string;
  amount: number;
  entries: string[];
}

interface Wallet {
  id: string;
  name: string;
  currencyCode: string;
}

export function PayoutDialog({
  userId,
  userName,
  onClose,
  onPaid,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [owed, setOwed] = useState<Owed[] | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [pick, setPick] = useState(0);
  const [walletId, setWalletId] = useState('');
  const [rate, setRate] = useState('1');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiJson<{ owed: Owed[]; wallets: Wallet[] }>(`/api/finance/commission/payout?userId=${userId}`)
      .then((d) => {
        setOwed(d.owed ?? []);
        setWallets(d.wallets ?? []);
        if (d.wallets?.length === 1) setWalletId(d.wallets[0].id);
      })
      .catch((e) => { setOwed([]); setError(e instanceof Error ? e.message : 'تعذر التحميل'); });
  }, [userId]);

  const row = owed?.[pick] ?? null;
  const wallet = wallets.find((w) => w.id === walletId) ?? null;
  const sameCurrency = !!wallet && !!row && wallet.currencyCode === row.currencyCode;
  const numericRate = Number(rate);
  // What will actually leave, shown before anything is confirmed.
  const leaving = row && numericRate > 0 ? row.amount * numericRate : null;

  // A wallet of the same currency needs no conversion, and offering one is
  // an invitation to mistype a rate that should be 1.
  useEffect(() => { if (sameCurrency) setRate('1'); }, [sameCurrency]);

  async function pay() {
    if (!row || !wallet) return;
    setSaving(true);
    setError(null);
    try {
      await apiJson('/api/finance/commission/payout', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          walletId: wallet.id,
          entryIds: row.entries,
          exchangeRate: sameCurrency ? 1 : numericRate,
          note: note.trim() || null,
        }),
      });
      onPaid();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الصرف');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`صرف عمولة ${userName}`}>
      {!owed ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[#697586]">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : owed.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#697586]">
          لا عمولة مستحقة لهذا الموظف.
          <span className="mt-1 block text-[11px] text-[#9aa4b2]">
            العمولة تصير مستحقة بعد اعتماد كشف التحصيل الذي يغطّيها.
          </span>
        </p>
      ) : (
        <div className="space-y-3">
          {owed.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#364152]">العملة المستحقة</span>
              <select
                value={pick}
                onChange={(e) => setPick(Number(e.target.value))}
                className="h-10 w-full rounded-[8px] border border-[#e3e8ef] bg-white px-3 text-sm"
              >
                {owed.map((o, i) => (
                  <option key={o.currencyCode} value={i}>
                    {o.amount} {o.currencyCode} · {o.entries.length} قيد
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[10.5px] text-[#9aa4b2]">
                كل عملة تُصرف وحدها — سعر واحد لا يخدم عملتين.
              </span>
            </label>
          )}

          <div className="rounded-[8px] bg-[#f8fafc] px-3 py-2.5">
            <p className="text-[11px] text-[#697586]">المستحق</p>
            <p className="text-lg font-black text-[#121926] tabular-nums" dir="ltr">
              {row?.amount} {row?.currencyCode}
            </p>
            <p className="text-[10.5px] text-[#9aa4b2]">{row?.entries.length} قيد عمولة</p>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#364152]">تُصرف من محفظة</span>
            <select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="h-10 w-full rounded-[8px] border border-[#e3e8ef] bg-white px-3 text-sm"
            >
              <option value="">— اختر المحفظة —</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.currencyCode})</option>
              ))}
            </select>
            {wallets.length === 0 && (
              <span className="mt-1 block text-[11px] text-[#c07f2a]">لا محفظة مفعّلة — أنشئ واحدة أولاً.</span>
            )}
          </label>

          {wallet && !sameCurrency && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#364152]">
                سعر الصرف — كم {wallet.currencyCode} لكل {row?.currencyCode} واحد
              </span>
              <input
                type="number"
                step="0.000001"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="h-10 w-full rounded-[8px] border border-[#e3e8ef] px-3 text-sm"
                dir="ltr"
              />
              <span className="mt-1 block text-[10.5px] text-[#9aa4b2]">
                يُحفظ كما تكتبه ولا يُعاد حسابه — شهر دُفع يبقى كما هو.
              </span>
            </label>
          )}

          {wallet && leaving !== null && (
            <div className="rounded-[8px] border border-[#e3e8ef] px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-[#697586]">
                <WalletIcon className="h-3 w-3" /> سيخرج من «{wallet.name}»
              </p>
              <p className="text-lg font-black text-[#fb323f] tabular-nums" dir="ltr">
                {leaving.toFixed(3)} {wallet.currencyCode}
              </p>
              <p className="text-[10.5px] text-[#9aa4b2]">
                ويُسجَّل مصروفاً على المحفظة، وتُقفل قيود العمولة المدفوعة.
              </p>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#364152]">ملاحظة (اختياري)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="تحويل بنكي، نقداً باليد…"
              className="h-10 w-full rounded-[8px] border border-[#e3e8ef] px-3 text-sm"
            />
          </label>

          {error && <p className="text-sm text-[#fb323f]">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-[8px] border border-[#e3e8ef] px-4 text-sm">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => void pay()}
              disabled={saving || !wallet || (!sameCurrency && !(numericRate > 0))}
              className="h-9 rounded-[8px] bg-[#b8256e] px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'جارٍ الصرف…' : 'صرف'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
