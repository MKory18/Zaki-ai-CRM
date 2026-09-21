'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select, Textarea, Input } from '@/components/ui/Input';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { useOrderOwnership } from '@/hooks/useOrderOwnership';
import { OrderResponsibility } from '@/components/orders/OrderResponsibility';
import { CustomerCard } from '@/components/orders/CustomerCard';
import { OrderLinesCard } from '@/components/orders/OrderLinesCard';
import { ConfirmationActions } from '@/components/orders/ConfirmationActions';
import { ShippingSection } from '@/components/orders/ShippingSection';
import { useApp } from '@/context/AppContext';
import { userCan } from '@/lib/can';
import { apiFetch, apiJson } from '@/lib/api-client';
import { CustomerHistoryModal } from '@/components/orders/CustomerHistory';
import { OrderStateBadge } from '@/components/orders/OrderStateBadge';
import { OrderStages } from '@/components/orders/OrderStages';
import { OrderNotes } from '@/components/orders/OrderNotes';
import { orderStages } from '@/lib/order-stages';
import { useRegions } from '@/hooks/useRegions';
import { amount, arDateShort, arDateTime, type Currency } from '@/lib/format';
import {
  User,
  Phone,
  PhoneCall,
  History,
  Clock,
  DollarSign,
  MapPin,
  StickyNote,
  Truck,
  Save,
  MessageSquareText,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Lock,
  Pencil,
  Bike,
} from 'lucide-react';

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

