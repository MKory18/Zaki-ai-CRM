'use client';

import { TemplateGallery } from '@/components/ui/TemplateGallery';
import { StructureGallery } from '@/components/store/StructureGallery';
import { SlotFields, type SlotCopy } from '@/components/store/SlotFields';
import { TemplatePreview } from '@/components/landing/TemplatePreview';
import { LANDING_STRUCTURES } from '@/lib/landing-structures';
import { DIALECTS, DIALECT_LABEL, structureToSections, type Dialect } from '@/lib/landing-structure';
import { newSection } from '@/lib/landing-sections';
import { STORE_TEMPLATES } from '@/lib/store-templates';
import { skinToLandingTheme } from '@/lib/store-skin';
import { buildTemplate } from '@/lib/page-templates';
import type { LandingTheme } from '@/lib/landing-theme';
import React, { useEffect, useState } from 'react';
import { useConfirm, useTell } from '@/components/ui/Confirm';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { ProductPicker } from '@/components/ui/ProductPicker';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { screenApi as crmApi, qs } from '@/lib/screen-api';
import { formatDate } from '@/lib/screen-api';
import { publicAddress } from '@/lib/public-address';
import { publishQuestion } from '@/lib/landing-publish';
import { copyText } from '@/lib/clipboard';
import { useApp } from '@/context/AppContext';
import { userCan } from '@/lib/can';
import { RiAddCircleLine, RiCursorLine, RiDeleteBinLine, RiExternalLinkLine, RiEyeLine, RiEyeOffLine, RiFileCopy2Line, RiFileCopyLine, RiLoader4Line, RiPencilLine, RiStoreLine } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { routeLabel } from '@/lib/route-registry';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';

/** One shape for both starting points; the unused half is simply not sent. */
const BLANK_FORM = {
  name: '',
  slug: '',
  productId: '',
  template: 'classic',
  structure: '',
  skin: '',
  /**
   * THE DIALECT THE COPY IS WRITTEN IN.
   *
   * Formal Arabic by default, and deliberately: `copyIn` falls back to
   * whatever dialect HAS text, so one pass written in الفصحى المبسّطة
   * serves every visitor, and a Levantine-only page would read wrong in
   * Cairo and in Nouakchott. The chips below switch it for a seller who
   * wants a second pass in a dialect.
   */
  dialect: 'msa' as Dialect,
};

/** The library's own theme, which is what a page with no skin is given. */
const BARE_THEME = buildTemplate('blank').theme as LandingTheme;

