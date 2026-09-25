'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { ScreenTitle } from '@/components/shell/ScreenTitle';

/**
 * /finance/collection — the three sequential steps, in order and visible as
 * such: import the courier statement, record what actually arrived, then
 * approve. The money moves on approval and nowhere earlier, so the approve
 * button stays disabled until receipts exist, matching has run and any gap
 * between claimed and received carries a written explanation.
 */

interface Gap {
  claimed: number;
  received: number;
  gap: number;
  needsExplanation: boolean;
  explained: boolean;
}

interface StatementRow {
  id: string;
  reference: string;
  fileName: string;
  status: string;
  currencyCode: string;
  totalAmount: number;
  createdAt: string;
  counts: { lines: number; receipts: number; matches: number };
  gap: Gap;
}

const STATUS_AR: Record<string, string> = {
  IMPORTED: 'مستورد',
  RECEIPTED: 'سُجِّل الاستلام',
  MATCHED: 'مطابَق',
  APPROVED: 'معتمد',
};

const STATUS_STYLE: Record<string, string> = {
  IMPORTED: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]',
  RECEIPTED: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/40',
  MATCHED: 'bg-sky-50 text-sky-700 border-sky-200',
  APPROVED: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[var(--sys-success)]/40',
};

export function CollectionScreen() {
  const [rows, setRows] = useState<StatementRow[] | null>(null);
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [wallets, setWallets] = useState<{ id: string; name: string; currencyCode: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [receiptFor, setReceiptFor] = useState<StatementRow | null>(null);
  const [explainFor, setExplainFor] = useState<StatementRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ statements: StatementRow[] }>('/api/finance/statements');
      setRows(data.statements);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
    void apiJson<{ providers: { id: string; name: string }[] }>('/api/ops/references')
      .then((d) => setProviders(d.providers))
      .catch(() => undefined);
    void apiJson<{ wallets: { id: string; name: string; currencyCode: string }[] }>('/api/finance/wallets')
      .then((d) => setWallets(d.wallets))
      .catch(() => undefined);
  }, [load]);

  async function act(id: string, label: string, run: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    setDone(null);
    try {
      await run();
      setDone(label);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التنفيذ');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-6xl space-y-3">
      <ScreenTitle />

      <ImportCard
        providers={providers}
        busy={importing}
        onImport={async (payload) => {
          setImporting(true);
          setError(null);
          setDone(null);
          try {
            const res = await apiJson<{ rows: number; total: number }>('/api/finance/statements', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
            setDone(`تم استيراد ${res.rows} سطراً بإجمالي ${res.total}`);
            await load();
            return true;
          } catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر الاستيراد');
            return false;
          } finally {
            setImporting(false);
          }
        }}
      />

      {error && <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-[8px] p-3">{error}</p>}
      {done && <p className="text-sm text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-success)]/30 rounded-[8px] p-3">{done}</p>}

      {!rows ? (
        <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--sys-muted-foreground)] bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-6 text-center">
          <FileSpreadsheet className="w-5 h-5 mx-auto mb-2 text-[var(--sys-muted)]" />
          لا توجد كشوف مستوردة بعد.
        </p>
      ) : (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] text-xs">
              <tr>
                <th className="text-right font-medium px-3 py-2">الكشف</th>
                <th className="text-right font-medium px-3 py-2">الحالة</th>
                <th className="text-right font-medium px-3 py-2">أقرّت الشركة</th>
                <th className="text-right font-medium px-3 py-2">وصل فعلاً</th>
                <th className="text-right font-medium px-3 py-2">الفرق</th>
                <th className="text-right font-medium px-3 py-2">الأسطر</th>
                <th className="text-right font-medium px-3 py-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sys-border)]">
              {rows.map((s) => {
                const approvable =
                  s.status !== 'APPROVED' &&
                  s.counts.receipts > 0 &&
                  s.counts.matches > 0 &&
                  (!s.gap.needsExplanation || s.gap.explained);
                return (
                  <tr key={s.id}>
                    <td className="px-3 py-2">
                      <span className="font-medium text-[var(--sys-heading)]" dir="ltr">{s.reference}</span>
                      <span className="block text-xs text-[var(--sys-muted)]" dir="ltr">{s.fileName}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_STYLE[s.status] ?? ''}`}>
                        {STATUS_AR[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{s.gap.claimed} {s.currencyCode}</td>
                    <td className="px-3 py-2 tabular-nums">{s.gap.received}</td>
                    <td className={`px-3 py-2 tabular-nums ${s.gap.gap === 0 ? 'text-[var(--sys-muted-foreground)]' : 'text-[var(--sys-destructive)] font-medium'}`}>
                      {s.gap.gap}
                      {s.gap.needsExplanation && !s.gap.explained && (
                        <AlertTriangle className="w-3.5 h-3.5 inline mr-1 align-[-2px]" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--sys-muted-foreground)] tabular-nums">
                      {s.counts.lines} سطر · {s.counts.receipts} إيصال · {s.counts.matches} مطابقة
                    </td>
                    <td className="px-3 py-2 text-left whitespace-nowrap">
                      {s.status === 'APPROVED' ? (
                        <span className="text-xs text-[var(--sys-success)] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> معتمد
                        </span>
                      ) : (
                        <span className="flex gap-3 justify-end">
                          <button onClick={() => setReceiptFor(s)} className="text-xs text-[var(--sys-primary)] hover:underline">
                            إيصال استلام
                          </button>
                          <button
                            disabled={s.counts.receipts === 0 || busy === s.id}
                            onClick={() =>
                              act(s.id, 'تمت المطابقة', () =>
                                apiJson(`/api/finance/statements/${s.id}/match`, { method: 'POST' })
                              )
                            }
                            className="text-xs text-[var(--sys-primary)] hover:underline disabled:text-[var(--sys-border-strong)] disabled:no-underline"
                          >
                            مطابقة
                          </button>
                          {s.gap.needsExplanation && !s.gap.explained && (
                            <button onClick={() => setExplainFor(s)} className="text-xs text-[var(--sys-warning)] hover:underline">
                              تفسير الفرق
                            </button>
                          )}
                          <button
                            disabled={!approvable || busy === s.id}
                            title={
                              s.counts.receipts === 0
                                ? 'سجّل إيصال الاستلام أولاً'
                                : s.counts.matches === 0
                                  ? 'شغّل المطابقة أولاً'
                                  : s.gap.needsExplanation && !s.gap.explained
                                    ? 'الفرق يحتاج تفسيراً مكتوباً'
                                    : 'اعتماد الكشف — عندها تُسجَّل حركة المحفظة'
                            }
                            onClick={() =>
                              act(s.id, 'اعتُمد الكشف وسُجِّلت حركة المحفظة', () =>
                                apiJson(`/api/finance/statements/${s.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ approve: true }),
                                })
                              )
                            }
                            className="text-xs font-medium text-[var(--sys-success)] hover:underline disabled:text-[var(--sys-border-strong)] disabled:no-underline"
                          >
                            اعتماد
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {receiptFor && (
        <ReceiptDialog
          statement={receiptFor}
          wallets={wallets}
          onClose={() => setReceiptFor(null)}
          onSaved={async (message) => {
            setReceiptFor(null);
            setDone(message);
            await load();
          }}
        />
      )}

      {explainFor && (
        <ExplainDialog
          statement={explainFor}
          onClose={() => setExplainFor(null)}
          onSaved={async () => {
            setExplainFor(null);
            setDone('سُجِّل تفسير الفرق');
            await load();
          }}
        />
      )}
    </div>
  );
}

