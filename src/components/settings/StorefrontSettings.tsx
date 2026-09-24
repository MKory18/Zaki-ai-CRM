'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Store as StoreIcon, Loader2, ExternalLink, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { apiJson } from '@/lib/api-client';
import { StoreLogoField } from './StoreLogoField';
import {
  type LandingTheme, DEFAULT_THEME, MOODS, FONTS, isValidHex,
} from '@/lib/landing-theme';
import { STORE_TYPE_LABEL } from '@/lib/store-types';

/**
 * Turning a store's public face on, and dressing it.
 *
 * The same theme controls as a landing page — one accent colour and the
 * palette derived from it — because a company selling through both should
 * not end up with two different-looking brands, and a seller who has learnt
 * one set of controls should not have to learn a second.
 */

interface StoreRow {
  id: string;
  name: string;
  slug: string;
  type: 'SINGLE_PRODUCT' | 'MULTI_PRODUCT';
  storefrontEnabled?: boolean;
  theme?: string | null;
  tagline?: string | null;
  about?: string | null;
  supportPhone?: string | null;
  domain?: string | null;
  logo?: string | null;
  landingPageId?: string | null;
}

const SWATCHES = [
  '#b8256e', '#e11d48', '#ea580c', '#f59e0b',
  '#16a34a', '#0d9488', '#2563eb', '#4f46e5',
  '#7c3aed', '#0f172a', '#8b5a2b', '#be123c',
];

function parseTheme(raw: string | null | undefined): LandingTheme {
  if (!raw) return DEFAULT_THEME;
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? { ...DEFAULT_THEME, ...p } : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function StorefrontSettings({ store, onSaved }: { store: StoreRow; onSaved?: () => void }) {
  const [enabled, setEnabled] = useState(!!store.storefrontEnabled);
  const [type, setType] = useState(store.type);
  const [theme, setTheme] = useState<LandingTheme>(parseTheme(store.theme));
  const [logo, setLogo] = useState<string | null>(store.logo ?? null);
  const [form, setForm] = useState({
    tagline: store.tagline ?? '',
    about: store.about ?? '',
    supportPhone: store.supportPhone ?? '',
    domain: store.domain ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reset = useCallback(() => {
    setEnabled(!!store.storefrontEnabled);
    setType(store.type);
    setTheme(parseTheme(store.theme));
    setForm({
      tagline: store.tagline ?? '',
      about: store.about ?? '',
      supportPhone: store.supportPhone ?? '',
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
          theme,
          tagline: form.tagline.trim() || null,
          about: form.about.trim() || null,
          supportPhone: form.supportPhone.trim() || null,
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

      {/* Saved on upload, not with the form: a file is not a field to
          remember to press save for. */}
      <StoreLogoField
        storeId={store.id}
        logo={logo}
        onChange={(next) => {
          setLogo(next);
          onSaved?.();
        }}
      />

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
          label="هاتف التواصل"
          dir="ltr"
          value={form.supportPhone}
          onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
        />
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

      {/* The same one-colour theme the landing pages use. */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[#121926]">لون المتجر</label>
        <div className="mb-2 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setTheme({ ...theme, accent: hex })}
              title={hex}
              style={{ background: hex }}
              className={`h-7 rounded-md border-2 transition ${
                theme.accent.toLowerCase() === hex ? 'scale-105 border-[#121926]' : 'border-transparent'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={isValidHex(theme.accent) ? theme.accent : DEFAULT_THEME.accent}
            onChange={(e) => setTheme({ ...theme, accent: e.target.value })}
            className="h-8 w-10 cursor-pointer rounded border border-[#e3e8ef]"
          />
          <Select
            className="text-xs"
            value={theme.mood}
            onChange={(e) => setTheme({ ...theme, mood: e.target.value as LandingTheme['mood'] })}
          >
            {MOODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </Select>
          <Select
            className="text-xs"
            value={theme.font}
            onChange={(e) => setTheme({ ...theme, font: e.target.value as LandingTheme['font'] })}
          >
            {FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </Select>
          <Select
            className="text-xs"
            value={theme.corners}
            onChange={(e) => setTheme({ ...theme, corners: e.target.value as LandingTheme['corners'] })}
          >
            <option value="soft">زوايا ناعمة</option>
            <option value="sharp">زوايا حادّة</option>
          </Select>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-[#9aa4b2]">
          كل باقي الألوان تُشتق من هذا اللون — نفس نظام صفحات الهبوط، فلا يخرج
          لك متجر بلون وصفحة هبوط بلون آخر.
        </p>
      </div>

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
