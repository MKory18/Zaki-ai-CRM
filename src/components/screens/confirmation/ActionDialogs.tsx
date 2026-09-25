'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';

/**
 * Dialogs for the confirmation screen: a date picker for postponing, and
 * real dropdowns for issue and change-request reasons. Nothing here is typed
 * free-hand unless the reason itself is "other".
 */

const FIELD_CLS =
  'w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-sm focus:outline-none focus:border-[var(--sys-primary)]';

function Buttons({ onCancel, busy, submitLabel }: { onCancel: () => void; busy?: boolean; submitLabel: string }) {
  return (
    <div className="flex gap-2 pt-2">
      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-60"
      >
        {busy ? 'جارٍ الحفظ…' : submitLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 rounded-lg border border-[var(--sys-border)] text-sm text-[var(--sys-muted-foreground)]"
      >
        إلغاء
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">{label}</span>
      {children}
    </label>
  );
}

export const POSTPONE_REASONS = [
  { value: 'CUSTOMER_REQUESTED_CALLBACK', label: 'العميل طلب معاودة الاتصال' },
  { value: 'POSTPONED', label: 'العميل طلب التأجيل' },
  { value: 'NO_ANSWER', label: 'لا يرد — إعادة المحاولة لاحقاً' },
  { value: 'FAILED_CONFIRMATION', label: 'تعذر التأكيد' },
  { value: 'OTHER', label: 'سبب آخر' },
] as const;

const PREFERRED_TIMES = ['صباحاً (9-12)', 'ظهراً (12-3)', 'عصراً (3-6)', 'مساءً (6-9)'] as const;

export interface PostponeValue {
  date: string;
  preferredTime: string;
  reason: string;
  note: string;
}

export function PostponeDialog({
  open,
  orderNumber,
  postponeCount,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  orderNumber: string;
  postponeCount: number;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (value: PostponeValue) => void;
}) {
  // Computed once on mount: reading the clock during render is impure.
  const [value, setValue] = useState<PostponeValue>(() => ({
    date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    preferredTime: PREFERRED_TIMES[0],
    reason: 'POSTPONED',
    note: '',
  }));
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <Modal isOpen={open} onClose={onClose} title="تأجيل الطلب" subtitle={orderNumber} maxWidth="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
        className="space-y-3"
      >
        {postponeCount > 0 && (
          <p className="text-xs text-[var(--sys-warning)] bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/30 rounded-lg p-2">
            هذا الطلب مؤجل {postponeCount} مرة سابقاً.
          </p>
        )}
        <Field label="تاريخ المعاودة">
          <input
            type="date"
            required
            min={today}
            value={value.date}
            onChange={(e) => setValue({ ...value, date: e.target.value })}
            className={FIELD_CLS}
            dir="ltr"
          />
        </Field>
        <Field label="الوقت المفضّل للعميل">
          <select
            value={value.preferredTime}
            onChange={(e) => setValue({ ...value, preferredTime: e.target.value })}
            className={FIELD_CLS}
          >
            {PREFERRED_TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="السبب">
          <select
            value={value.reason}
            onChange={(e) => setValue({ ...value, reason: e.target.value })}
            className={FIELD_CLS}
          >
            {POSTPONE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ملاحظة (اختياري)">
          <input
            value={value.note}
            onChange={(e) => setValue({ ...value, note: e.target.value })}
            className={FIELD_CLS}
            placeholder="مثال: العميل مسافر حتى الأحد"
          />
        </Field>
        <Buttons onCancel={onClose} busy={busy} submitLabel="تأجيل" />
      </form>
    </Modal>
  );
}

export const ISSUE_REASONS = [
  { value: 'WRONG_PHONE', label: 'رقم الهاتف خاطئ' },
  { value: 'WRONG_ADDRESS', label: 'العنوان خاطئ أو ناقص' },
  { value: 'WRONG_PRODUCT', label: 'المنتج خاطئ' },
  { value: 'MISSING_DATA', label: 'بيانات ناقصة' },
  { value: 'DUPLICATE', label: 'طلب مكرر' },
  { value: 'OTHER', label: 'سبب آخر' },
] as const;

export function IssueDialog({
  open,
  orderNumber,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  orderNumber: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (value: { reason: string; note: string }) => void;
}) {
  const [reason, setReason] = useState<string>('MISSING_DATA');
  const [note, setNote] = useState('');
  const noteRequired = reason === 'OTHER';

  return (
    <Modal isOpen={open} onClose={onClose} title="إشكال في بيانات الإدخال" subtitle={orderNumber} maxWidth="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ reason, note });
        }}
        className="space-y-3"
      >
        <p className="text-xs text-[var(--sys-muted-foreground)]">
          يعود الطلب إلى الطابور بتاريخه الأصلي، ولا يُحتسب إلغاءً عليك.
        </p>
        <Field label="نوع الإشكال">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD_CLS}>
            {ISSUE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={noteRequired ? 'التفاصيل (إلزامية)' : 'تفاصيل (اختياري)'}>
          <textarea
            required={noteRequired}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-sm focus:outline-none focus:border-[var(--sys-primary)]"
            placeholder="مثال: رقم الهاتف ٨ أرقام فقط"
          />
        </Field>
        <Buttons onCancel={onClose} busy={busy} submitLabel="فتح الإشكال" />
      </form>
    </Modal>
  );
}

