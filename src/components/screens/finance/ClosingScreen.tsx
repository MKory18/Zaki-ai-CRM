'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Lock, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';

/**
 * /finance/closing — count each wallet at the end of the day against its book
 * balance. A difference needs a written explanation, an unexplained one
 * blocks the next day, and whoever recorded the day's movements cannot
 * approve its closing — the approve button simply refuses, server-side.
 */

interface Closing {
  id: string;
  status: 'OPEN' | 'APPROVED';
  bookBalance: number;
  actualBalance: number;
  difference: number;
  explanation: string | null;
  recordedById: string;
}

interface Row {
  walletId: string;
  walletName: string;
  currencyCode: string;
  bookBalance: number;
  closing: Closing | null;
  blockedBy: { id: string; date: string; difference: number } | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export function ClosingScreen() {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [countFor, setCountFor] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      const data = await apiJson<{ rows: Row[] }>(`/api/finance/closing?date=${date}`);
      setRows(data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-5xl space-y-3">
      <div className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 flex gap-3 items-end">
        <label>
          <span className="block text-xs font-medium text-[#364152] mb-1">يوم الإغلاق</span>
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
            dir="ltr"
          />
        </label>
      </div>

      {error && <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>}
      {done && <p className="text-sm text-[#00a344] bg-emerald-50 border border-emerald-100 rounded-[8px] p-3">{done}</p>}

      {!rows ? (
        <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          لا توجد محافظ نشطة.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.walletId} className="bg-white border border-[#e3e8ef] rounded-[8px] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-[#121926]">{r.walletName}</h3>
                  <p className="text-xs text-[#697586] tabular-nums mt-0.5">
                    رصيد الدفاتر {r.bookBalance} {r.currencyCode}
                    {r.closing && ` · الجرد ${r.closing.actualBalance}`}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {r.closing && (
                    <span
                      className={`text-xs px-2 py-1 rounded-full border tabular-nums ${
                        r.closing.difference === 0
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-[#feecee] text-[#fb323f] border-[#fecdd1]'
                      }`}
                    >
                      الفرق {r.closing.difference}
                    </span>
                  )}
                  {r.closing?.status === 'APPROVED' ? (
                    <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> معتمد
                    </span>
                  ) : (
                    <>
                      <button
                        disabled={!!r.blockedBy}
                        onClick={() => setCountFor(r)}
                        className="h-8 px-3 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium disabled:opacity-50"
                      >
                        {r.closing ? 'تعديل الجرد' : 'تسجيل الجرد'}
                      </button>
                      {r.closing && (
                        <button
                          disabled={busy === r.walletId}
                          title="يعتمده شخص غير من سجّل الحركات أو الجرد"
                          onClick={async () => {
                            setBusy(r.walletId);
                            setError(null);
                            setDone(null);
                            try {
                              await apiJson('/api/finance/closing', {
                                method: 'PATCH',
                                body: JSON.stringify({ closingId: r.closing!.id }),
                              });
                              setDone(`اعتُمد إغلاق ${r.walletName}`);
                              await load();
                            } catch (e) {
                              setError(e instanceof Error ? e.message : 'تعذر الاعتماد');
                            } finally {
                              setBusy(null);
                            }
                          }}
                          className="h-8 px-3 rounded-[8px] border border-[#e3e8ef] text-xs font-medium text-[#00a344] disabled:opacity-50"
                        >
                          اعتماد
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {r.blockedBy && (
                <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-[8px] p-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  إغلاق {new Date(r.blockedBy.date).toISOString().slice(0, 10)} فيه فرق{' '}
                  <b className="tabular-nums">{r.blockedBy.difference}</b> بلا تفسير — فسّره واعتمده قبل إغلاق هذا اليوم.
                </p>
              )}

              {r.closing?.explanation && (
                <p className="mt-3 text-xs text-[#697586] bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] p-2.5">
                  التفسير: {r.closing.explanation}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {countFor && (
        <CountDialog
          row={countFor}
          date={date}
          onClose={() => setCountFor(null)}
          onSaved={async (message) => {
            setCountFor(null);
            setDone(message);
            await load();
          }}
        />
      )}
    </div>
  );
}

function CountDialog({
  row,
  date,
  onClose,
  onSaved,
}: {
  row: Row;
  date: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [actual, setActual] = useState(row.closing ? String(row.closing.actualBalance) : '');
  const [explanation, setExplanation] = useState(row.closing?.explanation ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const difference = actual === '' ? null : Number(actual) - row.bookBalance;
  const needsExplanation = difference !== null && Math.abs(difference) > 1e-9;

  return (
    <Modal isOpen onClose={onClose} title={`جرد ${row.walletName} — ${date}`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await apiJson('/api/finance/closing', {
              method: 'POST',
              body: JSON.stringify({
                walletId: row.walletId,
                date,
                actualBalance: Number(actual),
                ...(explanation.trim() ? { explanation: explanation.trim() } : {}),
              }),
            });
            onSaved('سُجِّل الجرد — يبقى بانتظار اعتماد شخص آخر');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر الحفظ');
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-3"
      >
        <p className="text-sm text-[#364152] bg-[#f8fafc] border border-[#e3e8ef] rounded-[8px] p-3 tabular-nums">
          رصيد الدفاتر: <b>{row.bookBalance}</b> {row.currencyCode}
        </p>

        <label className="block">
          <span className="block text-xs font-medium text-[#364152] mb-1">المبلغ المعدود فعلياً</span>
          <input
            type="number"
            step="0.001"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            required
            autoFocus
            className="w-full h-10 px-3 rounded-[8px] border border-[#e3e8ef] text-sm"
            dir="ltr"
          />
        </label>

        {difference !== null && (
          <p
            className={`text-sm rounded-[8px] p-3 border tabular-nums ${
              needsExplanation
                ? 'text-[#fb323f] bg-[#feecee] border-[#fecdd1]'
                : 'text-emerald-700 bg-emerald-50 border-emerald-200'
            }`}
          >
            الفرق: <b>{Number(difference.toFixed(3))}</b> {row.currencyCode}
            {needsExplanation && ' — يحتاج تفسيراً مكتوباً'}
          </p>
        )}

        {needsExplanation && (
          <label className="block">
            <span className="block text-xs font-medium text-[#364152] mb-1">سبب الفرق (إلزامي)</span>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              required
              rows={3}
              className="w-full p-3 rounded-[8px] border border-[#e3e8ef] text-sm"
              placeholder="مثال: سلفة نقدية لمندوب لم تُسجَّل بعد"
            />
          </label>
        )}

        {error && <p className="text-sm text-[#fb323f]">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-[8px] border border-[#e3e8ef] text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-4 rounded-[8px] bg-[#b8256e] text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'جارٍ الحفظ…' : 'حفظ الجرد'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
