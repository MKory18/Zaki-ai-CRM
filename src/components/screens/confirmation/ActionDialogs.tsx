'use client';

import React, { useState } from 'react';
import { PICKABLE_REJECTION_REASONS, REJECTION_REASON_AR } from '@/lib/confirmation-workflow';
import { CHANGE_INTENTS, INTENT_AR, refusalFor, type ChangeIntent } from '@/lib/change-request-intent';
import { Modal } from '@/components/ui/Modal';

/**
 * Dialogs for the confirmation screen: a date picker for postponing, and
 * real dropdowns for issue and change-request reasons. Nothing here is typed
 * free-hand unless the reason itself is "other".
 */

const FIELD_CLS =
  'w-full h-11 md:h-10 px-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-sm focus:outline-none focus:border-[var(--sys-primary)]';

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
            placeholder="مثال: رقم الهاتف 8 أرقام فقط"
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

export interface ChangeRequestValue {
  intent: ChangeIntent;
  /** EDIT only. */
  field: string;
  to: string;
  /** POSTPONE only — yyyy-mm-dd. */
  postponeDate: string;
  /** CANCEL only — one of the structured reasons. */
  cancelReason: string;
  reason: string;
}

/**
 * THREE DOORS, NOT ONE.
 *
 * What the customer says on the phone after the order is confirmed is one
 * of three things: change something, cancel it, or not this week. The agent
 * had a door for the first and, once she had pressed «تأكيد», none at all
 * for the other two — her «ألغِ» and «تأجيل» buttons live on the queue
 * screen and are gone by then.
 *
 * So the three are chosen first, because they are three different
 * conversations and asking «which field?» of somebody cancelling an order
 * is the wrong first question. Each shows only what it needs, and the
 * reason — the sentence the decider actually reads — is common to all.
 *
 * WHAT IS IMPOSSIBLE IS NOT OFFERED. A parcel already with the courier
 * cannot be postponed: there is nothing left to hold back. `refusalFor`
 * says so — the same function the route refuses with, so the door and the
 * answer can never disagree — and the button is disabled with its sentence
 * beside it rather than failing two hours later in somebody's queue.
 */
export function ChangeRequestDialog({
  open,
  orderNumber,
  busy,
  hasLeftWarehouse = false,
  onClose,
  onSubmit,
}: {
  open: boolean;
  orderNumber: string;
  busy?: boolean;
  /** The parcel is with the courier — what that rules out is shown, not hidden. */
  hasLeftWarehouse?: boolean;
  onClose: () => void;
  onSubmit: (value: ChangeRequestValue) => void;
}) {
  const [intent, setIntent] = useState<ChangeIntent>('EDIT');
  const [field, setField] = useState<string>(CHANGE_FIELDS[0].value);
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [cancelReason, setCancelReason] = useState<string>(PICKABLE_REJECTION_REASONS[0]);
  const [postponeDate, setPostponeDate] = useState(() =>
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const numeric = field === 'quantity' || field === 'discountAmount';
  const blockedPostpone = refusalFor('POSTPONE', { hasLeftWarehouse });

  return (
    <Modal isOpen={open} onClose={onClose} title="طلب على طلب مؤكد" subtitle={orderNumber} maxWidth="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ intent, field, to, postponeDate, cancelReason, reason });
        }}
        className="space-y-3"
      >
        {/* WHAT YOU ARE ASKING FOR — first, because it decides the rest. */}
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--sys-surface-strong)] p-0.5">
          {CHANGE_INTENTS.map((k) => {
            const blocked = refusalFor(k, { hasLeftWarehouse });
            return (
              <button
                key={k}
                type="button"
                disabled={!!blocked}
                title={blocked ?? undefined}
                onClick={() => setIntent(k)}
                className={`min-h-11 md:min-h-9 rounded-md px-2 text-xs font-semibold transition disabled:opacity-40 ${
                  intent === k
                    ? 'bg-[var(--sys-card)] text-[var(--sys-primary)] shadow-raised'
                    : 'text-[var(--sys-muted-foreground)] hover:text-[var(--sys-foreground)]'
                }`}
              >
                {INTENT_AR[k]}
              </button>
            );
          })}
        </div>

        {hasLeftWarehouse && intent !== 'POSTPONE' && (
          <p className="text-xs text-[var(--sys-warning)] bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)]/30 rounded-lg p-2">
            الطرد عند شركة الشحن — يُنفَّذ برسالةٍ إليهم بعد الموافقة، لا بتعديلٍ عندنا.
          </p>
        )}
        {blockedPostpone && (
          <p className="text-xs text-[var(--sys-muted-foreground)]">{blockedPostpone}</p>
        )}

        <p className="text-xs text-[var(--sys-muted-foreground)]">
          الطلب المؤكد للقراءة فقط. يراجع المشرف الطلب، ويتوقف تقدّم الطلب حتى صدور القرار.
        </p>

        {intent === 'EDIT' && (
          <>
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
          </>
        )}

        {intent === 'CANCEL' && (
          <Field label="سبب الإلغاء">
            {/* The taxonomy, picked by the person who heard it. The decider
                reads her sentence below; they should not also have to guess
                which of the eight she meant — the reports count this one. */}
            <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={FIELD_CLS}>
              {PICKABLE_REJECTION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REJECTION_REASON_AR[r] ?? r}
                </option>
              ))}
            </select>
          </Field>
        )}

        {intent === 'POSTPONE' && (
          <Field label="يُؤجَّل حتى">
            <input
              type="date"
              required
              min={today}
              value={postponeDate}
              onChange={(e) => setPostponeDate(e.target.value)}
              className={FIELD_CLS}
              dir="ltr"
            />
          </Field>
        )}

        <Field label={intent === 'EDIT' ? 'سبب التعديل' : 'ما قاله العميل'}>
          <textarea
            required
            minLength={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-sm focus:outline-none focus:border-[var(--sys-primary)]"
            placeholder={
              intent === 'EDIT'
                ? 'مثال: العميل أعطى عنواناً جديداً عند الاتصال'
                : intent === 'CANCEL'
                  ? 'مثال: العميل اشترى المنتج من مكان آخر'
                  : 'مثال: العميل مسافر ويعود يوم الأحد'
            }
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
 * Reasons are a fixed list, not free text, because "ألغى" in a hundred rows
 * tells nobody anything while "السعر مرتفع" repeated forty times is a price
 * decision waiting to be made.
 *
 * AND THE LIST IS NOT COPIED HERE ANY MORE. This was the THIRD copy of it —
 * the workflow held ten codes, `ConfirmationActions` held eight, and this
 * held eight in a different order with different words for two of them. The
 * comment above it said «the same one the server accepts», and it had already
 * stopped being that. A reason the server stores and no screen can spell
 * renders to an Arabic reader as a raw English constant.
 */
export const REJECT_REASONS = PICKABLE_REJECTION_REASONS.map((value) => ({
  value,
  label: REJECTION_REASON_AR[value] ?? value,
}));

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
