'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Store, ExternalLink, Link2, Check, Loader2, AlertTriangle, Globe, Settings2, Paintbrush, Plus, Info,
} from 'lucide-react';
import { useConfirm } from '@/components/ui/Confirm';
import { STORE_TYPE_LABEL } from '@/lib/store-types';

/**
 * متجر SINGLE PRODUCT — A STORE WHOSE FRONT IS ONE OF ITS LANDING PAGES.
 *
 * The store is the address (its link, its domain); the page is the shop —
 * every block, template, pixel and upsell the landing page builder has.
 * No cart, no catalogue. So this screen does three things: picks the page,
 * opens or closes the store, and says what still stops it selling.
 *
 * The page picker is on every card, open, because it IS the feature: a
 * seller who has to find it behind a button reads the screen as having no
 * way to design the store.
 *
 * Stores that sell many products keep their switch in their own panel
 * under «البلدان والمتاجر» — the same rule decides both.
 */

interface PageOption {
  id: string;
  name: string;
  slug: string;
  isPublished: boolean;
  domain: string | null;
  product: { name: string } | null;
}

interface Shop {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  status: string;
  live: boolean;
  tagline: string | null;
  domain: string | null;
  currency: string;
  path: string;
  current: boolean;
  frontPage: PageOption | null;
  pages: PageOption[];
  orders: number;
  revenue: number;
  refusal: string | null;
  warnings: string[];
}

export function StorefrontsScreen() {
  const [shops, setShops] = useState<Shop[] | null>(null);
  /** A failed load is not "you have no stores" — telling a seller to create one would be wrong. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/growth/storefronts');
      const json = await res.json();
      if (!res.ok) throw new Error();
      setShops(json.stores || []);
      setLoadFailed(false);
    } catch {
      setShops((cur) => cur ?? []);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function send(shop: Shop, body: Record<string, unknown>) {
    setBusy(shop.id);
    setError(null);
    try {
      const res = await fetch('/api/growth/storefronts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: shop.id, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذر الحفظ');
    } catch (e) {
      setError(`${shop.name}: ${e instanceof Error ? e.message : 'تعذر الحفظ'}`);
    } finally {
      await load();
      setBusy(null);
    }
  }

  async function toggle(shop: Shop) {
    if (shop.live) {
      const ok = await confirm({
        title: `إغلاق متجر «${shop.name}»؟`,
        body: 'الرابط سيتوقف عن العمل فوراً. أي إعلان يشير إليه سيصل إلى صفحة مغلقة.',
        confirmLabel: 'أغلقه',
        cancelLabel: 'إلغاء',
        tone: 'danger',
      });
      if (!ok) return;
    }
    await send(shop, { live: !shop.live });
  }

  async function copyLink(shop: Shop) {
    const url = shop.domain ? `https://${shop.domain}` : `${window.location.origin}${shop.path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(shop.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* the link is printed on the card either way */
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-[var(--sys-heading)]">
          <Store className="h-5 w-5 text-[var(--sys-primary)]" /> متجر {STORE_TYPE_LABEL.SINGLE_PRODUCT}
        </h1>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
          متجر يبيع منتجاً واحداً. واجهته صفحة هبوط من صفحاتك — بكل أقسامها وقوالبها وبكسلاتها وعروض ما
          بعد الطلب — على رابط المتجر ونطاقه. لا سلة ولا كتالوج.
        </p>
      </div>

      {error && <p className="rounded-lg bg-[var(--sys-destructive-soft)] px-3 py-2 text-xs font-medium text-[var(--sys-destructive)]" role="alert">{error}</p>}

      {loadFailed && (
        <p className="rounded-lg bg-[var(--sys-destructive-soft)] px-3 py-2 text-xs font-medium text-[var(--sys-destructive)]" role="alert">
          تعذّر تحميل المتاجر — أعد تحميل الصفحة.
        </p>
      )}

      {shops === null ? (
        <div className="flex h-40 items-center justify-center text-[var(--sys-muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : shops.length === 0 && !loadFailed ? (
        <div className="rounded-lg border border-dashed border-[var(--sys-border-strong)] p-8 text-center">
          <Store className="mx-auto h-8 w-8 text-[var(--sys-border-strong)]" />
          <p className="mt-2 text-sm font-semibold text-[var(--sys-foreground)]">لا متاجر {STORE_TYPE_LABEL.SINGLE_PRODUCT} في هذه الدولة</p>
          <p className="mt-1 text-xs text-[var(--sys-muted-foreground)]">
            أنشئ متجراً من «البلدان والمتاجر» واختر نوعه {STORE_TYPE_LABEL.SINGLE_PRODUCT}، ثم اختر له صفحته هنا.
          </p>
          <Link href="/settings/geo" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--sys-primary)] hover:underline">
            <Settings2 className="h-3.5 w-3.5" /> البلدان والمتاجر
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shops.map((s) => (
            <Card
              key={s.id}
              shop={s}
              busy={busy === s.id}
              copied={copied === s.id}
              onToggle={() => void toggle(s)}
              onCopy={() => void copyLink(s)}
              onPick={(id) => void send(s, { landingPageId: id })}
            />
          ))}
        </div>
      )}

      {shops && shops.length > 0 && (
        <p className="text-[10px] leading-relaxed text-[var(--sys-muted)]">
          «طلبات الواجهة» كل طلب جاء من صفحة الواجهة الحالية — من رابط المتجر أو من رابط الصفحة نفسها — ومن صفحة
          منتج المتجر. والإيراد هو المحصَّل فعلاً حيث نعرفه، نفس التعريف في شاشة الأرباح.
        </p>
      )}
    </div>
  );
}