function ImportCard({
  providers,
  busy,
  onImport,
}: {
  providers: { id: string; name: string }[];
  busy: boolean;
  onImport: (payload: {
    deliveryProviderId: string;
    reference: string;
    fileName: string;
    content: string;
    encoding: 'text' | 'base64';
  }) => Promise<boolean>;
}) {
  const [providerId, setProviderId] = useState('');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<{ name: string; content: string; encoding: 'text' | 'base64' } | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!providerId || !file) return;
        const ok = await onImport({
          deliveryProviderId: providerId,
          reference,
          fileName: file.name,
          content: file.content,
          encoding: file.encoding,
        });
        if (ok) {
          setReference('');
          setFile(null);
        }
      }}
      className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-[8px] p-4 grid gap-3 md:grid-cols-4 items-end"
    >
      <label>
        <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">شركة الشحن</span>
        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          required
          className="w-full h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm bg-[var(--sys-card)]"
        >
          <option value="">اختر…</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>

      <label>
        <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">مرجع الكشف</span>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          required
          minLength={2}
          placeholder="ST-2026-09"
          className="w-full h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm"
        />
      </label>

      <label>
        <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">ملف الكشف (Excel أو CSV)</span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={async (e) => {
            const picked = e.target.files?.[0];
            if (!picked) return setFile(null);
            // A spreadsheet is binary: send its bytes, not a text reading of
            // them, or the hash and the parse both see something else.
            if (/\.xlsx?$/i.test(picked.name)) {
              const bytes = new Uint8Array(await picked.arrayBuffer());
              let binary = '';
              for (const b of bytes) binary += String.fromCharCode(b);
              setFile({ name: picked.name, content: btoa(binary), encoding: 'base64' });
            } else {
              setFile({ name: picked.name, content: await picked.text(), encoding: 'text' });
            }
          }}
          className="w-full text-xs file:h-8 file:px-3 file:rounded-[6px] file:border-0 file:bg-[var(--sys-surface)] file:text-[var(--sys-foreground)] file:ml-2"
        />
      </label>

      <button
        type="submit"
        disabled={busy || !file || !providerId}
        className="h-10 px-4 rounded-[8px] bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        استيراد
      </button>
    </form>
  );
}

