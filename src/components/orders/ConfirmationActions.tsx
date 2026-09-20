'use client';

/**
 * SALESFLOW — Phase D1: Confirmation quick actions + customer contact history.
 * Quick actions open a controlled form when the server requires extra data.
 * All authorization/workflow validation is backend-enforced.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { apiFetch } from '@/lib/api-client';
import {
  Phone,
  PhoneCall,
  Clock,
  RefreshCw,
  Check,
  XCircle,
  PhoneOff,
  History,
  CalendarClock,
} from 'lucide-react';
import { arDateShort, arDateTime } from '@/lib/format';

const REJECTION_REASONS: { key: string; ar: string; en: string }[] = [
  { key: 'PRICE_TOO_HIGH', ar: 'السعر مرتفع', en: 'Price too high' },
  { key: 'CUSTOMER_CHANGED_MIND', ar: 'غيّر رأيه', en: 'Changed mind' },
  { key: 'CUSTOMER_DOES_NOT_WANT_PRODUCT', ar: 'لا يريد المنتج', en: 'Does not want product' },
  { key: 'DUPLICATE_ORDER', ar: 'طلب مكرر', en: 'Duplicate order' },
  { key: 'WRONG_NUMBER', ar: 'رقم خاطئ', en: 'Wrong number' },
  { key: 'FAKE_ORDER', ar: 'طلب وهمي', en: 'Fake order' },
  { key: 'OUT_OF_SERVICE_AREA', ar: 'خارج نطاق التغطية', en: 'Out of service area' },
  { key: 'OTHER', ar: 'سبب آخر', en: 'Other' },
];

const RESULTS: Record<string, { ar: string; en: string }> = {
  ANSWERED: { ar: 'أجاب', en: 'Answered' },
  NO_ANSWER: { ar: 'لم يجب', en: 'No Answer' },
  BUSY: { ar: 'مشغول', en: 'Busy' },
  WRONG_NUMBER: { ar: 'رقم خاطئ', en: 'Wrong Number' },
  CALLBACK_REQUESTED: { ar: 'طلب الاتصال به', en: 'Callback Requested' },
  CONFIRMED: { ar: 'مؤكد', en: 'Confirmed' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected' },
  OTHER: { ar: 'أخرى', en: 'Other' },
};

const WORKFLOW_STATE: Record<string, { ar: string; en: string; cls: string }> = {
  NEW: { ar: 'جديد', en: 'New', cls: 'bg-blue-50 text-blue-700 border-blue-300' },
  IN_PROGRESS: { ar: 'قيد المعالجة', en: 'In Progress', cls: 'bg-purple-50 text-purple-700 border-purple-300' },
  NO_ANSWER: { ar: 'لا يجيب', en: 'No Answer', cls: 'bg-amber-50 text-amber-700 border-amber-300' },
  FOLLOW_UP_REQUIRED: { ar: 'يتطلب متابعة', en: 'Follow-Up Required', cls: 'bg-orange-50 text-orange-700 border-orange-300' },
  POSTPONED: { ar: 'مؤجل', en: 'Postponed', cls: 'bg-yellow-50 text-yellow-700 border-yellow-300' },
  CONFIRMED: { ar: 'مؤكد ✓', en: 'Confirmed ✓', cls: 'bg-green-50 text-green-700 border-green-300' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', cls: 'bg-red-50 text-red-700 border-red-300' },
  CANCELLED: { ar: 'ملغى', en: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  PHONE: { ar: 'هاتف', en: 'Phone' },
  WHATSAPP: { ar: 'واتساب', en: 'WhatsApp' },
  SMS: { ar: 'رسالة', en: 'SMS' },
  OTHER: { ar: 'أخرى', en: 'Other' },
};

interface ConfirmationActionsProps {
  order: any;
  ar: boolean;
  isRtl: boolean;
  onRefreshOrder: () => void | Promise<void>;
}

export function ConfirmationActions({ order, ar, isRtl, onRefreshOrder }: ConfirmationActionsProps) {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Quick-action form state
  const [openForm, setOpenForm] = useState<string | null>(null); // 'confirm' | 'reject' | 'followup' | 'call_later'
  const [note, setNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const loadAttempts = async () => {
    if (!order?.id) return;
    setLoadingAttempts(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/contact-attempts`);
      if (res.ok) {
        const data = await res.json();
        setAttempts(data.attempts || []);
        setSummary(data.summary || null);
      }
      } catch (e) {
      console.error(e);
    } finally {
      setLoadingAttempts(false);
    }
  };

  useEffect(() => {
    setFeedback(null);
    loadAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  /** Core submit: record attempt (always) + workflow transition (when provided) */
  const submitAction = async (payload: {
    action?: string; result?: string; contactMethod?: string; note?: string;
    nextFollowUpAt?: string; followUpReason?: string;
    rejectionReason?: string; rejectionNote?: string;
  }) => {
    if (!order?.id) return false;
    setActionLoading(true);
    setFeedback(null);
    try {
      // 1. Contact attempt (append-only history) — recorded for every action
      const attRes = await apiFetch(`/api/orders/${order.id}/contact-attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactMethod: payload.contactMethod || 'PHONE',
          result: payload.result || 'OTHER',
          note: payload.note,
          nextFollowUpAt: payload.nextFollowUpAt,
        }),
      });
      if (!attRes.ok) {
        const d = await attRes.json().catch(() => ({}));
        setFeedback({ type: 'error', text: d.errorAr || d.error || (ar ? 'فشل تسجيل المحاولة' : 'Failed to record attempt') });
        return false;
      }

      // 2. Workflow transition (only when the action changes confirmation state)
      if (payload.action && payload.action !== 'attempt_only') {
        const confRes = await apiFetch(`/api/orders/${order.id}/confirmation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: payload.action,
            result: payload.result,
            note: payload.note,
            nextFollowUpAt: payload.nextFollowUpAt,
            rejectionReason: payload.rejectionReason,
            rejectionNote: payload.rejectionNote,
            expectedVersion: order.version,
          }),
        });
        const confData = await confRes.json().catch(() => ({}));
        if (!confRes.ok) {
          // The contact attempt WAS recorded but the transition failed —
          // warn clearly and keep the modal open with the form values intact
          const errText = confData.errorAr || confData.error || (ar ? 'رفض الإجراء' : 'Action rejected');
          setFeedback({
            type: 'error',
            text: ar
              ? `تم تسجيل محاولة الاتصال لكن فشل تحديث حالة الطلب: ${errText}`
              : `Contact attempt recorded but the order status update failed: ${errText}`,
          });
          return false;
        }
      }

      setFeedback({ type: 'success', text: ar ? 'تم تسجيل الإجراء بنجاح ✓' : 'Action recorded successfully ✓' });
      setNote(''); setRejectionReason(''); setFollowUpDate('');
      await loadAttempts();
      await onRefreshOrder();
      return true;
    } finally {
      setActionLoading(false);
    }
  };

  const wf = WORKFLOW_STATE[order?.confirmationStatus] ?? WORKFLOW_STATE.NEW;
  const terminal = ['CONFIRMED', 'REJECTED', 'CANCELLED'].includes(order?.confirmationStatus);
  const busy = actionLoading || loadingAttempts;

  const handleQuickSubmit = async () => {
    if (!openForm) return;
    let ok = false;
    if (openForm === 'confirm') {
      ok = await submitAction({ action: 'confirm', result: 'CONFIRMED', note });
    } else if (openForm === 'reject') {
      ok = await submitAction({ action: 'reject', result: 'REJECTED', rejectionReason, note, rejectionNote: note });
    } else {
      ok = await submitAction({
        action: 'schedule_follow_up',
        result: openForm === 'call_later' ? 'CALLBACK_REQUESTED' : 'OTHER',
        note,
        nextFollowUpAt: followUpDate ? new Date(followUpDate).toISOString() : undefined,
      });
    }
    if (ok) setOpenForm(null);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-indigo-600" />
          {ar ? 'سير عمل التأكيد وسجل التواصل' : 'Confirmation Workflow & Contact History'}
        </h4>
        <div className="flex items-center gap-2">
          {summary?.total > 0 && (
            <span className="text-[11px] font-bold text-slate-600 bg-slate-100 rounded-lg px-2 py-1">
              {ar ? `محاولات: ${summary.total}` : `Attempts: ${summary.total}`}
            </span>
          )}
          {order.nextFollowUpAt && order.followUpStatus !== 'COMPLETED' && order.followUpStatus !== 'CANCELLED' && (
            <span className="text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1 inline-flex items-center gap-1">
              <CalendarClock className="w-3 h-3" />
              {ar ? 'متابعة:' : 'Follow-up:'} {arDateShort(order.nextFollowUpAt)}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-2 text-[11px] font-bold ${wf.cls}`}>
            {ar ? wf.ar : wf.en}
          </span>
        </div>
      </div>

      {/* Quick actions */}
      {!terminal && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => submitAction({ action: 'contact_result', result: 'ANSWERED' })}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border-2 border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Phone className="w-3.5 h-3.5" />{ar ? '📞 العميل أجاب' : '📞 Answered'}
          </button>
          <button
            onClick={() => submitAction({ action: 'contact_result', result: 'NO_ANSWER' })}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border-2 border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <PhoneOff className="w-3.5 h-3.5" />{ar ? '☎️ لم يجب' : '☎️ No Answer'}
          </button>
          <button
            onClick={() => { setNote(''); setOpenForm('call_later'); }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border-2 border-purple-300 text-purple-700 hover:bg-purple-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Clock className="w-3.5 h-3.5" />{ar ? '⏰ الاتصال لاحقاً' : '⏰ Call Later'}
          </button>
          <button
            onClick={() => { setNote(''); setOpenForm('followup'); }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border-2 border-orange-300 text-orange-700 hover:bg-orange-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />{ar ? '🔄 متابعة' : '🔄 Follow Up'}
          </button>
          <button
            onClick={() => { setNote(''); setOpenForm('confirm'); }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border-2 border-green-400 text-green-700 hover:bg-green-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />{ar ? '✅ تأكيد الطلب' : '✅ Confirm Order'}
          </button>
          <button
            onClick={() => { setNote(''); setRejectionReason(''); setOpenForm('reject'); }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border-2 border-red-300 text-red-700 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />{ar ? '❌ العميل رفض' : '❌ Rejected'}
          </button>
          <button
            onClick={() => submitAction({ action: 'contact_result', result: 'WRONG_NUMBER' })}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border-2 border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <PhoneOff className="w-3.5 h-3.5" />{ar ? '🚫 رقم خاطئ' : '🚫 Wrong Number'}
          </button>
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`mb-3 rounded-xl border p-2.5 text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'border-green-300 bg-green-50 text-green-800'
              : 'border-rose-300 bg-rose-50 text-rose-800'
          }`}
        >
          <span className="leading-relaxed">{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="opacity-60 hover:opacity-100 cursor-pointer shrink-0">✕</button>
        </div>
      )}

      {/* Contact attempt history — append-only chronological */}
      <div className="border-t border-slate-100 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
          <History className="w-3 h-3" />
          {ar ? 'سجل التواصل مع العميل' : 'Customer Contact History'}
          {busy && <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-500" />}
        </p>

        {attempts.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-2">
            {ar ? 'لا توجد محاولات تواصل بعد.' : 'No contact attempts yet.'}
          </p>
        ) : (
          <div className="space-y-2">
            {attempts.map((att: any) => {
              const cfg = RESULTS[att.result];
              const isGood = ['ANSWERED', 'CONFIRMED'].includes(att.result);
              const isBad = ['NO_ANSWER', 'WRONG_NUMBER', 'BUSY', 'REJECTED'].includes(att.result);
              return (
                <div
                  key={att.id}
                  className={`p-2.5 rounded-xl border text-xs ${
                    isGood ? 'bg-green-50/60 border-green-200' : isBad ? 'bg-red-50/60 border-red-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">
                      📞 {ar ? `محاولة #${att.attemptNumber}` : `Attempt #${att.attemptNumber}`}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {arDateTime(att.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                    <span className="text-slate-500">
                      {ar ? 'الموظف:' : 'Employee:'} <span className="font-semibold text-slate-700">{att.employee?.name}</span>
                    </span>
                    <span className="text-slate-500">
                      {ar ? 'النتيجة:' : 'Result:'} <span className="font-semibold text-slate-700">{ar ? cfg?.ar ?? att.result : cfg?.en ?? att.result}</span>
                    </span>
                    <span className="text-slate-500">
                      {ar ? 'القناة:' : 'Channel:'} <span className="text-slate-700">{(METHOD_LABELS as any)[att.contactMethod]?.[ar ? 'ar' : 'en'] ?? att.contactMethod}</span>
                    </span>
                    {att.nextFollowUpAt && (
                      <span className="text-orange-600 font-semibold inline-flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" />
                        {ar ? 'المتابعة:' : 'Next:'} {arDateShort(att.nextFollowUpAt)}
                      </span>
                    )}
                  </div>
                  {att.note && <p className="mt-1 text-slate-600 leading-relaxed">{att.note}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick-action form modal */}
      <Modal isOpen={!!openForm} onClose={() => setOpenForm(null)} title={formTitle()} maxWidth="md">
        <div className="space-y-3" dir={isRtl ? 'rtl' : 'ltr'}>
          {openForm === 'confirm' && (
            <>
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl p-2.5">
                {ar
                  ? 'سيتم تسجيل تأكيد العميل للطلب ونقله لمرحلة ما بعد التأكيد.'
                  : 'The order will be confirmed and prepared for the next operational stage.'}
              </p>
              <Textarea label={ar ? 'ملاحظة تأكيد (اختياري)' : 'Confirmation note (optional)'} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </>
          )}

          {openForm === 'reject' && (
            <>
              <Select label={ar ? 'سبب الرفض *' : 'Rejection Reason *'} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}>
                <option value="">— {ar ? 'اختر السبب' : 'Select reason'} —</option>
                {REJECTION_REASONS.map((r) => (
                  <option key={r.key} value={r.key}>{ar ? r.ar : r.en}</option>
                ))}
              </Select>
              <Textarea
                label={rejectionReason === 'OTHER' ? `${ar ? 'ملاحظة (إلزامية للسبب: أخرى)' : 'Note (required for Other)'} *` : ar ? 'ملاحظة إضافية' : 'Additional note'}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </>
          )}

          {(openForm === 'followup' || openForm === 'call_later') && (
            <>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                {ar ? 'تحديد موعد المتابعة إلزامي لهذا الإجراء.' : 'A next follow-up date is required for this action.'}
              </p>
              <Input label={ar ? 'موعد المتابعة *' : 'Next Follow-Up *'} type="datetime-local" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
              <Textarea label={ar ? 'ملاحظة المتابعة' : 'Follow-up note'} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setOpenForm(null)}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button size="sm" loading={actionLoading} onClick={handleQuickSubmit} disabled={formDisabled()} className="bg-red-600 hover:bg-red-700">
              {ar ? 'تأكيد' : 'Submit'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );

  function formTitle() {
    if (!openForm) return '';
    const map: Record<string, { ar: string; en: string }> = {
      confirm: { ar: '✅ تأكيد الطلب', en: '✅ Confirm Order' },
      reject: { ar: '❌ رفض الطلب', en: '❌ Reject Order' },
      followup: { ar: '🔄 جدولة متابعة', en: '🔄 Schedule Follow-Up' },
      call_later: { ar: '⏰ الاتصال لاحقاً', en: '⏰ Call Later' },
    };
    const t = map[openForm];
    return t ? (ar ? t.ar : t.en) : '';
  }

  function formDisabled(): boolean {
    if (openForm === 'reject') return !rejectionReason || (rejectionReason === 'OTHER' && (!note || note.trim().length < 5));
    if (openForm === 'followup' || openForm === 'call_later') return !followUpDate;
    return false;
  }
}