export function LandingPagesScreen() {
  const tell = useTell();
  const confirm = useConfirm();
  const { currentUser } = useApp();
  // The performance screen's own gate — a link that opens onto a refusal is noise.
  const canAnalytics = userCan(currentUser, 'reports.view') || userCan(currentUser, 'analytics.view');
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** What just happened, said on the screen — not in a browser alert box. */
  const [apiError, setApiError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  /**
   * WHICH OF THE TWO STARTING POINTS IS OPEN.
   *
   * `structure` is the default, and that is a changed default: the fifteen
   * ready-made shapes used to be the only thing here. A SHAPE carries its
   * own colours, so choosing one decides the story and the look together
   * and neither can be changed without changing the other. A STRUCTURE is
   * the story alone — «بنية × مظهر» — so the same story can be worn ten
   * ways and the same look can carry ten stories.
   *
   * The fifteen are still one labelled tab away, and nothing about them
   * changed: a page created from one is created exactly as before.
   */
  const [source, setSource] = useState<'structure' | 'template'>('structure');
  /** What the seller writes into the structure's slots, per dialect. */
  const [copy, setCopy] = useState<SlotCopy>({});
  const [products, setProducts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmApi('/api/landing-pages?limit=100');
      setPages(data.landingPages || []);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    // NO LIMIT. `?limit=200` read as 200 and was capped at 100 by the route
    // (`Math.min(…, 100)` in api/products/route.ts), so this modal could
    // reach only 100 of the 114 products — and the search box below makes
    // that worse, not better: it answers «لا يوجد» about a product that
    // exists. Not `useProducts`, because the template previews below need
    // `basePrice` and `currency`, which `PickableProduct` does not carry.
    crmApi('/api/products').then((d) => setProducts(d.products || [])).catch(() => {});
  }, []);

  /** What the template previews should be selling: the product just picked. */
  const chosenProduct = React.useMemo(() => {
    const p = products.find((x: any) => x.id === form.productId);
    return p ? { name: p.name, price: Number(p.basePrice ?? 0), currency: p.currency || '' } : null;
  }, [products, form.productId]);

  /** The structure whose story the skin previews and the slots belong to. */
  const chosenStructure = React.useMemo(
    () => LANDING_STRUCTURES.find((x) => x.id === form.structure) ?? null,
    [form.structure]
  );

  /**
   * THE STRUCTURE, DRAWN — ONCE, AND WORN TEN WAYS.
   *
   * The ten skin previews below are the SAME sections with ten different
   * themes, because that is exactly what a skin is: `بنية × مظهر`. Building
   * the sections once rather than per card is not only cheaper — it is the
   * claim being made. If each card built its own, a skin could quietly
   * change the story and the grid would not show it.
   *
   * It is rebuilt when the copy changes, so the words a seller types appear
   * in every preview as they type them.
   */
  const previewSections = React.useMemo(
    () => (chosenStructure ? structureToSections(chosenStructure, copy, form.dialect, newSection) : []),
    [chosenStructure, copy, form.dialect]
  );

  /** What the server will store for each skin — the bare theme, overlaid. */
  const skinThemes = React.useMemo(
    () =>
      Object.fromEntries(
        STORE_TEMPLATES.map((t) => [t.id, { ...BARE_THEME, ...skinToLandingTheme(t) } as LandingTheme])
      ),
    []
  );

  /**
   * The link this row hands over.
   *
   * It used to be `origin + /lp/<slug>` and ignored the page's own domain
   * entirely, so a seller who had connected one was still given the internal
   * address and concluded the domain had done nothing. One rule now, shared
   * with the storefront card and the domain screen: a connected domain is the
   * address only once a real lookup has passed.
   */
  const addressOf = (lp: any) =>
    publicAddress(typeof window === 'undefined' ? '' : window.location.origin, {
      kind: 'lp', slug: lp.slug, domain: lp.domain, domainVerifiedAt: lp.domainVerifiedAt,
    });
  const publicUrl = (lp: any) => addressOf(lp).url;

  const copyUrl = async (lp: any) => {
    // Silence was the bug: over plain HTTP the clipboard API is missing and
    // the old `catch {}` made the button look dead. Now it falls back, and
    // when even that fails it says the link out loud so it can be copied by
    // hand.
    if (await copyText(publicUrl(lp))) {
      setCopiedId(lp.id);
      setTimeout(() => setCopiedId(null), 1500);
    } else {
      void tell({ title: 'انسخ الرابط يدوياً', body: 'المتصفح لم يسمح بالنسخ التلقائي.', value: publicUrl(lp) });
    }
  };


  /**
   * RiFileCopyLine the page, not its results.
   *
   * The server decides what carries over — sections, theme and product do;
   * the slug, domain, pixel, published state and the original's view and
   * order counts do not. Deciding it here too would put one rule in two
   * places, and the copy in this screen is the one that would drift.
   */
  const duplicate = async (lp: any) => {
    setBusyId(lp.id);
    try {
      setApiError(null);
      setNotice(null);
      const d = await crmApi(`/api/landing-pages/${lp.id}/duplicate`, { method: 'POST' });
      await load();
      setNotice(d?.message ?? null);
    } catch (e: any) { setApiError(e.message); } finally { setBusyId(null); }
  };

  const togglePublish = async (lp: any) => {
    /**
     * THE SAME QUESTION AS THE EDITOR'S, FROM THE SAME SENTENCE.
     *
     * This row's toggle was the quieter of the two and the likelier to be
     * pressed by accident — it sits between «أظهِرها في المتجر» and «نسخ
     * الرابط» on a list of pages, where the hand is scanning rather than
     * deciding. `unsaved` is false here: this screen holds no edits.
     */
    if (!(await confirm(publishQuestion(!lp.isPublished, publicUrl(lp))))) return;

    setBusyId(lp.id);
    try {
      await crmApi(`/api/landing-pages/${lp.id}`, { method: 'PATCH', body: JSON.stringify({ isPublished: !lp.isPublished }) });
      await load();
    } catch (e: any) {
      void tell({ title: 'تعذر تغيير حالة النشر', body: e.message, tone: 'danger' });
    } finally { setBusyId(null); }
  };

  /**
   * SHOWN IN THE SHOP, OR REACHABLE BY ITS LINK ALONE.
   *
   * Belonging to a store is not the same as being in its window: a
   * campaign page is built for one audience and one advert, and listing
   * every page a store owns would put the half-finished ones in front of
   * every shopper.
   *
   * Publishing is still the act — an unpublished page is never shown in
   * the shop whatever this says — so the two toggles mean different things
   * and both are on the row.
   */
  const toggleInStore = async (lp: any) => {
    setBusyId(lp.id);
    try {
      await crmApi(`/api/landing-pages/${lp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ showInStore: !lp.showInStore }),
      });
      await load();
    } catch (e: any) {
      void tell({ title: 'تعذر تغيير ظهورها في المتجر', body: e.message, tone: 'danger' });
    } finally { setBusyId(null); }
  };

  const createLandingPage = async () => {
    setFormError(null);
    setSaving(true);
    try {
      /**
       * ONE OF THE TWO STARTING POINTS IS SENT, NEVER BOTH.
       *
       * The route refuses slot copy that arrives without a structure, for
       * the right reason: the fifteen shapes have no slots, so there would
       * be nowhere for those words to land and the seller would open an
       * empty page believing they had written it. Sending both halves would
       * walk into that refusal.
       */
      const start =
        source === 'structure'
          ? { structure: form.structure, skin: form.skin || undefined, copy, dialect: form.dialect }
          : { template: form.template };
      const data = await crmApi('/api/landing-pages', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          slug: form.slug.toLowerCase().trim(),
          productId: form.productId || null,
          ...start,
        }),
      });
      setCreateOpen(false);
      window.location.href = `/store/landing-pages/${data.landingPage.id}`;
    } catch (e: any) { setFormError(e.message); } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await crmApi(`/api/landing-pages/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      await load();
    } catch (e: any) {
      void tell({ title: 'تعذر حذف الصفحة', body: e.message, tone: 'danger' });
    } finally { setDeleteLoading(false); }
  };

  return (
    <>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <PageHeader
          title={routeLabel('/store/landing-pages')}
          description="صفحات تسويق عامة تُنشئ طلبات حقيقية داخل CRM تلقائيًا"
          actions={
            <Button onClick={() => { setForm(BLANK_FORM); setCopy({}); setFormError(null); setCreateOpen(true); }}>
              <RiAddCircleLine className="w-4 h-4" /> صفحة جديدة
            </Button>
          }
        />
        {/* The numbers in this list are lifetime totals; a period, by
            device and by campaign, is read on the performance screen. */}
        {canAnalytics && (
          <a href="/growth/performance?tab=landing" className="-mt-3 mb-6 inline-block text-xs font-semibold text-[var(--sys-primary)] hover:underline">
            تحليلات الصفحات حسب الفترة والجهاز والحملة ←
          </a>
        )}

        {/* List */}
        <Card>
          <CardContent className="p-0">
            {notice && (
              <p className="rounded-lg border border-[var(--sys-success)]/30 bg-[var(--sys-success-soft)] px-3 py-2 text-xs text-[var(--sys-success)]">
                {notice}
              </p>
            )}
            {apiError && (
              <p className="rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] px-3 py-2 text-xs text-[var(--sys-destructive)]">
                {apiError}
              </p>
            )}

            {loading ? (
              <div className="p-4"><SkeletonRows rows={4} /></div>
            ) : pages.length === 0 ? (
              <div className="p-10 text-center text-[var(--sys-muted-foreground)] text-sm">
                لا توجد صفحات هبوط بعد. أنشئ أول صفحة لبدء استقبال الطلبات.
              </div>
            ) : (
              <div className="overflow-x-auto">
                                <Rows
                  rows={pages}
                  keyOf={(lp: any) => lp.id}
                  columns={[
                    { key: 'c0', label: "الصفحة", primary: true,
                      render: (lp: any) => (lp.name) },
                    { key: 'c1', label: "المنتج", primary: true,
                      render: (lp: any) => (lp.product?.name || '—') },
                    { key: 'c2', label: "الحالة",
                      render: (lp: any) => (
                  <><Badge variant={lp.isPublished ? 'success' : 'default'}>
                            {lp.isPublished ? 'منشورة' : 'مسودة'}
                          </Badge>
                          {/* Said where the state is read, not only where it
                              is toggled: «in the shop» is a fact about this
                              page a seller scans the column for. */}
                          {lp.showInStore && (
                            <Badge variant="info">في المتجر</Badge>
                          )}</>
                ) },
                    { key: 'c3', label: "الرابط",
                      render: (lp: any) => (
                  <>{lp.isPublished ? (
                            <a href={`/lp/${lp.slug}`} target="_blank" rel="noopener noreferrer" className="text-[var(--sys-primary)] hover:underline flex items-center gap-1">
                              /lp/{lp.slug} <RiExternalLinkLine className="icon-mirror w-4 h-4" />
                            </a>
                          ) : (
                            <span className="text-[var(--sys-muted)]">/lp/{lp.slug}</span>
                          )}</>
                ) },
                    { key: 'c4', label: "أُنشئت",
                      render: (lp: any) => (formatDate(lp.createdAt)) },
                    { key: 'c5', label: "إجراءات",
                      render: (lp: any) => (
                  <><div className="flex items-center gap-1">
                            <button aria-label="تحرير" title="تحرير" onClick={() => (window.location.href = `/store/landing-pages/${lp.id}`)}
                              className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 p-1.5 rounded-lg hover:bg-[var(--sys-surface-strong)] text-[var(--sys-foreground)]"><RiPencilLine className="w-4 h-4" /></button>
                            <button title={lp.isPublished ? 'إلغاء النشر' : 'نشر'} disabled={busyId === lp.id}
                              onClick={() => togglePublish(lp)}
                              className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 p-1.5 rounded-lg hover:bg-[var(--sys-surface-strong)] text-[var(--sys-foreground)] disabled:opacity-40">
                              {lp.isPublished ? <RiEyeOffLine className="w-4 h-4" /> : <RiEyeLine className="w-4 h-4" />}
                            </button>
                            <button
                              title={lp.showInStore ? 'أخفِها من المتجر' : 'أظهِرها في المتجر'}
                              aria-label={lp.showInStore ? 'أخفِها من المتجر' : 'أظهِرها في المتجر'}
                              disabled={busyId === lp.id}
                              onClick={() => toggleInStore(lp)}
                              className={`min-h-11 min-w-11 md:min-h-0 md:min-w-0 p-1.5 rounded-lg hover:bg-[var(--sys-surface-strong)] disabled:opacity-40 ${
                                lp.showInStore ? 'text-[var(--sys-primary)]' : 'text-[var(--sys-foreground)]'
                              }`}
                            >
                              <RiStoreLine className="w-4 h-4" />
                            </button>
                            <button title="نسخ الرابط" onClick={() => copyUrl(lp)}
                              className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 p-1.5 rounded-lg hover:bg-[var(--sys-surface-strong)] text-[var(--sys-foreground)]">
                              {copiedId === lp.id ? <RiCursorLine className="w-4 h-4 text-[var(--sys-success)]" /> : <RiFileCopyLine className="w-4 h-4" />}
                            </button>
                            {/* A page that converts, wanted again for the next
                                product. Rebuilding it by hand is how a working
                                page gets copied wrong. */}
                            <button aria-label="انسخ الصفحة" title="انسخ الصفحة" disabled={busyId === lp.id}
                              onClick={() => duplicate(lp)}
                              className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 p-1.5 rounded-lg hover:bg-[var(--sys-primary-soft)] text-[var(--sys-foreground)] hover:text-[var(--sys-primary)] disabled:opacity-40">
                              <RiFileCopy2Line className="w-4 h-4" />
                            </button>
                            <button aria-label="حذف" title="حذف" onClick={() => setDeleting(lp)}
                              className="min-h-11 min-w-11 md:min-h-0 md:min-w-0 p-1.5 rounded-lg hover:bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)]"><RiDeleteBinLine className="w-4 h-4" /></button>
                          </div></>
                ) },
                  ]}
                  empty={
                    <EmptyState title="لا صفحاتِ هبوطٍ بعد" why="صفحةُ الهبوط تُنشئ طلباً داخل النظام مباشرةً. أنشئ واحدةً من الزرّ أعلاه واربطها بمنتج." />
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="إنشاء صفحة هبوط جديدة" maxWidth="4xl">
        <div className="space-y-4">
          {/*
            THE PRODUCT FIRST, AND THE SHAPE SECOND.

            The order is the whole point: every template below is drawn
            selling the product chosen here, with its name and its price in
            it. Asked afterwards, as it used to be, the fifteen previews
            would all advertise «منتجك», and the question a seller actually
            has — «هل يناسب هذا منتجي؟» — could not be answered by looking.
          */}
          <div>
            <label className="text-xs font-semibold text-[var(--sys-foreground)]">المنتج المرتبط</label>
            {/*
              SEARCH REPLACES THE GROUPING, AND THAT IS A TRADE.

              What was here: 114 products under `<optgroup>` headings, with a
              note saying a flat list of 114 is one nobody reads to the end.
              That was right about the problem and it is the same problem the
              owner reported — «لما أضيف منتج … ما بطلع بحث». Typing three
              letters beats scrolling to the right heading, so the grouping
              goes and the search comes in.

              WHAT IS LOST, stated rather than hidden: the category headings,
              and with them the bucket that showed which products have no
              category at all. Nothing else on this screen displayed that, so
              it is now not displayed anywhere — named in the hand-back.

              The picker shows the SKU beside each name; every one of the 114
              products in this database has one.
            */}
            <ProductPicker
              products={products}
              value={form.productId}
              onChange={(productId) => setForm({ ...form, productId })}
              anyOption={{ value: '', label: '— اختر منتجًا —' }}
              groupByCategory
            />
            <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">المنتج والسعر يُحدَّدان من السيرفر عند إرسال أي طلب — لا يمكن التلاعب بهما من الصفحة.</p>
          </div>

          {/*
            THE SHAPE OF THE PAGE, CHOSEN SECOND.

            It lived in the editor, a thousand pixels down the panel, past
            every decision the template was about to make for you. Here it
            costs nothing: there is no page yet, so nothing to warn about
            losing. Pick the shape, then name it.

            AND THERE ARE TWO KINDS OF STARTING POINT, SO BOTH ARE NAMED.
            A ready-made shape is a story and a look welded together; a
            persuasion structure is the story alone, worn by any of the ten
            skins. Both tabs are on the screen rather than behind a menu,
            because a seller who cannot see that the ten structures exist
            will go on using the fifteen forever.
          */}
          <div>
            <span className="text-xs font-semibold text-[var(--sys-foreground)]">من أين تبدأ الصفحة</span>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {([
                ['structure', 'بنية إقناع × مظهر', 'القصّة والمظهر منفصلان — أيّ بنية من العشر بأيّ مظهر من العشرة، والنصّ تكتبه هنا'],
                ['template', 'شكل جاهز', 'خمسة عشر شكلاً، كلٌّ بألوانه ونصّه الجاهز — تعدّل كلّ شيء بعد الإنشاء'],
              ] as const).map(([key, label, hint]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSource(key)}
                  aria-pressed={source === key}
                  className={`rounded-lg border p-2.5 text-start ${
                    source === key
                      ? 'border-[var(--sys-primary)] bg-[var(--sys-primary)]/5'
                      : 'border-[var(--sys-border)] hover:border-[var(--sys-primary)]'
                  }`}
                >
                  <span className="block text-xs font-bold text-[var(--sys-heading)]">{label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[var(--sys-muted-foreground)]">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          {source === 'template' ? (
            <div>
              <label className="text-xs font-semibold text-[var(--sys-foreground)]">شكل الصفحة</label>
              <p className="mb-2 mt-0.5 text-xs text-[var(--sys-muted-foreground)]">
                كل قالب معروض كما سيظهر{chosenProduct ? ` وهو يبيع «${chosenProduct.name}»` : ''} — ويمكنك
                تغيير كل شيء بعدها.
              </p>
              <div className="max-h-[22rem] overflow-y-auto pe-1">
                <TemplateGallery
                  value={form.template}
                  onChange={(key) => setForm({ ...form, template: key })}
                  product={chosenProduct}
                  columns="sm:grid-cols-2"
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-[var(--sys-foreground)]">1 · البنية — ترتيب القصّة</label>
                <p className="mb-2 mt-0.5 text-xs text-[var(--sys-muted-foreground)]">
                  لا لونَ في هذه البطاقات: البنية ترتيبٌ وقصّة وخاناتُ نصّ، والمظهر يُختار بعدها.
                </p>
                <div className="max-h-[22rem] overflow-y-auto pe-1">
                  <StructureGallery
                    structures={LANDING_STRUCTURES}
                    value={form.structure || null}
                    onChange={(id) => setForm({ ...form, structure: id })}
                    productName={chosenProduct?.name}
                  />
                </div>
              </div>

              {/*
                WHAT THE SKIN STEP DRAWS IS THE CHOSEN STRUCTURE.

                Ten cards, one sections tree, ten themes — so the grid shows
                the only thing a skin changes. Before a structure is chosen
                there is nothing to dress, and ten previews of nothing would
                be a control that cannot keep its promise, so the step says
                what it is waiting for instead.
              */}
              <div>
                <label className="text-xs font-semibold text-[var(--sys-foreground)]">2 · المظهر — الألوان والخطّ</label>
                {!chosenStructure ? (
                  <p className="mt-1 rounded-lg border border-[var(--sys-border)] p-3 text-xs text-[var(--sys-muted-foreground)]">
                    يظهر بعد اختيار البنية — لأنّه معاينةُ بنيتك أنت بكلّ مظهر، لا عشرَ صورٍ عامّة.
                  </p>
                ) : (
                  <>
                    <p className="mb-2 mt-0.5 text-xs text-[var(--sys-muted-foreground)]">
                      «{chosenStructure.name}» بعشرة مظاهر — نفس الترتيب ونفس النصّ، واللونُ والخطُّ فقط يتغيّران.
                    </p>
                    <div className="max-h-[24rem] overflow-y-auto pe-1">
                      <div className="grid gap-2 sm:grid-cols-3">
                        {STORE_TEMPLATES.map((t) => {
                          const picked = form.skin === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setForm({ ...form, skin: picked ? '' : t.id })}
                              aria-pressed={picked}
                              className={`overflow-hidden rounded-lg border text-start ${
                                picked
                                  ? 'border-[var(--sys-primary)] ring-1 ring-[var(--sys-primary)]'
                                  : 'border-[var(--sys-border)] hover:border-[var(--sys-primary)]/40'
                              }`}
                            >
                              <TemplatePreview
                                sections={previewSections}
                                theme={skinThemes[t.id]}
                                product={chosenProduct}
                                height={150}
                                zoom={0.3}
                              />
                              <span className="block p-2">
                                <span className="block text-xs font-bold text-[var(--sys-foreground)]">{t.name}</span>
                                <span className="mt-0.5 block text-xs text-[var(--sys-muted)]">{t.suggestedFor}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-[var(--sys-muted)]">
                      بلا مظهر؟ تُنشأ بألوان المكتبة الافتراضية، وتُلوّنها متى شئت.
                    </p>
                  </>
                )}
              </div>

              {/*
                THE COPY, THIRD — AND IT REACHES THE PAGE. The route built
                the sections from an EMPTY copy map, so these fields were a
                form whose answers were discarded; now every sentence typed
                here lands in the block its slot names.
              */}
              {chosenStructure && (
                <div>
                  <label className="text-xs font-semibold text-[var(--sys-foreground)]">3 · النصّ — خاناتُ هذه البنية</label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-[var(--sys-muted)]">اللهجة</span>
                    {DIALECTS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setForm({ ...form, dialect: d })}
                        aria-pressed={form.dialect === d}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          form.dialect === d
                            ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)]'
                            : 'border border-[var(--sys-border)] text-[var(--sys-muted-foreground)]'
                        }`}
                      >
                        {DIALECT_LABEL[d]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-[var(--sys-muted-foreground)]">
                    اتركها فارغةً فتبدأ الصفحةُ بهيكل القصّة تكتبه في المحرّر — وما تكتبه هنا يظهر في المعاينة فوراً.
                  </p>
                  <div className="mt-2 max-h-[26rem] overflow-y-auto pe-1">
                    <SlotFields
                      structure={chosenStructure}
                      copy={copy}
                      dialect={form.dialect}
                      onChange={(slotKey, dialect, text) =>
                        setCopy((prev) => ({ ...prev, [slotKey]: { ...prev[slotKey], [dialect]: text } }))
                      }
                    />
                  </div>
                </div>
              )}
            </>
          )}
          <div>
            <label className="text-xs font-semibold text-[var(--sys-foreground)]">اسم الصفحة *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: صفحة Tremella" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--sys-foreground)]">الرابط (slug) * — سيصبح /lp/…</label>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="tremella" dir="ltr" />
          </div>
          {formError && <div className="text-xs text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] rounded-lg px-3 py-2">{formError}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            {/* A structure is not optional on its own tab: there is no
                default story, and a silent fallback would hand somebody a
                first screen that contradicts the advert pointing at it. */}
            <Button
              onClick={createLandingPage}
              disabled={
                saving ||
                form.name.trim().length < 2 ||
                form.slug.trim().length < 3 ||
                (source === 'structure' && !form.structure)
              }
            >
              {saving ? <RiLoader4Line className="w-4 h-4 animate-spin" /> : <RiAddCircleLine className="w-4 h-4" />} إنشاء
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="تأكيد الحذف" maxWidth="sm">
        <p className="text-sm text-[var(--sys-foreground)] mb-4">
          حذف صفحة الهبوط «{deleting?.name}»؟ الطلبات السابقة المرتبطة بها ستبقى موجودة في الطلبات.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleteLoading}>
            {deleteLoading ? <RiLoader4Line className="w-4 h-4 animate-spin" /> : <RiDeleteBinLine className="w-4 h-4" />} حذف نهائي
          </Button>
        </div>
      </Modal>
    </>
  );
}