function ReceiptDialog({
  statement,
  wallets,
  onClose,
  onSaved,
}: {
  statement: StatementRow;
  wallets: { id: string; name: string; currencyCode: string }[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [walletId, setWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const wallet = wallets.find((w) => w.id === walletId);
  const needsRate = !!wallet && wallet.currencyCode !== statement.currencyCode;

  return (
    <Modal isOpen onClose={onClose} title={`إيصال استلام — ${statement.reference}`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await apiJson(`/api/finance/statements/${statement.id}/receipts`, {
              method: 'POST',
              body: JSON.stringify({
                walletId,
                amount: Number(amount),
                ...(needsRate && rate ? { exchangeRate: Number(rate) } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
              }),
            });
            onSaved('سُجِّل إيصال الاستلام — لم تتحرك المحفظة بعد، الحركة تُكتب عند الاعتماد');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الحفظ');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <p className="text-xs text-[var(--sys-muted-foreground)] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-[8px] p-3">
          أقرّت الشركة {statement.gap.claimed} {statement.currencyCode} ووصل حتى الآن {statement.gap.received}.
          يمكن تسجيل أكثر من إيصال لنفس الكشف (نقد + حوالة).
        </p>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">المحفظة التي وصل إليها المبلغ</span>
          <select
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm bg-[var(--sys-card)]"
          >
            <option value="">اختر…</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name} — {w.currencyCode}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">المبلغ الواصل</span>
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm"
            dir="ltr"
          />
        </label>

        {needsRate && (
          <label className="block">
            <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">
              سعر الصرف ({statement.currencyCode} → {wallet?.currencyCode})
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

        <label className="block">
          <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">ملاحظة (اختيارية)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full h-10 px-3 rounded-[8px] border border-[var(--sys-border)] text-sm"
          />
        </label>

        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-[8px] border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-4 rounded-[8px] bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'جارٍ الحفظ…' : 'حفظ الإيصال'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ExplainDialog({
  statement,
  onClose,
  onSaved,
}: {
  statement: StatementRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Modal isOpen onClose={onClose} title={`تفسير الفرق — ${statement.reference}`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await apiJson(`/api/finance/statements/${statement.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ gapExplanation: text.trim() }),
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
        <p className="text-sm text-[var(--sys-foreground)]">
          الفرق بين ما أقرّته الشركة وما وصل: <b className="tabular-nums text-[var(--sys-destructive)]">{statement.gap.gap}</b>{' '}
          {statement.currencyCode}. اكتب سبب الفرق — بدونه لا يُعتمد الكشف.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          minLength={5}
          rows={3}
          className="w-full p-3 rounded-[8px] border border-[var(--sys-border)] text-sm"
          placeholder="مثال: خصمت الشركة رسوم إرجاع شحنتين"
        />
        {error && <p className="text-sm text-[var(--sys-destructive)]">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-[8px] border border-[var(--sys-border)] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-4 rounded-[8px] bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            حفظ التفسير
          </button>
        </div>
      </form>
    </Modal>
  );
}
