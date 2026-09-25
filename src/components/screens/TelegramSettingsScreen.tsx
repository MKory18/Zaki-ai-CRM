'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
import { screenApi as crmApi } from '@/lib/screen-api';
import { Send, RefreshCw, CheckCircle2, XCircle, Copy } from 'lucide-react';
import { copyText } from '@/lib/clipboard';
import { TelegramSourcesCard } from '@/components/settings/TelegramSourcesCard';

export function TelegramSettingsScreen() {
  const { currentUser } = useApp();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const canManage = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('telegram.manage');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await crmApi('/api/telegram/status'));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الحالة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setupWebhook = async () => {
    setBusy(true);
    try {
      await crmApi('/api/telegram/webhook/setup', { method: 'POST' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'تعذر تسجيل الويبهوك');
    } finally {
      setBusy(false);
    }
  };

  const copyWebhook = () => {
    if (status?.webhookUrl) {
      void copyText(status.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const Row = ({ label, ok, value }: { label: string; ok: boolean; value?: string }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--sys-surface-strong)] last:border-0">
      <span className="text-xs text-[var(--sys-muted-foreground)]">{label}</span>
      <span className={`text-xs font-semibold flex items-center gap-1.5 ${ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>
        {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        {value ?? (ok ? 'مضبوط' : 'غير مضبوط')}
      </span>
    </div>
  );

  return (
    <>
      <div className="p-6 space-y-6 max-w-3xl mx-auto" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--sys-heading)] flex items-center gap-2">
              <Send className="w-5 h-5 text-[#229ED9]" /> إعدادات تيليجرام
            </h1>
            <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">حالة اتصال البوت والويبهوك (لا تُعرض أي مفاتيح سرية هنا أبدًا)</p>
          </div>
          <div className="flex gap-2">
            <Link href="/growth/telegram/orders"><Button variant="outline" size="sm">رجوع</Button></Link>
            <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] px-3 py-2.5 text-xs">{error}</div>
        )}

        <Card>
          <CardHeader title="حالة البوت" subtitle="تُقرأ الحالة من متغيرات البيئة على السيرفر" />
          <CardContent>
            {loading ? (
              <p className="text-xs text-[var(--sys-muted-foreground)] py-4">جارٍ التحميل...</p>
            ) : (
              <div>
                <Row label="TELEGRAM_BOT_TOKEN" ok={Boolean(status?.botConfigured)} />
                <Row label="الاتصال بواجهة Telegram API" ok={Boolean(status?.botApiOk)} value={status?.botApiOk ? 'يعمل' : undefined} />
                <Row label="TELEGRAM_WEBHOOK_SECRET" ok={Boolean(status?.webhookSecretConfigured)} />
                <Row label="APP_URL (لبناء رابط الويبهوك)" ok={Boolean(status?.appUrlConfigured)} />
                <div className="flex items-center justify-between py-2.5 border-b border-[var(--sys-surface-strong)]">
                  <span className="text-xs text-[var(--sys-muted-foreground)]">Bot username</span>
                  <span className="text-xs font-mono text-[var(--sys-heading)] font-semibold" dir="ltr">
                    {status?.botUsername ? `@${status.botUsername}` : '—'}
                  </span>
                </div>
                <div className="pt-3">
                  <p className="text-xs text-[var(--sys-muted-foreground)] mb-1">Webhook URL:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded px-3 py-2 font-mono break-all" dir="ltr">
                      {status?.webhookUrl || '— لم يتم ضبط APP_URL —'}
                    </code>
                    {status?.webhookUrl && (
                      <Button variant="outline" size="sm" onClick={copyWebhook}><Copy className="w-3.5 h-3.5 ml-1" />{copied ? 'تم النسخ' : 'نسخ'}</Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {canManage && (
          <Card>
            <CardHeader title="تسجيل الويبهوك" subtitle="يسجّل رابط الويبهوك لدى تيليجرام باستخدام TELEGRAM_WEBHOOK_SECRET" />
            <CardContent className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${status?.telegramWebhookSet ? 'text-[var(--sys-success)]' : 'text-[var(--sys-muted-foreground)]'}`}>
                {status?.telegramWebhookSet ? 'الويبهوك مسجل لدى تيليجرام' : 'الويبهوك غير مسجل'}
              </span>
              <Button size="sm" disabled={busy || !status?.botConfigured || !status?.appUrlConfigured} onClick={setupWebhook}>
                {busy ? 'جارٍ التسجيل...' : 'تسجيل / تحديث الويبهوك'}
              </Button>
            </CardContent>
          </Card>
        )}

        <TelegramSourcesCard canManage={!!canManage} />

        <Card>
          <CardHeader title="ملاحظات مهمة" />
          <CardContent className="text-xs text-[var(--sys-muted-foreground)] leading-relaxed space-y-2">
            <p>• يجب أن يكون البوت عضوًا في المجموعة لاستقبال الرسائل، وقد يتطلب تعطيل Privacy Mode أو منحه صلاحية قراءة الرسائل حسب نوع المجموعة.</p>
            <p>• في المجموعات ذات المواضيع (Topics/Forum) يستقبل البوت رسائل المواضيع تلقائيًا؛ يمكنك ربط موضوع محدد من «المجموعات والمواضيع المرتبطة» أعلاه.</p>
            <p>• لا تشارك مفتاح البوت أو سر الويبهوك مع أي شخص. لا تُعرض هذه القيم في هذه الصفحة مطلقًا.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
