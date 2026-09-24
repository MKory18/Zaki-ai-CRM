'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Store, ExternalLink, Link2, Check, Loader2, AlertTriangle, Globe, Settings2, Package,
} from 'lucide-react';
import { useConfirm } from '@/components/ui/Confirm';

/**
 * EVERY SHOP THIS USER RUNS, ON ONE SCREEN.
 *
 * The rest of the system is answered from inside one store, which is
 * correct — a clerk should not be able to read another shop's ledger. But
 * "which of my shops are live, and are they selling?" cannot be asked from
 * inside one of them, and until now the answer was to switch store, look,
 * switch back, and hold the numbers in your head.
 *
 * What bounds this instead is ACCESS: the same UserStoreAccess rows the
 * store switcher obeys. A user who may enter two shops sees two rows.
 *
 * The blockers are the reason this is more than a list. A shopfront that is
 * switched on but has no products is a link a seller will paste into an ad
 * before discovering it shows empty shelves — so the screen says so here,
 * where it can still be fixed, rather than leaving it to be found by a
 * customer.
 */

interface Shop {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  type: 'SINGLE_PRODUCT' | 'MULTI_PRODUCT';
  status: string;
  live: boolean;
  tagline: string | null;
  supportPhone: string | null;
  domain: string | null;
  currency: string;
  path: string;
  products: number;
  landingPages: number;
  orders: number;
  revenue: number;
  blockers: string[];
}

export function StorefrontsScreen() {
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/growth/storefronts');
      const json = await res.json();
      setShops(json.stores || []);
    } catch {
      setShops([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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

    setBusy(shop.id);
    setError(null);
    try {
      const res = await fetch('/api/growth/storefronts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: shop.id, live: !shop.live }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'تعذر التغيير');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التغيير');
    } finally {
      setBusy(null);
    }
  }

  async function copyLink(shop: Shop) {
    const url = shop.domain ? `https://${shop.domain}` : `${window.location.origin}${shop.path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(shop.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* the link is printed below either way */
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-[#121926]">
          <Store className="h-5 w-5 text-[#b8256e]" /> المتاجر المفردة
        </h1>
        <p className="mt-0.5 text-xs text-[#697586]">
          كل متجر وواجهته العامة — أيّها مفتوح، وأيّها يبيع فعلاً.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>
      )}

      {shops === null ? (
        <div className="flex h-40 items-center justify-center text-[#697586]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : shops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#c9d2e0] p-8 text-center">
          <Store className="mx-auto h-8 w-8 text-[#c9d2e0]" />
          <p className="mt-2 text-sm font-semibold text-[#364152]">لا متاجر في هذه الدولة</p>
          <p className="mt-1 text-xs text-[#697586]">أنشئ متجراً من الإعدادات ثم عد إلى هنا.</p>
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {shops.map((s) => (
            <Card
              key={s.id}
              shop={s}
              busy={busy === s.id}
              copied={copied === s.id}
              onToggle={() => toggle(s)}
              onCopy={() => copyLink(s)}
            />
          ))}
        </div>
      )}

      {shops && shops.length > 0 && (
        <p className="text-[10px] leading-relaxed text-[#9aa4b2]">
          الطلبات والإيراد هنا تحسب ما جاء من واجهة المتجر فقط — لا طلبات صفحات الهبوط ولا الطلبات
          اليدوية، وإلا بدت واجهةٌ مغلقة وكأنها تبيع. والإيراد هو المحصَّل فعلاً حيث نعرفه، نفس
          التعريف في شاشة الأرباح.
        </p>
      )}
    </div>
  );
}

function Card({
  shop, busy, copied, onToggle, onCopy,
}: {
  shop: Shop; busy: boolean; copied: boolean; onToggle: () => void; onCopy: () => void;
}) {
  const url = shop.domain ? `https://${shop.domain}` : shop.path;
  return (
    <div className={`rounded-xl border bg-white p-3 ${shop.live ? 'border-[#c9e8d5]' : 'border-[#e3e8ef]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          {shop.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f1f3f6]">
              <Store className="h-4 w-4 text-[#9aa4b2]" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#121926]">{shop.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-[#697586]">
              <span className={`rounded px-1.5 py-0.5 font-semibold ${
                shop.live ? 'bg-[#e6f9ee] text-[#00994d]' : 'bg-[#f1f3f6] text-[#697586]'
              }`}>
                {shop.live ? 'مفتوح' : 'مغلق'}
              </span>
              <span>{shop.type === 'SINGLE_PRODUCT' ? 'منتج واحد' : 'متعدد المنتجات'}</span>
              {shop.domain && (
                <span className="flex items-center gap-0.5 text-[#0ea5e9]">
                  <Globe className="h-2.5 w-2.5" /> نطاق خاص
                </span>
              )}
            </p>
          </div>
        </div>

        {/* A switch that reads as one: the label says what it IS, not what
            pressing it would do — a toggle labelled with its own action is
            the classic way people turn the wrong thing off. */}
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          title={shop.live ? 'أغلق المتجر' : 'افتح المتجر'}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
            shop.live ? 'bg-[#00994d]' : 'bg-[#c9d2e0]'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              shop.live ? 'start-0.5' : 'start-[1.375rem]'
            }`}
          />
        </button>
      </div>

      {shop.tagline && <p className="mt-2 truncate text-[11px] text-[#697586]">{shop.tagline}</p>}

      <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-[#f1f3f6] pt-2.5">
        <Num label="منتجات" value={shop.products} />
        <Num label="صفحات هبوط" value={shop.landingPages} />
        <Num label="طلبات الواجهة" value={shop.orders} />
        <Num label={`إيراد ${shop.currency}`} value={shop.revenue} />
      </div>

      {shop.blockers.length > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50 p-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold text-amber-800">
            <AlertTriangle className="h-3 w-3" /> قبل أن يبيع هذا المتجر
          </p>
          <ul className="mt-1 space-y-0.5 ps-4">
            {shop.blockers.map((b) => (
              <li key={b} className="list-disc text-[10px] leading-relaxed text-amber-800">{b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-lg border border-[#e3e8ef] px-2 py-1 text-[10px] font-semibold text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e]"
        >
          <ExternalLink className="h-3 w-3" /> افتح المتجر
        </a>
        <button
          onClick={onCopy}
          className="flex items-center gap-1 rounded-lg border border-[#e3e8ef] px-2 py-1 text-[10px] font-semibold text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e]"
        >
          {copied ? <Check className="h-3 w-3 text-[#00994d]" /> : <Link2 className="h-3 w-3" />}
          {copied ? 'نُسخ' : 'انسخ الرابط'}
        </button>
        {/* Settings live where they always did. A second editor for the same
            fields is a second place for them to disagree. */}
        <a
          href="/settings/geo"
          className="flex items-center gap-1 rounded-lg border border-[#e3e8ef] px-2 py-1 text-[10px] font-semibold text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e]"
        >
          <Settings2 className="h-3 w-3" /> الإعدادات
        </a>
        {shop.products > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-[#9aa4b2]">
            <Package className="h-3 w-3" /> {shop.products} منتج
          </span>
        )}
      </div>

      <p className="mt-1.5 truncate font-mono text-[9px] text-[#9aa4b2]" dir="ltr" title={url}>{url}</p>
    </div>
  );
}

function Num({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[9px] text-[#9aa4b2]">{label}</p>
      <p className="text-xs font-bold tabular-nums text-[#121926]" dir="ltr">
        {value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}
