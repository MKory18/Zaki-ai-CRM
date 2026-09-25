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
  NEW: { ar: 'جديد', en: 'New', cls: 'bg-[var(--sys-surface)] text-[var(--sys-info)] border-[var(--sys-info)]/50' },
  IN_PROGRESS: { ar: 'قيد المعالجة', en: 'In Progress', cls: 'bg-[var(--sys-surface)] text-purple-700 border-purple-300' },
  NO_ANSWER: { ar: 'لا يجيب', en: 'No Answer', cls: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/60' },
  FOLLOW_UP_REQUIRED: { ar: 'يتطلب متابعة', en: 'Follow-Up Required', cls: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/60' },
  POSTPONED: { ar: 'مؤجل', en: 'Postponed', cls: 'bg-yellow-50 text-yellow-700 border-yellow-300' },
  CONFIRMED: { ar: 'مؤكد ✓', en: 'Confirmed ✓', cls: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[var(--sys-success)]/60' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', cls: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]' },
  CANCELLED: { ar: 'ملغى', en: 'Cancelled', cls: 'bg-[var(--sys-surface-strong)] text-[var(--sys-muted-foreground)] border-[var(--sys-border-strong)]' },
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
    <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4 shadow-xs" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h4 className="text-xs font-black uppercase tracking-wide text-[var(--sys-foreground)] flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-indigo-600" />
          {ar ? 'تسجيل نتيجة الاتصال' : 'Record a call outcome'}
        </h4>
        <div className="flex items-center gap-2">
          {summary?.total > 0 && (
            <span className="text-[11px] font-bold text-[var(--sys-muted-foreground)] bg-[var(--sys-surface-strong)] rounded-lg px-2 py-1">
              {ar ? `محاولات: ${summary.total}` : `Attempts: ${summary.total}`}
            </span>
          )}
          {order.nextFollowUpAt && order.followUpStatus !== 'COMPLETED' && order.followUpStatus !== 'CANCELLED' && (
            <span className="text-[11px] font-bold text-[var(--sys-warning)] bg-[var(--sys-warning-soft)] border border-orange-200 rounded-lg px-2 py-1 inline-flex items-center gap-1">
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 border-[var(--sys-info)]/50 text-[var(--sys-info)] hover:bg-[var(--sys-surface)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <Phone className="w-3.5 h-3.5" />{ar ? '📞 العميل أجاب' : '📞 Answered'}
          </button>
          <button
            onClick={() => submitAction({ action: 'contact_result', result: 'NO_ANSWER' })}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 border-[var(--sys-warning)]/60 text-[var(--sys-warning)] hover:bg-[var(--sys-warning-soft)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <PhoneOff className="w-3.5 h-3.5" />{ar ? '☎️ لم يجب' : '☎️ No Answer'}
          </button>
          <button
            onClick={() => { setNote(''); setOpenForm('call_later'); }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 border-purple-300 text-purple-700 hover:bg-[var(--sys-surface)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <Clock className="w-3.5 h-3.5" />{ar ? '⏰ الاتصال لاحقاً' : '⏰ Call Later'}
          </button>
          <button
            onClick={() => { setNote(''); setOpenForm('followup'); }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 border-[var(--sys-warning)]/60 text-[var(--sys-warning)] hover:bg-[var(--sys-warning-soft)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />{ar ? '🔄 متابعة' : '🔄 Follow Up'}
          </button>
          <button
            onClick={() => { setNote(''); setOpenForm('confirm'); }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 border-green-400 text-[var(--sys-success)] hover:bg-[var(--sys-success-soft)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />{ar ? '✅ تأكيد الطلب' : '✅ Confirm Order'}
          </button>
          <button
            onClick={() => { setNote(''); setRejectionReason(''); setOpenForm('reject'); }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 border-[var(--sys-destructive-border)] text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive-soft)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />{ar ? '❌ العميل رفض' : '❌ Rejected'}
          </button>
          <button
            onClick={() => submitAction({ action: 'contact_result', result: 'WRONG_NUMBER' })}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 border-[var(--sys-border-strong)] text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <PhoneOff className="w-3.5 h-3.5" />{ar ? '🚫 رقم خاطئ' : '🚫 Wrong Number'}
          </button>
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`mb-3 rounded-lg border p-2.5 text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'border-[var(--sys-success)]/60 bg-[var(--sys-success-soft)] text-[var(--sys-success)]'
              : 'border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)]'
          }`}
        >
          <span className="leading-relaxed">{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="opacity-60 hover:opacity-100 cursor-pointer shrink-0">✕</button>
        </div>
      )}

      {/* Quick-action form modal */}
      <Modal isOpen={!!openForm} onClose={() => setOpenForm(null)} title={formTitle()} maxWidth="md">
        <div className="space-y-3" dir={isRtl ? 'rtl' : 'ltr'}>
          {openForm === 'confirm' && (
            <>
              <p className="text-xs text-[var(--sys-success)] bg-[var(--sys-success-soft)] border border-[var(--sys-success)]/40 rounded-lg p-2.5">
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
              <p className="text-xs text-[var(--sys-warning)] bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/40 rounded-lg p-2.5">
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
            <Button size="sm" loading={actionLoading} onClick={handleQuickSubmit} disabled={formDisabled()} className="bg-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]">
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
