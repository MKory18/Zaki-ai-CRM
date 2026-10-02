'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SkinGallery, type SkinCard } from '@/components/store/SkinGallery';
import { LayoutPanel } from '@/components/store/LayoutPanel';
import { ContrastNotes } from '@/components/store/ContrastNotes';
import type { SampleProduct } from '@/components/store/SkinPreview';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { apiJson } from '@/lib/api-client';
import { FONTS, MOODS, isValidHex } from '@/lib/landing-theme';
import {
  CHECKOUT_FIELDS, DEFAULT_STORE_THEME, MANDATORY_CHECKOUT_FIELDS,
  checkoutOrder, type CheckoutField, type StoreTheme,
} from '@/lib/store-theme';
import { RiArrowGoBackLine, RiBankCardLine, RiCheckLine, RiDownload2Line, RiExternalLinkLine, RiImageLine, RiLayoutBottomLine, RiLayoutGridLine, RiLayoutLine, RiLayoutTopLine, RiLoader4Line, RiPaletteLine, RiShoppingBagLine, RiTreeLine, RiUpload2Line } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { TemplateGallery } from '@/components/ui/TemplateGallery';
import { routeLabel } from '@/lib/route-registry';

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

/** What `GET /api/store/templates` answers with, for the ten. */
interface ShopTemplates {
  skins: SkinCard[];
  installed: string | null;
  sample: SampleProduct[];
  storeName: string;
}

const SWATCHES = [
  '#b8256e', '#e11d48', '#ea580c', '#f59e0b',
  '#16a34a', '#0d9488', '#2563eb', '#4f46e5',
  '#7c3aed', '#0f172a', '#8b5a2b', '#be123c',
];

type TabKey = 'gallery' | 'general' | 'layout' | 'chrome' | 'product' | 'checkout' | 'cart' | 'home';

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'gallery', label: 'معرض القوالب', icon: RiLayoutGridLine },
  { key: 'general', label: 'عام', icon: RiPaletteLine },
  { key: 'layout', label: 'الترتيب', icon: RiLayoutGridLine },
  { key: 'chrome', label: 'الترويسة والتذييل', icon: RiLayoutTopLine },
  { key: 'product', label: 'إعدادات المنتج', icon: RiShoppingBagLine },
  { key: 'checkout', label: 'الدفع', icon: RiBankCardLine },
  { key: 'cart', label: 'شريط السلة السفلي', icon: RiLayoutBottomLine },
  { key: 'home', label: 'الصفحة الرئيسية', icon: RiLayoutLine },
];