export const CHANGE_FIELDS = [
  { value: 'customerName', label: 'اسم العميل' },
  { value: 'customerPhone', label: 'رقم الهاتف' },
  { value: 'customerAltPhone', label: 'رقم بديل' },
  { value: 'customerAddress', label: 'العنوان' },
  { value: 'customerCity', label: 'المدينة' },
  { value: 'quantity', label: 'الكمية' },
  { value: 'discountAmount', label: 'الخصم' },
  { value: 'customerNotes', label: 'ملاحظات العميل' },
] as const;

export function ChangeRequestDialog({
  open,
  orderNumber,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  orderNumber: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (value: { field: string; to: string; reason: string }) => void;
}) {
  const [field, setField] = useState<string>(CHANGE_FIELDS[0].value);
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const numeric = field === 'quantity' || field === 'discountAmount';

  return (
    <Modal isOpen={open} onClose={onClose} title="طلب تعديل على طلب مؤكد" subtitle={orderNumber} maxWidth="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ field, to, reason });
        }}
        className="space-y-3"
      >
        <p className="text-xs text-[var(--sys-muted-foreground)]">
          الطلب المؤكد للقراءة فقط. يراجع المشرف التعديل، ويتوقف تقدّم الطلب حتى صدور القرار.
        </p>
        <Field label="الحقل المطلوب تعديله">
          <select value={field} onChange={(e) => setField(e.target.value)} className={FIELD_CLS}>
            {CHANGE_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="القيمة الجديدة">
          <input
            required
            type={numeric ? 'number' : 'text'}
            min={numeric ? 0 : undefined}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={FIELD_CLS}
            dir={field === 'customerPhone' || field === 'customerAltPhone' || numeric ? 'ltr' : undefined}
          />
        </Field>
        <Field label="سبب التعديل">
          <textarea
            required
            minLength={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-sm focus:outline-none focus:border-[var(--sys-primary)]"
            placeholder="مثال: العميل أعطى عنواناً جديداً عند الاتصال"
          />
        </Field>
        <Buttons onCancel={onClose} busy={busy} submitLabel="إرسال الطلب" />
      </form>
    </Modal>
  );
}

/**
 * The customer said no.
 *
 * Reasons are a fixed list, not free text, because "ألغى" in a hundred
 * rows tells nobody anything while "السعر مرتفع" repeated forty times is a
 * price decision waiting to be made. The list is the same one the server
 * accepts — an unknown reason is refused there, so a free-text box would
 * only produce errors.
 */
export const REJECT_REASONS = [
  { value: 'CUSTOMER_CHANGED_MIND', label: 'غيّر رأيه' },
  { value: 'PRICE_TOO_HIGH', label: 'السعر مرتفع' },
  { value: 'CUSTOMER_DOES_NOT_WANT_PRODUCT', label: 'لا يريد المنتج' },
  { value: 'DUPLICATE_ORDER', label: 'طلب مكرر' },
  { value: 'WRONG_NUMBER', label: 'رقم خاطئ' },
  { value: 'FAKE_ORDER', label: 'طلب وهمي' },
  { value: 'OUT_OF_SERVICE_AREA', label: 'خارج نطاق التوصيل' },
  { value: 'OTHER', label: 'سبب آخر' },
] as const;

export function RejectDialog({
  open,
  orderNumber,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  orderNumber: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (value: { rejectionReason: string; note: string }) => void;
}) {
  const [rejectionReason, setReason] = useState<string>('CUSTOMER_CHANGED_MIND');
  const [note, setNote] = useState('');
  // The server demands a note of its own for OTHER; asking here saves a
  // round trip that ends in a red error.
  const noteRequired = rejectionReason === 'OTHER';

  return (
    <Modal isOpen={open} onClose={onClose} title="إلغاء الطلب" subtitle={orderNumber} maxWidth="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ rejectionReason, note });
        }}
        className="space-y-3"
      >
        <p className="text-xs text-[var(--sys-muted-foreground)]">
          يُغلق الطلب ويعود المحجوز من بضاعته إلى المخزون. القرار يُسجَّل باسمك.
        </p>
        <Field label="السبب">
          <select value={rejectionReason} onChange={(e) => setReason(e.target.value)} className={FIELD_CLS}>
            {REJECT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={noteRequired ? 'التفاصيل (إلزامية)' : 'تفاصيل (اختياري)'}>
          <textarea
            required={noteRequired}
            minLength={noteRequired ? 5 : undefined}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            className={FIELD_CLS}
          />
        </Field>
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-[var(--sys-destructive)] text-[var(--sys-primary-foreground)] text-sm font-medium disabled:opacity-60"
          >
            ألغِ الطلب
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--sys-border)] text-sm text-[var(--sys-muted-foreground)]"
          >
            تراجع
          </button>
        </div>
      </form>
    </Modal>
  );
}
