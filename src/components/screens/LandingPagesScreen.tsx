'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import {
  Globe, Plus, Pencil, Trash2, Copy, Eye, EyeOff, ExternalLink,
  MousePointerClick, Loader2,
} from 'lucide-react';
import { screenApi as crmApi, qs } from '@/lib/screen-api';
import { formatDate } from '@/lib/screen-api';

export function LandingPagesScreen() {
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', productId: '' });
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
    try { await navigator.clipboard.writeText(publicUrl(lp)); setCopiedId(lp.id); setTimeout(() => setCopiedId(null), 1500); } catch {}
  };

  const togglePublish = async (lp: any) => {
    setBusyId(lp.id);
    try {
      await crmApi(`/api/landing-pages/${lp.id}`, { method: 'PATCH', body: JSON.stringify({ isPublished: !lp.isPublished }) });
      await load();
    } catch (e: any) { alert(e.message); } finally { setBusyId(null); }
  };

  const createLandingPage = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const data = await crmApi('/api/landing-pages', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, slug: form.slug.toLowerCase().trim(), productId: form.productId || null }),
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
    } catch (e: any) { alert(e.message); } finally { setDeleteLoading(false); }
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
          </div>
          <Button onClick={() => { setForm({ name: '', slug: '', productId: '' }); setFormError(null); setCreateOpen(true); }}>
            <Plus className="w-4 h-4" /> صفحة جديدة
          </Button>
        </div>

        {/* List */}
        <Card>
          <CardContent className="p-0">
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