'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RotateCcw, Wallet as WalletIcon, Pencil, Trash2, Power, Check, X} from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/Confirm';
import { ScreenTitle } from '@/components/shell/ScreenTitle';

/**
 * /finance/wallets — balances and the movement ledger. A recorded movement is
 * never edited or deleted: the only correction is a reversing entry that
 * carries a reason and stays linked to the original, so both lines remain
 * visible forever.
 */

interface WalletRow {
  id: string;
  name: string;
  currencyCode: string;
  isActive: boolean;
  opening: number;
  in: number;
  out: number;
  balance: number;
  movements: number;
  country: { id: string; name: string } | null;
}

interface Movement {
  id: string;
  direction: 'IN' | 'OUT';
  amount: number;
  party: string;
  category: string;
  note: string | null;
  reversalReason: string | null;
  createdAt: string;
  createdByName: string | null;
  isReversal: boolean;
  wasReversed: boolean;
}

const CATEGORY_AR: Record<string, string> = {
  COURIER_SETTLEMENT: 'تحصيل شركة شحن',
  COMMISSION: 'عمولة',
  EXPENSE: 'مصروف',
  TRANSFER_IN: 'تحويل وارد',
  TRANSFER_OUT: 'تحويل صادر',
  ADJUSTMENT: 'تسوية',
  OTHER: 'أخرى',
};

