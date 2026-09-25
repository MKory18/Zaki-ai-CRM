'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2, Check, Copy, RefreshCw, ShieldCheck, ShieldAlert, ShieldQuestion, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useConfirm } from '@/components/ui/Confirm';
import { apiJson } from '@/lib/api-client';
import type { DomainCheck } from '@/lib/domain-verify';

/**
 * THE SHOP'S OWN ADDRESS.
 *
 * Two things this screen refuses to pretend about.
 *
 * VERIFICATION is a real DNS lookup, and «متحقَّق» is only ever shown when
 * the lookup passed. A badge meaning "the seller pressed a button" tells
 * them the shop is reachable while every customer gets an error.
 *
 * BUYING A DOMAIN needs a registrar's API and an account nobody has given
 * this system. The tab says so, in one line, and points at the tab that
 * works — rather than a form that takes a domain name and does nothing.
 *
 * The records are shown with a copy button and NO provider's instructions:
 * a seller on a registrar we named steps we did not check is worse off than
 * one told the four values and where to put them.
 */

interface Payload {
  domain: string | null;
  verifiedAt: string | null;
  lastCheck: DomainCheck | null;
  records: { type: string; name: string; value: string; ttl: string; note?: string }[];
  target: { kind: string; value: string } | null;
  storefrontEnabled: boolean;
  publicPath: string;
}

