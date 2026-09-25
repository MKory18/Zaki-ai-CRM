'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, Loader2, Wallet } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';

/**
 * WHAT THIS PERSON IS PAID, AND PAYING IT.
 *
 * The deductions had nowhere to go until this screen existed: rows saying
 * somebody owed the business forty pounds, and no moment at which those
 * forty pounds were ever taken. This is that moment, and the arithmetic is
 * printed in full before anybody presses anything — salary, what is being
 * deducted, and what is actually handed over.
 *
 * The two numbers that matter most are the ones nobody would think to ask
 * for: what did NOT fit inside the wage and stays owed for next month, and
 * what actually leaves the wallet after the rate is applied. A person
 * paying a salary in a currency the business does not hold is entitled to
 * see both before committing.
 */

interface Preview {
  salary: number;
  currencyCode: string;
  penaltyTotal: number;
  net: number;
  carriedOver: number;
  penaltyIds: string[];
  otherCurrency: { currencyCode: string; amount: number }[];
}

interface Data {
  period: { start: string; end: string; paid: { id: string; netAmount: number; createdAt: string } | null };
  preview: Preview;
  commission: { currencyCode: string; amount: number }[];
  wallets: WalletRow[];
}

interface WalletRow {
  id: string;
  name: string;
  currencyCode: string;
}

const FIELD =
  'h-9 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-2 text-xs text-[var(--sys-foreground)] outline-none focus:border-[var(--sys-primary)]';

function Line({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className={`text-[11px] ${warn ? 'text-[var(--sys-warning)]' : 'text-[var(--sys-muted-foreground)]'}`}>{label}</span>
      <span
        className={`tabular-nums ${strong ? 'text-sm font-bold text-[var(--sys-heading)]' : 'text-xs text-[var(--sys-foreground)]'}`}
        dir="ltr"
      >
        {value}
      </span>
    </div>
  );
}

