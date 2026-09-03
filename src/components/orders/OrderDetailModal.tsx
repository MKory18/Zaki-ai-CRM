'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { Select, Textarea, Input } from '@/components/ui/Input';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { useApp } from '@/context/AppContext';
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
} from 'lucide-react';

/* ─── Status config: Arabic label + color + icon per status ─── */
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
}

export function OrderDetailModal({ orderId, isOpen, onClose, onRefresh }: OrderDetailModalProps) {
  const { t, locale, isRtl } = useApp();
  const ar = locale === 'ar';
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');

  const [callResult, setCallResult] = useState('CONFIRMED');
  const [callNotes, setCallNotes] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');

  useEffect(() => {
    if (isOpen && orderId) loadOrder(orderId);
  }, [isOpen, orderId]);

  const loadOrder = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${id}`);
      if (res.ok) {
        const data = await res.json();
        setOrder(data.order);
        setSelectedStatus(data.order.status);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!orderId || selectedStatus === order.status) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: selectedStatus,
          internalNotes: statusNote
            ? `${order.internalNotes ? order.internalNotes + '\n' : ''}[${new Date().toLocaleTimeString(ar ? 'ar-EG' : 'en-US')}]: ${statusNote}`
            : order.internalNotes,
        }),
      });
      if (res.ok) {
        await loadOrder(orderId);
        onRefresh();
        setStatusNote('');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/call-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: callResult, notes: callNotes, nextFollowUpDate: nextFollowUpDate || null }),
      });
      if (res.ok) {
        await loadOrder(orderId);
        onRefresh();
        setCallNotes('');
        setNextFollowUpDate('');
      }
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
  if (!order) return null;

  const currentCfg = STATUS_CONFIG[order.status];
  const CurrentIcon = currentCfg?.icon ?? Clock;

  const money = (n: number) =>
    `$${n.toLocaleString(ar ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`الطلب ${order.orderNumber}`}
      subtitle={`أُنشئ في ${format(new Date(order.createdAt), 'd MMMM yyyy — h:mm a', {})} • المصدر: ${order.source}`}
      maxWidth="4xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" dir={isRtl ? 'rtl' : 'ltr'}>
        {/* ─── Left column ─── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Current Status — colored with icon */}
          <div className="rounded-2xl border border-slate-200 p-4 bg-gradient-to-l from-slate-50 to-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  {ar ? 'الحالة الحالية' : 'Current Status'}
                </span>
                <span
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border-2 font-bold text-sm ${currentCfg?.pill ?? 'bg-slate-100 text-slate-700 border-slate-300'}`}
                >
                  <CurrentIcon className="w-4 h-4" />
                  {ar ? currentCfg?.ar : currentCfg?.en}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-200 focus:border-red-500 focus:outline-none transition-colors cursor-pointer"
                >
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key} className={cfg.select}>
                      {ar ? cfg.ar : cfg.en}
                    </option>
                  ))}
                </select>
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
              </div>
            </div>

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
                  <div>
                    <p className="text-[11px] text-slate-400">عنوان التوصيل</p>
                    <p className="text-slate-700 text-xs leading-relaxed">
                      {order.customer?.address}
                      {order.customer?.city ? ` — ${order.customer.city}` : ''}
                    </p>
                  </div>
                </div>
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
                  {order.offer?.name || 'مباشر'} ({order.quantity} {t.units})
                </span>
              </div>
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

          {/* Timeline */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              سجل الأحداث
            </h4>

            <div className="relative border-s-2 border-slate-200 ms-2.5 space-y-4 text-xs">
              {order.activities?.map((act: any) => {
                const label = ACTIVITY_LABELS[act.action];
                return (
                  <div key={act.id} className="relative ps-4">
                    <span className="absolute -start-[7px] top-1 w-2.5 h-2.5 rounded-full bg-red-600 border-2 border-white" />
                    <p className="font-bold text-slate-800">{ar ? label?.ar ?? act.action : label?.en ?? act.action}</p>
                    {act.previousStatus && act.newStatus && (
                      <p className="text-slate-500 mt-0.5">
                        {ar ? STATUS_CONFIG[act.previousStatus]?.ar : STATUS_CONFIG[act.previousStatus]?.en} ←{' '}
                        <span className="font-semibold text-slate-700">
                          {ar ? STATUS_CONFIG[act.newStatus]?.ar : STATUS_CONFIG[act.newStatus]?.en}
                        </span>
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {format(new Date(act.createdAt), 'd MMM, h:mm a')}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
