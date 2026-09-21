'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  Globe, Upload, Copy, ExternalLink, ArrowRight, Plus, Trash2, Pencil,
  Loader2, FileCode, MonitorPlay, Gift,
} from 'lucide-react';
import { screenApi as crmApi } from '@/lib/screen-api';

export function LandingPageDetailScreen() {
  const params = useParams<{ id: string }>();
  const lpId = params?.id ?? null;
  const [lp, setLp] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', slug: '', productId: '', domain: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Recommendations
  const [recs, setRecs] = useState<any[]>([]);
  const [recProductId, setRecProductId] = useState('');
  const [recSaving, setRecSaving] = useState(false);

  const loadRecs = useCallback(async () => {
    if (!lpId) return;
    try { const d = await crmApi(`/api/landing-pages/${lpId}/recommendations`); setRecs(d.recommendations || []); } catch {}
  }, [lpId]);

  const load = useCallback(async () => {
    if (!lpId) return;
    setLoading(true);
    try {
      const data = await crmApi(`/api/landing-pages/${lpId}`);
      setLp(data.landingPage);
      setForm({
        name: data.landingPage.name,
        slug: data.landingPage.slug,
        productId: data.landingPage.productId || '',
        domain: data.landingPage.domain || '',
      });
    } catch (e: any) { setApiError(e.message); } finally { setLoading(false); }
  }, [lpId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (lpId) { loadRecs(); }
  }, [lpId, loadRecs]);
  useEffect(() => {
    crmApi('/api/products?limit=200').then((d) => setProducts(d.products || [])).catch(() => {});
  }, []);

  const save = async () => {
    setSaveMsg(null);
    setSaving(true);
    try {
      await crmApi(`/api/landing-pages/${lpId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          slug: form.slug.toLowerCase().trim(),
          productId: form.productId || null,
          domain: form.domain.trim(),
        }),
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

  // ─── Recommendations management ───
  const addRecommendation = async () => {
    if (!recProductId) return;
    setRecSaving(true);
    try {
      await crmApi(`/api/landing-pages/${lpId}/recommendations`, { method: 'POST', body: JSON.stringify({ productId: recProductId, sortOrder: recs.length }) });
      setRecProductId('');
      await loadRecs();
      await refreshPreview();
    } catch (e: any) { alert(e.message); } finally { setRecSaving(false); }
  };

  const deleteRecommendation = async (recId: string) => {
    try {
      await crmApi(`/api/landing-pages/${lpId}/recommendations/${recId}`, { method: 'DELETE' });
      await loadRecs();
      await refreshPreview();
    } catch (e: any) { alert(e.message); }
  };

  const publicUrl = typeof window !== 'undefined' && lp ? `${window.location.origin}/lp/${lp.slug}` : '';

  useEffect(() => {
    if (lp && lpId) refreshPreviewRef.current();
  }, [lp, lpId]);


  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  if (loading) {
    return (
      <>
        <div className="p-10 text-center text-[#697586] text-sm">جارٍ التحميل…</div>
      </>
    );
  }
  if (apiError || !lp) {
    return (
      <>
        <div className="p-10 text-center text-rose-600 text-sm">{apiError || 'الصفحة غير موجودة'}</div>
      </>
    );
  }

  // An offer price with no currency beside it is a number, not a price —
  // and this company sells into more than one country.
  const currencyCode: string = lp.store?.country?.currencyCode || lp.company?.currency || '';

  return (
    <>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        {/* On a phone the title, the badge and two buttons cannot share one
            row: the heading wrapped onto three lines and the buttons left
            the screen. So the row breaks, and the actions sit together on
            their own line where they are still one tap each. */}
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Row one on a phone: where you came from, and where this page
              stands. The title gets its own line rather than being squeezed
              to "تحري.." between a button and a badge. */}
          <Button variant="secondary" size="sm" onClick={() => (window.location.href = '/growth/landing-pages')}>
            <ArrowRight className="w-4 h-4" /> رجوع
          </Button>
          <Badge variant={lp.isPublished ? 'success' : 'warning'}>{lp.isPublished ? 'منشورة' : 'مسودة'}</Badge>

          <div className="order-last min-w-0 basis-full sm:order-none sm:basis-auto">
            <h1 className="text-lg sm:text-2xl font-bold text-[#1a2232] flex items-center gap-2">
              <Globe className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-[#b8256e]" />
              تحرير صفحة الهبوط
            </h1>
            <p className="text-xs text-[#697586] mt-0.5 truncate">{lp.name}</p>
          </div>

          <div className="flex flex-1 items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => (window.location.href = `/growth/landing-pages/${lpId}/editor`)}>
              <Pencil className="w-4 h-4" /> المحرّر
            </Button>
            <Button size="sm" onClick={togglePublish} variant={lp.isPublished ? 'outline' : 'success'}>
              {lp.isPublished ? 'إلغاء النشر' : 'نشر الصفحة'}
            </Button>
          </div>
        </div>

        {/* `min-w-0` on the columns is not cosmetic: a grid item's automatic
            minimum size is its min-content width, and a text input's is about
            twenty characters. Without it the column refused to shrink and the
            whole page scrolled sideways by 185px on a phone. */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* ─── Settings + upload ─── */}
          <div className="min-w-0 space-y-6">
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
                {/* A domain of the seller's own. The page keeps working at
                    /lp/<slug> either way — the domain is a second door, not
                    a replacement, so a mistyped DNS record never takes a
                    live page offline. */}
                <div>
                  <label className="text-xs font-semibold text-[#364152]">نطاق خاص (اختياري)</label>
                  <Input
                    value={form.domain}
                    onChange={(e) => setForm({ ...form, domain: e.target.value })}
                    dir="ltr"
                    placeholder="shop.example.com"
                  />
                  <p className="mt-1 text-[10.5px] leading-relaxed text-[#697586]">
                    وجّه النطاق إلى هذا الخادم بسجل <code dir="ltr">A</code> أو{' '}
                    <code dir="ltr">CNAME</code> عند مزوّد النطاق، ثم اكتبه هنا. الصفحة
                    تبقى تعمل على <code dir="ltr">/lp/{lp.slug}</code> في الحالتين، فالنطاق
                    باب إضافي لا بديل — وخطأ في الـDNS لا يوقف صفحة تعمل.
                  </p>
                  {lp.domain && (
                    <p className="mt-1 text-[10.5px] text-[#15803d]" dir="ltr">
                      https://{lp.domain}
                    </p>
                  )}
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
                  نموذج الطلب يُضاف تلقائيًا أسفل الصفحة من النظام نفسه — لا تحتاج أي <code dir="ltr">&lt;form&gt;</code> داخل الملف.
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
                <h3 className="font-semibold text-[#1a2232]">نموذج الطلب</h3>
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-[#00c853] text-white text-xs font-bold">✓</span>
                  <div>
                    <p className="text-sm font-semibold text-[#121926]">نموذج الطلب مفعل</p>
                    <p className="text-[11px] text-[#697586]">يظهر تلقائيًا أسفل الصفحة لكل زائر — بدون أي إعداد إضافي. المنتج والسعر يؤخذان من قاعدة البيانات.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Offers live on the PRODUCT now — one bundle, one price,
                wherever it is sold. This card used to hold a second copy,
                and raising a price in the catalogue never reached it. */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="font-semibold text-[#1a2232] flex items-center gap-2">
                  <Gift className="w-4 h-4 text-[#b8256e]" /> عروض المنتج
                </h3>
                <p className="text-[11px] leading-relaxed text-[#697586]">
                  العروض تُدار من صفحة المنتج نفسه، وهذه الصفحة تقرأ منها مباشرة —
                  فتغيير السعر هناك يصل إلى هنا وإلى كل مكان يبيع نفس المنتج.
                </p>
                {lp.productId ? (
                  <a href={`/products/${lp.productId}`}>
                    <Button variant="outline" size="sm">
                      <Gift className="w-4 h-4" /> إدارة عروض هذا المنتج
                    </Button>
                  </a>
                ) : (
                  <p className="text-[11px] text-[#c2410c]">
                    اربط الصفحة بمنتج أولاً حتى تظهر عروضه عليها.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ─── Recommended products ─── */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[#1a2232] flex items-center gap-2">
                    <Gift className="w-4 h-4 text-[#b8256e]" /> المنتجات المقترحة بعد الطلب
                  </h3>
                </div>
                <p className="text-[11px] text-[#697586]">تظهر في شاشة النجاح بعد الطلب — يمكن للعميل إضافتها إلى نفس الطلب خلال 30 دقيقة.</p>
                <div className="flex gap-2">
                  <Select value={recProductId} onChange={(e: any) => setRecProductId(e.target.value)}>
                    <option value="">— اختر منتجًا —</option>
                    {products.filter((p: any) => !recs.some((r: any) => r.product?.id === p.id)).map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.basePrice})</option>
                    ))}
                  </Select>
                  <Button size="sm" onClick={addRecommendation} disabled={recSaving || !recProductId}>
                    {recSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إضافة
                  </Button>
                </div>
                {recs.length === 0 ? (
                  <p className="text-xs text-[#697586]">لا توجد منتجات مقترحة.</p>
                ) : (
                  <div className="space-y-1.5">
                    {recs.map((r: any, i: number) => (
                      <div key={r.id} className="flex items-center gap-2 rounded-xl border border-[#e3e8ef] bg-[#f8fafc] px-3 py-2">
                        <span className="text-xs text-[#9aa4b2]">{i + 1}.</span>
                        <span className="flex-1 truncate text-sm text-[#121926]">{r.product?.name}</span>
                        <span className="text-xs font-bold text-[#b8256e]" dir="ltr">{r.product?.basePrice ?? '—'}</span>
                        {!r.isActive && <span className="text-[10px] text-[#ffab00]">معطّل</span>}
                        <button title="حذف" onClick={() => deleteRecommendation(r.id)} className="p-1 rounded-lg hover:bg-rose-50 text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
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
          <div className="min-w-0">
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
    </>
  );
}
