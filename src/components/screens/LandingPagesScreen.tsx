'use client';

import { PAGE_TEMPLATES } from '@/lib/page-templates';
import React, { useEffect, useState } from 'react';
import { useTell } from '@/components/ui/Confirm';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import {
  Globe, Plus, Pencil, Trash2, Copy, Eye, EyeOff, ExternalLink,
  CopyPlus,
  MousePointerClick, Loader2,
} from 'lucide-react';
import { screenApi as crmApi, qs } from '@/lib/screen-api';
import { formatDate } from '@/lib/screen-api';
import { copyText } from '@/lib/clipboard';

export function LandingPagesScreen() {
  const tell = useTell();
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
   * Copy the page, not its results.
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

  const createLandingPage = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const data = await crmApi('/api/landing-pages', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, slug: form.slug.toLowerCase().trim(), productId: form.productId || null, template: form.template }),
      });
      setCreateOpen(false);
      window.location.href = `/growth/landing-pages/${data.landingPage.id}`;
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1a2232] flex items-center gap-2">
              <Globe className="w-6 h-6 text-[#b8256e]" />
              صفحات الهبوط
            </h1>
            <p className="text-sm text-[#697586] mt-1">
              صفحات تسويق عامة تُنشئ طلبات حقيقية داخل CRM تلقائيًا
            </p>
            {/* The numbers in this list are lifetime totals; a period, by
                device and by campaign, is read on the performance screen. */}
            <a href="/growth/performance?tab=landing" className="mt-1 inline-block text-xs font-semibold text-[#b8256e] hover:underline">
              تحليلات الصفحات حسب الفترة والجهاز والحملة ←
            </a>
          </div>
          <Button onClick={() => { setForm({ name: '', slug: '', productId: '', template: 'classic' }); setFormError(null); setCreateOpen(true); }}>
            <Plus className="w-4 h-4" /> صفحة جديدة
          </Button>
        </div>

        {/* List */}
        <Card>
          <CardContent className="p-0">
            {notice && (
              <p className="rounded-[8px] border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-[#00733a]">
                {notice}
              </p>
            )}
            {apiError && (
              <p className="rounded-[8px] border border-[#fecdd1] bg-[#feecee] px-3 py-2 text-xs text-[#b3242e]">
                {apiError}
              </p>
            )}

            {loading ? (
              <div className="p-10 text-center text-[#697586] text-sm">جارٍ التحميل…</div>
            ) : pages.length === 0 ? (
              <div className="p-10 text-center text-[#697586] text-sm">
                لا توجد صفحات هبوط بعد. أنشئ أول صفحة لبدء استقبال الطلبات.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f8fafc] text-[#697586] text-xs uppercase">
                      <th className="px-4 py-3 text-start">الصفحة</th>
                      <th className="px-4 py-3 text-start">المنتج</th>
                      <th className="px-4 py-3 text-start">الحالة</th>
                      <th className="px-4 py-3 text-start">الرابط</th>
                      <th className="px-4 py-3 text-start">الزيارات</th>
                      <th className="px-4 py-3 text-start">الطلبات</th>
                      <th className="px-4 py-3 text-start">التحويل</th>
                      <th className="px-4 py-3 text-start">أُنشئت</th>
                      <th className="px-4 py-3 text-start">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((lp: any) => (
                      <tr key={lp.id} className="border-t border-[#e3e8ef] hover:bg-[#f8fafc]">
                        <td className="px-4 py-3 font-semibold text-[#1a2232]">{lp.name}</td>
                        <td className="px-4 py-3 text-[#364152]">{lp.product?.name || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={lp.isPublished ? 'success' : 'default'}>
                            {lp.isPublished ? 'منشورة' : 'مسودة'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3" dir="ltr">
                          {lp.isPublished ? (
                            <a href={`/lp/${lp.slug}`} target="_blank" rel="noopener noreferrer" className="text-[#b8256e] hover:underline flex items-center gap-1">
                              /lp/{lp.slug} <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[#9aa4b2]">/lp/{lp.slug}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{lp.viewsCount}</td>
                        <td className="px-4 py-3">{lp.ordersCount}</td>
                        <td className="px-4 py-3 font-semibold text-[#1a2232]">{lp.conversionRate}%</td>
                        <td className="px-4 py-3 text-[#697586]">{formatDate(lp.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button title="تحرير" onClick={() => (window.location.href = `/growth/landing-pages/${lp.id}`)}
                              className="p-1.5 rounded-lg hover:bg-[#eef2f6] text-[#364152]"><Pencil className="w-4 h-4" /></button>
                            <button title={lp.isPublished ? 'إلغاء النشر' : 'نشر'} disabled={busyId === lp.id}
                              onClick={() => togglePublish(lp)}
                              className="p-1.5 rounded-lg hover:bg-[#eef2f6] text-[#364152] disabled:opacity-40">
                              {lp.isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button title="نسخ الرابط" onClick={() => copyUrl(lp)}
                              className="p-1.5 rounded-lg hover:bg-[#eef2f6] text-[#364152]">
                              {copiedId === lp.id ? <MousePointerClick className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                            </button>
                            {/* A page that converts, wanted again for the next
                                product. Rebuilding it by hand is how a working
                                page gets copied wrong. */}
                            <button title="انسخ الصفحة" disabled={busyId === lp.id}
                              onClick={() => duplicate(lp)}
                              className="p-1.5 rounded-lg hover:bg-[#fdf5fa] text-[#364152] hover:text-[#b8256e] disabled:opacity-40">
                              <CopyPlus className="w-4 h-4" />
                            </button>
                            <button title="حذف" onClick={() => setDeleting(lp)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="إنشاء صفحة هبوط جديدة" maxWidth="lg">
        <div className="space-y-4">
          {/*
            The shape of the page, chosen FIRST.
            
            It lived in the editor, a thousand pixels down the panel, past
            every decision the template was about to make for you. Here it
            costs nothing: there is no page yet, so nothing to warn about
            losing. Pick the shape, then name it.
          */}
          <div>
            <label className="text-xs font-semibold text-[#364152]">شكل الصفحة</label>
            <p className="mb-2 mt-0.5 text-[11px] text-[#697586]">
              تبدأ الصفحة بهذا الشكل ولونه وخطه — ويمكنك تغيير كل شيء بعدها.
            </p>
            <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pe-1 sm:grid-cols-2">
              {PAGE_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setForm({ ...form, template: t.key })}
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-start transition ${
                    form.template === t.key
                      ? 'border-[#b8256e] bg-[#fdf2f7]'
                      : 'border-[#e3e8ef] hover:border-[#b8256e]/40'
                  }`}
                >
                  <span className="mt-0.5 h-7 w-1.5 shrink-0 rounded-full" style={{ background: t.swatch }} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[#364152]">{t.label}</span>
                    <span className="block text-[9.5px] leading-relaxed text-[#9aa4b2]">{t.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#364152]">اسم الصفحة *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: صفحة Tremella" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#364152]">الرابط (slug) * — سيصبح /lp/…</label>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="tremella" dir="ltr" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#364152]">المنتج المرتبط</label>
            <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">— اختر منتجًا —</option>
              {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <p className="text-[11px] text-[#697586] mt-1">المنتج والسعر يُحدَّدان من السيرفر عند إرسال أي طلب — لا يمكن التلاعب بهما من الصفحة.</p>
          </div>
          {formError && <div className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{formError}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button onClick={createLandingPage} disabled={saving || form.name.trim().length < 2 || form.slug.trim().length < 3}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إنشاء
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="تأكيد الحذف" maxWidth="sm">
        <p className="text-sm text-[#364152] mb-4">
          حذف صفحة الهبوط «{deleting?.name}»؟ الطلبات السابقة المرتبطة بها ستبقى موجودة في الطلبات.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>إلغاء</Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleteLoading}>
            {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} حذف نهائي
          </Button>
        </div>
      </Modal>
    </>
  );
}