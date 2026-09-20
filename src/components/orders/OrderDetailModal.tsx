'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { Select, Textarea, Input } from '@/components/ui/Input';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { useOrderOwnership } from '@/hooks/useOrderOwnership';
import { OwnershipSection } from '@/components/orders/OwnershipSection';
import { ConfirmationActions } from '@/components/orders/ConfirmationActions';
import { ShippingSection } from '@/components/orders/ShippingSection';
import { useApp } from '@/context/AppContext';
import { apiFetch, apiJson } from '@/lib/api-client';
import { CustomerHistoryButton } from '@/components/orders/CustomerHistory';
import { OrderStateBadge } from '@/components/orders/OrderStateBadge';
import { useRegions } from '@/hooks/useRegions';
import { format } from 'date-fns';
import {
  User,
  Phone,
  PhoneCall,
  History,
  Clock,
  CalendarClock,
  DollarSign,
  MapPin,
  StickyNote,
  Truck,
  Save,
  MessageSquareText,
  Tag,
  UserCheck,
  Send,
  ChevronLeft,
  ChevronRight,
  Lock,
  Pencil,
  Bike,
} from 'lucide-react';

/* ─── Status config: Arabic label + color + icon per status ─── */
/** Settlement is its own fact, never merged into the delivery status. */
const SETTLEMENT_AR: Record<string, string> = {
  PENDING: 'بانتظار التسوية',
  PENDING_COLLECTION: 'لم يُحصَّل',
  COLLECTED: 'محصَّل',
  PARTIALLY_SETTLED: 'مسوّى جزئياً',
  SETTLED: 'مسوّى',
  UNSETTLED: 'غير مسوّى',
  REFUNDED: 'مُسترد',
  CANCELLED: 'ملغى',
};

const STATUS_CONFIG: Record<
  string,
  { ar: string; en: string; pill: string; select: string; icon: React.ElementType }
> = {
  NEW: { ar: 'جديد', en: 'New', pill: 'bg-blue-50 text-blue-700 border-blue-300', select: 'bg-blue-50 text-blue-800', icon: Clock },
  CONTACTING: { ar: 'قيد التواصل', en: 'Contacting', pill: 'bg-purple-50 text-purple-700 border-purple-300', select: 'bg-purple-50 text-purple-800', icon: PhoneCall },
  NO_ANSWER: { ar: 'لا يجيب', en: 'No Answer', pill: 'bg-amber-50 text-amber-700 border-amber-300', select: 'bg-amber-50 text-amber-800', icon: Phone },
  CONFIRMED: { ar: 'مؤكد', en: 'Confirmed', pill: 'bg-green-50 text-green-700 border-green-300', select: 'bg-green-50 text-green-800', icon: CheckIcon },
  POSTPONED: { ar: 'مؤجل', en: 'Postponed', pill: 'bg-orange-50 text-orange-700 border-orange-300', select: 'bg-orange-50 text-orange-800', icon: CalendarClock },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', pill: 'bg-red-50 text-red-700 border-red-300', select: 'bg-red-50 text-red-800', icon: XIcon },
  READY_FOR_SHIPPING: { ar: 'جاهز للشحن', en: 'Ready for Shipping', pill: 'bg-cyan-50 text-cyan-700 border-cyan-300', select: 'bg-cyan-50 text-cyan-800', icon: Tag },
  SHIPPED: { ar: 'تم الشحن', en: 'Shipped', pill: 'bg-indigo-50 text-indigo-700 border-indigo-300', select: 'bg-indigo-50 text-indigo-800', icon: Send },
  OUT_FOR_DELIVERY: { ar: 'خرج للتوصيل', en: 'Out for Delivery', pill: 'bg-violet-50 text-violet-700 border-violet-300', select: 'bg-violet-50 text-violet-800', icon: Truck },
  DELIVERED: { ar: 'تم التوصيل ✓', en: 'Delivered ✓', pill: 'bg-emerald-50 text-emerald-700 border-emerald-400', select: 'bg-emerald-50 text-emerald-800', icon: CheckIcon },
  CANCELLED: { ar: 'ملغى', en: 'Cancelled', pill: 'bg-rose-50 text-rose-700 border-rose-300', select: 'bg-rose-50 text-rose-800', icon: XIcon },
  RETURNED: { ar: 'مرتجع', en: 'Returned', pill: 'bg-pink-50 text-pink-700 border-pink-300', select: 'bg-pink-50 text-pink-800', icon: History },
  FAILED_DELIVERY: { ar: 'فشل التوصيل', en: 'Failed Delivery', pill: 'bg-red-100 text-red-800 border-red-400', select: 'bg-red-100 text-red-900', icon: XIcon },
};

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

