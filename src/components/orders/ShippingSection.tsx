'use client';

/**
 * SALESFLOW — Phase D2: Shipping & Delivery section in Order Details.
 * Shows status timeline, provider, tracking, batch, attempts.
 * All mutations go through /api/orders/[id]/shipping (backend-enforced);
 * this component renders server state and never decides permissions.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { apiFetch } from '@/lib/api-client';
import { arDateShort } from '@/lib/format';
import {
  Truck,
  Package,
  PackageCheck,
  Ship,
  MapPin,
  XCircle,
  Undo2,
  Clock,
  History,
  Hash,
} from 'lucide-react';

/** Delivery attempt outcomes, stored as codes and read as words. */
const ATTEMPT_RESULT_AR: Record<string, string> = {
  DELIVERED: 'سُلّم',
  PARTIALLY_DELIVERED: 'سُلّم جزئياً',
  FAILED: 'فشل',
  FAILED_DELIVERY: 'فشل التوصيل',
  CUSTOMER_NOT_AVAILABLE: 'العميل غير متواجد',
  PHONE_UNREACHABLE: 'الهاتف مغلق',
  WRONG_ADDRESS: 'عنوان خاطئ',
  CUSTOMER_REFUSED: 'العميل رفض الاستلام',
  ADDRESS_NOT_FOUND: 'العنوان غير موجود',
  AREA_NOT_SERVICED: 'المنطقة خارج التغطية',
  CUSTOMER_REQUESTED_DELAY: 'العميل طلب التأجيل',
  RESCHEDULED: 'أُعيدت جدولته',
  OTHER: 'أخرى',
};