const COLOR_FIELDS: { key: keyof NonNullable<StoreTheme['colors']>; label: string; hint: string }[] = [
  // Named by the job each does. «أساسي» used to be the first of these and
  // it wrote a variable nothing read — three rows under the accent picker,
  // which is the control that actually sets the colour of the actions.
  { key: 'background', label: 'الصفحة', hint: 'ورق الصفحة' },
  { key: 'surface1', label: 'البطاقة', hint: 'سطح البطاقة فوق الصفحة' },
  { key: 'surface2', label: 'سطح ثالث', hint: 'شريط الفرز وورقة الفلاتر' },
  { key: 'textPrimary', label: 'النص', hint: 'العناوين والنص الغامق' },
  { key: 'textSecondary', label: 'نص خافت', hint: 'الشروح والملاحظات' },
  { key: 'border', label: 'الحدود', hint: 'الخطوط والفواصل' },
  { key: 'accentTint', label: 'أساسي فاتح', hint: 'خلفية الشارات والصفوف المختارة' },
  { key: 'accentContrast', label: 'نص الزر', hint: 'ما يُكتب فوق اللون الأساسي' },
  { key: 'price', label: 'السعر', hint: 'رقم السعر على البطاقة' },
  { key: 'priceCompare', label: 'قبل الخصم', hint: 'السعر المشطوب بجانبه' },
  { key: 'offerBadge', label: 'شارة العرض', hint: 'شارة نسبة الخصم على المنتج' },
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

const LABEL = 'mb-1.5 block text-xs font-medium text-[var(--sys-heading)]';
const HINT = 'mt-1 block text-xs leading-relaxed text-[var(--sys-muted-foreground)]';
const CARD = 'rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4';

export function StoreThemeScreen() {
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [theme, setTheme] = useState<StoreTheme>(DEFAULT_STORE_THEME);
  const [saved, setSaved] = useState<StoreTheme>(DEFAULT_STORE_THEME);
  const [tab, setTab] = useState<TabKey>('gallery');
  const [installing, setInstalling] = useState<string | null>(null);
  /**
   * The card being looked at. Selecting is not installing: installing
   * overwrites the shop's draft, and a gallery where a stray tap replaces
   * the design somebody spent an evening on is a gallery nobody browses.
   */
  const [picked, setPicked] = useState<string | null>(null);
  /**
   * The ten shop templates, and the shop's own products to draw them with.
   * Unlike the fifteen page shapes these are NOT a constant this bundle
   * holds: which one is installed and which products exist are both facts
   * about this shop, and only the server knows them.
   */
  const [shop, setShop] = useState<ShopTemplates | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /**
   * SAVING IS NOT PUBLISHING ANY MORE.
   *
   * `theme` is what every live storefront page paints from, and this
   * editor used to write it on every save — so a seller moving a colour
   * repainted the shop for every customer standing in it, while the home
   * page beside it had had a draft and a deliberate publish since the day
   * it was written. These three say where the shop stands.
   */
  const [unpublished, setUnpublished] = useState(false);
  const [canRevert, setCanRevert] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The fifteen templates are a constant this bundle already holds;
      // asking the server to name them was a request whose answer never
      // differs from `PAGE_TEMPLATES`. The install call still goes to the
      // server, which is where the decision about the draft belongs.
      const [data, gallery] = await Promise.all([
        apiJson<{ store: StoreInfo; theme: StoreTheme; hasUnpublished: boolean; canRevert: boolean }>(
          '/api/store/theme'
        ),
        apiJson<ShopTemplates>('/api/store/templates').catch(() => null),
      ]);
      setStore(data.store);
      setTheme(data.theme);
      setSaved(data.theme);
      setUnpublished(data.hasUnpublished);
      setCanRevert(data.canRevert);
      setShop(gallery);
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

  /**
   * Install a template. It writes the DRAFT — the seller looks at it before
   * any customer does — so this reloads rather than pretending to know what
   * the server decided.
   */
  async function install(source: 'builtin' | 'skin' | 'file', payload: string | unknown) {
    setInstalling(typeof payload === 'string' ? payload : 'file');
    setMsg(null);
    try {
      const body = source === 'file' ? { source, file: payload } : { source, key: payload };
      const res = await apiJson<{ installed: string; theme: StoreTheme; themeApplied: boolean }>(
        '/api/store/templates',
        { method: 'POST', body: JSON.stringify(body) }
      );
      await load();
      // The palette comes back as a PROPOSAL, not something already saved:
      // stores.theme is what every live page renders from, so installing
      // must not repaint the shop. It lands here as an unsaved change the
      // seller saves when they mean it — which is why the message says so.
      setTheme(res.theme);
      setMsg({
        ok: true,
        text: `ثُبِّت «${res.installed}»: الصفحة مسوّدة في «التصميم»، وألوانه معروضة هنا غير محفوظة — اضغط «حفظ» لتطبيقها على المتجر`,
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر التثبيت' });
    } finally {
      setInstalling(null);
    }
  }

  async function importFile(file: File) {
    try {
      await install('file', JSON.parse(await file.text()));
    } catch {
      setMsg({ ok: false, text: 'الملف ليس ملف قالب صالحاً' });
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiJson<{ theme: StoreTheme; hasUnpublished: boolean }>('/api/store/theme', {
        method: 'PATCH',
        body: JSON.stringify(theme),
      });
      setTheme(res.theme);
      setSaved(res.theme);
      setUnpublished(res.hasUnpublished);
      // It says what it did. «تم الحفظ» on a screen that used to repaint
      // the shop would let a seller believe the shop had changed.
      setMsg({ ok: true, text: 'حُفظت المسوّدة — لا شيء تغيّر عند الزبون حتى تنشر' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الحفظ' });
    } finally {
      setSaving(false);
    }
  }

  /** The one act a customer feels, and the only one that asks first. */
  async function publish() {
    if (!confirm('سينتقل شكل المتجر إلى هذه المسوّدة ويراه كل زبون الآن. متابعة؟')) return;
    setPublishing(true);
    setMsg(null);
    try {
      const res = await apiJson<{ theme: StoreTheme }>('/api/store/theme', { method: 'POST' });
      setTheme(res.theme);
      setSaved(res.theme);
      setUnpublished(false);
      setCanRevert(true);
      setMsg({ ok: true, text: 'نُشر — المتجر يرتدي هذا الشكل الآن' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر النشر' });
    } finally {
      setPublishing(false);
    }
  }

  /**
   * One press, no dialog: «رجوع للنسخة السابقة بضغطة». It is safe to press
   * because pressing it again returns — the thing it undoes becomes the
   * next step back.
   */
  async function revert() {
    setPublishing(true);
    setMsg(null);
    try {
      const res = await apiJson<{ theme: StoreTheme }>('/api/store/theme', { method: 'PUT' });
      setTheme(res.theme);
      setSaved(res.theme);
      setUnpublished(false);
      setMsg({ ok: true, text: 'رجع المتجر إلى الشكل السابق — اضغط مرّة أخرى للعودة' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'تعذّر الرجوع' });
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--sys-muted-foreground)]">
        <RiLoader4Line className="h-4 w-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={routeLabel('/store/themes')}
          description={`شكل «${store?.name}» ومحتواه. إعدادات تشغيل النظام مكانها «الإعدادات».`}
        />
        <div className="flex items-center gap-2">
          {msg && (
            <span className={`text-xs ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`}>
              {msg.ok && <RiCheckLine className="mb-0.5 ml-1 inline h-4 w-4" />}
              {msg.text}
            </span>
          )}
          <Button variant="secondary" size="sm" disabled={!dirty || saving} onClick={() => setTheme(saved)}>
            تراجع
          </Button>
          <Button size="sm" variant="secondary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving && <RiLoader4Line className="h-4 w-4 animate-spin" />} احفظ المسوّدة
          </Button>
          <Button size="sm" disabled={dirty || !unpublished || publishing} onClick={() => void publish()}>
            {publishing && <RiLoader4Line className="h-4 w-4 animate-spin" />} انشر
          </Button>
          {canRevert && (
            <Button size="sm" variant="secondary" disabled={publishing} onClick={() => void revert()}>
              <RiArrowGoBackLine className="h-4 w-4 icon-mirror" /> النسخة السابقة
            </Button>
          )}
        </div>
      </header>

      {/*
        WHERE THE SHOP STANDS, ABOVE EVERYTHING ELSE.
        A seller must never have to guess whether what they are looking at
        is what a customer is looking at.
      */}
      {(dirty || unpublished) && (
        <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-2.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
          {dirty
            ? 'تغييرات لم تُحفظ بعد. احفظ المسوّدة ثم انشرها ليراها الزبون.'
            : 'مسوّدة محفوظة لم تُنشر — الزبون ما زال يرى الشكل السابق.'}
        </p>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-[var(--sys-border)]">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
              tab === key
                ? 'border-[var(--sys-primary)] text-[var(--sys-primary)]'
                : 'border-transparent text-[var(--sys-muted-foreground)] hover:text-[var(--sys-foreground)]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {/* ── معرض القوالب ── */}
      {tab === 'gallery' && (
        <div className="space-y-4">
          <div className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-[var(--sys-heading)]">قالبك الحالي</p>
                <p className="mt-0.5 text-xs text-[var(--sys-muted-foreground)]">
                  احفظه كملف لتنقله إلى متجر آخر، أو ثبّت ملفاً جاهزاً.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a href="/api/store/templates?export=1" download>
                  <Button variant="secondary" size="sm">
                    <RiDownload2Line className="h-4 w-4" /> صدّر قالبي
                  </Button>
                </a>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--sys-border)] px-3 py-1.5 text-xs font-bold text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]">
                  <RiUpload2Line className="h-4 w-4" /> استورد ملفاً
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void importFile(file);
                    }}
                  />
                </label>
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--sys-muted)]">
              القالب ينقل الشكل والأقسام ونصوصها. لا ينقل الصور — كل صورة تخصّ المتجر الذي رُفعت فيه
              ولا تُعرض من متجر آخر — ولا الأسعار ولا البكسلات ولا النطاق.
            </p>
          </div>

          {/*
            THE TEN SHOP TEMPLATES, FIRST.

            They dress the whole engine — palette, type, and which
            arrangement each part draws — and the fifteen below order the
            blocks of one page. A seller looking for «how should my shop
            look» means the first; one looking for «what goes on my home
            page» means the second. Two units, one screen, in the order a
            shop is actually built.
          */}
          {shop && shop.skins.length > 0 && (
            <div className={CARD}>
              <p className="text-sm font-bold text-[var(--sys-heading)]">قوالب المتجر</p>
              <p className="mb-3 mt-0.5 text-xs text-[var(--sys-muted-foreground)]">
                كل قالب يغيّر الألوان والخط وترتيب الترويسة والبطل والبطاقة وصفحة المنتج — ولا يمسّ
                منتجاً ولا طلباً ولا سعراً ولا رابطاً.
              </p>
              <SkinGallery
                skins={shop.skins}
                installed={shop.installed}
                products={shop.sample}
                storeName={shop.storeName}
                installing={installing}
                onInstall={(key) => void install('skin', key)}
              />
            </div>
          )}

          {/*
            SHOWN, NOT DESCRIBED — and by the renderer that draws the real
            page, so the card cannot promise a shape the shop will not get.
            The same gallery the landing page's create dialog uses: one
            grid, one set of fifteen, no second place to be out of date.
          */}
          <p className="text-sm font-bold text-[var(--sys-heading)]">قوالب الصفحة الرئيسية</p>
          <TemplateGallery
            value={picked}
            onChange={setPicked}
            action={(key) => (
              <Button
                size="sm"
                variant="secondary"
                disabled={!!installing}
                onClick={() => void install('builtin', key)}
              >
                {installing === key && <RiLoader4Line className="h-4 w-4 animate-spin" />}
                ثبّته كمسوّدة
              </Button>
            )}
          />
          <p className="text-xs leading-relaxed text-[var(--sys-muted)]">
            التثبيت يكتب المسوّدة فقط: تعاينها في «التصميم» وتنشرها حين ترضى عنها. لا شيء يتغيّر عند
            الزبون قبل النشر.
          </p>
        </div>
      )}

      {/* ── أ. عام: الخطوط والألوان ── */}
      {tab === 'general' && (
        <div className="space-y-4">
          <div className={CARD}>
            <p className="mb-3 text-sm font-bold text-[var(--sys-heading)]">الهوية</p>
            {/* A LINK, never a second copy of the control. */}
            <a
              href="/settings/geo"
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] px-3 py-2.5 text-xs text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
            >
              <span className="flex items-center gap-2">
                {store?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={store.logo} alt="" className="h-7 w-7 rounded-lg object-contain" />
                ) : (
                  <RiImageLine className="h-4 w-4" />
                )}
                الشعار والأيقونة المفضّلة ورقم الدعم
                {!store?.logo && <span className="text-[var(--sys-muted)]">— لم يُضبط بعد</span>}
              </span>
              <span className="flex items-center gap-1 font-semibold">
                في «البلدان والمتاجر» <RiExternalLinkLine className="icon-mirror h-4 w-4" />
              </span>
            </a>
            <p className={HINT}>
              تُكتب مرة واحدة مع المتجر نفسه، لأنّ البوليصة تطبع الشعار واختيار المتجر يعرضه. لا تُكرَّر هنا.
            </p>
          </div>

          <div className={CARD}>
            <p className="mb-3 text-sm font-bold text-[var(--sys-heading)]">الخطوط</p>
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
            <p className="mb-1 text-sm font-bold text-[var(--sys-heading)]">الألوان</p>
            <p className="mb-3 text-xs text-[var(--sys-muted)]">
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
                  className={`h-11 md:h-7 rounded-md border-2 transition ${
                    theme.accent.toLowerCase() === hex ? 'scale-105 border-[var(--sys-heading)]' : 'border-transparent'
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
                className="h-11 md:h-8 w-10 cursor-pointer rounded-lg border border-[var(--sys-border)]"
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
                  <div key={key} className="rounded-lg border border-[var(--sys-border)] p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={label}
                        value={value && isValidHex(value) ? value : '#ffffff'}
                        onChange={(e) => setPart('colors', { [key]: e.target.value })}
                        className="h-11 md:h-7 w-9 cursor-pointer rounded-lg border border-[var(--sys-border)]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-[var(--sys-foreground)]">{label}</p>
                        <p className="truncate text-xs text-[var(--sys-muted)]">{hint}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!value}
                      onClick={() => setPart('colors', { [key]: undefined })}
                      className="mt-1 text-xs text-[var(--sys-muted)] underline disabled:opacity-40"
                    >
                      {value ? 'أعده للمُشتقّ' : 'مُشتقّ من الأساسي'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/*
              Under the grid, not beside one picker: a contrast failure is
              a fact about a PAIR, and which of the two to move is the
              seller's call. It names the pair by what a shopper reads and
              offers the nearest colour that works.
            */}
            <div className="mt-3">
              <ContrastNotes
                theme={theme}
                onFix={(field, hex) => setPart('colors', { [field]: hex })}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── الترتيب: أيّ نسخة يرسمها كل جزء من المحرّك ── */}
      {tab === 'layout' && (
        <div className={CARD}>
          <p className="text-sm font-bold text-[var(--sys-heading)]">الترتيب</p>
          <p className="mb-4 mt-0.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
            كل قالب يأتي بترتيبه، وهذه الضوابط تغيّره دون مغادرته. ولا نسخة هنا تحذف البحث أو السلة
            أو زر واتساب — هي ترتيب، لا طرح.
          </p>
          <LayoutPanel
            layout={theme.layout}
            cartApplies={store?.cartBarApplies !== false}
            onChange={(slot, variant) =>
              setTheme((t) => ({ ...t, layout: { ...(t.layout ?? {}), [slot]: variant } }))
            }
          />
        </div>
      )}

      {/* ── ب. الترويسة والتذييل ── */}
      {tab === 'chrome' && (
        <div className="space-y-4">
          <div className={CARD}>
            <p className="mb-3 text-sm font-bold text-[var(--sys-heading)]">الترويسة</p>
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
                    className="h-11 md:h-10 w-12 cursor-pointer rounded-lg border border-[var(--sys-border)]"
                  />
                  <button
                    type="button"
                    disabled={!theme.header?.background}
                    onClick={() => setPart('header', { background: undefined })}
                    className="text-xs text-[var(--sys-muted)] underline disabled:opacity-40"
                  >
                    مُشتقّ
                  </button>
                </div>
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-xs text-[var(--sys-foreground)]">
                <input
                  type="checkbox"
                  checked={theme.header?.sticky ?? true}
                  onChange={(e) => setPart('header', { sticky: e.target.checked })}
                  className="h-4 w-4 accent-[var(--sys-primary)]"
                />
                تثبيتها عند التمرير
              </label>
            </div>
            <p className={HINT}>
              الشعار المعروض في الترويسة هو شعار المتجر نفسه — يُضبط من «البلدان والمتاجر».
            </p>

            {/*
              ONLY A SINGLE PRODUCT STORE HAS THIS QUESTION.
              Every other store's pages are shop pages and always wear the
              header. A Single Product store's address renders its landing
              page, and until now it rendered it bare: no logo, no name, no
              header, no footer — everything set on this screen, invisible.
            */}
            {store?.type === 'SINGLE_PRODUCT' && (
              <div className="mt-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3">
                <label className="flex items-start gap-2 text-xs text-[var(--sys-foreground)]">
                  <input
                    type="checkbox"
                    checked={theme.header?.onFrontPage !== false}
                    onChange={(e) => setPart('header', { onFrontPage: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-[var(--sys-primary)]"
                  />
                  <span>
                    <span className="font-semibold">أظهرها فوق صفحة الواجهة</span>
                    <span className="mt-0.5 block leading-relaxed text-[var(--sys-muted-foreground)]">
                      عنوانُ هذا المتجر يعرض صفحةَ الهبوط التي اخترتَها. مع هذا الخيار تلبس الصفحةُ
                      ترويسةَ المتجر وشعارَه وقوائمَه وتذييلَه. أطفئه إن كنت تريدها إعلاناً صافياً
                      بلا طريقٍ للخروج منه — وتذييلُ الصفحة الخاصُّ بها، إن وُجد، يبقى هو الظاهر.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className={CARD}>
            <p className="mb-3 text-sm font-bold text-[var(--sys-heading)]">التذييل</p>
            {/* The links are a MENU — with an order and a visibility flag —
                and they have one editor. They lived here too for one part,
                because the contract named them in this tab and named
                «التذييل» among the five menus. */}
            <a
              href="/store/menus"
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] px-3 py-2.5 text-xs text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
            >
              <span className="flex items-center gap-1.5">
                <RiTreeLine className="h-4 w-4" />
                روابط التذييل
              </span>
              <span className="font-semibold">في «القوائم» ←</span>
            </a>
            <label className="mt-3 block">
              <span className={LABEL}>حقوق النشر</span>
              <Input
                maxLength={160}
                placeholder="© 2026 جميع الحقوق محفوظة"
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
          <label className="mt-3 flex items-center gap-2 text-xs text-[var(--sys-foreground)]">
            <input
              type="checkbox"
              checked={theme.product?.showStock ?? false}
              onChange={(e) => setPart('product', { showStock: e.target.checked })}
              className="h-4 w-4 accent-[var(--sys-primary)]"
            />
            أظهر المخزون المتبقي
          </label>
          <p className={HINT}>رقم منخفض قد يُقنع بالشراء وقد يُخيف — لذلك هو اختيار، ومطفأ افتراضياً.</p>
          <label className="mt-3 flex items-center gap-2 text-xs text-[var(--sys-foreground)]">
            <input
              type="checkbox"
              checked={theme.product?.discountBadge ?? true}
              onChange={(e) => setPart('product', { discountBadge: e.target.checked })}
              className="h-4 w-4 accent-[var(--sys-primary)]"
            />
            أظهر شارة الخصم
          </label>
        </div>
      )}

      {/* ── د. إعدادات الدفع ── */}
      {tab === 'checkout' && (
        <div className="space-y-4">
          <div className={CARD}>
            <p className="mb-1 text-sm font-bold text-[var(--sys-heading)]">ترتيب الحقول وإلزامها</p>
            <p className="mb-3 text-xs text-[var(--sys-muted)]">
              الاسم والهاتف والمحافظة والعنوان إلزامية دائماً: بدونها لا تُسعَّر الشحنة ولا تصل.
            </p>
            <div className="space-y-1.5">
              {checkoutOrder(theme).map((field, i, arr) => {
                const mandatory = MANDATORY_CHECKOUT_FIELDS.includes(field);
                const required = mandatory || (theme.checkout?.required ?? []).includes(field);
                return (
                  <div key={field} className="flex items-center gap-2 rounded-lg border border-[var(--sys-border)] px-2.5 py-1.5">
                    <span className="flex-1 text-xs font-medium text-[var(--sys-foreground)]">{CHECKOUT_LABEL[field]}</span>
                    <label className="flex items-center gap-1.5 text-xs text-[var(--sys-muted-foreground)]">
                      <input
                        type="checkbox"
                        checked={required}
                        disabled={mandatory}
                        onChange={(e) => {
                          const set = new Set(theme.checkout?.required ?? []);
                          if (e.target.checked) set.add(field); else set.delete(field);
                          setPart('checkout', { required: [...set] });
                        }}
                        className="h-3.5 w-3.5 accent-[var(--sys-primary)] disabled:opacity-50 tap-safe"
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
                        className="rounded-lg px-1.5 text-xs text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface-strong)] disabled:opacity-30"
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
                        className="rounded-lg px-1.5 text-xs text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface-strong)] disabled:opacity-30"
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
                    className="h-11 md:h-10 w-12 cursor-pointer rounded-lg border border-[var(--sys-border)]"
                  />
                  <button
                    type="button"
                    disabled={!theme.checkout?.buttonColor}
                    onClick={() => setPart('checkout', { buttonColor: undefined })}
                    className="text-xs text-[var(--sys-muted)] underline disabled:opacity-40"
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
          <label className="flex items-center gap-2 text-xs text-[var(--sys-foreground)]">
            <input
              type="checkbox"
              checked={theme.cartBar?.enabled ?? true}
              onChange={(e) => setPart('cartBar', { enabled: e.target.checked })}
              className="h-4 w-4 accent-[var(--sys-primary)]"
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
          <p className="mt-4 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
            ترتيب أقسام الرئيسية يُسحب ويُرتَّب في «التصميم» — نفس بانية الأقسام المستعملة في صفحات الهبوط،
            لا بانية ثانية.
          </p>
        </div>
      )}
    </div>
  );
}