export function UserSalary({
  userId,
  initial,
  canEdit,
  canPay,
}: {
  userId: string;
  initial: { salaryAmount: number | null; salaryCurrency: string | null };
  canEdit: boolean;
  canPay: boolean;
}) {
  const [amount, setAmount] = useState(initial.salaryAmount === null ? '' : String(initial.salaryAmount));
  const [currency, setCurrency] = useState(initial.salaryCurrency ?? '');
  const [saved, setSaved] = useState(`${initial.salaryAmount ?? ''}|${initial.salaryCurrency ?? ''}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [paying, setPaying] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [walletId, setWalletId] = useState('');
  const [rate, setRate] = useState('1');
  const [payError, setPayError] = useState<string | null>(null);

  const current = `${amount}|${currency.toUpperCase()}`;
  const changed = current !== saved;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateContact',
          salaryAmount: amount === '' ? null : Number(amount),
          salaryCurrency: currency.trim().toUpperCase(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذّر الحفظ');
      setSaved(current);
      setMsg({ ok: true, text: 'حُفظ.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحفظ' });
    } finally {
      setBusy(false);
    }
  };

  const openPay = useCallback(async () => {
    setPaying(true);
    setPayError(null);
    setData(null);
    try {
      const slip = await apiJson<Data>(`/api/payroll/payslip?userId=${userId}`);
      setData(slip);
      setWallets(slip.wallets ?? []);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'تعذّر التحميل');
    }
  }, [userId]);

  const wallet = wallets.find((w) => w.id === walletId);
  // Same currency both sides needs no rate, and offering one there is how a
  // salary gets multiplied by a number somebody typed out of habit.
  const sameCurrency = !!wallet && !!data && wallet.currencyCode === data.preview.currencyCode;
  const effectiveRate = sameCurrency ? 1 : Number(rate);
  const leaves = data && effectiveRate > 0 ? data.preview.net * effectiveRate : null;

  const pay = async () => {
    if (!data || !walletId) return;
    setBusy(true);
    setPayError(null);
    try {
      await apiJson('/api/payroll/payslip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, walletId, exchangeRate: effectiveRate }),
      });
      setPaying(false);
      setMsg({ ok: true, text: 'صُرف الراتب.' });
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'تعذّر الصرف');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col-span-full rounded-lg bg-[var(--sys-surface)] px-3 py-2.5">
      <p className="mb-1.5 flex items-center gap-1 text-[10px] text-[var(--sys-muted)]">
        <Banknote className="h-3 w-3" /> الراتب
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[10px] text-[var(--sys-muted-foreground)]">المبلغ</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            disabled={!canEdit}
            onChange={(e) => setAmount(e.target.value)}
            className={`${FIELD} w-28`}
            dir="ltr"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] text-[var(--sys-muted-foreground)]">العملة</span>
          <input
            value={currency}
            disabled={!canEdit}
            maxLength={3}
            placeholder="EGP"
            onChange={(e) => setCurrency(e.target.value)}
            className={`${FIELD} w-20`}
            dir="ltr"
          />
        </label>

        {canEdit && (
          <button
            type="button"
            onClick={save}
            disabled={busy || !changed}
            className="h-9 rounded-lg bg-[var(--sys-primary)] px-3 text-xs font-medium text-[var(--sys-primary-foreground)] disabled:opacity-50"
          >
            {busy ? 'جارٍ…' : 'احفظ'}
          </button>
        )}

        {canPay && initial.salaryAmount !== null && (
          <button
            type="button"
            onClick={openPay}
            className="flex h-9 items-center gap-1 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 text-xs text-[var(--sys-foreground)]"
          >
            <Wallet className="h-3.5 w-3.5" /> اصرف الراتب
          </button>
        )}
      </div>

      {!amount && (
        <p className="mt-1 text-[10px] text-[var(--sys-muted)]">
          لا راتب مسجّل. الخصومات المعتمدة تبقى مستحقة ولا تُطرح من شيء حتى يُسجَّل راتب.
        </p>
      )}
      {msg && <p className={`mt-1 text-[10px] ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>{msg.text}</p>}

      {paying && (
        <Modal isOpen onClose={() => setPaying(false)} title="صرف الراتب" maxWidth="md">
          {!data && !payError && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--sys-muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ الحساب…
            </p>
          )}
          {payError && <p className="text-sm text-[var(--sys-destructive)]">{payError}</p>}

          {data && (
            <div className="space-y-3" dir="rtl">
              <p className="text-[11px] text-[var(--sys-muted-foreground)]">
                الفترة{' '}
                <span dir="ltr" className="tabular-nums">
                  {data.period.start.slice(0, 10)} ← {data.period.end.slice(0, 10)}
                </span>
              </p>

              {data.period.paid && (
                <p className="rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] p-2 text-[11px] text-[var(--sys-destructive)]">
                  صُرف راتب هذه الفترة من قبل. شهرٌ يُصرف مرتين هو شهرٌ يُصرف مرتين.
                </p>
              )}

              <div className="divide-y divide-[var(--sys-border)] rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3">
                <Line label="الراتب" value={`${data.preview.salary} ${data.preview.currencyCode}`} />
                <Line label="خصومات مطروحة" value={`− ${data.preview.penaltyTotal}`} />
                <Line label="الصافي" value={`${data.preview.net} ${data.preview.currencyCode}`} strong />
                {data.preview.carriedOver > 0 && (
                  <Line
                    label="خصومات لم تتّسع — تبقى مستحقة للشهر القادم"
                    value={`${data.preview.carriedOver}`}
                    warn
                  />
                )}
                {data.preview.otherCurrency.map((o) => (
                  <Line
                    key={o.currencyCode}
                    label={`خصومات بعملة ${o.currencyCode} — لا تُطرح من راتب بعملة أخرى`}
                    value={`${o.amount}`}
                    warn
                  />
                ))}
              </div>

              {data.commission.length > 0 && (
                <p className="text-[11px] text-[var(--sys-muted-foreground)]">
                  وله عمولة مستحقة لم تُصرف:{' '}
                  {data.commission.map((c) => (
                    <span key={c.currencyCode} className="ms-1 tabular-nums text-[var(--sys-heading)]" dir="ltr">
                      {c.amount} {c.currencyCode}
                    </span>
                  ))}{' '}
                  — تُصرف من شاشة العمولات بزرّها.
                </p>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <label className="block">
                  <span className="mb-0.5 block text-[10px] text-[var(--sys-muted-foreground)]">من محفظة</span>
                  <select value={walletId} onChange={(e) => setWalletId(e.target.value)} className={`${FIELD} w-40`}>
                    <option value="">اختر…</option>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.currencyCode})
                      </option>
                    ))}
                  </select>
                </label>
                {!sameCurrency && (
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] text-[var(--sys-muted-foreground)]">
                      سعر الصرف ({wallet?.currencyCode ?? '؟'} لكل {data.preview.currencyCode})
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.000001"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      className={`${FIELD} w-28`}
                      dir="ltr"
                    />
                  </label>
                )}
              </div>

              {leaves !== null && wallet && (
                <p className="rounded-lg bg-[var(--sys-surface)] px-2 py-1.5 text-[11px] text-[var(--sys-foreground)]">
                  يخرج من المحفظة{' '}
                  <span className="font-semibold tabular-nums" dir="ltr">
                    {leaves.toFixed(3)} {wallet.currencyCode}
                  </span>
                  {!sameCurrency && ' — بالسعر الذي كتبته أنت، ويُحفظ ولا يُعاد حسابه.'}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !walletId || !(effectiveRate > 0) || !!data.period.paid || data.preview.net <= 0}
                  onClick={pay}
                  className="rounded-lg bg-[var(--sys-primary)] px-4 py-2 text-xs font-medium text-[var(--sys-primary-foreground)] disabled:opacity-50"
                >
                  {busy ? 'جارٍ…' : 'اصرف'}
                </button>
                <button
                  type="button"
                  onClick={() => setPaying(false)}
                  className="rounded-lg border border-[var(--sys-border)] px-4 py-2 text-xs text-[var(--sys-muted-foreground)]"
                >
                  تراجع
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
