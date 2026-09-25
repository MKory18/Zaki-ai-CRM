'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Store as StoreIcon, Loader2, ExternalLink, Check, Palette } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { apiJson } from '@/lib/api-client';
import { STORE_TYPE_LABEL } from '@/lib/store-types';

/**
 * Turning a store's public face on, and what it says about itself.
 *
 * NOT what it looks like. The colour, the fonts, the header, the footer,
 * the product display and the checkout are the store's template, and they
 * live in one place — «واجهة المتجر ← القوالب». This screen links there.
 *
 * The theme is not merely un-editable here: it is not SENT here either. It
 * used to ride along in this form's PATCH as a plain landing theme, so
 * saving a tagline would have written back a theme with the header, the
 * footer and the checkout settings missing from it.
 */

interface StoreRow {
  id: string;
  name: string;
  slug: string;
  type: 'SINGLE_PRODUCT' | 'MULTI_PRODUCT';
  storefrontEnabled?: boolean;
  tagline?: string | null;
  about?: string | null;
  domain?: string | null;
  landingPageId?: string | null;
}


export function StorefrontSettings({ store, onSaved }: { store: StoreRow; onSaved?: () => void }) {
  const [enabled, setEnabled] = useState(!!store.storefrontEnabled);
  const [type, setType] = useState(store.type);
  const [form, setForm] = useState({
    tagline: store.tagline ?? '',
    about: store.about ?? '',
    domain: store.domain ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reset = useCallback(() => {
    setEnabled(!!store.storefrontEnabled);
    setType(store.type);
    setForm({
      tagline: store.tagline ?? '',
      about: store.about ?? '',
      domain: store.domain ?? '',
    });
  }, [store]);

  useEffect(() => { reset(); }, [reset]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await apiJson(`/api/geo/stores/${store.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          storefrontEnabled: enabled,
          type,
          tagline: form.tagline.trim() || null,
          about: form.about.trim() || null,
          domain: form.domain.trim(),
        }),
      });
      setMsg({ ok: true, text: 'تم الحفظ' });
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذر الحفظ' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-[#e3e8ef] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-[#121926]">
            <StoreIcon className="h-4 w-4 text-[#b8256e]" />
            واجهة متجر {store.name}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#697586]">
            يعرض منتجات هذا المتجر ويستقبل الطلبات بنفس مسار صفحات الهبوط —
            نفس العروض، نفس نموذج الطلب، نفس التحقق.
          </p>
        </div>

        {enabled && (
          <a
            href={`/s/${store.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-[#b8256e] hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> افتح المتجر
          </a>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#364152]">
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer accent-[#b8256e]"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        المتجر مفتوح للزوار
      </label>

      {!enabled && (
        <p className="rounded-lg bg-[#f8fafc] p-2.5 text-[10.5px] leading-relaxed text-[#697586]">
          مغلق الآن: الرابط يقرأ كأنه غير موجود، ولا يقبل طلبات. متجر غير مفتوح
          لا يجوز أن يكون قابلاً للتصفّح.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="نوع المتجر" value={type} onChange={(e) => setType(e.target.value as StoreRow['type'])}>
          <option value="MULTI_PRODUCT">متعدد المنتجات — صفحة رئيسية بالمنتجات</option>
          <option value="SINGLE_PRODUCT">{STORE_TYPE_LABEL.SINGLE_PRODUCT} — واجهته صفحة هبوط تختارها</option>
        </Select>
        <Input
          label="سطر تعريفي"
          placeholder="منتجات العناية الأصلية"
          value={form.tagline}
          onChange={(e) => setForm({ ...form, tagline: e.target.value })}
        />
        <Input
          label="نطاق خاص (اختياري)"
          dir="ltr"
          placeholder="shop.example.com"
          value={form.domain}
          onChange={(e) => setForm({ ...form, domain: e.target.value })}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[#121926]">نبذة عن المتجر</label>
        <textarea
          rows={2}
          value={form.about}
          onChange={(e) => setForm({ ...form, about: e.target.value })}
          placeholder="نوصّل لكل المحافظات، والدفع عند الاستلام."
          className="w-full min-w-0 resize-y rounded-[8px] border border-[#e3e8ef] px-3 py-2 text-sm outline-none focus:border-[#b8256e]"
        />
      </div>

      {/* A Single Product store with a front page LOOKS like that page: its
          colour, font and words come from the page editor. Said here, where
          the seller would otherwise change a colour and see nothing move.
          The logo and the support phone still count — waybills print them. */}
      {store.type === 'SINGLE_PRODUCT' && store.landingPageId && (
        <p className="rounded-lg bg-[#f1f5f9] px-3 py-2 text-[11px] leading-relaxed text-[#475467]">
          واجهة هذا المتجر صفحة هبوط — ألوانها وخطها ونصوصها تُعدَّل من{' '}
          <a href="/growth/single-product-stores" className="font-semibold text-[#b8256e] hover:underline">
            متجر Single Product ← صمّم الواجهة
          </a>
          . اللون والنصوص هنا لا تظهر عليها؛ الشعار ورقم الدعم يُطبعان على البوالص.
        </p>
      )}

      {/* THE LOOK MOVED, AND IT MOVED WHOLE.
          The colour, the mood, the font and the corners are the store's
          template, and a template has one editor — «واجهة المتجر ← القوالب»,
          where the header, the footer, the product display and the checkout
          are set beside them. Four controls left here would have been four
          fields in two places, which is how a shop ends up with two answers
          to what colour it is. */}
      <a
        href="/store/themes"
        className="flex items-center justify-between gap-2 rounded-lg border border-[#e3e8ef] bg-[#f8fafc] px-3 py-2.5 text-xs text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e]"
      >
        <span className="flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5" />
          الألوان والخطوط والترويسة والتذييل وشكل الدفع
        </span>
        <span className="font-semibold">في «واجهة المتجر ← القوالب» ←</span>
      </a>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {msg && (
          <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
            {msg.ok && <Check className="mb-0.5 mr-1 inline h-3.5 w-3.5" />}
            {msg.text}
          </span>
        )}
        <Button variant="outline" size="sm" onClick={reset} disabled={saving}>تراجع</Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} احفظ
        </Button>
      </div>
    </div>
  );
}