const CARD = 'rounded-xl border border-[#e3e8ef] bg-white p-4';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10.5px] font-medium text-[#697586]">{label}</p>
      <div className="flex items-center gap-1">
        <code
          dir="ltr"
          className="min-w-0 flex-1 truncate rounded-[6px] border border-[#e3e8ef] bg-[#f8fafc] px-2 py-1.5 text-[11px] text-[#121926]"
          title={value}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="shrink-0 rounded-[6px] border border-[#e3e8ef] p-1.5 text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e]"
          aria-label={`انسخ ${label}`}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#00a651]" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function StoreDomainScreen() {
  const confirm = useConfirm();
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<'connect' | 'buy'>('connect');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const got = await apiJson<Payload>('/api/store/domain');
      setData(got);
      setDraft(got.domain ?? '');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر التحميل' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(fn: () => Promise<Payload>, okText?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const got = await fn();
      setData(got);
      setDraft(got.domain ?? '');
      if (okText) setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر التنفيذ' });
    } finally {
      setBusy(false);
    }
  }

  const bind = () =>
    call(() => apiJson<Payload>('/api/store/domain', { method: 'PUT', body: JSON.stringify({ domain: draft.trim() }) }),
      'تم ربط النطاق — أضف السجلّين ثم اضغط «تحقّق الآن»');

  const check = () => call(() => apiJson<Payload>('/api/store/domain', { method: 'POST' }));

  async function clear() {
    const ok = await confirm({
      title: 'فصل النطاق؟',
      body: 'سيعود متجرك إلى عنوانه الداخلي فقط، وكل من يفتح النطاق لن يجد شيئاً حتى تعيد ربطه.',
      tone: 'danger',
      confirmLabel: 'افصله',
    });
    if (!ok) return;
    await call(() => apiJson<Payload>('/api/store/domain', { method: 'PUT', body: JSON.stringify({ domain: '' }) }));
  }

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[#697586]">
        <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const last = data.lastCheck;
  const verified = !!data.verifiedAt;

  return (
    <div className="space-y-4 p-4 sm:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-[#121926]">
            <Globe className="h-5 w-5 text-[#b8256e]" />
            نطاق المتجر
          </h1>
          <p className="mt-0.5 text-xs text-[#697586]">
            عنوان المتجر الذي يراه الزبون. عنوانه الداخلي <code dir="ltr">{data.publicPath}</code> يبقى يعمل دائماً.
          </p>
        </div>
        {msg && (
          <span className={`text-xs ${msg.ok ? 'text-[#00a651]' : 'text-[#fb323f]'}`}>
            {msg.ok && <Check className="mb-0.5 ml-1 inline h-3.5 w-3.5" />}
            {msg.text}
          </span>
        )}
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-[#e3e8ef]">
        {([['connect', 'ربط نطاق موجود'], ['buy', 'شراء نطاق']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition ${
              tab === key ? 'border-[#b8256e] text-[#b8256e]' : 'border-transparent text-[#697586] hover:text-[#364152]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'buy' ? (
        <div className={CARD}>
          <p className="text-sm font-bold text-[#121926]">شراء نطاق من هنا غير متاح</p>
          <p className="mt-1.5 text-xs leading-relaxed text-[#697586]">
            الشراء يحتاج حساباً ومفتاحاً عند مُسجِّل نطاقات (registrar)، وهذا ما لم يُربط بالنظام بعد.
            اشترِ النطاق من أي مُسجِّل تختاره، ثم اربطه من تبويب «ربط نطاق موجود» — الخطوات هي نفسها
            أيًّا كان المُسجِّل.
          </p>
          <p className="mt-2 text-[10.5px] text-[#9aa4b2]">
            لا نعرض لك تعليمات مُسجِّل بعينه: القيم المطلوبة واحدة، ومكان إدخالها يختلف من لوحة إلى أخرى.
          </p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => setTab('connect')}>
            اذهب إلى ربط نطاق موجود
          </Button>
        </div>
      ) : (
        <>
          <div className={CARD}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#121926]">النطاق</span>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-[320px]"
                  dir="ltr"
                  placeholder="shop.example.com"
                  maxLength={253}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button size="sm" disabled={busy || draft.trim() === (data.domain ?? '')} onClick={() => void bind()}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} اربطه
                </Button>
                {data.domain && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void clear()}
                    className="rounded-lg p-1.5 text-[#fb323f] hover:bg-[#fb323f]/10 disabled:opacity-40"
                    title="افصل النطاق"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </label>
            {!data.storefrontEnabled && (
              <p className="mt-2 text-[11px] text-[#b45309]">
                واجهة هذا المتجر مطفأة — النطاق لن يعرض شيئاً حتى تُشغّلها من «البلدان والمتاجر».
              </p>
            )}
          </div>

          {data.domain && (
            <>
              <div className={CARD}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-[#121926]">حالة التحقّق</p>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => void check()}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    تحقّق الآن
                  </Button>
                </div>

                {!last ? (
                  <p className="text-xs text-[#697586]">لم يُجرَ فحص بعد. أضف السجلّين أدناه ثم اضغط «تحقّق الآن».</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          verified
                            ? 'bg-[#00a651]/10 text-[#00a651]'
                            : last.status === 'FAILED'
                              ? 'bg-[#fb323f]/10 text-[#fb323f]'
                              : 'bg-[#f59e0b]/15 text-[#b45309]'
                        }`}
                      >
                        {verified ? 'متحقَّق' : last.status === 'FAILED' ? 'فشل' : 'بانتظار'}
                      </span>
                      <span className="text-[11px] text-[#697586]">
                        آخر فحص: {new Date(last.checkedAt).toLocaleString('ar')}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-[#364152]">{last.detail}</p>
                    <ul className="space-y-1 text-[11px]">
                      <li className={last.ownership ? 'text-[#00a651]' : 'text-[#697586]'}>
                        {last.ownership ? '✓' : '○'} ملكية النطاق (سجل TXT)
                      </li>
                      <li className={last.routing ? 'text-[#00a651]' : 'text-[#697586]'}>
                        {last.routing ? '✓' : '○'} توجيه النطاق إلينا (سجل {data.target?.kind ?? 'A/CNAME'})
                      </li>
                      <li className="flex items-center gap-1.5 text-[#697586]">
                        {last.ssl === 'VALID' ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-[#00a651]" />
                        ) : last.ssl === 'INVALID' ? (
                          <ShieldAlert className="h-3.5 w-3.5 text-[#fb323f]" />
                        ) : (
                          <ShieldQuestion className="h-3.5 w-3.5 text-[#9aa4b2]" />
                        )}
                        شهادة SSL:{' '}
                        {last.ssl === 'VALID' ? 'صالحة' : last.ssl === 'INVALID' ? 'غير صالحة' : 'غير معروفة'}
                        {last.sslDetail && <span className="text-[#9aa4b2]"> — {last.sslDetail}</span>}
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              <div className={CARD}>
                <p className="text-sm font-bold text-[#121926]">السجلّات المطلوبة</p>
                <p className="mb-3 mt-1 text-[11px] leading-relaxed text-[#697586]">
                  أضف سجل TXT، <strong>وواحداً</strong> من سجلّي التوجيه (أيّهما يقبله مُسجِّلك لهذا
                  النطاق)، في لوحة إدارة النطاق، ثم اضغط «تحقّق الآن». انتشار السجلّات قد يستغرق من
                  دقائق إلى ساعات.
                </p>
                {data.records.length === 0 || !data.target ? (
                  <p className="rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-3 text-[11px] leading-relaxed text-[#92400e]">
                    لم يُضبط عنوان التطبيق على الخادم بعد (<code dir="ltr">APP_DOMAIN</code> أو{' '}
                    <code dir="ltr">APP_PUBLIC_IP</code>)، فلا يمكن إخبارك بقيمة التوجيه المطلوبة — لن نخترع لك
                    قيمة تُخرج متجرك عن الخدمة. اضبطها على الخادم وستظهر هنا.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.records.map((record, i) => (
                      <div key={i} className="rounded-lg border border-[#e3e8ef] p-2.5">
                        <div className="grid gap-2 sm:grid-cols-4">
                          <CopyField label="النوع" value={record.type} />
                          <CopyField label="الاسم" value={record.name} />
                          <CopyField label="القيمة" value={record.value} />
                          <CopyField label="TTL" value={record.ttl} />
                        </div>
                        {/* A CNAME cannot exist at a zone apex, so the note
                            says which of the two to use for THIS hostname
                            rather than leaving the seller to find out from a
                            registrar's refusal. */}
                        {record.note && (
                          <p className="mt-1.5 text-[10.5px] text-[#9aa4b2]">{record.note}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