export function WalletsScreen() {
  const ask = useConfirm();
  const [wallets, setWallets] = useState<WalletRow[] | null>(null);
  const [active, setActive] = useState<string>('');
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reverseFor, setReverseFor] = useState<Movement | null>(null);

  const loadWallets = useCallback(async () => {
    try {
      const data = await apiJson<{ wallets: WalletRow[] }>('/api/finance/wallets');
      setWallets(data.wallets);
      setActive((current) => current || data.wallets[0]?.id || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  const loadMovements = useCallback(async (id: string) => {
    if (!id) return;
    setMovements(null);
    try {
      const data = await apiJson<{ movements: Movement[] }>(`/api/finance/wallets/${id}/movements`);
      setMovements(data.movements);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    void loadMovements(active);
  }, [active, loadMovements]);

  const wallet = wallets?.find((w) => w.id === active) ?? null;

  async function refresh(message: string) {
    setDone(message);
    await Promise.all([loadWallets(), loadMovements(active)]);
  }

  const patchWallet = async (body: Record<string, unknown>, ok: string) => {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await apiJson(`/api/finance/wallets/${wallet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setDone(ok);
      setRenaming(false);
      await loadWallets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Delete asks the server, which decides. A wallet any money has passed
   * through is stopped instead and says what is holding it — its movements
   * ARE the ledger, and there is nothing to re-enter.
   */
  const removeWallet = async () => {
    if (!wallet) return;
    const ok = await ask({
      title: `حذف «${wallet.name}»؟`,
      body: 'إن مرّ بها أي مبلغ فستُوقَف بدل الحذف، والسجلّات تبقى كما هي.',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const d = await apiJson<{ message?: string; deleted?: boolean }>(
        `/api/finance/wallets/${wallet.id}`,
        { method: 'DELETE' }
      );
      setDone(d.message ?? null);
      if (d.deleted) setActive('');
      await loadWallets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحذف');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl space-y-3">
      <ScreenTitle />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--sys-muted-foreground)]">
          المحفظة تتبع متجراً واحداً وتحمل عملته. حركاتها سجل دائم: ما مرّ بها مبلغ يُوقَف
          ولا يُحذف — ولا يُحذف فعلياً إلا ما لم يمرّ به شيء.
        </p>
        <button
          onClick={() => setCreating(true)}
          className="h-10 px-3 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> محفظة جديدة
        </button>
      </div>

      {!wallets ? (
        <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : wallets.length === 0 ? (
        <p className="text-sm text-[var(--sys-muted-foreground)] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-6 text-center">
          <WalletIcon className="w-5 h-5 mx-auto mb-2 text-[var(--sys-muted)]" />
          لا توجد محافظ بعد — أنشئ واحدة من الزر أعلاه.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wallets.map((w) => (
              <button
                key={w.id}
                onClick={() => setActive(w.id)}
                className={`text-right bg-[var(--sys-card)] border rounded-lg p-4 transition ${
                  w.id === active ? 'border-[var(--sys-primary)] ring-1 ring-[var(--sys-primary)]/20' : 'border-[var(--sys-border)]'
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--sys-heading)]">{w.name}</span>
                  {!w.isActive && <span className="text-caption text-[var(--sys-muted)] border border-[var(--sys-border)] rounded-full px-2 py-0.5">موقوفة</span>}
                </span>
                <span className="block text-2xl font-semibold text-[var(--sys-heading)] tabular-nums mt-2">
                  {w.balance} <span className="text-sm font-normal text-[var(--sys-muted-foreground)]">{w.currencyCode}</span>
                </span>
                <span className="block text-xs text-[var(--sys-muted-foreground)] mt-1 tabular-nums">
                  افتتاحي {w.opening} · وارد {w.in} · صادر {w.out}
                </span>
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>}
          {done && <p className="text-sm text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-success)]/30 rounded-lg p-3">{done}</p>}

          <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg overflow-hidden">
            {/* The wallet's own actions live here, on the one that is
                selected — not repeated on every card, where they would be
                twelve buttons for one decision. */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--sys-border)]">
              {renaming && wallet ? (
                <span className="flex items-center gap-1.5">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-8 w-44 rounded-lg border border-[var(--sys-border)] px-2 text-sm"
                  />
                  <button
                    onClick={() => patchWallet({ name: newName.trim() }, 'تم تغيير الاسم')}
                    disabled={busy || newName.trim().length < 2}
                    title="احفظ"
                    className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-success)] hover:bg-[var(--sys-success-soft)] disabled:opacity-40"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setRenaming(false)}
                    title="ألغِ"
                    className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </span>
              ) : (
                <h2 className="text-sm font-medium text-[var(--sys-heading)]">حركات {wallet?.name ?? ''}</h2>
              )}

              <span className="flex items-center gap-1.5">
                {wallet && !renaming && (
                  <>
                    <button
                      onClick={() => { setRenaming(true); setNewName(wallet.name); }}
                      title="عدّل الاسم"
                      className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-primary)]"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        patchWallet(
                          { isActive: !wallet.isActive },
                          wallet.isActive ? 'أُوقِفت المحفظة' : 'أُعيد تشغيل المحفظة'
                        )
                      }
                      disabled={busy}
                      title={wallet.isActive ? 'أوقف المحفظة' : 'أعِد تشغيلها'}
                      className={`cursor-pointer rounded-lg p-1.5 disabled:opacity-40 ${
                        wallet.isActive
                          ? 'text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-warning-soft)] hover:text-[var(--sys-warning)]'
                          : 'text-[var(--sys-success)] hover:bg-[var(--sys-success-soft)]'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      onClick={removeWallet}
                      disabled={busy}
                      title="احذف"
                      className="cursor-pointer rounded-lg p-1.5 text-[var(--sys-muted)] hover:bg-[var(--sys-destructive-soft)] hover:text-[var(--sys-destructive)] disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <span className="mx-1 h-5 w-px bg-[var(--sys-border)]" />
                  </>
                )}
                <button
                  disabled={!wallet?.isActive}
                  onClick={() => setRecordOpen(true)}
                  className="h-8 px-3 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" /> حركة جديدة
                </button>
              </span>
            </div>

            {!movements ? (
              <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-12">
                <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
              </div>
            ) : movements.length === 0 ? (
              <p className="text-sm text-[var(--sys-muted-foreground)] py-10 text-center">لا حركات بعد.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
                  <tr>
                    <th className="text-right font-medium px-3 py-2">التاريخ</th>
                    <th className="text-right font-medium px-3 py-2">الطرف</th>
                    <th className="text-right font-medium px-3 py-2">البند</th>
                    <th className="text-right font-medium px-3 py-2">وارد</th>
                    <th className="text-right font-medium px-3 py-2">صادر</th>
                    <th className="text-right font-medium px-3 py-2">سجّلها</th>
                    <th className="text-right font-medium px-3 py-2"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sys-border)]">
                  {movements.map((m) => (
                    <tr key={m.id} className={m.isReversal ? 'bg-[var(--sys-destructive-soft)]' : undefined}>
                      <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)] whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-3 py-2 text-[var(--sys-foreground)]">
                        {m.party}
                        {m.note && <span className="block text-xs text-[var(--sys-muted)]">{m.note}</span>}
                        {m.reversalReason && (
                          <span className="block text-xs text-[var(--sys-destructive)]">قيد عكسي: {m.reversalReason}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)]">{CATEGORY_AR[m.category] ?? m.category}</td>
                      <td className="px-3 py-2 tabular-nums text-[var(--sys-success)]">{m.direction === 'IN' ? m.amount : ''}</td>
                      <td className="px-3 py-2 tabular-nums text-[var(--sys-destructive)]">{m.direction === 'OUT' ? m.amount : ''}</td>
                      <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)]">{m.createdByName ?? '—'}</td>
                      <td className="px-3 py-2 text-left">
                        {m.wasReversed ? (
                          <span className="text-xs text-[var(--sys-muted)]">عُكِست</span>
                        ) : m.isReversal ? (
                          <span className="text-xs text-[var(--sys-muted)]">قيد عكسي</span>
                        ) : (
                          <button
                            onClick={() => setReverseFor(m)}
                            className="text-xs text-[var(--sys-primary)] hover:underline inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> قيد عكسي
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {creating && (
        <CreateWalletDialog
          onClose={() => setCreating(false)}
          onSaved={async (message) => {
            setCreating(false);
            await refresh(message);
          }}
        />
      )}

      {recordOpen && wallet && (
        <RecordDialog
          wallet={wallet}
          onClose={() => setRecordOpen(false)}
          onSaved={async () => {
            setRecordOpen(false);
            await refresh('سُجِّلت الحركة');
          }}
        />
      )}

      {reverseFor && wallet && (
        <ReverseDialog
          wallet={wallet}
          movement={reverseFor}
          onClose={() => setReverseFor(null)}
          onSaved={async () => {
            setReverseFor(null);
            await refresh('سُجِّل القيد العكسي — القيد الأصلي باقٍ كما هو');
          }}
        />
      )}
    </div>
  );
}

function RecordDialog({
  wallet,
  onClose,
  onSaved,
}: {
  wallet: WalletRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT');
  const [amount, setAmount] = useState('');
  const [party, setParty] = useState('');
  const [category, setCategory] = useState('EXPENSE');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Modal isOpen onClose={onClose} title={`حركة جديدة — ${wallet.name}`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await apiJson(`/api/finance/wallets/${wallet.id}/movements`, {
              method: 'POST',
              body: JSON.stringify({
                direction,
                amount: Number(amount),
                party: party.trim(),
                category,
                note: note.trim(),
              }),
            });
            onSaved();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الحفظ');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <div className="flex gap-2">
          {(['IN', 'OUT'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`flex-1 h-10 rounded-lg border text-sm font-medium ${
                direction === d
                  ? d === 'IN'
                    ? 'bg-[var(--sys-success-soft)] border-[var(--sys-success)]/60 text-[var(--sys-success)]'
                    : 'bg-[var(--sys-destructive-soft)] border-[var(--sys-destructive-border)] text-[var(--sys-destructive)]'
                  : 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)]'
              }`}
            >
              {d === 'IN' ? 'وارد' : 'صادر'}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">المبلغ ({wallet.currencyCode})</span>
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
            dir="ltr"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">الطرف</span>
          <input
            value={party}
            onChange={(e) => setParty(e.target.value)}
            required
            minLength={2}
            placeholder="اسم الشخص أو الجهة"
            className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">البند</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm bg-[var(--sys-card)]"
          >
            {Object.entries(CATEGORY_AR)
              .filter(([key]) => key !== 'TRANSFER_IN' && key !== 'TRANSFER_OUT')
              .map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
          </select>
          <span className="block text-caption text-[var(--sys-muted)] mt-1">التحويلات تُسجَّل من شاشة التحويلات لا من هنا.</span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">الملاحظة (إلزامية)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            minLength={3}
            className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'جارٍ الحفظ…' : 'تسجيل'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReverseDialog({
  wallet,
  movement,
  onClose,
  onSaved,
}: {
  wallet: WalletRow;
  movement: Movement;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Modal isOpen onClose={onClose} title="قيد عكسي">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await apiJson(`/api/finance/wallets/${wallet.id}/movements`, {
              method: 'PATCH',
              body: JSON.stringify({ movementId: movement.id, reason: reason.trim() }),
            });
            onSaved();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر القيد العكسي');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <p className="text-sm text-[var(--sys-foreground)] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-3">
          سيُسجَّل قيد معاكس بمبلغ <b className="tabular-nums">{movement.amount}</b> {wallet.currencyCode}{' '}
          ({movement.direction === 'IN' ? 'صادر' : 'وارد'}) مرتبطاً بالحركة الأصلية.
          القيد الأصلي لا يُحذف ولا يُعدَّل.
        </p>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">سبب القيد العكسي (إلزامي)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={5}
            rows={3}
            className="w-full p-3 rounded-lg border border-[var(--sys-border)] text-sm"
            placeholder="مثال: سُجِّل المبلغ مرتين بالخطأ"
          />
        </label>

        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 px-4 rounded-lg bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'جارٍ التسجيل…' : 'تسجيل القيد العكسي'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Creating a wallet.
 *
 * It belongs to a COUNTRY and carries its own currency, which need not be
 * the country's: a Syrian business holding dollars is the normal case, not
 * the exception. The currency is fixed at creation because every movement
 * is recorded in it — changing it later would silently restate history.
 *
 * The opening balance is what is in it today, before any movement is
 * recorded. It is not a movement itself, which is why it never appears in
 * the ledger.
 */
function CreateWalletDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [countries, setCountries] = useState<{ id: string; name: string; currencyCode: string }[]>([]);
  const [countryId, setCountryId] = useState('');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('');
  const [opening, setOpening] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiJson<{ countries: { id: string; name: string; currencyCode: string }[] }>('/api/geo/countries')
      .then((d) => {
        setCountries(d.countries);
        if (d.countries.length === 1) {
          setCountryId(d.countries[0].id);
          setCurrency(d.countries[0].currencyCode);
        }
      })
      .catch(() => undefined);
  }, []);

  const country = countries.find((c) => c.id === countryId);

  return (
    <Modal isOpen onClose={onClose} title="محفظة جديدة">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await apiJson('/api/finance/wallets', {
              method: 'POST',
              body: JSON.stringify({
                countryId,
                name: name.trim(),
                currencyCode: currency.trim().toUpperCase(),
                openingBalance: opening ? Number(opening) : 0,
              }),
            });
            onSaved(`أُنشئت المحفظة ${name.trim()}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الإنشاء');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">البلد</span>
          <select
            value={countryId}
            onChange={(e) => {
              setCountryId(e.target.value);
              const picked = countries.find((c) => c.id === e.target.value);
              // Default to the country's currency; it stays editable.
              if (picked && !currency) setCurrency(picked.currencyCode);
            }}
            required
            className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm bg-[var(--sys-card)]"
          >
            <option value="">اختر…</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {c.currencyCode}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">اسم المحفظة</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            autoFocus
            placeholder="مثال: الصندوق النقدي، حساب البنك العربي"
            className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">العملة</span>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            required
            maxLength={3}
            placeholder="USD"
            className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
            dir="ltr"
          />
          <span className="block text-caption text-[var(--sys-muted)] mt-1">
            ثلاثة أحرف. لا يمكن تغييرها لاحقاً — كل حركة تُسجَّل بها.
            {country && currency && currency !== country.currencyCode && (
              <span className="block text-[var(--sys-warning)] mt-0.5">
                تختلف عن عملة {country.name} ({country.currencyCode}) — مقبول، وسيُطلب سعر الصرف عند الحاجة.
              </span>
            )}
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">الرصيد الافتتاحي</span>
          <input
            type="number"
            step="0.001"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            placeholder="0"
            className="w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm"
            dir="ltr"
          />
          <span className="block text-caption text-[var(--sys-muted)] mt-1">
            ما في المحفظة الآن قبل أي حركة. ليس حركة بحد ذاته، فلا يظهر في السجل.
          </span>
        </label>

        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving || !countryId}
            className="h-10 px-4 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'جارٍ الإنشاء…' : 'إنشاء'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
