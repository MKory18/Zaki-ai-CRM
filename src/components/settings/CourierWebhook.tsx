'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, RefreshCw, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';
import { apiJson } from '@/lib/api-client';
import { arDateTime } from '@/lib/format';
import { copyText } from '@/lib/clipboard';

/**
 * The address the courier pushes statuses to.
 *
 * Shown once, when it is minted, and never again — it is a credential, the
 * same as the password one card up. The screen afterwards knows only that a
 * URL exists, when it was made, and whether the courier has ever used it.
 *
 * That last fact is the useful one: a URL created three days ago that has
 * never been called means the courier did not actually add it, and the
 * statuses are still arriving only by polling.
 */

interface Status {
  configured: boolean;
  setAt: string | null;
  lastSeenAt: string | null;
}

export function CourierWebhook({ providerId }: { providerId: string }) {
  const ask = useConfirm();
  const [status, setStatus] = useState<Status | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await apiJson<Status>(`/api/settings/couriers/${providerId}/webhook`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [providerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mint = async () => {
    if (
      status?.configured &&
      !(await ask({
        title: 'رابط جديد؟',
        body: 'الرابط الحالي سيتوقف فوراً، وعليك إرسال الجديد لشركة الشحن.',
        confirmLabel: 'ولّد رابطاً جديداً',
      }))
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const d = await apiJson<{ url: string }>(`/api/settings/couriers/${providerId}/webhook`, { method: 'POST' });
      setUrl(d.url);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التوليد');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    const ok = await copyText(url);
    if (!ok) {
      setError('تعذر النسخ — حدّد الرابط وانسخه يدوياً.');
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!status) return null;

  return (
    <div className="space-y-2 rounded-lg border border-[#e3e8ef] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold text-[#121926]">
            <Webhook className="h-3.5 w-3.5 text-[#b8256e]" />
            رابط استقبال الحالات
          </p>
          <p className="mt-0.5 text-[11px] text-[#697586]">
            {!status.configured ? (
              <>لا رابط بعد — الحالات تصل بالاستطلاع كل دقيقتين.</>
            ) : status.lastSeenAt ? (
              <>
                يعمل · آخر استقبال {arDateTime(status.lastSeenAt)}
              </>
            ) : (
              <>
                أُنشئ {status.setAt && arDateTime(status.setAt)} — ولم تصل عليه أي حالة بعد.
              </>
            )}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={mint} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {status.configured ? 'رابط جديد' : 'أنشئ الرابط'}
        </Button>
      </div>

      {/* Shown once. Reloading this screen will not bring it back. */}
      {url && (
        <div className="space-y-1.5 rounded-lg border border-[#f2c9dd] bg-[#fdf5fa] p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#b8256e]">
            <AlertTriangle className="h-3.5 w-3.5" />
            انسخه الآن — لن يُعرَض مرة أخرى.
          </p>
          <div className="flex items-center gap-1.5">
            <code
              dir="ltr"
              className="flex-1 truncate rounded border border-[#e3e8ef] bg-white px-2 py-1.5 text-[10px] text-[#364152]"
            >
              {url}
            </code>
            <button
              type="button"
              onClick={copy}
              title="انسخ"
              className="shrink-0 cursor-pointer rounded-lg border border-[#e3e8ef] bg-white p-1.5 text-[#697586] hover:border-[#b8256e] hover:text-[#b8256e]"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[#00a344]" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-[#697586]">
            أرسله لشركة الشحن ليضيفوه عندهم. الرابط كلمة سرّ: من يملكه يستطيع إرسال
            حالات باسمهم — لا تنشره في مجموعة.
          </p>
        </div>
      )}

      {error && <p className="text-[11px] text-[#fb323f]">{error}</p>}
    </div>
  );
}