const CALL_RESULTS: Record<string, { ar: string; en: string }> = {
  CONFIRMED: { ar: 'مؤكد — وافق على الطلب', en: 'Confirmed (Agreed & Accepted)' },
  POSTPONED: { ar: 'مؤجل — سيتصل لاحقاً', en: 'Postponed (Callback later)' },
  NO_ANSWER: { ar: 'لا يجيب — لم يرد', en: 'No Answer' },
  REJECTED: { ar: 'مرفوض — ألغى الطلب', en: 'Rejected' },
  CALLBACK_REQUESTED: { ar: 'طلب منك الاتصال به', en: 'Customer Requested Callback' },
  WRONG_NUMBER: { ar: 'رقم خاطئ', en: 'Wrong Number' },
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

  // Two fields the person editing may not have authority over. The server
  // decides; these mirror it so the screen never offers what it will refuse.
  const perms = currentUser?.permissions ?? [];
  const isAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN';
  const mayChangeChannel = isAdmin || perms.includes('orders.assign');
  const mayChangeShipping = isAdmin || perms.includes('orders.change_status');
  const ar = locale === 'ar';
  const [order, setOrder] = useState<any>(null);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [channelOpen, setChannelOpen] = useState(false);
  const [channelDraft, setChannelDraft] = useState('');

  useEffect(() => {
    if (!isOpen || channels.length) return;
    apiJson<{ channels: { id: string; name: string; isActive: boolean }[] }>('/api/settings/channels')
      .then((d) => setChannels((d.channels ?? []).filter((c) => c.isActive)))
      .catch(() => setChannels([]));
  }, [isOpen, channels.length]);

  const saveChannel = async () => {
    if (!order?.id) return;
    try {
      await apiJson(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: order.version, channelId: channelDraft || null }),
      });
      setChannelOpen(false);
      await loadOrder(order.id);
      onRefresh();
    } catch (e) {
      setActionFeedback({ type: 'error', text: e instanceof Error ? e.message : 'تعذر حفظ القناة' });
    }
  };
  // The COD breakdown, computed server-side by the one cod function.
  const [cod, setCod] = useState<
    { subtotal: number; discount: number; deliveryFee: number; cod: number; includesDelivery: boolean } | null
  >(null);
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
      // Shipping belongs to the shipping authority. Without it the field is
      // not sent at all — an unchanged value is not an edit, and sending it
      // would earn a 403 for a number nobody touched.
      if (
        mayChangeShipping &&
        num(editForm.shippingCost) !== undefined &&
        num(editForm.shippingCost) !== order.shippingCost
      ) {
        body.shippingCost = num(editForm.shippingCost);
      }
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
        if (data.currency) setCurrency(data.currency);
        setCod(data.cod ?? null);
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
        {historyOpen && order.customer?.id && (
        <CustomerHistoryModal
          customerId={order.customer.id}
          orderId={order.id}
          onClose={() => setHistoryOpen(false)}
        />
      )}
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

  // The store's currency, the same one the orders list prints.
  const money = (n: number) => amount(n, currency);

  const mayRecordCalls =
    userCan(currentUser, 'orders.confirm') || userCan(currentUser, 'confirmation.work');

  // Derived here from the order the screen already holds — the same way the
  // state and the zone are derived, and never stored.
  const stages = orderStages(order, {
    contactAttempts: order._count?.contactAttempts,
    deliveryAttempts: order._count?.deliveryAttempts,
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`الطلب ${order.orderNumber}`}
      subtitle={`أُنشئ في ${arDateTime(order.createdAt)} • قناة الطلب: ${order.source.split(' → ')[0]}${order.source.includes(' → ') ? ` • المصدر: ${order.source.split(' → ')[1]}` : ''}${order.source === 'Landing Page' && order.landingPage?.name ? ` • صفحة الهبوط: ${order.landingPage.name}` : ''}${order.offer?.name ? ` • العرض: ${order.offer.name}` : ''}${(order.source === 'Telegram' || order.source.startsWith('Telegram → ')) && (order as any).telegramMessages?.[0] ? ` • تيليجرام: رسالة #${(order as any).telegramMessages[0].messageId}${(order as any).telegramMessages[0].threadId ? ` • موضوع: ${(order as any).telegramMessages[0].threadName || (order as any).telegramMessages[0].threadId}` : ''}` : ''}`}
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

          {/* Whose hands it is in, and the two things anyone wants to do
              about that. The six read-only ownership fields it replaced said
              "—" on nearly every order. */}
          <OrderResponsibility
            order={order}
            currentUserId={currentUser?.id}
            onChanged={async () => {
              if (order?.id) await loadOrder(order.id);
              onRefresh();
            }}
          />

          {/* The state, and the facts that travel with it. No button: the
              edit lock is taken by whichever card you actually edit, and a
              standalone "تعديل" here neither advanced nor stopped anything. */}
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[11px] font-semibold text-slate-400">حالة الطلب</span>
              <OrderStateBadge state={order.state} />

              {order.deliveryProvider && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-200 bg-[#f8fafc] text-[11px] font-semibold text-slate-600">
                  {order.deliveryProvider.kind === 'AGENT' ? (
                    <Bike className="w-3 h-3 text-[#b8256e]" />
                  ) : (
                    <Truck className="w-3 h-3 text-slate-400" />
                  )}
                  {order.deliveryProvider.name}
                </span>
              )}
              {order.trackingNumber && (
                <span className="px-2.5 py-1 rounded-full border border-slate-200 bg-[#f8fafc] text-[11px] font-mono text-slate-500" dir="ltr">
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

              {editingLockedByOther && (
                <span className="ms-auto text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />
                  {t.editingBy} {lockHolderName}
                </span>
              )}
            </div>
          </div>

          <CustomerCard
            order={order}
            canEdit={order.lockedById === currentUser?.id && lockActive}
            onAcquireLock={handleEnterEditMode}
            onSaved={async () => {
              if (order?.id) await loadOrder(order.id);
              onRefresh();
            }}
            onOpenHistory={() => setHistoryOpen(true)}
          />

          <OrderLinesCard
            order={order}
            currency={currency}
            canEdit={order.lockedById === currentUser?.id && lockActive}
            onAcquireLock={handleEnterEditMode}
            onSaved={async () => {
              if (order?.id) await loadOrder(order.id);
              onRefresh();
            }}
          />

          {/* ─── Phase D2: Shipping & delivery section ─── */}
          <ShippingSection
            order={order}
            ar={ar}
            isRtl={isRtl}
            canEdit={mayChangeShipping}
            onRefreshOrder={async () => {
              if (order?.id) await loadOrder(order.id);
              onRefresh();
            }}
          />

          {/* How far it has got, when, and by whom. Not a control: a passed
              stage is a record, and a record you can edit is not a record. */}
          <OrderStages stages={stages} />

          {/* What was said about it, under what happened to it. */}
          <OrderNotes orderId={order.id} />

          {/* Recording a call outcome is the confirmation agent's job. For an
              owner this screen is oversight, and a panel of buttons whose
              every press the server refuses is worse than no panel. The
              server still enforces it — this only stops offering it. */}
          {mayRecordCalls && (
          <ConfirmationActions
            order={order}
            ar={ar}
            isRtl={isRtl}
            onRefreshOrder={async () => {
              if (order?.id) await loadOrder(order.id);
              onRefresh();
            }}
          />
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

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">العرض / الكمية:</span>
                <span className="font-medium text-slate-900">
                  {order.offer?.name || 'مباشر'} ({order.quantity} {t.units}{order.freeQuantity ? ` + ${order.freeQuantity} هدية` : ''})
                </span>
              </div>
              {order.addOns?.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">منتجات إضافية:</span>
                  <span className="font-medium text-slate-900 text-end">
                    {order.addOns.map((a: any) => `${a.productName} ×${a.quantity} (${money(a.total)})`).join(' + ')}
                  </span>
                </div>
              )}

              {/* What the customer pays. The figures come from the one COD
                  function on the server — a screen never adds up money. */}
              <div className="mt-2 rounded-xl border border-slate-200 divide-y divide-slate-100">
                <p className="text-[11px] font-bold text-slate-600 px-2.5 py-1.5 bg-slate-50 rounded-t-xl">
                  ما يدفعه العميل
                </p>
                <div className="flex justify-between px-2.5 py-1.5">
                  <span className="text-slate-500">قيمة البضاعة:</span>
                  <span className="text-slate-900" dir="ltr">{money(cod?.subtotal ?? order.sellingPrice)}</span>
                </div>
                {!!cod?.discount && (
                  <div className="flex justify-between px-2.5 py-1.5">
                    <span className="text-slate-500">الخصم:</span>
                    <span className="text-slate-700" dir="ltr">− {money(cod.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between px-2.5 py-1.5">
                  <span className="text-slate-500">
                    أجرة التوصيل:
                    {cod?.includesDelivery && (
                      <span className="text-slate-400"> (داخلة في السعر)</span>
                    )}
                  </span>
                  {/* The fee follows the courier, and the courier is chosen when
                      the shipment is created. Before that it is undecided, not
                      zero — printing 0.00 here reads as free delivery. */}
                  {!order.deliveryProvider && !Number(cod?.deliveryFee ?? 0) ? (
                    <span className="text-slate-400 text-[11px]">تُحدَّد عند إنشاء الشحنة</span>
                  ) : (
                    <span className="text-slate-700" dir="ltr">{money(cod?.deliveryFee ?? order.shippingCost)}</span>
                  )}
                </div>
                <div className="flex justify-between px-2.5 py-2 bg-slate-50 rounded-b-xl">
                  <span className="font-bold">المحصَّل عند الباب:</span>
                  <span className="font-black text-red-600 text-sm" dir="ltr">
                    {money(cod?.cod ?? order.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Costs are ours, not the customer's — kept apart so the column
                  above never reads as a sum that includes them. */}
              <div className="mt-2 rounded-xl border border-slate-200 divide-y divide-slate-100">
                <p className="text-[11px] font-bold text-slate-600 px-2.5 py-1.5 bg-slate-50 rounded-t-xl">
                  تكاليفنا على هذا الطلب
                </p>
                <div className="flex justify-between px-2.5 py-1.5">
                  <span className="text-slate-500">تكلفة البضاعة:</span>
                  <span className="text-slate-700" dir="ltr">{money(order.estimatedCostOfGoods)}</span>
                </div>
                <div className="flex justify-between px-2.5 py-1.5">
                  <span className="text-slate-500">عمولة المودريتور:</span>
                  <span className="text-slate-700" dir="ltr">{money(order.moderatorCommission)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Where the order came from. Editable, because the numbers are
              counted per channel and an order filed under the wrong one is a
              wrong number rather than a wrong label. */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-black text-slate-700 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#b8256e]" />
                جهة الطلب
              </h4>
              {/* The channel is the order's attribution — which campaign or
                  page the sale is credited to. Changing it moves that credit,
                  which is a different authority from fixing an address. The
                  server refuses it either way; hiding it just stops a button
                  that would only ever fail. */}
              {mayChangeChannel && (
                <button
                  onClick={() => { setChannelOpen((v) => !v); setChannelDraft(order.channelId ?? ''); }}
                  className="text-[11px] px-2.5 py-1.5 rounded-[8px] border border-[#e3e8ef] text-slate-600 hover:text-[#b8256e] inline-flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {channelOpen ? 'إغلاق' : 'تعديل'}
                </button>
              )}
            </div>

            {channelOpen ? (
              <div className="space-y-2">
                <select
                  value={channelDraft}
                  onChange={(e) => setChannelDraft(e.target.value)}
                  className="w-full h-9 px-3 rounded-[8px] border border-[#e3e8ef] text-sm focus:outline-none focus:border-[#b8256e]"
                >
                  <option value="">— بلا قناة —</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={saveChannel}
                  className="text-xs px-3 py-1.5 rounded-[8px] bg-[#b8256e] text-white font-medium"
                >
                  حفظ القناة
                </button>
                <p className="text-[11px] text-slate-400">
                  القنوات تُدار من الإعدادات ← قنوات الطلبات.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm font-bold text-slate-900">{order.source || '—'}</p>
                {order.moderator?.name && (
                  <p className="text-[11px] text-slate-400">أدخله: {order.moderator.name}</p>
                )}
              </>
            )}
          </div>

          {/* Timeline — merged from every event table (src/lib/order-timeline.ts),
              not just the activity log, so it always matches the state above. */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              سجل الأحداث ({timeline.length})
              {timeline.length > 5 && (
                <button
                  onClick={() => setTimelineExpanded((v) => !v)}
                  className="ms-auto text-[11px] font-medium text-[#b8256e] hover:underline"
                >
                  {timelineExpanded ? 'إظهار الأحدث فقط' : `إظهار الكل (${timeline.length})`}
                </button>
              )}
            </h4>

            <div className="relative border-s-2 border-slate-200 ms-2.5 space-y-4 text-xs">
              {timeline.length === 0 && <p className="ps-4 text-slate-400">لا توجد أحداث بعد.</p>}
              {(timelineExpanded ? timeline : timeline.slice(-5)).map((event) => (
                <div key={event.id} className="relative ps-4">
                  <span className="absolute -start-[7px] top-1 w-2.5 h-2.5 rounded-full bg-red-600 border-2 border-white" />
                  <p className="font-bold text-slate-800">{event.title}</p>
                  {event.detail && <p className="text-slate-500 mt-0.5 break-words">{event.detail}</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {arDateShort(event.at)}
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
