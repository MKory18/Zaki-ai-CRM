'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Palette, Loader2, Check, PanelTop, ShoppingBag, CreditCard,
  PanelBottom, LayoutTemplate, ExternalLink, Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { apiJson } from '@/lib/api-client';
import { FONTS, MOODS, isValidHex } from '@/lib/landing-theme';
import {
  CHECKOUT_FIELDS, DEFAULT_STORE_THEME, MANDATORY_CHECKOUT_FIELDS,
  checkoutOrder, type CheckoutField, type StoreTheme,
} from '@/lib/store-theme';

/**
 * THE STORE'S TEMPLATE — one screen, six tabs.
 *
 * Everything about how the shop LOOKS lives here, and nothing about how the
 * system runs. Two things are deliberately absent:
 *
 *  - The LOGO and the FAVICON. They are the store's identity, not its
 *    template: the waybill prints the logo and the picker shows it, so they
 *    belong to the store itself. This screen shows what is set and links to
 *    the one editor. A copy of the control here would be the same field in
 *    two places.
 *  - The CART BAR tab, on a Single Product store. Not greyed out — absent.
 *    There is no cart, so there is no setting, and a disabled tab would be
 *    telling the seller about something that does not exist in their shop.
 *
 * No colour is written into a component. The eight named colours are CSS
 * custom properties (storeThemeVars); one left unset is derived from the
 * accent, so a seller who picks one colour gets a whole shop.
 */

const SWATCHES = [
  '#b8256e', '#e11d48', '#ea580c', '#f59e0b',
  '#16a34a', '#0d9488', '#2563eb', '#4f46e5',
  '#7c3aed', '#0f172a', '#8b5a2b', '#be123c',
];

type TabKey = 'general' | 'chrome' | 'product' | 'checkout' | 'cart' | 'home';

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'general', label: 'عام', icon: Palette },
  { key: 'chrome', label: 'الترويسة والتذييل', icon: PanelTop },
  { key: 'product', label: 'إعدادات المنتج', icon: ShoppingBag },
  { key: 'checkout', label: 'الدفع', icon: CreditCard },
  { key: 'cart', label: 'شريط السلة السفلي', icon: PanelBottom },
  { key: 'home', label: 'الصفحة الرئيسية', icon: LayoutTemplate },
];

const COLOR_FIELDS: { key: keyof NonNullable<StoreTheme['colors']>; label: string; hint: string }[] = [
  { key: 'primary', label: 'أساسي', hint: 'لون الفعل: الأزرار والروابط' },
  { key: 'secondary', label: 'ثانوي', hint: 'العناوين والنص الغامق' },
  { key: 'primaryLight', label: 'أساسي فاتح', hint: 'خلفية الشارات والصفوف المختارة' },
  { key: 'secondaryLight', label: 'ثانوي فاتح', hint: 'النص الخافت والشروح' },
  { key: 'background', label: 'خلفية', hint: 'ورق الصفحة' },
  { key: 'success', label: 'نجاح', hint: 'محصَّل · تم' },
  { key: 'warning', label: 'تحذير', hint: 'يحتاج انتباه' },
  { key: 'danger', label: 'خطر', hint: 'متأخر · خسارة' },
];

const CHECKOUT_LABEL: Record<CheckoutField, string> = {
  name: 'الاسم',
  phone: 'الهاتف',
  altPhone: 'هاتف بديل',
  region: 'المحافظة',
  address: 'العنوان',
  note: 'ملاحظة',
};

interface StoreInfo {
  id: string;
  name: string;
  type: string;
  logo: string | null;
  favicon: string | null;
  cartBarApplies: boolean;
}

const LABEL = 'mb-1.5 block text-xs font-medium text-[#121926]';
const HINT = 'mt-1 block text-[10.5px] leading-relaxed text-[#9aa4b2]';
const CARD = 'rounded-xl border border-[#e3e8ef] bg-white p-4';

