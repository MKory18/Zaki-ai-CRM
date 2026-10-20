'use client';

import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useConfirm } from '@/components/ui/Confirm';
import { apiJson } from '@/lib/api-client';
import type { DomainCheck } from '@/lib/domain-verify';
import { publicAddress } from '@/lib/public-address';
import { RiCheckboxBlankCircleLine, RiCheckLine, RiDeleteBinLine, RiFileCopyLine, RiLoader4Line, RiRefreshLine, RiShieldCheckLine, RiShieldFlashLine, RiShieldKeyholeLine } from '@remixicon/react';
import { PanelHeader } from '@/components/store-admin/PanelHeader';
import { arDateTime } from '@/lib/format';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';

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
 * this system. It used to be a second TAB — a tab whose whole content was
 * «not available» and a button back to the first one. It is one line behind
 * this panel's ⓘ now: the fact is unchanged, and the seller arriving to
 * connect a domain is no longer asked to choose between two tabs first.
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
  slug: string;
  publicPath: string;
}

const CARD = 'rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-[var(--sys-muted-foreground)]">{label}</p>
      <div className="flex items-center gap-1">
        <code
          dir="ltr"
          className="min-w-0 flex-1 truncate rounded-md border border-[var(--sys-border)] bg-[var(--sys-surface)] px-2 py-1.5 text-xs text-[var(--sys-heading)]"
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
          className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 shrink-0 rounded-md border border-[var(--sys-border)] p-1.5 text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
          aria-label={`انسخ ${label}`}
        >
          {copied ? <RiCheckLine className="h-4 w-4 text-[var(--sys-success)]" /> : <RiFileCopyLine className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function StoreDomainScreen() {
  const confirm = useConfirm();
  const [data, setData] = useState<Payload | null>(null);
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

  useLiveRefresh(load);

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
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--sys-muted-foreground)]">
        <RiLoader4Line className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const last = data.lastCheck;
  const verified = !!data.verifiedAt;
  const address = publicAddress(typeof window === 'undefined' ? '' : window.location.origin, {
    kind: 'store', slug: data.slug, domain: data.domain, domainVerifiedAt: data.verifiedAt,
  });

  return (
    <div className="space-y-4 pt-4" dir="rtl">
      {/* `line` is a STRING rendered as text, so an HTML tag written into it
          is printed to the seller verbatim — this screen's first line once
          read «عنوانه الداخلي <code dir="ltr">/s/…</code>». The address
          belongs in the address card below, where it can be copied. */}
      <PanelHeader
        title="الدومين"
        line={`عنوان المتجر الذي يراه الزبون. عنوانه الداخلي ${data.publicPath} يبقى يعمل دائماً.`}
        note={
          msg && (
            <span className={`text-xs ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>
              {msg.ok && <RiCheckLine className="mb-0.5 ml-1 inline h-4 w-4" />}
              {msg.text}
            </span>
          )
        }
        primary={
          <Button size="sm" disabled={busy || draft.trim() === (data.domain ?? '')} onClick={() => void bind()}>
            {busy && <RiLoader4Line className="h-4 w-4 animate-spin" />} اربط النطاق
          </Button>
        }
        help={
          <>
            <p>
              الشراء من هنا غير متاح: يحتاج حساباً ومفتاحاً عند مُسجِّل نطاقات، وهذا ما لم يُربط
              بالنظام بعد. اشترِ النطاق من أي مُسجِّل، ثم اربطه هنا — الخطوات واحدة أيًّا كان.
            </p>
            <p>
              النطاق لا يصبح عنوان متجرك حتى يَنجح فحص DNS حقيقي. قبل ذلك يُعرض العنوان الداخلي،
              لأنّ رابطاً قد لا يُفتح أسوأُ من لا رابط.
            </p>
            <p>
              السجلّات تُضاف في لوحة إدارة النطاق عند مُسجِّلك — أيّ سجلِّ توجيهٍ يقبله لهذا النطاق —
              وانتشارها قد يستغرق من دقائق إلى ساعات. لا نعرض تعليمات مُسجِّلٍ بعينه: القيم واحدة،
              ومكان إدخالها يختلف من لوحة إلى أخرى.
            </p>
          </>
        }
      />

      <>
          <div className={CARD}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--sys-heading)]">النطاق</span>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-[320px]"
                  dir="ltr"
                  placeholder="shop.example.com"
                  maxLength={253}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                {data.domain && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void clear()}
                    className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded-lg p-1.5 text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]/10 disabled:opacity-40"
                    aria-label="افصل النطاق" title="افصل النطاق"
                  >
                    <RiDeleteBinLine className="h-4 w-4" />
                  </button>
                )}
              </div>
            </label>
            {!data.storefrontEnabled && (
              <p className="mt-2 text-xs text-[var(--sys-warning)]">
                واجهة هذا المتجر مطفأة — النطاق لن يعرض شيئاً حتى تُشغّلها من «البلدان والمتاجر».
              </p>
            )}
          </div>

          {/* ── THE ONE LINE THE SELLER CAME FOR ──
              This screen used to end without ever saying what the shop's
              address now IS. The seller connected a domain, watched it turn
              «متحقَّق», and still had to guess whether to advertise the
              domain or the internal path.
              The answer is the same rule the storefront card and the landing
              page screens use (src/lib/public-address.ts): the domain is the
              address only once a real lookup has passed. Before that the
              internal address is shown, and the reason is said out loud —
              a link that may not open is worse than no link. */}
          <div className={CARD}>
            <p className="text-sm font-bold text-[var(--sys-heading)]">عنوان متجرك الآن</p>
            <div className="mt-2">
              <CopyField label={address.source === 'DOMAIN' ? 'نطاقك' : 'العنوان الداخلي'} value={address.url} />
            </div>
            {address.pending && (
              <p className="mt-2 text-xs leading-relaxed text-[var(--sys-warning)]">{address.pending.reason}</p>
            )}
            {address.source === 'DOMAIN' && (
              <p className="mt-2 text-xs text-[var(--sys-muted-foreground)]" dir="ltr">
                {data.publicPath}
                <span dir="rtl"> — العنوان الداخلي يبقى يعمل أيضاً</span>
              </p>
            )}
          </div>

          {data.domain && (
            <>
              <div className={CARD}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-[var(--sys-heading)]">حالة التحقّق</p>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => void check()}>
                    {busy ? <RiLoader4Line className="h-4 w-4 animate-spin" /> : <RiRefreshLine className="h-4 w-4" />}
                    تحقّق الآن
                  </Button>
                </div>

                {!last ? (
                  <p className="text-xs text-[var(--sys-muted-foreground)]">لم يُجرَ فحص بعد. أضف السجلّين أدناه ثم اضغط «تحقّق الآن».</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          verified
                            ? 'bg-[var(--sys-success)]/10 text-[var(--sys-success)]'
                            : last.status === 'FAILED'
                              ? 'bg-[var(--sys-destructive)]/10 text-[var(--sys-destructive)]'
                              : 'bg-[var(--sys-warning)]/15 text-[var(--sys-warning)]'
                        }`}
                      >
                        {verified ? 'متحقَّق' : last.status === 'FAILED' ? 'فشل' : 'بانتظار'}
                      </span>
                      <span className="text-xs text-[var(--sys-muted-foreground)]">
                        آخر فحص: {arDateTime(last.checkedAt)}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-[var(--sys-foreground)]">{last.detail}</p>
                    <ul className="space-y-1 text-xs">
                      <li className={`flex items-center gap-1.5 ${last.ownership ? 'text-[var(--sys-success)]' : 'text-[var(--sys-muted-foreground)]'}`}>
                        {last.ownership ? (
                          <RiCheckLine className="h-4 w-4 shrink-0" aria-hidden />
                        ) : (
                          <RiCheckboxBlankCircleLine className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        ملكية النطاق (سجل TXT)
                      </li>
                      <li className={`flex items-center gap-1.5 ${last.routing ? 'text-[var(--sys-success)]' : 'text-[var(--sys-muted-foreground)]'}`}>
                        {last.routing ? (
                          <RiCheckLine className="h-4 w-4 shrink-0" aria-hidden />
                        ) : (
                          <RiCheckboxBlankCircleLine className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        توجيه النطاق إلينا (سجل {data.target?.kind ?? 'A/CNAME'})
                      </li>
                      <li className="flex items-center gap-1.5 text-[var(--sys-muted-foreground)]">
                        {last.ssl === 'VALID' ? (
                          <RiShieldCheckLine className="h-4 w-4 text-[var(--sys-success)]" />
                        ) : last.ssl === 'INVALID' ? (
                          <RiShieldFlashLine className="h-4 w-4 text-[var(--sys-destructive)]" />
                        ) : (
                          <RiShieldKeyholeLine className="h-4 w-4 text-[var(--sys-muted)]" />
                        )}
                        شهادة SSL:{' '}
                        {last.ssl === 'VALID' ? 'صالحة' : last.ssl === 'INVALID' ? 'غير صالحة' : 'غير معروفة'}
                        {last.sslDetail && <span className="text-[var(--sys-muted)]"> — {last.sslDetail}</span>}
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              <div className={CARD}>
                <p className="text-sm font-bold text-[var(--sys-heading)]">السجلّات المطلوبة</p>
                <p className="mb-3 mt-1 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
                  أضف سجل TXT <strong>وواحداً</strong> من سجلّي التوجيه، ثم اضغط «تحقّق الآن».
                </p>
                {data.records.length === 0 || !data.target ? (
                  <p className="rounded-lg border border-[var(--sys-warning)]/40 bg-[var(--sys-warning)]/10 p-3 text-xs leading-relaxed text-[var(--sys-warning)]">
                    لم يُضبط عنوان التطبيق على الخادم (<code dir="ltr">APP_DOMAIN</code> أو{' '}
                    <code dir="ltr">APP_PUBLIC_IP</code>)، فلا قيمةَ توجيهٍ نعطيكها — ولن نخترع واحدة.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.records.map((record, i) => (
                      <div key={i} className="rounded-lg border border-[var(--sys-border)] p-2.5">
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
                          <p className="mt-1.5 text-xs text-[var(--sys-muted)]">{record.note}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
      </>
    </div>
  );
}