function Card({
  shop, busy, copied, onToggle, onCopy, onPick,
}: {
  shop: Shop; busy: boolean; copied: boolean; onToggle: () => void; onCopy: () => void; onPick: (id: string | null) => void;
}) {
  const url = shop.domain ? `https://${shop.domain}` : shop.path;
  return (
    <div className={`rounded-lg border bg-[var(--sys-card)] p-3 ${shop.live ? 'border-[var(--sys-success-soft)]' : 'border-[var(--sys-border)]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          {shop.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sys-surface-strong)]">
              <Store className="h-4 w-4 text-[var(--sys-muted)]" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--sys-heading)]">{shop.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-[var(--sys-muted-foreground)]">
              <span className={`rounded px-1.5 py-0.5 font-semibold ${shop.live ? 'bg-[var(--sys-success-soft)] text-[var(--sys-success)]' : 'bg-[var(--sys-surface-strong)] text-[var(--sys-muted-foreground)]'}`}>
                {shop.live ? 'مفتوح' : 'مغلق'}
              </span>
              {shop.domain && (
                <span className="flex items-center gap-0.5 text-[var(--sys-info)]">
                  <Globe className="h-2.5 w-2.5" /> {shop.domain}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* A switch that reads as one: the label says what it IS, not what
            pressing it would do. */}
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          role="switch"
          aria-checked={shop.live}
          aria-label={shop.live ? `متجر ${shop.name} مفتوح` : `متجر ${shop.name} مغلق`}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${shop.live ? 'bg-[var(--sys-success)]' : 'bg-[var(--sys-border-strong)]'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--sys-card)] shadow transition-all ${shop.live ? 'start-0.5' : 'start-[1.375rem]'}`} />
        </button>
      </div>

      {/* ── The front page: the feature itself, always in view ── */}
      <div className="mt-3 rounded-lg bg-[var(--sys-surface)] p-2.5">
        <label className="mb-1 block text-[11px] font-semibold text-[var(--sys-foreground)]" htmlFor={`front-${shop.id}`}>
          صفحة الواجهة
        </label>
        {shop.pages.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-[var(--sys-muted-foreground)]">
            لا صفحات هبوط تبيع منتجاً في هذا المتجر بعد.{' '}
            {shop.current ? (
              <Link href="/growth/landing-pages" className="inline-flex items-center gap-0.5 font-semibold text-[var(--sys-primary)] hover:underline">
                <Plus className="h-3 w-3" /> أنشئ صفحة من قالب
              </Link>
            ) : (
              <span>بدّل إلى هذا المتجر من الأعلى لتنشئ صفحته.</span>
            )}
          </p>
        ) : (
          <select
            id={`front-${shop.id}`}
            value={shop.frontPage?.id ?? ''}
            disabled={busy}
            onChange={(e) => onPick(e.target.value || null)}
            className="h-9 w-full rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-2 text-xs text-[var(--sys-heading)]"
          >
            <option value="">— لم تُختر بعد —</option>
            {shop.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.product ? ` — ${p.product.name}` : ''}
                {p.product ? '' : ' (بلا منتج)'}
                {p.isPublished ? '' : ' (غير منشورة)'}
                {p.domain ? ' (لها نطاق خاص)' : ''}
              </option>
            ))}
          </select>
        )}
        {shop.frontPage && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {shop.current ? (
              <Link
                href={`/growth/landing-pages/${shop.frontPage.id}/editor`}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--sys-primary)] px-2.5 py-1 text-[11px] font-bold text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-primary)]/90"
              >
                <Paintbrush className="h-3 w-3" /> صمّم الواجهة
              </Link>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-[var(--sys-muted-foreground)]">
                <Info className="h-3 w-3" /> بدّل إلى هذا المتجر من الأعلى لتصمّم صفحته.
              </span>
            )}
            {!shop.frontPage.isPublished && <span className="text-[10px] font-semibold text-[var(--sys-warning)]">الصفحة غير منشورة</span>}
          </div>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-[var(--sys-surface-strong)] pt-2.5">
        <Num label="طلبات الواجهة" value={shop.orders} />
        <Num label={`إيراد ${shop.currency}`} value={shop.revenue} />
      </div>

      {shop.refusal && (
        // Open and broken is the case that matters most: an advert is
        // probably pointing at this link right now.
        shop.live ? (
          <p className="mt-2 flex items-start gap-1 rounded-lg bg-[var(--sys-destructive-soft)] p-2 text-[10px] font-semibold leading-relaxed text-[var(--sys-destructive)]" role="alert">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> المتجر مفتوح لكن رابطه لا يبيع: {shop.refusal}
          </p>
        ) : (
          <p className="mt-2 flex items-start gap-1 rounded-lg bg-[var(--sys-warning-soft)] p-2 text-[10px] leading-relaxed text-[var(--sys-warning)]">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> قبل أن يُفتح: {shop.refusal}
          </p>
        )
      )}
      {shop.warnings.length > 0 && (
        <p className="mt-1.5 text-[10px] text-[var(--sys-muted-foreground)]">يُستحسن: {shop.warnings.join('، ')}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-lg border border-[var(--sys-border)] px-2 py-1 text-[10px] font-semibold text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
        >
          <ExternalLink className="h-3 w-3" /> افتح المتجر
        </a>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 rounded-lg border border-[var(--sys-border)] px-2 py-1 text-[10px] font-semibold text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
        >
          {copied ? <Check className="h-3 w-3 text-[var(--sys-success)]" /> : <Link2 className="h-3 w-3" />}
          {copied ? 'نُسخ' : 'انسخ الرابط'}
        </button>
        {/* Name, domain, logo and support phone live in the store's own panel. */}
        <a
          href={`/settings/geo?store=${shop.id}`}
          className="flex items-center gap-1 rounded-lg border border-[var(--sys-border)] px-2 py-1 text-[10px] font-semibold text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
        >
          <Settings2 className="h-3 w-3" /> الإعدادات والنطاق
        </a>
      </div>

      <p className="mt-1.5 truncate font-mono text-[9px] text-[var(--sys-muted)]" dir="ltr" title={url}>{url}</p>
    </div>
  );
}

function Num({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[9px] text-[var(--sys-muted)]">{label}</p>
      <p className="text-xs font-bold tabular-nums text-[var(--sys-heading)]" dir="ltr">
        {value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}
