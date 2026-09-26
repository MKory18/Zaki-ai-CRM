'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { screenApi as crmApi } from '@/lib/screen-api';
import { useApp } from '@/context/AppContext';
import { RiArrowGoBackLine, RiCheckboxCircleLine, RiCloseCircleLine, RiMessage3Line, RiRefreshLine, RiSettings3Line, RiShoppingBagLine } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Rows } from '@/components/ui/Rows';

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
  PENDING: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)]',
  PROCESSED: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)]',
  IGNORED: 'bg-[var(--sys-surface-strong)] text-[var(--sys-muted-foreground)]',
  NEEDS_REVIEW: 'bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)]',
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
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [messages, setMessages] = useState<TelegramMsg[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('telegram.manage');
  const canView = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('telegram.view');

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [st, msgs] = await Promise.all([
        crmApi('/api/telegram/status'),
        crmApi('/api/telegram/messages' + (statusFilter ? `?status=${statusFilter}` : '')),
      ]);
      setStatus(st);
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
        <div className="p-8 text-center text-[var(--sys-muted-foreground)]">ليس لديك صلاحية لعرض تكامل تيليجرام</div>
      </>
    );
  }

  const retryMessage = async (m: TelegramMsg) => {
    setBusyId(m.id);
    try {
      const r: any = await crmApi(`/api/telegram/messages/${m.id}/retry`, { method: 'POST' });
      if (r.status === 'PROCESSED') await loadAll(true);
      else toast.failed(REVIEW_REASONS[r.reason] || 'لا يزال لا يمكن إنشاء الطلب');
    } catch (e: any) {
      toast.failed(e?.message || 'تعذر إعادة المحاولة');
    } finally {
      setBusyId(null);
    }
  };

  const connected = status?.botConfigured && status?.botApiOk;

  return (
    <>
      <div className="p-6 space-y-6 max-w-6xl mx-auto" dir="rtl">
        {/* Header */}
        <PageHeader title="طلبات تلجرام"
            description="تحويل رسائل مجموعات تيليجرام إلى طلبات تلقائيًا"
            actions={
              <><div className="flex items-center gap-2">
            {canManage && (
              <Link href="/settings/telegram">
                <Button variant="outline" size="sm"><RiSettings3Line className="w-4 h-4 ml-1" /> الإعدادات</Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={() => loadAll()}><RiRefreshLine className="w-4 h-4" /></Button>
          </div></>
            }
          />

        {error && (
          <div className="rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] px-3 py-2.5 text-xs flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 cursor-pointer">✕</button>
          </div>
        )}

        {/* Connection status */}
        <Card>
          <CardContent className="p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-[var(--sys-success)]' : 'bg-[var(--sys-destructive)]'}`} />
              <span className="text-sm font-semibold text-[var(--sys-heading)]">{connected ? 'متصل' : 'غير متصل'}</span>
            </div>
            <div className="text-xs text-[var(--sys-muted-foreground)]">
              البوت: {status?.botUsername ? <span dir="ltr" className="font-mono">@{status.botUsername}</span> : 'غير معروف'}
            </div>
            <div className="text-xs text-[var(--sys-muted-foreground)]">
              الويبهوك: {status?.telegramWebhookSet ? <span className="text-[var(--sys-success)] font-semibold">مسجل</span> : <span className="text-[var(--sys-destructive)] font-semibold">غير مسجل</span>}
            </div>
            <div className="text-xs text-[var(--sys-muted-foreground)]">المصادر المرتبطة: <span className="font-semibold text-[var(--sys-heading)]">{status?.sourcesCount ?? 0}</span></div>
            {/* Adding, switching and removing groups is configuration — it
                lives on the settings screen, beside the bot it depends on. */}
            {canManage && (
              <Link href="/settings/telegram" className="text-xs text-[var(--sys-primary)] hover:underline mr-auto">الاتصال والمجموعات المرتبطة ←</Link>
            )}
          </CardContent>
        </Card>

        {/* Order processing stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'CREATED', label: 'تم الإنشاء', icon: RiShoppingBagLine, color: 'text-[var(--sys-success)]' },
            { key: 'NEEDS_REVIEW', label: 'قيد المراجعة', icon: RiMessage3Line, color: 'text-[var(--sys-destructive)]' },
            { key: 'IGNORED', label: 'تم التجاهل', icon: RiCheckboxCircleLine, color: 'text-[var(--sys-muted-foreground)]' },
            { key: 'FAILED', label: 'فشل', icon: RiCloseCircleLine, color: 'text-[var(--sys-destructive)]' },
          ].map((s) => (
            <Card key={s.key}>
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <div>
                  <p className="text-lg font-bold text-[var(--sys-heading)]">{status?.stats?.[s.key] ?? 0}</p>
                  <p className="text-xs text-[var(--sys-muted-foreground)]">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

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
                            <Rows
                rows={messages}
                keyOf={(m) => m.id}
                columns={[
                  { key: 'c0', label: "الرسائل", primary: true,
                    render: (m) => (
                  <><p className="truncate text-[var(--sys-heading)]">{m.text || '—'}</p>
                        <p className="text-xs text-[var(--sys-muted-foreground)]">{m.senderName || 'مجهول'}</p></>
                ) },
                  { key: 'c1', label: "المجموعات", primary: true,
                    render: (m) => (m.source?.chatTitle || m.chatId) },
                  { key: 'c2', label: "المواضيع",
                    render: (m) => (m.threadName || m.source?.topicName || (m.threadId ? m.threadId : '—')) },
                  { key: 'c3', label: "اسم الصفحة",
                    render: (m) => (
                  <>{m.pageName ? <span className="text-[var(--sys-heading)] font-semibold">{m.pageName}</span> : '—'}</>
                ) },
                  { key: 'c4', label: "حالة المعالجة",
                    render: (m) => (
                  <><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[m.processingStatus] || ''}`}>
                          {STATUS_LABELS[m.processingStatus] || m.processingStatus}
                        </span>
                        {m.reviewReason && <p className="text-xs text-[var(--sys-destructive)] mt-0.5">{REVIEW_REASONS[m.reviewReason] || m.reviewReason}</p>}</>
                ) },
                  { key: 'c5', label: "الطلب",
                    render: (m) => (
                  <>{m.order ? <span className="font-mono text-[var(--sys-primary)] font-semibold" dir="ltr">{m.order.orderNumber}</span> : '—'}</>
                ) },
                  { key: 'c6', label: "الوقت",
                    render: (m) => (new Date(m.createdAt).toLocaleString('ar-u-nu-latn')) },
                  { key: 'c7', label: "إجراء", align: 'end',
                    render: (m) => (
                  <>{['NEEDS_REVIEW', 'FAILED'].includes(m.processingStatus) && canManage && (
                          <Button size="sm" variant="outline" disabled={busyId === m.id} onClick={() => retryMessage(m)}>
                            <RiArrowGoBackLine className="icon-mirror w-4 h-4 ml-1" /> إعادة المعالجة
                          </Button>
                        )}</>
                ) },
                ]}
                empty={
                  <EmptyState
                    title="لا رسائل من تلجرام بعد"
                    why="الرسائل تصل حين يُضاف البوت إلى المجموعة ويُمنح صلاحية القراءة. لا شيء يُسحب بأثرٍ رجعيّ."
                  />
                }
              />
            </div>
          </CardContent>
        </Card>

      </div>
    </>
  );
}
