'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Loader2, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { apiJson } from '@/lib/api-client';
import { changeFieldLabel } from '@/lib/change-request-fields';

/**
 * ONE CHANGE REQUEST, DECIDED.
 *
 * It opens where the work is — on the packing line, on the order the box is
 * being filled for — because the answer to "can this still be changed?"
 * depends on what is happening to that box right now, and the person with
 * the box is the one who knows.
 *
 * Two things it is careful about:
 *
 *   The BEFORE and the AFTER are both shown. A request that says only "make
 *   it 3" is unanswerable; three instead of what?
 *
 *   A refusal must say what happens next. "مرفوض" on its own leaves the
 *   person who asked with a customer on the phone and nothing to tell them,
 *   so the reason is required — the server refuses a rejection without one,
 *   and this asks for it before letting the button work.
 */

interface RequestRow {
  id: string;
  orderId: string;
  reason: string;
  changes: Record<string, { from?: unknown; to?: unknown }> | null;
  requestedByName?: string | null;
  requestedRole?: string | null;
  createdAt: string;
  order?: { orderNumber: string } | null;
}


function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function ChangeRequestReview({
  requestId,
  onClose,
  onDecided,
}: {
  requestId: string;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [row, setRow] = useState<RequestRow | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ requests: RequestRow[] }>('/api/control/change-requests?status=all');
      const found = data.requests?.find((r) => r.id === requestId) ?? null;
      setRow(found);
      if (!found) setError('طلب التعديل لم يعد معروضاً لك — ربما بُتّ فيه.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    setBusy(decision);
    setError(null);
    try {
      await apiJson(`/api/control/change-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      onDecided();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ القرار');
    } finally {
      setBusy(null);
    }
  };

  const fields = Object.entries(row?.changes ?? {});

  return (
    <Modal isOpen onClose={onClose} title={`طلب تعديل · ${row?.order?.orderNumber ?? ''}`}>
      <div className="space-y-4">
        {row && (
          <>
            <p className="text-[11px] text-[#697586]">
              {row.requestedByName ?? 'موظف'} · {new Date(row.createdAt).toLocaleString('ar-EG')}
            </p>

            <div className="rounded-lg border border-[#e3e8ef] divide-y divide-[#e3e8ef]">
              {fields.length === 0 ? (
                <p className="p-3 text-xs text-[#9aa4b2]">لا تفاصيل مرفقة.</p>
              ) : (
                fields.map(([field, change]) => (
                  <div key={field} className="p-3">
                    <p className="text-[11px] font-semibold text-[#697586] mb-1">
                      {changeFieldLabel(field)}
                    </p>
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="text-[#9aa4b2] line-through">{show(change?.from)}</span>
                      <ArrowLeft className="w-3.5 h-3.5 text-[#b8256e] shrink-0" />
                      <span className="font-semibold text-[#121926]">{show(change?.to)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-lg bg-[#f8fafc] border border-[#e3e8ef] p-3">
              <p className="text-[11px] font-semibold text-[#697586] mb-1">السبب</p>
              <p className="text-xs text-[#364152]">{row.reason}</p>
            </div>

            <label className="block">
              <span className="block text-[11px] text-[#697586] mb-1">
                ردّك — <span className="text-[#c07f2a]">مطلوب مع الرفض</span>
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثلاً: الطرد خرج مع المندوب، بلّغي الزبون أنه سيُسلَّم بالعنوان القديم"
                maxLength={500}
                className="w-full h-9 px-2 rounded-lg border border-[#e3e8ef] bg-white text-xs text-[#364152] focus:outline-none focus:border-[#b8256e]"
              />
            </label>

            <p className="flex items-start gap-1.5 text-[11px] text-[#697586]">
              <AlertTriangle className="w-3.5 h-3.5 text-[#c07f2a] shrink-0 mt-0.5" />
              الموافقة تسجّل القرار ولا تكتب التعديل على الطلب — طبّقه من شاشة الطلب بعدها،
              لأن تغيير الكمية أو السعر يمرّ بمسار المال وليس بنسخ حقل.
            </p>
          </>
        )}

        {error && (
          <p className="text-xs text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-lg p-2.5">{error}</p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose} disabled={!!busy}>
            إغلاق
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => decide('REJECTED')}
            disabled={!!busy || !row || !note.trim()}
            title={!note.trim() ? 'الرفض يتطلب سبباً' : undefined}
          >
            {busy === 'REJECTED' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            رفض
          </Button>
          <Button size="sm" onClick={() => decide('APPROVED')} disabled={!!busy || !row}>
            {busy === 'APPROVED' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            موافقة
          </Button>
        </div>
      </div>
    </Modal>
  );
}
