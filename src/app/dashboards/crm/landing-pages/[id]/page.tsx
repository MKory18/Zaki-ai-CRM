'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  Globe, Upload, Copy, ExternalLink, ArrowRight,
  Loader2, FileCode, MonitorPlay,
} from 'lucide-react';
import { crmApi } from '@/lib/crm-client';

export default function LandingPageEditorPage() {
  const params = useParams<{ id: string }>();
  const lpId = params?.id ?? null;
  const [lp, setLp] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', slug: '', productId: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!lpId) return;
    setLoading(true);
    try {
      const data = await crmApi(`/api/landing-pages/${lpId}`);
      setLp(data.landingPage);
      setForm({ name: data.landingPage.name, slug: data.landingPage.slug, productId: data.landingPage.productId || '' });
    } catch (e: any) { setApiError(e.message); } finally { setLoading(false); }
  }, [lpId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    crmApi('/api/products?limit=200').then((d) => setProducts(d.products || [])).catch(() => {});
  }, []);

  const save = async () => {
    setSaveMsg(null);
    setSaving(true);
    try {
      await crmApi(`/api/landing-pages/${lpId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: form.name, slug: form.slug.toLowerCase().trim(), productId: form.productId || null }),
      });
      setSaveMsg('تم الحفظ ✓');
      await load();
    } catch (e: any) { setSaveMsg(e.message); } finally { setSaving(false); }
  };

  const togglePublish = async () => {
    setSaveMsg(null);
    try {
      await crmApi(`/api/landing-pages/${lpId}`, { method: 'PATCH', body: JSON.stringify({ isPublished: !lp.isPublished }) });
      await load();
    } catch (e: any) { setSaveMsg(e.message); }
  };

  const uploadHtml = async (file: File) => {
    setUploadMsg(null);
    setUploadMsg('جارٍ الرفع…');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`/api/landing-pages/${lpId}/html`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUploadMsg(`تم رفع الملف ✓ (${file.name})`);
      await load();
      await refreshPreview();
    } catch (e: any) { setUploadMsg(e.message); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const refreshPreview = async () => {
    try {
      const data = await crmApi(`/api/landing-pages/${lpId}/preview-token`, { method: 'POST' });
      setPreviewToken(data.previewPath);
    } catch {}
  };
  const refreshPreviewRef = useRef(refreshPreview);

  useEffect(() => {
    if (lp && lpId) refreshPreviewRef.current();
  }, [lp, lpId]);

  const publicUrl = typeof window !== 'undefined' && lp ? `${window.location.origin}/lp/${lp.slug}` : '';

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="p-10 text-center text-[#697586] text-sm">جارٍ التحميل…</div>
      </AppLayout>
    );
  }
  if (apiError || !lp) {
    return (
      <AppLayout>
        <div className="p-10 text-center text-rose-600 text-sm">{apiError || 'الصفحة غير موجودة'}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => (window.location.href = '/dashboards/crm/landing-pages')}>
              <ArrowRight className="w-4 h-4" /> رجوع
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-[#1a2232] flex items-center gap-2">
                <Globe className="w-6 h-6 text-[#b8256e]" /> تحرير صفحة الهبوط
              </h1>
              <p className="text-xs text-[#697586] mt-0.5">{lp.name}</p>
            </div>
            <Badge variant={lp.isPublished ? 'success' : 'warning'}>{lp.isPublished ? 'منشورة' : 'مسودة'}</Badge>
          </div>
          <Button onClick={togglePublish} variant={lp.isPublished ? 'outline' : 'success'}>
            {lp.isPublished ? 'إلغاء النشر' : 'نشر الصفحة'}
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* ─── Settings + upload ─── */}
          <div className="space-y-6">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[#364152]">اسم الصفحة</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#364152]">الرابط (slug)</label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} dir="ltr" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#364152]">المنتج المرتبط</label>
                  <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                    <option value="">— اختر منتجًا —</option>
                    {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  <p className="text-[11px] text-[#697586] mt-1">السعر يُؤخذ من المنتج في قاعدة البيانات — لا يُقبل من المتصفح أبدًا.</p>
                </div>
                <div className="flex items-center justify-between">
                  {saveMsg && <span className="text-xs text-[#364152]">{saveMsg}</span>}
                  <Button onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />} حفظ التعديلات
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-[#1a2232] text-sm">ملف HTML</h3>
                <p className="text-xs text-[#697586]">
                  ارفع ملف <code dir="ltr">.html</code> جاهز (حد أقصى 2MB). يُعرض دائمًا داخل iframe معزول — لا يمكنه قراءة جلسة CRM.
                  نموذج الطلب يُضاف تلقائيًا عبر عنصر <code dir="ltr">&lt;div id=&quot;zaki-order-form&quot;&gt;&lt;/div&gt;</code> إن وجد، وإلا يُلحق بنهاية الصفحة.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".html"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadHtml(e.target.files[0])}
                />
                <Button onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4" /> رفع ملف HTML
                </Button>
                {uploadMsg && <p className="text-xs text-[#364152]">{uploadMsg}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-[#1a2232]">الرابط العام</h3>
                <div className="flex items-center gap-2" dir="ltr">
                  <code className="flex-1 text-xs bg-[#f8fafc] border border-[#e3e8ef] rounded px-3 py-2 truncate">{publicUrl}</code>
                  <Button variant="secondary" size="sm" onClick={copyUrl}><Copy className="w-4 h-4" /> {copied ? 'تم' : 'نسخ'}</Button>
                  {lp.isPublished && (
                    <a href={`/lp/${lp.slug}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm"><ExternalLink className="w-4 h-4" /></Button>
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-[#f8fafc] rounded-lg p-3">
                    <p className="text-lg font-bold text-[#1a2232]">{lp.viewsCount}</p>
                    <p className="text-[11px] text-[#697586]">الزيارات</p>
                  </div>
                  <div className="bg-[#f8fafc] rounded-lg p-3">
                    <p className="text-lg font-bold text-[#1a2232]">{lp.ordersCount}</p>
                    <p className="text-xs text-[#697586]">الطلبات</p>
                  </div>
                  <div className="bg-[#f8fafc] rounded-lg p-3">
                    <p className="text-lg font-bold text-[#b8256e]">{lp.conversionRate}%</p>
                    <p className="text-xs text-[#697586]">نسبة التحويل</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Preview (sandboxed, opaque origin) ─── */}
          <div>
            <Card className="h-full">
              <CardContent className="p-4 flex flex-col h-full">
                <h3 className="font-semibold text-[#1a2232] flex items-center gap-2 mb-3">
                  <MonitorPlay className="w-5 h-5 text-[#b8256e]" /> معاينة آمنة
                </h3>
                {previewToken ? (
                  <iframe
                    src={previewToken}
                    sandbox="allow-scripts allow-forms allow-popups"
                    title="معاينة صفحة الهبوط"
                    className="flex-1 w-full min-h-[480px] rounded-lg border border-[#e3e8ef] bg-white"
                  />
                ) : (
                  <div className="flex-1 min-h-[480px] flex items-center justify-center text-sm text-[#697586] bg-[#f8fafc] rounded-lg">
                    جارٍ تجهيز المعاينة…
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}