const SHIPPING_STATE: Record<string, { ar: string; en: string; cls: string }> = {
  NOT_READY: { ar: 'غير جاهز', en: 'Not Ready', cls: 'bg-[var(--sys-surface-strong)] text-[var(--sys-muted-foreground)] border-[var(--sys-border-strong)]' },
  READY_FOR_SHIPPING: { ar: 'جاهز للشحن', en: 'Ready for Shipping', cls: 'bg-[var(--sys-surface)] text-[var(--sys-info)] border-[var(--sys-info)]/50' },
  PACKING: { ar: 'تغليف', en: 'Packing', cls: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
  READY_FOR_PICKUP: { ar: 'جاهز للاستلام', en: 'Ready for Pickup', cls: 'bg-cyan-50 text-cyan-700 border-cyan-300' },
  SHIPPED: { ar: 'تم الشحن', en: 'Shipped', cls: 'bg-violet-50 text-violet-700 border-violet-300' },
  OUT_FOR_DELIVERY: { ar: 'خرج للتوصيل', en: 'Out for Delivery', cls: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/60' },
  DELIVERED: { ar: 'تم التسليم ✓', en: 'Delivered ✓', cls: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[var(--sys-success)]/60' },
  FAILED_DELIVERY: { ar: 'فشل التوصيل', en: 'Delivery Failed', cls: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]' },
  RETURN_REQUESTED: { ar: 'طلب إرجاع', en: 'Return Requested', cls: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]/60' },
  RETURNED: { ar: 'مُرتجع', en: 'Returned', cls: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] border-[var(--sys-destructive-border)]' },
  CANCELLED: { ar: 'ملغى', en: 'Cancelled', cls: 'bg-[var(--sys-surface-strong)] text-[var(--sys-muted-foreground)] border-[var(--sys-border-strong)]' },
};

const FAILURE_REASONS: Record<string, { ar: string; en: string }> = {
  CUSTOMER_NOT_AVAILABLE: { ar: 'العميل غير متوفر', en: 'Customer not available' },
  PHONE_UNREACHABLE: { ar: 'الهاتف لا يرد', en: 'Phone unreachable' },
  WRONG_ADDRESS: { ar: 'عنوان خاطئ', en: 'Wrong address' },
  CUSTOMER_REFUSED: { ar: 'العميل رفض', en: 'Customer refused' },
  ADDRESS_NOT_FOUND: { ar: 'العنوان غير موجود', en: 'Address not found' },
  AREA_NOT_SERVICED: { ar: 'منطقة غير مخدومة', en: 'Area not serviced' },
  CUSTOMER_REQUESTED_DELAY: { ar: 'العميل طلب تأخير', en: 'Customer requested delay' },
  OTHER: { ar: 'أخرى', en: 'Other' },
};

const RETURN_REASONS: Record<string, { ar: string; en: string }> = {
  CUSTOMER_REFUSED: { ar: 'العميل رفض', en: 'Customer refused' },
  FAILED_DELIVERY: { ar: 'فشل التوصيل', en: 'Failed delivery' },
  DAMAGED_PRODUCT: { ar: 'منتج تالف', en: 'Damaged product' },
  WRONG_PRODUCT: { ar: 'منتج خاطئ', en: 'Wrong product' },
  CUSTOMER_REQUEST: { ar: 'طلب العميل', en: 'Customer request' },
  OTHER: { ar: 'أخرى', en: 'Other' },
};

/** Next allowed transitions per current status (mirrors backend map for UX only) */
const NEXT_ACTIONS: Record<string, { to: string; labelAr: string; labelEn: string; cls: string }[]> = {
  // NOT_READY offers nothing here on purpose. An order becomes ready to ship
  // in the preparation screen, where the stock is actually reserved against
  // its lines; a button here only ever produced "الشحن يتطلب طلباً مؤكداً".
  NOT_READY: [],
  READY_FOR_SHIPPING: [{ to: 'PACKING', labelAr: '📦 بدء التغليف', labelEn: '📦 Start Packing', cls: 'border-indigo-300 text-indigo-700 hover:bg-indigo-50' }],
  PACKING: [{ to: 'READY_FOR_PICKUP', labelAr: '🚚 جاهز للاستلام', labelEn: '🚚 Ready for Pickup', cls: 'border-cyan-300 text-cyan-700 hover:bg-cyan-50' }],
  READY_FOR_PICKUP: [{ to: 'SHIPPED', labelAr: '🚀 تم الشحن', labelEn: '🚀 Shipped', cls: 'border-violet-300 text-violet-700 hover:bg-violet-50' }],
  SHIPPED: [{ to: 'OUT_FOR_DELIVERY', labelAr: '🛵 خرج للتوصيل', labelEn: '🛵 Out for Delivery', cls: 'border-[var(--sys-warning)]/60 text-[var(--sys-warning)] hover:bg-[var(--sys-warning-soft)]' }],
  OUT_FOR_DELIVERY: [
    { to: 'DELIVERED', labelAr: '✅ تم التسليم', labelEn: '✅ Delivered', cls: 'border-green-400 text-[var(--sys-success)] hover:bg-[var(--sys-success-soft)]' },
    { to: 'FAILED_DELIVERY', labelAr: '⚠️ فشل التوصيل', labelEn: '⚠️ Failed', cls: 'border-[var(--sys-destructive-border)] text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive-soft)]' },
  ],
  FAILED_DELIVERY: [
    { to: 'RETURN_REQUESTED', labelAr: '↩️ طلب إرجاع', labelEn: '↩️ Return', cls: 'border-[var(--sys-warning)]/60 text-[var(--sys-warning)] hover:bg-[var(--sys-warning-soft)]' },
    { to: 'SHIPPED', labelAr: '🔁 إعادة شحن', labelEn: '🔁 Retry Ship', cls: 'border-violet-300 text-violet-700 hover:bg-violet-50' },
  ],
  RETURN_REQUESTED: [{ to: 'RETURNED', labelAr: '↩️ تم الإرجاع', labelEn: '↩️ Returned', cls: 'border-[var(--sys-destructive-border)] text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive-soft)]' }],
};

interface ShippingSectionProps {
  order: any;
  ar: boolean;
  isRtl: boolean;
  onRefreshOrder: () => void | Promise<void>;
  /**
   * May this person move the shipment at all?
   *
   * The server already refuses them — every action here needs
   * orders.change_status — but showing the buttons to a confirmation agent
   * or a moderator invites a click that can only end in a red error, and
   * teaches them the screen is unreliable. Worse, this modal opens from
   * half a dozen screens, so "who is looking at it" is never obvious from
   * the buttons alone.
   */
  canEdit?: boolean;
}

export function ShippingSection({ order, ar, isRtl, onRefreshOrder, canEdit = true }: ShippingSectionProps) {
  const [providers, setProviders] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // form state
  const [openForm, setOpenForm] = useState<string | null>(null); // 'fail' | 'return' | 'provider' | 'tracking'
  const [providerId, setProviderId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    setFeedback(null);
    loadProviders();
    loadAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const loadProviders = async () => {
    try {
      const res = await apiFetch('/api/delivery-providers');
      if (res.ok) setProviders((await res.json()).providers || []);
      else setListError((ar ? 'فشل تحميل شركات التوصيل' : 'Failed to load providers') + ` (HTTP ${res.status})`);
    } catch (e: any) {
      setListError(e?.message || (ar ? 'فشل تحميل شركات التوصيل' : 'Failed to load providers'));
    }
  };

  const loadAttempts = async () => {
    if (!order?.id) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/orders/${order.id}/delivery-attempts`);
      if (res.ok) {
        setAttempts((await res.json()).attempts || []);
        setListError(null);
      } else {
        setListError((ar ? 'فشل تحميل سجل التوصيل' : 'Failed to load attempts') + ` (HTTP ${res.status})`);
      }
    } catch (e: any) {
      setListError(e?.message || (ar ? 'فشل تحميل سجل التوصيل' : 'Failed to load attempts'));
    } finally {
      setLoading(false);
    }
  };

  /** Submit one shipping action. Returns the updated order (with fresh version)
   *  so multi-step sequences can thread optimistic-concurrency versions. */
  const submit = async (payload: Record<string, unknown>): Promise<{ ok: boolean; order?: any }> => {
    return submitWithVersion(payload, order.version);
  };

  const submitWithVersion = async (payload: Record<string, unknown>, expectedVersion: number): Promise<{ ok: boolean; order?: any }> => {
    if (!order?.id) return { ok: false };
    setActionLoading(String(payload.action));
    setFeedback(null);
    try {
      const res = await apiFetch(`/api/orders/${order.id}/shipping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, expectedVersion }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.errorAr || data.error || (ar ? 'فشل الإجراء' : 'Action failed') });
        return { ok: false };
      }
      setFeedback({ type: 'success', text: ar ? 'تم تحديث الشحن ✓' : 'Shipping updated ✓' });
      await onRefreshOrder();
      await loadAttempts();
      return { ok: true, order: data.order };
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || (ar ? 'فشل الإجراء' : 'Action failed') });
      return { ok: false };
    } finally {
      setActionLoading(null);
    }
  };

  /** Single-step transition: close the form + clear inputs only on success */
  const transition = async (to: string, extra: Record<string, unknown> = {}) => {
    const result = await submit({ action: 'transition', to, ...extra });
    if (result.ok) {
      setNote(''); setFailureReason(''); setReturnReason(''); setOpenForm(null);
    }
    return result.ok;
  };

  /** Record a delivery attempt; returns ok so sequences can abort on failure */
  const recordAttempt = async (result: string): Promise<boolean> => {
    setActionLoading('attempt');
    setFeedback(null);
    try {
      const res = await apiFetch(`/api/orders/${order.id}/delivery-attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result, failureReason, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.errorAr || data.error || (ar ? 'فشل التسجيل' : 'Failed') });
        return false;
      }
      await loadAttempts();
      return true;
    } catch (e: any) {
      setFeedback({ type: 'error', text: e?.message || (ar ? 'فشل التسجيل' : 'Failed') });
      return false;
    } finally {
      setActionLoading(null);
    }
  };

  const st = SHIPPING_STATE[order?.shippingStatus] ?? SHIPPING_STATE.NOT_READY;
  const terminal = ['DELIVERED', 'RETURNED', 'CANCELLED'].includes(order?.shippingStatus);
  const canTrack = !['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RETURN_REQUESTED', 'RETURNED'].includes(order?.shippingStatus);
  const actions = NEXT_ACTIONS[order?.shippingStatus] ?? [];

  return (
    <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4 shadow-xs" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h4 className="text-xs font-black uppercase tracking-wide text-[var(--sys-foreground)] flex items-center gap-2">
          <Truck className="w-4 h-4 text-[var(--sys-destructive)]" />
          {ar ? 'الشحن والتوصيل' : 'Shipping & Delivery'}
        </h4>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-2 text-[11px] font-bold ${st.cls}`}>
          {ar ? st.ar : st.en}
        </span>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs mb-3">
        <Info label={ar ? 'شركة التوصيل' : 'Provider'} value={order.deliveryProvider?.name || (ar ? 'غير معيّنة' : 'None')} />
        <Info label={ar ? 'رقم التتبع' : 'Tracking #'} value={order.trackingNumber || '—'} mono />
        <Info label={ar ? 'دفعة الشحن' : 'Batch'} value={order.shippingBatch?.batchNumber || '—'} mono />
        <Info label={ar ? 'شُحن في' : 'Shipped At'} value={arDateShort(order.shippedAt)} />
        <Info label={ar ? 'خرج للتوصيل' : 'Out for Delivery'} value={arDateShort(order.outForDeliveryAt)} />
        <Info label={ar ? 'سُلّم في' : 'Delivered At'} value={arDateShort(order.deliveredAt)} />
      </div>

      {/* Failure/return reasons */}
      {order.shippingStatus === 'FAILED_DELIVERY' && order.deliveryFailureReason && (
        <p className="mb-3 text-[11px] text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg px-2.5 py-1.5">
          ⚠️ {ar ? 'سبب الفشل:' : 'Failure reason:'}{' '}
          {(FAILURE_REASONS as any)[order.deliveryFailureReason]?.[ar ? 'ar' : 'en'] ?? order.deliveryFailureReason}
          {order.deliveryNote ? ` — ${order.deliveryNote}` : ''}
        </p>
      )}
      {order.returnReason && ['RETURN_REQUESTED', 'RETURNED'].includes(order.shippingStatus) && (
        <p className="mb-3 text-[11px] text-[var(--sys-warning)] bg-[var(--sys-warning-soft)] border border-orange-200 rounded-lg px-2.5 py-1.5">
          ↩️ {ar ? 'سبب الإرجاع:' : 'Return reason:'}{' '}
          {(RETURN_REASONS as any)[order.returnReason]?.[ar ? 'ar' : 'en'] ?? order.returnReason}
        </p>
      )}

      {!canEdit && (
        <p className="mb-3 text-[11px] text-[var(--sys-muted-foreground)] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg px-2.5 py-2">
          الشحن والتوصيل للعرض فقط — تحريكه من صلاحية فريق الشحن.
        </p>
      )}

      {/* Quick transition actions (backend validates everything) */}
      {canEdit && !terminal && actions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {actions.map((a) => (
            <button
              key={a.to}
              onClick={() => {
                setNote('');
                if (a.to === 'FAILED_DELIVERY') { setOpenForm('fail'); return; }
                if (a.to === 'RETURN_REQUESTED' || a.to === 'RETURNED') { setOpenForm('return'); return; }
                transition(a.to);
              }}
              disabled={actionLoading !== null}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 transition-colors cursor-pointer disabled:opacity-50 ${a.cls}`}
            >
              {a.to === 'DELIVERED' ? <PackageCheck className="w-3.5 h-3.5" /> : a.to === 'FAILED_DELIVERY' ? <XCircle className="w-3.5 h-3.5" /> : a.to === 'RETURNED' || a.to === 'RETURN_REQUESTED' ? <Undo2 className="w-3.5 h-3.5" /> : <Ship className="w-3.5 h-3.5" />}
              {ar ? a.labelAr : a.labelEn}
            </button>
          ))}
          {canTrack && (
            <button
              onClick={() => { setTrackingNumber(order.trackingNumber || ''); setDeliveryFee(order.deliveryFee ? String(order.deliveryFee) : ''); setOpenForm('tracking'); }}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 border-[var(--sys-border-strong)] text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <Hash className="w-3.5 h-3.5" />{ar ? 'رقم التتبع' : 'Tracking'}
            </button>
          )}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`mb-3 rounded-lg border p-2.5 text-xs flex items-center justify-between gap-2 ${
          feedback.type === 'success' ? 'border-[var(--sys-success)]/60 bg-[var(--sys-success-soft)] text-[var(--sys-success)]' : 'border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)]'
        }`}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="opacity-60 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      {/* Inline load error (providers / attempts) */}
      {listError && (
        <div className="mb-3 rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] p-2.5 text-xs flex items-center justify-between gap-2">
          <span>{listError}</span>
          <button onClick={() => setListError(null)} className="opacity-60 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      {/* Delivery attempts (append-only history) */}
      <div className="border-t border-slate-100 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sys-muted)] mb-2 flex items-center gap-1.5">
          <History className="w-3 h-3" />
          {ar ? 'سجل الشحن والتوصيل' : 'Shipping & Delivery Timeline'}
          {loading && <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-[var(--sys-destructive)]" />}
        </p>
        {attempts.length === 0 ? (
          <p className="text-[11px] text-[var(--sys-muted)] py-1.5">{ar ? 'لا محاولات توصيل بعد.' : 'No delivery attempts yet.'}</p>
        ) : (
          <div className="space-y-1.5">
            {attempts.map((att: any) => (
              <div key={att.id} className={`p-2 rounded-lg border text-[11px] ${
                att.result === 'DELIVERED' ? 'bg-[var(--sys-success-soft)]/60 border-[var(--sys-success)]/40' : att.result === 'FAILED' ? 'bg-[var(--sys-destructive-soft)]/60 border-[var(--sys-destructive-border)]' : 'bg-[var(--sys-surface)] border-[var(--sys-border)]'
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="font-bold text-[var(--sys-foreground)]">
                    {ar ? `محاولة #${att.attemptNumber}` : `Attempt #${att.attemptNumber}`} — {ATTEMPT_RESULT_AR[att.result] ?? att.result}
                  </span>
                  <span className="text-[var(--sys-muted)]">{arDateShort(att.createdAt)}</span>
                </div>
                <div className="text-[var(--sys-muted-foreground)] mt-0.5 flex flex-wrap gap-x-3">
                  <span>{ar ? 'بواسطة:' : 'By:'} <span className="font-semibold">{att.agent?.name ?? '—'}</span></span>
                  {att.provider && <span>{ar ? 'المندوب:' : 'Provider:'} {att.provider.name}</span>}
                  {att.failureReason && <span className="text-[var(--sys-destructive)]">{(FAILURE_REASONS as any)[att.failureReason]?.[ar ? 'ar' : 'en'] ?? att.failureReason}</span>}
                </div>
                {att.note && <p className="text-[var(--sys-muted-foreground)] mt-0.5">{att.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Forms ─── */}
      <Modal isOpen={openForm === 'fail'} onClose={() => setOpenForm(null)} title={ar ? '⚠️ تسجيل فشل التوصيل' : '⚠️ Record Delivery Failure'} maxWidth="md">
        <div className="space-y-3" dir={isRtl ? 'rtl' : 'ltr'}>
          <Select label={ar ? 'سبب الفشل *' : 'Failure Reason *'} value={failureReason} onChange={(e) => setFailureReason(e.target.value)}>
            <option value="">— {ar ? 'اختر السبب' : 'Select'} —</option>
            {Object.entries(FAILURE_REASONS).map(([k, v]) => <option key={k} value={k}>{ar ? v.ar : v.en}</option>)}
          </Select>
          <Textarea
            label={failureReason === 'OTHER' ? `${ar ? 'ملاحظة (إلزامية)' : 'Note (required)'} *` : ar ? 'ملاحظة' : 'Note'}
            rows={2} value={note} onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpenForm(null)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
            <Button
              size="sm" loading={actionLoading === 'transition'} className="bg-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]"
              disabled={!failureReason || (failureReason === 'OTHER' && note.trim().length < 5)}
              onClick={async () => {
                // 1. record attempt 2. transition — abort the sequence on first
                // failure and keep the modal open so the user can retry
                const attemptOk = await recordAttempt('FAILED');
                if (!attemptOk) return;
                const transitionOk = await transition('FAILED_DELIVERY', { deliveryFailureReason: failureReason, shippingNote: note });
                if (transitionOk) {
                  setNote(''); setFailureReason('');
                  setOpenForm(null);
                }
              }}
            >
              {ar ? 'تأكيد الفشل' : 'Confirm Failure'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={openForm === 'return'} onClose={() => setOpenForm(null)} title={ar ? '↩️ طلب إرجاع' : '↩️ Return Request'} maxWidth="md">
        <div className="space-y-3" dir={isRtl ? 'rtl' : 'ltr'}>
          <Select label={ar ? 'سبب الإرجاع *' : 'Return Reason *'} value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
            <option value="">— {ar ? 'اختر السبب' : 'Select'} —</option>
            {Object.entries(RETURN_REASONS).map(([k, v]) => <option key={k} value={k}>{ar ? v.ar : v.en}</option>)}
          </Select>
          <Textarea label={ar ? 'ملاحظة' : 'Note'} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpenForm(null)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
            <Button
              size="sm" loading={actionLoading === 'transition'} className="bg-orange-600 hover:bg-orange-700"
              disabled={!returnReason}
              onClick={async () => {
                const ok = await transition('RETURN_REQUESTED', { returnReason, shippingNote: note });
                if (ok) { setNote(''); setReturnReason(''); setOpenForm(null); }
              }}
            >
              {ar ? 'تأكيد الإرجاع' : 'Confirm Return'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={openForm === 'tracking'} onClose={() => setOpenForm(null)} title={ar ? '🔢 بيانات التتبع' : 'Tracking Details'} maxWidth="md">
        <div className="space-y-3" dir={isRtl ? 'rtl' : 'ltr'}>
          <Select
            label={ar ? 'شركة التوصيل' : 'Delivery Provider'}
            value={providerId || order.deliveryProviderId || ''}
            onChange={(e) => setProviderId(e.target.value)}
          >
            <option value="">— {ar ? 'بدون' : 'None'} —</option>
            {providers.filter((p) => p.isActive).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
            ))}
          </Select>
          <Input label={ar ? 'رقم التتبع' : 'Tracking Number'} value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} dir="ltr" />
          <Input label={ar ? 'رسوم التوصيل ($)' : 'Delivery Fee ($)'} type="number" step="0.01" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} dir="ltr" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpenForm(null)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
            <Button
              size="sm" loading={actionLoading !== null} className="bg-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]"
              onClick={async () => {
                // Sequence: assign_provider → update_tracking. Each call must use
                // the LATEST version from the previous response — abort on first
                // failure and keep the modal open so the user can retry.
                let currentVersion = order.version;
                if (providerId && providerId !== (order.deliveryProviderId ?? '')) {
                  const r1 = await submit({ action: 'assign_provider', deliveryProviderId: providerId });
                  if (!r1.ok) return;
                  currentVersion = r1.order?.version ?? currentVersion;
                }
                if (trackingNumber !== (order.trackingNumber ?? '') || deliveryFee !== String(order.deliveryFee ?? '')) {
                  const r2 = await submitWithVersion({
                    action: 'update_tracking',
                    trackingNumber,
                    deliveryFee: deliveryFee ? Number(deliveryFee) : 0,
                  }, currentVersion);
                  if (!r2.ok) return;
                }
                // Full sequence succeeded → close + refresh
                setTrackingNumber(''); setDeliveryFee(''); setProviderId('');
                setOpenForm(null);
                await onRefreshOrder();
              }}
            >
              {ar ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-[var(--sys-surface)] px-2.5 py-2">
      <p className="text-[10px] text-[var(--sys-muted)]">{label}</p>
      <p className={`text-xs font-bold text-[var(--sys-foreground)] truncate ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : undefined}>{value}</p>
    </div>
  );
}
