'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { screenApi as crmApi } from '@/lib/screen-api';
import { useApp } from '@/context/AppContext';
import {
  Send, Settings, Plus, RefreshCw, CheckCircle2, XCircle,
  AlertCircle, Trash2, Power, MessageSquare, ShoppingBag, RotateCcw, FlaskConical,
} from 'lucide-react';

interface TelegramSource {
  id: string;
  chatId: string;
  chatType: string;
  chatTitle: string | null;
  topicId: number | null;
  topicName: string | null;
  isActive: boolean;
  ordersCount: number;
  lastMessageAt: string | null;
}

interface TelegramMsg {
  id: string;
  chatId: string;
  messageId: string;
  threadId: number | null;
  threadName: string | null;
  senderName: string | null;
  text: string | null;
  processingStatus: string;
  reviewReason: string | null;
  pageName: string | null;
  createdAt: string;
  source: { chatTitle: string | null; topicName: string | null; chatId: string; topicId: number | null } | null;
  order: { id: string; orderNumber: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد المعالجة',
  PROCESSED: 'تم إنشاء طلب',
  IGNORED: 'تم التجاهل',
  NEEDS_REVIEW: 'قيد المراجعة',
  FAILED: 'فشل',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-[#fff7e6] text-[#b8860b]',
  PROCESSED: 'bg-[#e6f9ee] text-[#00a651]',
  IGNORED: 'bg-[#f1f5f9] text-[#697586]',
  NEEDS_REVIEW: 'bg-[#fff1f2] text-[#e11d48]',
  FAILED: 'bg-[#fef2f2] text-[#dc2626]',
};

const REVIEW_REASONS: Record<string, string> = {
  PRODUCT_NOT_FOUND: 'المنتج غير موجود',
  AMBIGUOUS_PRODUCT: 'أكثر من منتج محتمل',
  INVALID_PHONE: 'رقم هاتف غير صالح',
  MISSING_CUSTOMER_NAME: 'اسم العميل ناقص',
  MISSING_ADDRESS: 'العنوان ناقص',
  MISSING_PRODUCT: 'المنتج ناقص',
  INVALID_QUANTITY: 'كمية غير صالحة',
  MISSING_PRICE: 'السعر ناقص أو غير صالح',
  NO_SYSTEM_ACTOR: 'لا يوجد مستخدم نظام',
  CREATION_FAILED: 'فشل إنشاء الطلب',
};

export function TelegramOrdersScreen() {
  const { currentUser } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [sources, setSources] = useState<TelegramSource[]>([]);
  const [messages, setMessages] = useState<TelegramMsg[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ chatId: '', chatTitle: '', topicId: '', topicName: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('telegram.manage');
  const canView = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('telegram.view');

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [st, src, msgs] = await Promise.all([
        crmApi('/api/telegram/status'),
        crmApi('/api/telegram/sources'),
        crmApi('/api/telegram/messages' + (statusFilter ? `?status=${statusFilter}` : '')),
      ]);
      setStatus(st);
      setSources(src.sources || []);
      setMessages(msgs.messages || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (canView !== false) loadAll();
  }, [loadAll, canView]);

  if (!canView) {
    return (
      <>
        <div className="p-8 text-center text-[#697586]">ليس لديك صلاحية لعرض تكامل تيليجرام</div>
      </>
    );
  }

  const addSource = async () => {
    setFormError(null);
    setSaving(true);
    try {
      await crmApi('/api/telegram/sources', {
        method: 'POST',
        body: JSON.stringify({
          chatId: form.chatId.trim(),
          chatType: 'supergroup',
          chatTitle: form.chatTitle.trim() || null,
          topicId: form.topicId.trim() ? Number(form.topicId.trim()) : null,
          topicName: form.topicName.trim() || null,
          isActive: true,
        }),
      });
      setAddOpen(false);
      setForm({ chatId: '', chatTitle: '', topicId: '', topicName: '' });
      await loadAll(true);
    } catch (e: any) {
      setFormError(e?.message || 'تعذر إضافة المصدر');
    } finally {
      setSaving(false);
    }
  };

  const toggleSource = async (s: TelegramSource) => {
    setBusyId(s.id);
    try {
      await crmApi(`/api/telegram/sources/${s.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !s.isActive }) });
      await loadAll(true);
    } catch (e: any) {
      setError(e?.message || 'تعذر التحديث');
    } finally {
      setBusyId(null);
    }
  };

  const deleteSource = async (s: TelegramSource) => {
    if (!confirm(`حذف الربط مع "${s.chatTitle || s.chatId}"؟ لن يتم حذف الطلبات السابقة.`)) return;
    setBusyId(s.id);
    try {
      await crmApi(`/api/telegram/sources/${s.id}`, { method: 'DELETE' });
      await loadAll(true);
    } catch (e: any) {
      setError(e?.message || 'تعذر الحذف');
    } finally {
      setBusyId(null);
    }
  };

  const testSource = async (s: TelegramSource) => {
    setBusyId(s.id);
    try {
      const r: any = await crmApi(`/api/telegram/sources/${s.id}/test`, { method: 'POST' });
      alert(r.lastMessage
        ? `آخر رسالة: ${new Date(r.lastMessage.createdAt).toLocaleString('ar')} — الحالة: ${STATUS_LABELS[r.lastMessage.processingStatus] || r.lastMessage.processingStatus}`
        : 'لا توجد رسائل مستلمة من هذه المجموعة بعد');
    } catch (e: any) {
      setError(e?.message || 'تعذر الاختبار');
    } finally {
      setBusyId(null);
    }
  };

  const retryMessage = async (m: TelegramMsg) => {
    setBusyId(m.id);
    try {
      const r: any = await crmApi(`/api/telegram/messages/${m.id}/retry`, { method: 'POST' });
      if (r.status === 'PROCESSED') await loadAll(true);
      else setError(REVIEW_REASONS[r.reason] || 'لا يزال لا يمكن إنشاء الطلب');
    } catch (e: any) {
      setError(e?.message || 'تعذر إعادة المحاولة');
    } finally {
      setBusyId(null);
    }
  };

  const connected = status?.botConfigured && status?.botApiOk;

  return (
    <>
      <div className="p-6 space-y-6 max-w-6xl mx-auto" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#121926] flex items-center gap-2">
              <Send className="w-5 h-5 text-[#229ED9]" /> تكامل تيليجرام
            </h1>
            <p className="text-xs text-[#697586] mt-1">تحويل رسائل مجموعات تيليجرام إلى طلبات تلقائيًا</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/settings/telegram">
              <Button variant="outline" size="sm"><Settings className="w-4 h-4 ml-1" /> الإعدادات</Button>
            </Link>
            {canManage && (
              <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 ml-1" /> إضافة مصدر</Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => loadAll()}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 text-rose-800 px-3 py-2.5 text-xs flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 cursor-pointer">✕</button>
          </div>
        )}

        {/* Connection status */}
        <Card>
          <CardContent className="p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="text-sm font-semibold text-[#121926]">{connected ? 'متصل' : 'غير متصل'}</span>
            </div>
            <div className="text-xs text-[#697586]">
              البوت: {status?.botUsername ? <span dir="ltr" className="font-mono">@{status.botUsername}</span> : 'غير معروف'}
            </div>
            <div className="text-xs text-[#697586]">
              الويبهوك: {status?.telegramWebhookSet ? <span className="text-emerald-600 font-semibold">مسجل</span> : <span className="text-rose-600 font-semibold">غير مسجل</span>}
            </div>
            <div className="text-xs text-[#697586]">المصادر المرتبطة: <span className="font-semibold text-[#121926]">{status?.sourcesCount ?? 0}</span></div>
            <Link href="/settings/telegram" className="text-xs text-[#b8256e] hover:underline mr-auto">تفاصيل الاتصال ←</Link>
          </CardContent>
        </Card>

        {/* Order processing stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'CREATED', label: 'تم الإنشاء', icon: ShoppingBag, color: 'text-emerald-600' },
            { key: 'NEEDS_REVIEW', label: 'قيد المراجعة', icon: MessageSquare, color: 'text-rose-600' },
            { key: 'IGNORED', label: 'تم التجاهل', icon: CheckCircle2, color: 'text-[#697586]' },
            { key: 'FAILED', label: 'فشل', icon: XCircle, color: 'text-red-600' },
          ].map((s) => (
            <Card key={s.key}>
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <div>
                  <p className="text-lg font-bold text-[#121926]">{status?.stats?.[s.key] ?? 0}</p>
                  <p className="text-[10px] text-[#697586]">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Sources */}
        <Card>
          <CardHeader title="المجموعات والمواضيع المرتبطة" className="border-b-0 pb-0 px-6 pt-4" />
          <CardContent className="p-0 mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3 text-right">المجموعة</th>
                    <th className="px-4 py-3 text-right">النوع</th>
                    <th className="px-4 py-3 text-right">الحالة</th>
                    <th className="px-4 py-3 text-right">الطلبات</th>
                    <th className="px-4 py-3 text-right">آخر رسالة</th>
                    <th className="px-4 py-3 text-left">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {sources.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-[#9ca3af]">{loading ? 'جارٍ التحميل...' : 'لا توجد بيانات'}</td></tr>
                  ) : sources.map((s) => (
                    <tr key={s.id} className="hover:bg-[#f8fafc]">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#121926]">{s.chatTitle || 'بدون عنوان'}</p>
                        <p className="text-[10px] text-[#697586] font-mono" dir="ltr">{s.chatId}{s.topicId ? ` • topic ${s.topicId}` : ''}</p>
                        {s.topicName && <p className="text-[10px] text-[#697586]">الموضوع: {s.topicName}</p>}
                      </td>
                      <td className="px-4 py-3 text-[#697586]">{s.chatType === 'supergroup' ? 'مجموعة فائقة' : s.chatType === 'group' ? 'مجموعة' : 'قناة'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.isActive ? 'bg-[#e6f9ee] text-[#00a651]' : 'bg-[#f1f5f9] text-[#697586]'}`}>
                          {s.isActive ? 'مفعل' : 'معطل'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#121926]">{s.ordersCount}</td>
                      <td className="px-4 py-3 text-[#697586]">{s.lastMessageAt ? new Date(s.lastMessageAt).toLocaleString('ar') : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button disabled={busyId === s.id} onClick={() => testSource(s)} title="اختبار" className="p-1.5 rounded hover:bg-[#f1f5f9] text-[#697586]"><FlaskConical className="w-4 h-4" /></button>
                          <button disabled={busyId === s.id} onClick={() => toggleSource(s)} title={s.isActive ? 'تعطيل' : 'تفعيل'} className="p-1.5 rounded hover:bg-[#f1f5f9] text-[#697586]"><Power className="w-4 h-4" /></button>
                          <button disabled={busyId === s.id} onClick={() => deleteSource(s)} title="حذف" className="p-1.5 rounded hover:bg-rose-50 text-rose-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent messages */}
        <Card>
          <CardHeader
            title="الرسائل الأخيرة"
            className="border-b-0 pb-0 px-6 pt-4"
            action={
              <div className="w-40">
                <Select value={statusFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)} className="text-xs py-1.5">
                  <option value="">كل الحالات</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
            }
          />
          <CardContent className="p-0 mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3 text-right">الرسائل</th>
                    <th className="px-4 py-3 text-right">المجموعات</th>
                    <th className="px-4 py-3 text-right">المواضيع</th>
                    <th className="px-4 py-3 text-right">اسم الصفحة</th>
                    <th className="px-4 py-3 text-right">حالة المعالجة</th>
                    <th className="px-4 py-3 text-right">الطلب</th>
                    <th className="px-4 py-3 text-right">الوقت</th>
                    <th className="px-4 py-3 text-left">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {messages.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-[#9ca3af]">{loading ? 'جارٍ التحميل...' : 'لا توجد بيانات'}</td></tr>
                  ) : messages.map((m) => (
                    <tr key={m.id} className="hover:bg-[#f8fafc]">
                      <td className="px-4 py-3 max-w-[280px]">
                        <p className="truncate text-[#121926]">{m.text || '—'}</p>
                        <p className="text-[10px] text-[#697586]">{m.senderName || 'مجهول'}</p>
                      </td>
                      <td className="px-4 py-3 text-[#697586]">{m.source?.chatTitle || m.chatId}</td>
                      <td className="px-4 py-3 text-[#697586]">{m.threadName || m.source?.topicName || (m.threadId ? m.threadId : '—')}</td>
                      <td className="px-4 py-3">
                        {m.pageName ? <span className="text-[#121926] font-semibold">{m.pageName}</span> : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[m.processingStatus] || ''}`}>
                          {STATUS_LABELS[m.processingStatus] || m.processingStatus}
                        </span>
                        {m.reviewReason && <p className="text-[10px] text-[#e11d48] mt-0.5">{REVIEW_REASONS[m.reviewReason] || m.reviewReason}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {m.order ? <span className="font-mono text-[#b8256e] font-semibold" dir="ltr">{m.order.orderNumber}</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-[#697586]">{new Date(m.createdAt).toLocaleString('ar')}</td>
                      <td className="px-4 py-3 text-left">
                        {['NEEDS_REVIEW', 'FAILED'].includes(m.processingStatus) && canManage && (
                          <Button size="sm" variant="outline" disabled={busyId === m.id} onClick={() => retryMessage(m)}>
                            <RotateCcw className="w-3 h-3 ml-1" /> إعادة المعالجة
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Add Source modal */}
        <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="إضافة مصدر تيليجرام">
          <div className="space-y-4" dir="rtl">
            <div>
              <label className="text-xs font-semibold text-[#121926] block mb-1">Chat ID *</label>
              <Input value={form.chatId} onChange={(e) => setForm({ ...form, chatId: e.target.value })} placeholder="-1001234567890" dir="ltr" className="text-left font-mono" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#121926] block mb-1">اسم المجموعة</label>
              <Input value={form.chatTitle} onChange={(e) => setForm({ ...form, chatTitle: e.target.value })} placeholder="مجموعة طلبات المتجر" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#121926] block mb-1">Topic ID (اختياري)</label>
                <Input value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })} placeholder="اتركه فارغًا لربط المجموعة كاملة" dir="ltr" className="text-left font-mono" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#121926] block mb-1">اسم الموضوع</label>
                <Input value={form.topicName} onChange={(e) => setForm({ ...form, topicName: e.target.value })} />
              </div>
            </div>
            {formError && <p className="text-xs text-rose-600">{formError}</p>}
            <p className="text-[10px] text-[#697586] leading-relaxed">
              تأكد من إضافة البوت إلى المجموعة ومن تفعيل Privacy Mode المناسب. اترك Topic ID فارغًا لربط المجموعة بالكامل.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>إلغاء</Button>
              <Button size="sm" disabled={!form.chatId.trim() || saving} onClick={addSource}>{saving ? 'جارٍ الحفظ...' : 'إضافة'}</Button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
}