const CALL_RESULTS: Record<string, { ar: string; en: string }> = {
  CONFIRMED: { ar: 'مؤكد — وافق على الطلب', en: 'Confirmed (Agreed & Accepted)' },
  POSTPONED: { ar: 'مؤجل — سيتصل لاحقاً', en: 'Postponed (Callback later)' },
  NO_ANSWER: { ar: 'لا يجيب — لم يرد', en: 'No Answer' },
  REJECTED: { ar: 'مرفوض — ألغى الطلب', en: 'Rejected' },
  CALLBACK_REQUESTED: { ar: 'طلب منك الاتصال به', en: 'Customer Requested Callback' },
  WRONG_NUMBER: { ar: 'رقم خاطئ', en: 'Wrong Number' },
};

const ACTIVITY_LABELS: Record<string, { ar: string; en: string }> = {
  ORDER_CREATED: { ar: 'تم إنشاء الطلب', en: 'Order Created' },
  CUSTOMER_UPDATED: { ar: 'تحديث بيانات العميل', en: 'Customer Updated' },
  MODERATOR_ASSIGNED: { ar: 'تعيين مودريتور', en: 'Moderator Assigned' },
  CALL_MADE: { ar: 'اتصال', en: 'Call Made' },
  STATUS_CHANGED: { ar: 'تغيير الحالة', en: 'Status Changed' },
  ORDER_UPDATED: { ar: 'تحديث الطلب', en: 'Order Updated' },
  NOTE_ADDED: { ar: 'إضافة ملاحظة', en: 'Note Added' },
  SHIPPING_UPDATED: { ar: 'تحديث الشحن', en: 'Shipping Updated' },
};

interface OrderDetailModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  /** Current list filters so prev/next navigation matches the list context */
  filters?: { q?: string; status?: string; productId?: string; moderatorId?: string; queue?: string; source?: string };
}

