'use client';

import { TemplateGallery } from '@/components/ui/TemplateGallery';
import React, { useEffect, useState } from 'react';
import { useTell } from '@/components/ui/Confirm';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { screenApi as crmApi, qs } from '@/lib/screen-api';
import { formatDate } from '@/lib/screen-api';
import { copyText } from '@/lib/clipboard';
import { useApp } from '@/context/AppContext';
import { userCan } from '@/lib/can';
import { RiAddCircleLine, RiCursorLine, RiDeleteBinLine, RiExternalLinkLine, RiEyeLine, RiEyeOffLine, RiFileCopy2Line, RiFileCopyLine, RiLoader4Line, RiPencilLine, RiStoreLine } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { routeLabel } from '@/lib/route-registry';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';

export function LandingPagesScreen() {
  const tell = useTell();
  const { currentUser } = useApp();
  // The performance screen's own gate — a link that opens onto a refusal is noise.
  const canAnalytics = userCan(currentUser, 'reports.view') || userCan(currentUser, 'analytics.view');
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** What just happened, said on the screen — not in a browser alert box. */
  const [apiError, setApiError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', productId: '', template: 'classic' });
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
    crmApi('/api/products?limit=200').then((d) => setProducts(d.products || [])).catch(() => {});
  }, []);

  /**
   * THE PRODUCTS, UNDER THEIR CATEGORIES.
   *
   * 114 products in one flat list is a list nobody reads to the end. The
   * grouping is also the only honest way to show the gap: everything with
   * no category lands in one bucket that says so, instead of being spread
   * invisibly through the alphabet.
   */
  const grouped = React.useMemo(() => {
    const by = new Map<string, any[]>();
    for (const p of products) {
      const key = p.category?.name || '';
      if (!by.has(key)) by.set(key, []);
      by.get(key)!.push(p);
    }
    // Uncategorised last: it is a leftover, not a category.
    return [...by.entries()].sort((a, b) => (a[0] ? (b[0] ? a[0].localeCompare(b[0], 'ar') : -1) : 1));
  }, [products]);

  /** What the template previews should be selling: the product just picked. */
  const chosenProduct = React.useMemo(() => {
    const p = products.find((x: any) => x.id === form.productId);
    return p ? { name: p.name, price: Number(p.basePrice ?? 0), currency: p.currency || '' } : null;
  }, [products, form.productId]);

  const publicUrl = (lp: any) =>
    typeof window !== 'undefined' ? `${window.location.origin}/lp/${lp.slug}` : `/lp/${lp.slug}`;

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
      const data = await crmApi('/api/landing-pages', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, slug: form.slug.toLowerCase().trim(), productId: form.productId || null, template: form.template }),
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
            <Button onClick={() => { setForm({ name: '', slug: '', productId: '', template: 'classic' }); setFormError(null); setCreateOpen(true); }}>
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
            <label className="text-xs font-semibold text-[var(--sys-foreground)]" htmlFor="lp-product">المنتج المرتبط</label>
            <Select id="lp-product" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">— اختر منتجًا —</option>
              {grouped.map(([cat, items]) => (
                <optgroup key={cat || 'none'} label={cat || 'بلا تصنيف'}>
                  {items.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              ))}
            </Select>
            <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">المنتج والسعر يُحدَّدان من السيرفر عند إرسال أي طلب — لا يمكن التلاعب بهما من الصفحة.</p>
          </div>

          {/*
            The shape of the page, chosen SECOND.
            
            It lived in the editor, a thousand pixels down the panel, past
            every decision the template was about to make for you. Here it
            costs nothing: there is no page yet, so nothing to warn about
            losing. Pick the shape, then name it.
          */}
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
            <Button onClick={createLandingPage} disabled={saving || form.name.trim().length < 2 || form.slug.trim().length < 3}>
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