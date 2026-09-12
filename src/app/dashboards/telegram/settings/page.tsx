'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/context/AppContext';
import { crmApi } from '@/lib/crm-client';
import { Send, RefreshCw, CheckCircle2, XCircle, Copy } from 'lucide-react';

export default function TelegramSettingsPage() {
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
      setError(e?.message || 'طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ط­ط§ظ„ط©');
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
      setError(e?.message || 'طھط¹ط°ط± طھط³ط¬ظٹظ„ ط§ظ„ظˆظٹط¨ظ‡ظˆظƒ');
    } finally {
      setBusy(false);
    }
  };

  const copyWebhook = () => {
    if (status?.webhookUrl) {
      navigator.clipboard?.writeText(status.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const Row = ({ label, ok, value }: { label: string; ok: boolean; value?: string }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-[#f1f5f9] last:border-0">
      <span className="text-xs text-[#697586]">{label}</span>
      <span className={`text-xs font-semibold flex items-center gap-1.5 ${ok ? 'text-emerald-600' : 'text-rose-600'}`}>
        {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        {value ?? (ok ? 'ظ…ط¶ط¨ظˆط·' : 'ط؛ظٹط± ظ…ط¶ط¨ظˆط·')}
      </span>
    </div>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-3xl mx-auto" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#121926] flex items-center gap-2">
              <Send className="w-5 h-5 text-[#229ED9]" /> ط¥ط¹ط¯ط§ط¯ط§طھ طھظٹظ„ظٹط¬ط±ط§ظ…
            </h1>
            <p className="text-xs text-[#697586] mt-1">ط­ط§ظ„ط© ط§طھطµط§ظ„ ط§ظ„ط¨ظˆطھ ظˆط§ظ„ظˆظٹط¨ظ‡ظˆظƒ (ظ„ط§ طھظڈط¹ط±ط¶ ط£ظٹ ظ…ظپط§طھظٹط­ ط³ط±ظٹط© ظ‡ظ†ط§ ط£ط¨ط¯ظ‹ط§)</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboards/telegram"><Button variant="outline" size="sm">ط±ط¬ظˆط¹</Button></Link>
            <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 text-rose-800 px-3 py-2.5 text-xs">{error}</div>
        )}

        <Card>
          <CardHeader title="ط­ط§ظ„ط© ط§ظ„ط¨ظˆطھ" subtitle="ظٹطھظ… ظ‚ط±ط§ط،ط© ط§ظ„ط­ط§ظ„ط© ظ…ظ† ظ…طھط؛ظٹط±ط§طھ ط§ظ„ط¨ظٹط¦ط© ط¹ظ„ظ‰ ط§ظ„ط³ظٹط±ظپط±" />
          <CardContent>
            {loading ? (
              <p className="text-xs text-[#697586] py-4">ط¬ط§ط±ظچ ط§ظ„طھط­ظ…ظٹظ„...</p>
            ) : (
              <div>
                <Row label="TELEGRAM_BOT_TOKEN" ok={Boolean(status?.botConfigured)} />
                <Row label="ط§ظ„ط§طھطµط§ظ„ ط¨ظˆط§ط¬ظ‡ط© Telegram API" ok={Boolean(status?.botApiOk)} value={status?.botApiOk ? 'ظٹط¹ظ…ظ„' : undefined} />
                <Row label="TELEGRAM_WEBHOOK_SECRET" ok={Boolean(status?.webhookSecretConfigured)} />
                <Row label="APP_URL (ظ„ط¨ظ†ط§ط، ط±ط§ط¨ط· ط§ظ„ظˆظٹط¨ظ‡ظˆظƒ)" ok={Boolean(status?.appUrlConfigured)} />
                <div className="flex items-center justify-between py-2.5 border-b border-[#f1f5f9]">
                  <span className="text-xs text-[#697586]">ط§ط³ظ… ط§ظ„ط¨ظˆطھ</span>
                  <span className="text-xs font-mono text-[#121926] font-semibold" dir="ltr">
                    {status?.botUsername ? `@${status.botUsername}` : 'â€”'}
                  </span>
                </div>
                <div className="pt-3">
                  <p className="text-xs text-[#697586] mb-1">Webhook URL:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] bg-[#f8fafc] border border-[#e3e8ef] rounded px-3 py-2 font-mono break-all" dir="ltr">
                      {status?.webhookUrl || 'â€” ظ„ظ… ظٹطھظ… ط¶ط¨ط· APP_URL â€”'}
                    </code>
                    {status?.webhookUrl && (
                      <Button variant="outline" size="sm" onClick={copyWebhook}><Copy className="w-3.5 h-3.5 ml-1" />{copied ? 'طھظ… ط§ظ„ظ†ط³ط®' : 'ظ†ط³ط®'}</Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {canManage && (
          <Card>
            <CardHeader title="طھط³ط¬ظٹظ„ ط§ظ„ظˆظٹط¨ظ‡ظˆظƒ" subtitle="ظٹط³ط¬ظ‘ظ„ ط±ط§ط¨ط· ط§ظ„ظˆظٹط¨ظ‡ظˆظƒ ظ„ط¯ظ‰ طھظٹظ„ظٹط¬ط±ط§ظ… ط¨ط§ط³طھط®ط¯ط§ظ… TELEGRAM_WEBHOOK_SECRET" />
            <CardContent className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${status?.telegramWebhookSet ? 'text-emerald-600' : 'text-[#697586]'}`}>
                {status?.telegramWebhookSet ? 'ط§ظ„ظˆظٹط¨ظ‡ظˆظƒ ظ…ظڈط³ط¬ظ„ ظ„ط¯ظ‰ طھظٹظ„ظٹط¬ط±ط§ظ…' : 'ط§ظ„ظˆظٹط¨ظ‡ظˆظƒ ط؛ظٹط± ظ…ظڈط³ط¬ظ„'}
              </span>
              <Button size="sm" disabled={busy || !status?.botConfigured || !status?.appUrlConfigured} onClick={setupWebhook}>
                {busy ? 'ط¬ط§ط±ظچ ط§ظ„طھط³ط¬ظٹظ„...' : 'طھط³ط¬ظٹظ„ / طھط­ط¯ظٹط« ط§ظ„ظˆظٹط¨ظ‡ظˆظƒ'}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader title="ظ…ظ„ط§ط­ط¸ط§طھ ظ…ظ‡ظ…ط©" />
          <CardContent className="text-xs text-[#697586] leading-relaxed space-y-2">
            <p>â€¢ ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط§ظ„ط¨ظˆطھ ط¹ط¶ظˆظ‹ط§ ظپظٹ ط§ظ„ظ…ط¬ظ…ظˆط¹ط© ظ„ط§ط³طھظ‚ط¨ط§ظ„ ط§ظ„ط±ط³ط§ط¦ظ„طŒ ظˆظ‚ط¯ ظٹطھط·ظ„ط¨ طھط¹ط·ظٹظ„ Privacy Mode ط£ظˆ ظ…ظ†ط­ظ‡ طµظ„ط§ط­ظٹط© ظ‚ط±ط§ط،ط© ط§ظ„ط±ط³ط§ط¦ظ„ ط­ط³ط¨ ظ†ظˆط¹ ط§ظ„ظ…ط¬ظ…ظˆط¹ط©.</p>
            <p>â€¢ ظپظٹ ط§ظ„ظ…ط¬ظ…ظˆط¹ط§طھ ط°ط§طھ ط§ظ„ظ…ظˆط§ط¶ظٹط¹ (Topics/Forum) ط§ط³طھظ‚ط¨ظ„ ط§ظ„ط¨ظˆطھ ط±ط³ط§ط¦ظ„ ط§ظ„ظ…ظˆط§ط¶ظٹط¹ طھظ„ظ‚ط§ط¦ظٹظ‹ط§ط› ط§ط±ط¨ط· topic ظ…ط­ط¯ط¯ ظ…ظ† طµظپط­ط© ط§ظ„طھظƒط§ظ…ظ„ ط¹ظ†ط¯ ط§ظ„ط­ط§ط¬ط©.</p>
            <p>â€¢ ظ„ط§ طھط´ط§ط±ظƒ ظ…ظپطھط§ط­ ط§ظ„ط¨ظˆطھ ط£ظˆ ط³ط± ط§ظ„ظˆظٹط¨ظ‡ظˆظƒ ظ…ط¹ ط£ظٹ ط´ط®طµ. ظ„ط§ طھظڈط¹ط±ط¶ ظ‡ط°ظ‡ ط§ظ„ظ‚ظٹظ… ظپظٹ ظ‡ط°ظ‡ ط§ظ„طµظپط­ط© ظ…ط·ظ„ظ‚ظ‹ط§.</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