export function OrderDetailModal({ orderId, isOpen, onClose, onRefresh, filters }: OrderDetailModalProps) {
  const { t, locale, isRtl, currentUser } = useApp();
  const ar = locale === 'ar';
  const [order, setOrder] = useState<any>(null);
  // Merged history: status logs, ownership, contact and delivery attempts,
  // notes, change requests and issues in one list.
  const [timeline, setTimeline] = useState<
    { id: string; title: string; detail?: string | null; at: string; actorName?: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // 30s tick so lockActive (expiry-based) re-renders and expired locks clear.
  // Stores the current server clock read inside the interval (not during render)
  // so render stays pure: expiry comparisons use this cached `nowMs`.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  const [navLoading, setNavLoading] = useState<'prev' | 'next' | null>(null);
  const [navIds, setNavIds] = useState<{ previousOrderId: string | null; nextOrderId: string | null }>({
    previousOrderId: null,
    nextOrderId: null,
  });
  // Phase C: ownership + editing lock client integration
  const ownership = useOrderOwnership(orderId);

  // Release the editing lock when the modal closes/unmounts while in edit mode.
  // keepalive lets the request survive page navigation during unmount.
  const { inEditMode, releaseLock } = ownership;
  const releaseLockRef = useRef(releaseLock);
  useEffect(() => { releaseLockRef.current = releaseLock; }, [releaseLock]);

  useEffect(() => {
    return () => {
      if (inEditMode && orderId) {
        // Exactly ONE release request on unmount — keepalive lets it survive
        // page navigation during unmount.
        fetch(`/api/orders/${orderId}/lock`, { method: 'DELETE', keepalive: true }).catch(() => {});
      }
    };
  }, [inEditMode, orderId]);
  // Also release when the modal is closed without unmounting (stays mounted)
  useEffect(() => {
    if (!isOpen && inEditMode && orderId) {
      releaseLockRef.current(orderId).catch(() => {});
    }
  }, [isOpen, inEditMode, orderId]);

  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');

  const [callResult, setCallResult] = useState('CONFIRMED');
  const [callNotes, setCallNotes] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');

  // ─── Order data editing form (customer info + price fields) ───
  // Expiry-based lock state (same rule as the render-time check below) but
  // available before the early returns for the edit-form open handler.
  const lockActiveNow =
    !!order?.lockedById && !!order.lockExpiresAt && new Date(order.lockExpiresAt).getTime() > nowMs;
  const [editOpen, setEditOpen] = useState(false);
  const emptyEdit = {
    customerName: '', customerPhone: '', customerAddress: '',
    sellingPrice: '', quantity: '', discountAmount: '', shippingCost: '',
  };
  const [editForm, setEditForm] = useState(emptyEdit);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const openEditForm = async () => {
    if (!order?.id) return;
    setEditOpen((v) => !v);
    setEditError(null);
    setEditSuccess(null);
    if (!editOpen) {
      // Reuse the same backend lock as status editing so concurrent editors are blocked
      if (!(order.lockedById === currentUser?.id && lockActiveNow)) {        const lock = await ownership.acquireLock(order.id);
        if (!lock.ok) return;
        setOrder((prev: any) => ({
          ...prev,
          lockedById: currentUser?.id,
          lockHolder: { id: currentUser?.id, name: currentUser?.name },
          lockExpiresAt: lock.lockExpiresAt ?? prev.lockExpiresAt,
        }));
      }
      setEditForm({
        customerName: order.customer?.fullName || '',
        customerPhone: order.customer?.rawPhone || order.customer?.phone || '',
        customerAddress: order.customer?.address || '',
        sellingPrice: String(order.sellingPrice ?? ''),
        quantity: String(order.quantity ?? ''),
        discountAmount: String(order.discountAmount ?? '0'),
        shippingCost: String(order.shippingCost ?? '0'),
      });
    }
  };

  const handleEditSave = async () => {
    if (!order?.id) return;
    setEditLoading(true);
    setEditError(null);
    setEditSuccess(null);
    try {
      const body: any = { expectedVersion: order.version };
      const name = editForm.customerName.trim();
      const phone = editForm.customerPhone.trim();
      const address = editForm.customerAddress.trim();
      if (name && name !== order.customer?.fullName) body.customerName = name;
      if (phone && phone !== (order.customer?.rawPhone || order.customer?.phone)) body.customerPhone = phone;
      if (address && address !== order.customer?.address) body.customerAddress = address;
      const num = (v: string) => (v === '' ? undefined : Number(v));
      if (num(editForm.sellingPrice) !== undefined && num(editForm.sellingPrice) !== order.sellingPrice) body.sellingPrice = num(editForm.sellingPrice);
      if (num(editForm.quantity) !== undefined && num(editForm.quantity) !== order.quantity) body.quantity = num(editForm.quantity);
      if (num(editForm.discountAmount) !== undefined && num(editForm.discountAmount) !== order.discountAmount) body.discountAmount = num(editForm.discountAmount);
      if (num(editForm.shippingCost) !== undefined && num(editForm.shippingCost) !== order.shippingCost) body.shippingCost = num(editForm.shippingCost);
      const fields = Object.keys(body).filter((k) => k !== 'expectedVersion');
      if (fields.length === 0) {
        setEditError('لا توجد تغييرات للحفظ');
        return;
      }
      if (body.sellingPrice !== undefined && (isNaN(body.sellingPrice) || body.sellingPrice < 0)) {
        setEditError('السعر يجب أن يكون رقماً موجباً');
        return;
      }
      if (body.quantity !== undefined && (!Number.isInteger(body.quantity) || body.quantity < 1)) {
        setEditError('الكمية يجب أن تكون رقماً صحيحاً ≥ 1');
        return;
      }
      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setEditError('تم تعديل هذا الطلب بواسطة مستخدم آخر. يرجى تحديث البيانات قبل الحفظ.');
        return;
      }
      if (res.status === 423) {
        setEditError(data.errorAr || data.error || 'الطلب محتجز للتحرير من موظف آخر');
        return;
      }
      if (!res.ok) {
        setEditError(data.errorAr || data.error || `فشل حفظ التعديلات (HTTP ${res.status})`);
        return;
      }
      setEditSuccess('تم حفظ التعديلات بنجاح ✓');
      await loadOrder(order.id);
      onRefresh();
    } catch (e: any) {
      setEditError(e?.message || 'فشل حفظ التعديلات');
    } finally {
      setEditLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && orderId) loadOrder(orderId);
  }, [isOpen, orderId]);

  // Monotonic request counter for loadOrder — guards against out-of-order
  // responses when navigating prev/next rapidly (stale response discarded)
  const loadOrderSeq = useRef(0);

  const loadOrder = async (id: string) => {
    const seq = ++loadOrderSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (filters) {
        if (filters.q) params.set('q', filters.q);
        if (filters.status && filters.status !== 'all') params.set('status', filters.status);
        if (filters.productId && filters.productId !== 'all') params.set('productId', filters.productId);
        if (filters.moderatorId && filters.moderatorId !== 'all') params.set('moderatorId', filters.moderatorId);
        if (filters.queue) params.set('queue', filters.queue);
      }
      const res = await apiFetch(`/api/orders/${id}?${params.toString()}`);
      // Discard stale response — a newer loadOrder (rapid prev/next) superseded it
      if (seq !== loadOrderSeq.current) return;
      if (res.ok) {
        const data = await res.json();
        setOrder(data.order);
        setSelectedStatus(data.order.status);
        // The merged timeline is its own endpoint so every screen shows the
        // same history, not whatever one table happens to hold.
        apiJson<{ events: typeof timeline }>(`/api/orders/${id}/timeline`)
          .then((t) => seq === loadOrderSeq.current && setTimeline(t.events))
          .catch(() => setTimeline([]));
        setNavIds({
          previousOrderId: data.previousOrderId ?? null,
          nextOrderId: data.nextOrderId ?? null,
        });
        // Reset in-progress forms so stale input from the previous order never leaks
        setStatusNote('');
        setCallNotes('');
        setNextFollowUpDate('');
        setEditForm({
          customerName: data.order.customer?.fullName || '',
          customerPhone: data.order.customer?.rawPhone || data.order.customer?.phone || '',
          customerAddress: data.order.customer?.address || '',
          sellingPrice: String(data.order.sellingPrice ?? ''),
          quantity: String(data.order.quantity ?? ''),
          discountAmount: String(data.order.discountAmount ?? '0'),
          shippingCost: String(data.order.shippingCost ?? '0'),
        });
        setEditOpen(false);
        setEditError(null);
        setEditSuccess(null);
      } else {
        // 403/404 (not found / not assigned) — show a clear error panel
        const data = await res.json().catch(() => ({}));
        setOrder(null);
        setLoadError(data.errorAr || data.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      if (seq !== loadOrderSeq.current) return;
      console.error(e);
      setLoadError(e?.message || 'فشل تحميل الطلب');
    } finally {
      // Only the latest request may clear the shared loading flag
      if (seq === loadOrderSeq.current) setLoading(false);
    }
  };

  const navigateToOrder = async (targetId: string, direction: 'prev' | 'next') => {
    if (navLoading || loading) return;
    setNavLoading(direction);
    try {
      await loadOrder(targetId);
      // Scroll modal body back to top so the user sees the new order's header
      document.querySelector('.max-h-\\[90vh\\] .overflow-y-auto')?.scrollTo({ top: 0 });
    } finally {
      setNavLoading(null);
    }
  };

  const handleStatusUpdate = async () => {
    // Use order.id (current displayed order), not the orderId prop — after
    // prev/next navigation the prop still holds the originally opened order.
    if (!order?.id || selectedStatus === order.status) return;
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: selectedStatus,
          expectedVersion: order.version, // optimistic concurrency (Phase B)
          internalNotes: statusNote
            ? `${order.internalNotes ? order.internalNotes + '\n' : ''}[${new Date().toLocaleTimeString(ar ? 'ar-EG' : 'en-US')}]: ${statusNote}`
            : order.internalNotes,
        }),
      });
      if (res.status === 409) {
        // Version conflict — never silently overwrite
        ownership.setMessage({ type: 'conflict', text: t.conflictMessage });
        return;
      }
      if (res.status === 423) {
        const data = await res.json().catch(() => ({}));
        ownership.setMessage({ type: 'error', text: data.errorAr || data.error || t.editingBy });
        return;
      }
      if (res.ok) {
        setActionFeedback({ type: 'success', text: 'تم تحديث الحالة بنجاح ✓' });
        await loadOrder(order.id);
        onRefresh();
        setStatusNote('');
        // Save complete → release the editing lock
        await ownership.releaseLock(order.id);
      } else {
        const data = await res.json().catch(() => ({}));
        setActionFeedback({ type: 'error', text: data.errorAr || data.error || `HTTP ${res.status}` });
      }
    } catch (e: any) {
      setActionFeedback({ type: 'error', text: e?.message || 'فشل تحديث الحالة' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order?.id) return;
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const res = await apiFetch(`/api/orders/${order.id}/call-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: callResult,
          notes: callNotes,
          nextFollowUpDate: nextFollowUpDate || null,
          expectedVersion: order.version, // concurrency hint for the status change path
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActionFeedback({ type: 'success', text: data.warning || 'تم تسجيل نتيجة الاتصال ✓' });
        await loadOrder(order.id);
        onRefresh();
        setCallNotes('');
        setNextFollowUpDate('');
      } else {
        setActionFeedback({ type: 'error', text: data.errorAr || data.error || `HTTP ${res.status}` });
      }
    } catch (e: any) {
      setActionFeedback({ type: 'error', text: e?.message || 'فشل تسجيل الاتصال' });
    } finally {
      setActionLoading(false);
    }
  };

  if (!order && loading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={t.loading}>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
        </div>
      </Modal>
    );
  }
  if (loadError) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={t.orders} maxWidth="md">
        <div className="py-6 text-center space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 inline-block">
            {loadError}
          </p>
          <div className="flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>
              {ar ? 'إغلاق' : 'Close'}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }
  if (!order) return null;

  const currentCfg = STATUS_CONFIG[order.status];
  const CurrentIcon = currentCfg?.icon ?? Clock;
  const isNavigating = navLoading !== null || loading;

  // ─── Phase C: lock state helpers ───
  const lockActive = !!order.lockedById && !!order.lockExpiresAt && new Date(order.lockExpiresAt).getTime() > nowMs;
  const editingLockedByOther = lockActive && order.lockedById !== currentUser?.id;
  const lockHolderName = order.lockHolder?.name || order.lockedById || '';

  /** Enter edit mode: acquire the backend lock first (Phase B), only then allow edits */
  const handleEnterEditMode = async () => {
    if (!order?.id) return;
    const lock = await ownership.acquireLock(order.id);
    if (lock.ok) {
      setOrder((prev: any) => ({
        ...prev,
        lockedById: currentUser?.id,
        lockHolder: { id: currentUser?.id, name: currentUser?.name },
        // Refresh the expiry from the server — otherwise lockActive stays false
        // when the previous lock had already expired and Save never appears
        lockExpiresAt: lock.lockExpiresAt ?? prev.lockExpiresAt,
      }));
    }
  };

  const money = (n: number) =>
    `$${n.toLocaleString(ar ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`الطلب ${order.orderNumber}`}
      subtitle={`أُنشئ في ${format(new Date(order.createdAt), 'd MMMM yyyy — h:mm a', {})} • قناة الطلب: ${order.source.split(' → ')[0]}${order.source.includes(' → ') ? ` • المصدر: ${order.source.split(' → ')[1]}` : ''}${order.source === 'Landing Page' && order.landingPage?.name ? ` • صفحة الهبوط: ${order.landingPage.name}` : ''}${order.landingPageOffer?.name ? ` • العرض: ${order.landingPageOffer.name}` : ''}${(order.source === 'Telegram' || order.source.startsWith('Telegram → ')) && (order as any).telegramMessages?.[0] ? ` • تيليجرام: رسالة #${(order as any).telegramMessages[0].messageId}${(order as any).telegramMessages[0].threadId ? ` • موضوع: ${(order as any).telegramMessages[0].threadName || (order as any).telegramMessages[0].threadId}` : ''}` : ''}`}
      maxWidth="4xl"
    >
      {/* ─── Prev/Next order navigation (below the header, inside the modal) ─── */}
      <div
        className={`flex items-center justify-between gap-2 mb-4 -mt-1 ${isRtl ? 'flex-row-reverse' : ''}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <Button
          size="sm"
          variant="outline"
          disabled={!navIds.nextOrderId || isNavigating}
          onClick={() => navIds.nextOrderId && navigateToOrder(navIds.nextOrderId, 'next')}
          title={ar ? 'الطلب التالي (الأحدث)' : 'Next order (newer)'}
        >
          {navLoading === 'next' ? (
            <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-red-600" />
          ) : (
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          )}
          <span className="hidden sm:inline">{ar ? 'الطلب التالي' : 'Next Order'}</span>
        </Button>

        <span className="text-[11px] text-slate-400 font-medium">
          {navLoading || loading ? (ar ? 'جارٍ التحميل…' : 'Loading…') : ''}
        </span>

        <Button
          size="sm"
          variant="outline"
          disabled={!navIds.previousOrderId || isNavigating}
          onClick={() => navIds.previousOrderId && navigateToOrder(navIds.previousOrderId, 'prev')}
          title={ar ? 'الطلب السابق (الأقدم)' : 'Previous order (older)'}
        >
          {navLoading === 'prev' ? (
            <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-red-600" />
          ) : (
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          )}
          <span className="hidden sm:inline">{ar ? 'الطلب السابق' : 'Previous Order'}</span>
        </Button>
      </div>
      {/* Action feedback (status update / call log) */}
      {actionFeedback && (
        <div
          className={`mb-4 rounded-xl border p-2.5 text-xs flex items-center justify-between gap-2 ${
            actionFeedback.type === 'success'
              ? 'border-green-300 bg-green-50 text-green-800'
              : 'border-rose-300 bg-rose-50 text-rose-800'
          }`}
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <span className="leading-relaxed">{actionFeedback.text}</span>
          <button onClick={() => setActionFeedback(null)} className="opacity-60 hover:opacity-100 cursor-pointer shrink-0">✕</button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" dir={isRtl ? 'rtl' : 'ltr'}>
        {/* ─── Left column ─── */}
        <div className="lg:col-span-2 space-y-5">

          {/* ─── Phase C: Order responsibility / claim / editing lock ─── */}
          <OwnershipSection
            order={order}
            ar={ar}
            isRtl={isRtl}
            ownership={ownership}
            nowMs={nowMs}
            onRefreshOrder={async () => {
              if (order?.id) await loadOrder(order.id);
              onRefresh();
            }}
          />

          {/* Current Status — the DERIVED state, the same one the orders list,
              the queues and the shipment screens show. The stored `status`
              column is legacy and drifts out of step with reality. */}
          <div className="rounded-2xl border border-slate-200 p-4 bg-gradient-to-l from-slate-50 to-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  {ar ? 'حالة الطلب' : 'Order State'}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {order.state ? (
                    <OrderStateBadge state={order.state} />
                  ) : (
                    <span
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border-2 font-bold text-sm ${currentCfg?.pill ?? 'bg-slate-100 text-slate-700 border-slate-300'}`}
                    >
                      <CurrentIcon className="w-4 h-4" />
                      {ar ? currentCfg?.ar : currentCfg?.en}
                    </span>
                  )}

                  {/* Who is carrying it, and whether the money came back. */}
                  {order.deliveryProvider && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-600">
                      {order.deliveryProvider.kind === 'AGENT' ? (
                        <Bike className="w-3 h-3 text-[#b8256e]" />
                      ) : (
                        <Truck className="w-3 h-3 text-slate-400" />
                      )}
                      {order.deliveryProvider.name}
                    </span>
                  )}
                  {order.trackingNumber && (
                    <span className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-[11px] font-mono text-slate-500" dir="ltr">
                      {order.trackingNumber}
                    </span>
                  )}
                  {order.settlementStatus && order.settlementStatus !== 'NOT_APPLICABLE' && (
                    <span
                      className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                        order.settlementStatus === 'SETTLED'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}
                    >
                      {SETTLEMENT_AR[order.settlementStatus] ?? order.settlementStatus}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  disabled={editingLockedByOther}
                  className="px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-200 focus:border-red-500 focus:outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key} className={cfg.select}>
                      {ar ? cfg.ar : cfg.en}
                    </option>
                  ))}
                </select>
                {order.lockedById === currentUser?.id && lockActive ? (
                  <Button
                    size="sm"
                    onClick={handleStatusUpdate}
                    loading={actionLoading}
                    disabled={selectedStatus === order.status}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    <Save className="w-3.5 h-3.5" />
                    تحديث
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleEnterEditMode}
                    loading={ownership.actionLoading === 'lock'}
                    disabled={lockActive && order.lockedById !== currentUser?.id}
                    className="bg-red-600 hover:bg-red-700"
                    title={t.acquiringLock}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {t.enterEditMode}
                  </Button>
                )}
              </div>
            </div>

            {editingLockedByOther && (
              <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 mt-3 inline-flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
                {t.editingBy} {lockHolderName}
              </p>
            )}

            {selectedStatus !== order.status && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-3 inline-flex items-center gap-1.5">
                <History className="w-3 h-3" />
                سيتم تسجيل التغيير: {ar ? currentCfg?.ar : currentCfg?.en} ←{' '}
                {ar ? STATUS_CONFIG[selectedStatus]?.ar : STATUS_CONFIG[selectedStatus]?.en}
              </p>
            )}
          </div>

          {/* Customer Info + Notes */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 mb-3 flex items-center gap-2">
              <User className="w-4 h-4 text-red-600" />
              معلومات العميل
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2.5">
                <div>
                  <p className="text-[11px] text-slate-400">اسم العميل</p>
                  <p className="font-bold text-slate-900">{order.customer?.fullName}</p>
                </div>
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-400">عنوان التوصيل</p>
                    <p className="text-slate-700 text-xs leading-relaxed">{order.customer?.address}</p>
                  </div>
                </div>

                {/* The governorate is a real Region, not free text: the delivery
                    fee is keyed on it, so an order without one cannot be priced
                    or shipped. Editable here for exactly that reason. */}
                <OrderRegionField
                  order={order}
                  onSaved={async () => { await loadOrder(order.id); onRefresh(); }}
                />
              </div>

              <div className="space-y-2.5">
                <div>
                  <p className="text-[11px] text-slate-400 mb-1">رقم الهاتف</p>
                  <a
                    href={`tel:${order.customer?.phone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-300 font-mono text-xs font-bold rounded-xl hover:bg-green-100 transition-colors"
                    dir="ltr"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {order.customer?.rawPhone || order.customer?.phone}
                  </a>
                  {order.customer?.altPhone && (
                    <p className="text-[11px] text-slate-400 mt-1">بديل: {order.customer.altPhone}</p>
                  )}
                </div>
                <div className="flex gap-2 text-[11px]">
                  <span className="bg-slate-100 rounded-lg px-2 py-1 font-semibold text-slate-600">
                    طلبات سابقة: {order.customer?.totalOrders ?? 1}
                  </span>
                  <span className="bg-green-50 text-green-700 rounded-lg px-2 py-1 font-semibold">
                    موصّل: {order.customer?.deliveredOrders ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer notes — prominent */}
            {order.customerNotes && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                <MessageSquareText className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-bold text-amber-800 mb-0.5">ملاحظات العميل</p>
                  <p className="text-xs text-amber-900 leading-relaxed">{order.customerNotes}</p>
                </div>
              </div>
            )}
            {order.internalNotes && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start gap-2">
                <StickyNote className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-bold text-slate-600 mb-0.5">ملاحظات داخلية</p>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{order.internalNotes}</p>
                </div>
              </div>
            )}
          </div>

          {/* ─── Phase D2: Shipping & delivery section ─── */}
          <ShippingSection
            order={order}
            ar={ar}
            isRtl={isRtl}
            onRefreshOrder={async () => {
              if (order?.id) await loadOrder(order.id);
              onRefresh();
            }}
          />

          {/* ─── Phase D1: Quick confirmation actions + contact history ─── */}
          <ConfirmationActions
            order={order}
            ar={ar}
            isRtl={isRtl}
            onRefreshOrder={async () => {
              if (order?.id) await loadOrder(order.id);
              onRefresh();
            }}
          />

          {/* ─── Order data editing (customer info + price fields) ─── */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-[#b8256e]" />
                تعديل بيانات الطلب
              </h4>
              <Button size="sm" variant="outline" onClick={openEditForm} loading={ownership.actionLoading === 'lock'}>
                {editOpen ? 'إغلاق النموذج' : 'تعديل'}
              </Button>
            </div>

            {editOpen && (
              <div className="space-y-3">
                {editingLockedByOther && (
                  <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                    <Lock className="w-3 h-3 inline ml-1" />
                    {t.editingBy} {lockHolderName}
                  </p>
                )}
                {editError && (
                  <p className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                    {editError}
                  </p>
                )}
                {editSuccess && (
                  <p className="text-[11px] text-green-800 bg-green-50 border border-green-300 rounded-lg px-2.5 py-1.5">
                    {editSuccess}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="اسم العميل" value={editForm.customerName} onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })} />
                  <Input label="رقم الهاتف" dir="ltr" value={editForm.customerPhone} onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })} />
                  <Input label="عنوان التوصيل" value={editForm.customerAddress} onChange={(e) => setEditForm({ ...editForm, customerAddress: e.target.value })} />
                  <div />
                  <Input label="سعر البيع" type="number" min="0" step="0.01" dir="ltr" value={editForm.sellingPrice} onChange={(e) => setEditForm({ ...editForm, sellingPrice: e.target.value })} />
                  <Input label="الكمية" type="number" min="1" step="1" dir="ltr" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
                  <Input label="الخصم" type="number" min="0" step="0.01" dir="ltr" value={editForm.discountAmount} onChange={(e) => setEditForm({ ...editForm, discountAmount: e.target.value })} />
                  <Input label="تكلفة الشحن" type="number" min="0" step="0.01" dir="ltr" value={editForm.shippingCost} onChange={(e) => setEditForm({ ...editForm, shippingCost: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleEditSave}
                    loading={editLoading}
                    disabled={editingLockedByOther || !(order.lockedById === currentUser?.id && lockActiveNow)}
                  >
                    <Save className="w-3.5 h-3.5" />
                    حفظ التعديلات
                  </Button>
                  <span className="text-[11px] text-slate-400">
                    الحفظ يتطلب الاحتفاظ بقفل التحرير — الإجمالي الجديد = السعر × الكمية − الخصم + الشحن
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Call follow-up */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 mb-3 flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-indigo-600" />
              تسجيل نتيجة الاتصال
            </h4>

            <form onSubmit={handleRecordCall} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select label="نتيجة الاتصال *" value={callResult} onChange={(e) => setCallResult(e.target.value)}>
                  {Object.entries(CALL_RESULTS).map(([key, cfg]) => (
                    <option key={key} value={key}>{ar ? cfg.ar : cfg.en}</option>
                  ))}
                </Select>
                <Input
                  label="موعد المتابعة القادم (اختياري)"
                  type="date"
                  value={nextFollowUpDate}
                  onChange={(e) => setNextFollowUpDate(e.target.value)}
                />
              </div>

              <Textarea
                label="ملاحظات الاتصال / تعليقات العميل"
                placeholder="مثال: العميل أكد التوصيل يوم الأربعاء بين 2-5 عصراً."
                rows={2}
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
              />

              <div className="flex justify-end">
                <Button size="sm" type="submit" loading={actionLoading} className="bg-red-600 hover:bg-red-700">
                  <PhoneCall className="w-3.5 h-3.5" />
                  حفظ نتيجة الاتصال
                </Button>
              </div>
            </form>
          </div>

          {/* Call history */}
          {order.callLogs?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 mb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                سجل المكالمات ({order.callLogs.length})
              </h4>
              <div className="space-y-2.5">
                {order.callLogs.map((log: any) => {
                  const cfg = CALL_RESULTS[log.result];
                  const good = ['CONFIRMED'].includes(log.result);
                  const bad = ['REJECTED', 'WRONG_NUMBER'].includes(log.result);
                  return (
                    <div
                      key={log.id}
                      className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 ${
                        good
                          ? 'bg-green-50/70 border-green-200'
                          : bad
                          ? 'bg-red-50/70 border-red-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800">{ar ? cfg?.ar ?? log.result : cfg?.en ?? log.result}</span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            {log.moderator?.name}
                          </span>
                        </div>
                        {log.notes && <p className="text-slate-600 mt-1">{log.notes}</p>}
                      </div>
                      <div className="text-slate-400 text-[11px] shrink-0">
                        {format(new Date(log.callDate || log.createdAt), 'd MMM — h:mm a')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ─── Right column ─── */}
        <div className="space-y-5">
          {/* Financial overview */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-red-600" />
              الملخص المالي
            </h4>

            <div className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl">
              <ProductThumb
                src={order.productImageSnapshot || order.product?.image}
                alt={order.productNameSnapshot || order.product?.name}
                size="md"
              />
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400">المنتج</p>
                <p className="text-xs font-bold text-slate-900 line-clamp-2">
                  {order.productNameSnapshot || order.product?.name}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs divide-y divide-slate-100">
              <div className="flex justify-between pt-1.5">
                <span className="text-slate-500">العرض / الكمية:</span>
                <span className="font-medium text-slate-900">
                  {order.landingPageOffer?.name || order.offer?.name || 'مباشر'} ({order.quantity} {t.units}{order.freeQuantity ? ` + ${order.freeQuantity} هدية` : ''})
                </span>
              </div>
              {order.addOns?.length > 0 && (
                <div className="flex justify-between pt-1.5">
                  <span className="text-slate-500">منتجات إضافية (Upsell):</span>
                  <span className="font-medium text-slate-900 text-end">
                    {order.addOns.map((a: any) => `${a.productName} ×${a.quantity} (${money(a.total)})`).join(' + ')}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-1.5">
                <span className="text-slate-500">سعر البيع:</span>
                <span className="font-bold text-slate-900" dir="ltr">{money(order.sellingPrice)}</span>
              </div>
              <div className="flex justify-between pt-1.5">
                <span className="text-slate-500">تكلفة الشحن:</span>
                <span className="text-slate-700" dir="ltr">{money(order.shippingCost)}</span>
              </div>
              <div className="flex justify-between pt-1.5">
                <span className="text-slate-500">تكلفة البضاعة:</span>
                <span className="text-slate-700" dir="ltr">{money(order.estimatedCostOfGoods)}</span>
              </div>
              <div className="flex justify-between pt-1.5">
                <span className="text-slate-500">عمولة المودريتور:</span>
                <span className="text-slate-700" dir="ltr">{money(order.moderatorCommission)}</span>
              </div>
              <div className="flex justify-between pt-2 bg-slate-50 -mx-2 px-2 py-2 rounded-xl">
                <span className="font-bold">الإجمالي:</span>
                <span className="font-black text-red-600 text-sm" dir="ltr">{money(order.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Moderator */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 mb-2 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-red-600" />
              المودريتور المسؤول
            </h4>
            <p className="text-sm font-bold text-slate-900">{order.moderator?.name || 'غير معيّن'}</p>
            <p className="text-xs text-slate-500" dir="ltr">{order.moderator?.email || '—'}</p>
          </div>

          {/* Timeline — merged from every event table (src/lib/order-timeline.ts),
              not just the activity log, so it always matches the state above. */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              سجل الأحداث ({timeline.length})
              {order.customer?.id && (
                <span className="ms-auto">
                  <CustomerHistoryButton
                    customerId={order.customer.id}
                    orderId={order.id}
                    previousOrders={Math.max(0, (order.customer.totalOrders ?? 1) - 1)}
                    label="سجل العميل"
                  />
                </span>
              )}
            </h4>

            <div className="relative border-s-2 border-slate-200 ms-2.5 space-y-4 text-xs">
              {timeline.length === 0 && <p className="ps-4 text-slate-400">لا توجد أحداث بعد.</p>}
              {timeline.map((event) => (
                <div key={event.id} className="relative ps-4">
                  <span className="absolute -start-[7px] top-1 w-2.5 h-2.5 rounded-full bg-red-600 border-2 border-white" />
                  <p className="font-bold text-slate-800">{event.title}</p>
                  {event.detail && <p className="text-slate-500 mt-0.5 break-words">{event.detail}</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {format(new Date(event.at), 'd MMM, h:mm a')}
                    {event.actorName ? ` — ${event.actorName}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The order's governorate, shown and editable.
 *
 * It is a Region row, not the free-text city: the delivery-fee table is keyed
 * on regionId, and an order that never resolved one reaches the shipment
 * screen as "no governorate — cannot price delivery". The server re-checks
 * that the chosen region belongs to this order's country.
 */
function OrderRegionField({
  order,
  onSaved,
}: {
  order: any;
  onSaved: () => void | Promise<void>;
}) {
  const { regions, loading } = useRegions();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(order.regionId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = regions.find((r) => r.id === order.regionId);

  if (!editing) {
    return (
      <div className="flex items-start gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-[11px] text-slate-400">المحافظة</p>
          <div className="flex items-center gap-2">
            {order.regionId ? (
              <p className="text-slate-700 text-xs font-medium">{current?.name ?? order.customer?.city}</p>
            ) : (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-[6px] px-2 py-0.5">
                لم تُحدَّد — لا يمكن حساب أجرة التوصيل
              </p>
            )}
            <button
              type="button"
              onClick={() => { setValue(order.regionId ?? ''); setEditing(true); }}
              className="text-[11px] text-[#b8256e] hover:underline"
            >
              {order.regionId ? 'تغيير' : 'تحديد'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1.5">
      <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-[11px] text-slate-400 mb-1">المحافظة</p>
        <div className="flex items-center gap-2">
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading || saving}
            className="flex-1 h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white"
          >
            <option value="">اختر…</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={saving || !value}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await apiJson(`/api/orders/${order.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ regionId: value, expectedVersion: order.version }),
                });
                setEditing(false);
                await onSaved();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'تعذر الحفظ');
              } finally {
                setSaving(false);
              }
            }}
            className="h-8 px-3 rounded-lg bg-[#b8256e] text-white text-xs font-bold disabled:opacity-50"
          >
            {saving ? '…' : 'حفظ'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-slate-500">
            إلغاء
          </button>
        </div>
        {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      </div>
    </div>
  );
}