export function StoreThemeScreen() {
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [theme, setTheme] = useState<StoreTheme>(DEFAULT_STORE_THEME);
  const [saved, setSaved] = useState<StoreTheme>(DEFAULT_STORE_THEME);
  const [tab, setTab] = useState<TabKey>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ store: StoreInfo; theme: StoreTheme }>('/api/store/theme');
      setStore(data.store);
      setTheme(data.theme);
      setSaved(data.theme);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر تحميل القالب' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // The cart-bar tab is not rendered at all for a shop with no cart.
  const tabs = useMemo(
    () => TABS.filter((t) => t.key !== 'cart' || store?.cartBarApplies !== false),
    [store?.cartBarApplies]
  );

  // A tab that disappears under the seller (switching to a Single Product
  // store while standing on it) must not leave a blank panel.
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab('general');
  }, [tabs, tab]);

  const dirty = useMemo(() => JSON.stringify(theme) !== JSON.stringify(saved), [theme, saved]);

  const set = <K extends keyof StoreTheme>(key: K, value: StoreTheme[K]) =>
    setTheme((t) => ({ ...t, [key]: value }));

  const setPart = <K extends 'colors' | 'fonts' | 'header' | 'footer' | 'product' | 'checkout' | 'cartBar' | 'home'>(
    key: K,
    patch: Partial<NonNullable<StoreTheme[K]>>
  ) => setTheme((t) => ({ ...t, [key]: { ...(t[key] as object), ...patch } } as StoreTheme));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiJson<{ theme: StoreTheme }>('/api/store/theme', {
        method: 'PATCH',
        body: JSON.stringify(theme),
      });
      setTheme(res.theme);
      setSaved(res.theme);
      setMsg({ ok: true, text: 'تم الحفظ' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحفظ' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[#697586]">
        <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-[#121926]">
            <Palette className="h-5 w-5 text-[#b8256e]" />
            قالب المتجر
          </h1>
          <p className="mt-0.5 text-xs text-[#697586]">
            شكل «{store?.name}» ومحتواه. إعدادات تشغيل النظام مكانها «الإعدادات».
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && (
            <span className={`text-xs ${msg.ok ? 'text-[#00a651]' : 'text-[#fb323f]'}`}>
              {msg.ok && <Check className="mb-0.5 ml-1 inline h-3.5 w-3.5" />}
              {msg.text}
            </span>
          )}
          <Button variant="secondary" size="sm" disabled={!dirty || saving} onClick={() => setTheme(saved)}>
            تراجع
          </Button>
          <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} حفظ
          </Button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-[#e3e8ef]">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
              tab === key
                ? 'border-[#b8256e] text-[#b8256e]'
                : 'border-transparent text-[#697586] hover:text-[#364152]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {/* ── أ. عام: الخطوط والألوان ── */}
      {tab === 'general' && (
        <div className="space-y-4">
          <div className={CARD}>
            <p className="mb-3 text-sm font-bold text-[#121926]">الهوية</p>
            {/* A LINK, never a second copy of the control. */}
            <a
              href="/settings/geo"
              className="flex items-center justify-between gap-3 rounded-lg border border-[#e3e8ef] bg-[#f8fafc] px-3 py-2.5 text-xs text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e]"
            >
              <span className="flex items-center gap-2">
                {store?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={store.logo} alt="" className="h-7 w-7 rounded object-contain" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
                الشعار والأيقونة المفضّلة ورقم الدعم
                {!store?.logo && <span className="text-[#9aa4b2]">— لم يُضبط بعد</span>}
              </span>
              <span className="flex items-center gap-1 font-semibold">
                في «البلدان والمتاجر» <ExternalLink className="h-3 w-3" />
              </span>
            </a>
            <p className={HINT}>
              تُكتب مرة واحدة مع المتجر نفسه، لأنّ البوليصة تطبع الشعار واختيار المتجر يعرضه. لا تُكرَّر هنا.
            </p>
          </div>

          <div className={CARD}>
            <p className="mb-3 text-sm font-bold text-[#121926]">الخطوط</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className={LABEL}>خط النص</span>
                <Select value={theme.font} onChange={(e) => set('font', e.target.value as StoreTheme['font'])}>
                  {FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </Select>
                <span className={HINT} style={{ fontFamily: FONTS.find((f) => f.key === theme.font)?.stack }}>
                  نموذج: الدفع عند الاستلام وتوصيل لكل المناطق
                </span>
              </label>
              <label className="block">
                <span className={LABEL}>خط العناوين</span>
                <Select
                  value={theme.fonts?.heading ?? ''}
                  onChange={(e) => setPart('fonts', { heading: e.target.value || undefined })}
                >
                  <option value="">مثل خط النص</option>
                  {FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </Select>
                <span
                  className={HINT}
                  style={{ fontFamily: FONTS.find((f) => f.key === (theme.fonts?.heading ?? theme.font))?.stack }}
                >
                  نموذج: عرض خاص لفترة محدودة
                </span>
              </label>
              <label className="block">
                <span className={LABEL}>خط القوائم</span>
                <Select
                  value={theme.fonts?.menu ?? ''}
                  onChange={(e) => setPart('fonts', { menu: e.target.value || undefined })}
                >
                  <option value="">مثل خط النص</option>
                  {FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </Select>
                <span
                  className={HINT}
                  style={{ fontFamily: FONTS.find((f) => f.key === (theme.fonts?.menu ?? theme.font))?.stack }}
                >
                  نموذج: من نحن · الشروط · تواصل معنا
                </span>
              </label>
            </div>
          </div>

          <div className={CARD}>
            <p className="mb-1 text-sm font-bold text-[#121926]">الألوان</p>
            <p className="mb-3 text-[10.5px] text-[#9aa4b2]">
              كل لون لا تحدّده يُشتق من اللون الأساسي، فلا يخرج لك متجر بثمانية ألوان لا تتفق.
            </p>
            <div className="mb-3 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
              {SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => set('accent', hex)}
                  title={hex}
                  style={{ background: hex }}
                  className={`h-7 rounded-md border-2 transition ${
                    theme.accent.toLowerCase() === hex ? 'scale-105 border-[#121926]' : 'border-transparent'
                  }`}
                />
              ))}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                type="color"
                aria-label="اللون الأساسي"
                value={isValidHex(theme.accent) ? theme.accent : DEFAULT_STORE_THEME.accent}
                onChange={(e) => set('accent', e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-[#e3e8ef]"
              />
              <Select
                className="text-xs"
                value={theme.mood}
                onChange={(e) => set('mood', e.target.value as StoreTheme['mood'])}
              >
                {MOODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </Select>
              <Select
                className="text-xs"
                value={theme.corners}
                onChange={(e) => set('corners', e.target.value as StoreTheme['corners'])}
              >
                <option value="soft">زوايا ناعمة</option>
                <option value="sharp">زوايا حادّة</option>
              </Select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {COLOR_FIELDS.map(({ key, label, hint }) => {
                const value = theme.colors?.[key];
                return (
                  <div key={key} className="rounded-lg border border-[#e3e8ef] p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={label}
                        value={value && isValidHex(value) ? value : '#ffffff'}
                        onChange={(e) => setPart('colors', { [key]: e.target.value })}
                        className="h-7 w-9 cursor-pointer rounded border border-[#e3e8ef]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-[#364152]">{label}</p>
                        <p className="truncate text-[10px] text-[#9aa4b2]">{hint}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!value}
                      onClick={() => setPart('colors', { [key]: undefined })}
                      className="mt-1 text-[10px] text-[#9aa4b2] underline disabled:opacity-40"
                    >
                      {value ? 'أعده للمُشتقّ' : 'مُشتقّ من الأساسي'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ب. الترويسة والتذييل ── */}
      {tab === 'chrome' && (
        <div className="space-y-4">
          <div className={CARD}>
            <p className="mb-3 text-sm font-bold text-[#121926]">الترويسة</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className={LABEL}>الارتفاع (بكسل)</span>
                <Input
                  type="number"
                  min={48}
                  max={160}
                  value={theme.header?.height ?? 72}
                  onChange={(e) => setPart('header', { height: Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className={LABEL}>لون الترويسة</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="لون الترويسة"
                    value={theme.header?.background && isValidHex(theme.header.background) ? theme.header.background : '#ffffff'}
                    onChange={(e) => setPart('header', { background: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-[#e3e8ef]"
                  />
                  <button
                    type="button"
                    disabled={!theme.header?.background}
                    onClick={() => setPart('header', { background: undefined })}
                    className="text-[10px] text-[#9aa4b2] underline disabled:opacity-40"
                  >
                    مُشتقّ
                  </button>
                </div>
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-xs text-[#364152]">
                <input
                  type="checkbox"
                  checked={theme.header?.sticky ?? true}
                  onChange={(e) => setPart('header', { sticky: e.target.checked })}
                  className="h-4 w-4 accent-[#b8256e]"
                />
                تثبيتها عند التمرير
              </label>
            </div>
            <p className={HINT}>
              الشعار المعروض في الترويسة هو شعار المتجر نفسه — يُضبط من «البلدان والمتاجر».
            </p>
          </div>

          <div className={CARD}>
            <p className="mb-3 text-sm font-bold text-[#121926]">التذييل</p>
            <div className="space-y-2">
              {(theme.footer?.links ?? []).map((link, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    className="max-w-[180px]"
                    placeholder="العنوان"
                    value={link.label}
                    maxLength={60}
                    onChange={(e) => {
                      const links = [...(theme.footer?.links ?? [])];
                      links[i] = { ...links[i], label: e.target.value };
                      setPart('footer', { links });
                    }}
                  />
                  <Input
                    className="max-w-[260px]"
                    dir="ltr"
                    placeholder="/pages/about أو https://…"
                    value={link.href}
                    maxLength={300}
                    onChange={(e) => {
                      const links = [...(theme.footer?.links ?? [])];
                      links[i] = { ...links[i], href: e.target.value };
                      setPart('footer', { links });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setPart('footer', { links: (theme.footer?.links ?? []).filter((_, j) => j !== i) })}
                    className="text-xs text-[#fb323f] hover:underline"
                  >
                    حذف
                  </button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                disabled={(theme.footer?.links?.length ?? 0) >= 12}
                onClick={() => setPart('footer', { links: [...(theme.footer?.links ?? []), { label: '', href: '/' }] })}
              >
                أضف رابطاً
              </Button>
              <p className={HINT}>
                مسار داخلي يبدأ بشرطة مائلة واحدة، أو رابط كامل بـ https. أي شيء آخر مرفوض.
              </p>
            </div>
            <label className="mt-3 block">
              <span className={LABEL}>حقوق النشر</span>
              <Input
                maxLength={160}
                placeholder="© ٢٠٢٦ جميع الحقوق محفوظة"
                value={theme.footer?.copyright ?? ''}
                onChange={(e) => setPart('footer', { copyright: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}

      {/* ── ج. إعدادات المنتج ── */}
      {tab === 'product' && (
        <div className={CARD}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>شكل عرض السعر</span>
              <Select
                value={theme.product?.priceStyle ?? 'plain'}
                onChange={(e) => setPart('product', { priceStyle: e.target.value as 'plain' | 'with_compare' })}
              >
                <option value="plain">السعر وحده</option>
                <option value="with_compare">السعر مع سعر مشطوب بجانبه</option>
              </Select>
            </label>
            <label className="block">
              <span className={LABEL}>ترتيب الصور</span>
              <Select
                value={theme.product?.imageOrder ?? 'as_uploaded'}
                onChange={(e) => setPart('product', { imageOrder: e.target.value as 'as_uploaded' | 'newest_first' })}
              >
                <option value="as_uploaded">كما رُفعت</option>
                <option value="newest_first">الأحدث أولاً</option>
              </Select>
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-[#364152]">
            <input
              type="checkbox"
              checked={theme.product?.showStock ?? false}
              onChange={(e) => setPart('product', { showStock: e.target.checked })}
              className="h-4 w-4 accent-[#b8256e]"
            />
            أظهر المخزون المتبقي
          </label>
          <p className={HINT}>رقم منخفض قد يُقنع بالشراء وقد يُخيف — لذلك هو اختيار، ومطفأ افتراضياً.</p>
          <label className="mt-3 flex items-center gap-2 text-xs text-[#364152]">
            <input
              type="checkbox"
              checked={theme.product?.discountBadge ?? true}
              onChange={(e) => setPart('product', { discountBadge: e.target.checked })}
              className="h-4 w-4 accent-[#b8256e]"
            />
            أظهر شارة الخصم
          </label>
        </div>
      )}

      {/* ── د. إعدادات الدفع ── */}
      {tab === 'checkout' && (
        <div className="space-y-4">
          <div className={CARD}>
            <p className="mb-1 text-sm font-bold text-[#121926]">ترتيب الحقول وإلزامها</p>
            <p className="mb-3 text-[10.5px] text-[#9aa4b2]">
              الاسم والهاتف والمحافظة والعنوان إلزامية دائماً: بدونها لا تُسعَّر الشحنة ولا تصل.
            </p>
            <div className="space-y-1.5">
              {checkoutOrder(theme).map((field, i, arr) => {
                const mandatory = MANDATORY_CHECKOUT_FIELDS.includes(field);
                const required = mandatory || (theme.checkout?.required ?? []).includes(field);
                return (
                  <div key={field} className="flex items-center gap-2 rounded-lg border border-[#e3e8ef] px-2.5 py-1.5">
                    <span className="flex-1 text-xs font-medium text-[#364152]">{CHECKOUT_LABEL[field]}</span>
                    <label className="flex items-center gap-1.5 text-[11px] text-[#697586]">
                      <input
                        type="checkbox"
                        checked={required}
                        disabled={mandatory}
                        onChange={(e) => {
                          const set = new Set(theme.checkout?.required ?? []);
                          if (e.target.checked) set.add(field); else set.delete(field);
                          setPart('checkout', { required: [...set] });
                        }}
                        className="h-3.5 w-3.5 accent-[#b8256e] disabled:opacity-50"
                      />
                      إلزامي{mandatory && ' (دائماً)'}
                    </label>
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => {
                          const next = [...arr];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          setPart('checkout', { fieldOrder: next });
                        }}
                        className="rounded px-1.5 text-xs text-[#697586] hover:bg-[#eef2f6] disabled:opacity-30"
                        aria-label="حرّكه لأعلى"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={i === arr.length - 1}
                        onClick={() => {
                          const next = [...arr];
                          [next[i + 1], next[i]] = [next[i], next[i + 1]];
                          setPart('checkout', { fieldOrder: next });
                        }}
                        className="rounded px-1.5 text-xs text-[#697586] hover:bg-[#eef2f6] disabled:opacity-30"
                        aria-label="حرّكه لأسفل"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={CARD}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL}>نص زر التأكيد</span>
                <Input
                  maxLength={40}
                  placeholder="اطلب الآن — الدفع عند الاستلام"
                  value={theme.checkout?.submitText ?? ''}
                  onChange={(e) => setPart('checkout', { submitText: e.target.value })}
                />
              </label>
              <label className="block">
                <span className={LABEL}>لون زر التأكيد</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="لون زر التأكيد"
                    value={theme.checkout?.buttonColor && isValidHex(theme.checkout.buttonColor) ? theme.checkout.buttonColor : '#ffffff'}
                    onChange={(e) => setPart('checkout', { buttonColor: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-[#e3e8ef]"
                  />
                  <button
                    type="button"
                    disabled={!theme.checkout?.buttonColor}
                    onClick={() => setPart('checkout', { buttonColor: undefined })}
                    className="text-[10px] text-[#9aa4b2] underline disabled:opacity-40"
                  >
                    مثل اللون الأساسي
                  </button>
                </div>
              </label>
            </div>
            <label className="mt-3 block">
              <span className={LABEL}>رسالة ما بعد الطلب</span>
              <Input
                maxLength={300}
                placeholder="وصلنا طلبك — سنتصل بك خلال ساعات لتأكيده."
                value={theme.checkout?.afterOrderMessage ?? ''}
                onChange={(e) => setPart('checkout', { afterOrderMessage: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}

      {/* ── هـ. شريط السلة السفلي — لا يُعرض أصلاً لمتجر Single Product ── */}
      {tab === 'cart' && store?.cartBarApplies && (
        <div className={CARD}>
          <label className="flex items-center gap-2 text-xs text-[#364152]">
            <input
              type="checkbox"
              checked={theme.cartBar?.enabled ?? true}
              onChange={(e) => setPart('cartBar', { enabled: e.target.checked })}
              className="h-4 w-4 accent-[#b8256e]"
            />
            أظهر شريط السلة أسفل الشاشة
          </label>
          <label className="mt-3 block max-w-xs">
            <span className={LABEL}>نصّ الشريط</span>
            <Input
              maxLength={40}
              placeholder="أكمل الطلب"
              value={theme.cartBar?.label ?? ''}
              onChange={(e) => setPart('cartBar', { label: e.target.value })}
            />
          </label>
        </div>
      )}

      {/* ── و. الصفحة الرئيسية ── */}
      {tab === 'home' && (
        <div className={CARD}>
          <label className="block max-w-lg">
            <span className={LABEL}>صورة الغلاف</span>
            <Input
              dir="ltr"
              maxLength={300}
              placeholder="/api/public/media/…"
              value={theme.home?.coverImage ?? ''}
              onChange={(e) => setPart('home', { coverImage: e.target.value })}
            />
            <span className={HINT}>
              مسار من رفعك أنت. رابط خارجي مرفوض: صورة من موقع لا نتحكم به تسرّب كل زائر إليه.
            </span>
          </label>
          <p className="mt-4 text-[11px] leading-relaxed text-[#697586]">
            ترتيب أقسام الرئيسية يُسحب ويُرتَّب في «التصميم» — نفس بانية الأقسام المستعملة في صفحات الهبوط،
            لا بانية ثانية.
          </p>
        </div>
      )}
    </div>
  );
}
