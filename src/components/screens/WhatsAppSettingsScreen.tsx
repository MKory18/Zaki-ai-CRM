'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { useApp } from '@/context/AppContext';
import { screenApi as crmApi } from '@/lib/screen-api';
import { RefreshCw, Settings, ShieldAlert, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

export function WhatsAppSettingsScreen() {
  const { currentUser } = useApp();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'test' | 'reconnect' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [conn, setConn] = useState<any>(null);

  const canManage = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('whatsapp.manage');

  const load = useCallback(async () => {
    try {
      const d: any = await crmApi('/api/whatsapp/connection');
      setConn(d);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'تعذر تحميل الإعدادات' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runAction = async (kind: 'test' | 'reconnect') => {
    setBusy(kind); setMessage(null);
    try {
      const d: any = await crmApi(`/api/whatsapp/connection/${kind}`, { method: 'POST', body: JSON.stringify({}) });
      if (d.ok) {
        setMessage({ type: 'success', text: kind === 'test' ? 'تم اختبار الاتصال بنجاح' : 'تمت إعادة الاتصال بنجاح' });
      } else {
        setMessage({ type: 'error', text: d.error || 'تعذر الاتصال بواتساب' });
      }
      await load();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'تعذر الاتصال بواتساب' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <>
        <Card><CardContent className="py-12 text-center text-sm text-[var(--sys-muted-foreground)]">جارٍ التحميل...</CardContent></Card>
      </>
    );
  }

  if (!canManage) {
    return (
      <>
        <div className="p-8">
          <div className="max-w-md mx-auto mt-20 text-center p-8 bg-[var(--sys-card)] rounded-lg border border-[var(--sys-border)]">
            <ShieldAlert className="w-10 h-10 mx-auto text-[var(--sys-primary)]" />
            <h2 className="mt-4 font-bold text-[var(--sys-heading)]">ليس لديك صلاحية لإدارة واتساب</h2>
          </div>
        </div>
      </>
    );
  }

  const status = conn?.status || 'NEEDS_SETUP';
  const c = conn?.connection;

  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'WhatsApp Business', value: c?.displayName || '—' },
    { label: 'رقم الهاتف', value: c?.phoneNumber ? <span dir="ltr">{c.phoneNumber}</span> : '—' },
    { label: 'WABA ID', value: c?.wabaId || (conn?.envConfigured ? 'من متغيرات البيئة' : '—') },
    { label: 'Phone Number ID', value: c?.phoneNumberId || (conn?.envConfigured ? 'من متغيرات البيئة' : '—') },
    { label: 'آخر Webhook', value: c?.lastWebhookAt ? new Date(c.lastWebhookAt).toLocaleString('ar-EG') : 'لا يوجد' },
    { label: 'آخر رسالة', value: c?.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString('ar-EG') : 'لا يوجد' },
    { label: 'آخر خطأ', value: c?.lastError || 'لا يوجد' },
  ];

  return (
    <>
      <div className="p-6 space-y-6 max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--sys-heading)]">إعدادات واتساب</h1>
            <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">ربط رقم WhatsApp Business واحد مشترك لكل الموظفين</p>
          </div>
          <Link href="/growth/whatsapp/inbox" className="text-xs font-semibold text-[var(--sys-primary)] hover:underline">
            العودة للصندوق
          </Link>
        </div>

        {/* Status */}
        <div className={`p-4 rounded-lg border flex items-center gap-3 ${status === 'CONNECTED' ? 'bg-[var(--sys-success-soft)] border-[var(--sys-success-soft)]' : 'bg-[var(--sys-warning-soft)] border-[var(--sys-warning)]'}`}>
          <span className={`w-3 h-3 rounded-full ${status === 'CONNECTED' ? 'bg-[var(--sys-success)]' : 'bg-[var(--sys-warning)]'}`} />
          <div className="flex-1">
            <p className={`font-bold text-sm ${status === 'CONNECTED' ? 'text-[var(--sys-success)]' : 'text-[var(--sys-warning)]'}`}>
              {status === 'CONNECTED' ? '🟢 متصل' : '🟡 يحتاج إعداد'}
            </p>
            <p className="text-[11px] text-[var(--sys-muted-foreground)]">
              {status === 'CONNECTED'
                ? 'الاتصال بواتساب يعمل عبر WhatsApp Business Cloud API'
                : conn?.envConfigured
                  ? 'متغيرات البيئة موجودة — اضغط إعادة الاتصال لتفعيل الرقم'
                  : 'أكمل متغيرات البيئة في الخادم ثم اضغط إعادة الاتصال'}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => runAction('test')} disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-xs font-semibold text-[var(--sys-heading)] hover:bg-[var(--sys-surface)] disabled:opacity-50">
              {busy === 'test' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              اختبار الاتصال
            </button>
            <button onClick={() => runAction('reconnect')} disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-semibold hover:opacity-90 disabled:opacity-50">
              {busy === 'reconnect' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              إعادة الاتصال
            </button>
          </div>
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${message.type === 'success' ? 'bg-[var(--sys-success-soft)] border border-[var(--sys-success-soft)] text-[var(--sys-success)]' : 'bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] text-[var(--sys-destructive)]'}`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {message.text}
          </div>
        )}

        {/* Details */}
        <Card>
          <CardContent className="p-0 divide-y divide-[var(--sys-surface-strong)]">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between px-5 py-3">
                <span className="text-xs text-[var(--sys-muted-foreground)]">{r.label}</span>
                <span className="text-xs font-semibold text-[var(--sys-heading)] text-left">{r.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Environment checklist */}
        <Card>
          <CardContent className="p-5 space-y-2">
            <p className="text-sm font-bold text-[var(--sys-heading)] mb-1">متغيرات البيئة المطلوبة (ملف .env على الخادم)</p>
            {[
              ['WHATSAPP_ACCESS_TOKEN', 'رمز الوصول الدائم من Meta'],
              ['WHATSAPP_BUSINESS_ACCOUNT_ID', 'معرف حساب WhatsApp Business'],
              ['WHATSAPP_PHONE_NUMBER_ID', 'معرف رقم الهاتف'],
              ['WHATSAPP_VERIFY_TOKEN', 'رمز التحقق للويبهوك (أي قيمة سرية من عندك)'],
              ['WHATSAPP_APP_SECRET', 'App Secret من إعدادات تطبيق Meta'],
              ['WHATSAPP_ENCRYPTION_KEY', 'مفتاح تشفير (32 حرفًا على الأقل)'],
            ].map(([k, desc]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <code className="px-2 py-1 rounded bg-[var(--sys-surface-strong)] text-[var(--sys-heading)] font-semibold" dir="ltr">{k}</code>
                <span className="text-[var(--sys-muted-foreground)]">{desc}</span>
              </div>
            ))}
            <div className="mt-3 p-3 rounded-lg bg-[var(--sys-surface)] border border-[#eef1f5] text-[11px] text-[var(--sys-muted-foreground)] flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-[var(--sys-primary)]" />
              <span>
                لا تُدخل أي بيانات سرية هنا في الواجهة — كل البيانات من متغيرات بيئة الخادم فقط، ولا يتم عرض Access Token مطلقًا.
                بعد إضافة البيانات: أعد تشغيل الخادم، اضغط [إعادة الاتصال]، ثم سجّل رابط الويبهوك في تطبيق Meta:
                <code className="mx-1 px-1.5 py-0.5 rounded bg-[var(--sys-surface-strong)]" dir="ltr">/api/webhooks/whatsapp</code>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
