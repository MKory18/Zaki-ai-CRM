'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  Globe, Upload, Copy, ExternalLink, ArrowRight, Plus, Trash2, Star, Pencil,
  Loader2, FileCode, MonitorPlay, Gift,
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

  // Offers
  const [offers, setOffers] = useState<any[]>([]);
  const [offerForm, setOfferForm] = useState<any>(null);
  const [offerSaving, setOfferSaving] = useState(false);
  // Recommendations
  const [recs, setRecs] = useState<any[]>([]);
  const [recProductId, setRecProductId] = useState('');
  const [recSaving, setRecSaving] = useState(false);

  const loadOffers = useCallback(async () => {
    if (!lpId) return;
    try { const d = await crmApi(`/api/landing-pages/${lpId}/offers`); setOffers(d.offers || []); } catch {}
  }, [lpId]);
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
      setForm({ name: data.landingPage.name, slug: data.landingPage.slug, productId: data.landingPage.productId || '' });
    } catch (e: any) { setApiError(e.message); } finally { setLoading(false); }
  }, [lpId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (lpId) { loadOffers(); loadRecs(); }
  }, [lpId, loadOffers, loadRecs]);
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

  // ─── Offers management ───
  const saveOffer = async () => {
    if (!offerForm) return;
    setOfferSaving(true);
    try {
      if (offerForm.id) {
        await crmApi(`/api/landing-pages/${lpId}/offers/${offerForm.id}`, { method: 'PATCH', body: JSON.stringify(offerForm) });
      } else {
        await crmApi(`/api/landing-pages/${lpId}/offers`, { method: 'POST', body: JSON.stringify(offerForm) });
      }
      setOfferForm(null);
      await loadOffers();
      await refreshPreview();
    } catch (e: any) { alert(e.message); } finally { setOfferSaving(false); }
  };

  const deleteOffer = async (offerId: string) => {
    try {
      await crmApi(`/api/landing-pages/${lpId}/offers/${offerId}`, { method: 'DELETE' });
      await loadOffers();
      await refreshPreview();
    } catch (e: any) { alert(e.message); }
  };

  const toggleDefaultOffer = async (o: any) => {
    try {
      await crmApi(`/api/landing-pages/${lpId}/offers/${o.id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) });
      await loadOffers();
      await refreshPreview();
    } catch (e: any) { alert(e.message); }
  };

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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => (window.location.href = `/dashboards/crm/landing-pages/${lpId}/editor`)}>
              <Pencil className="w-4 h-4" /> Custom Editor
            </Button>
            <Button onClick={togglePublish} variant={lp.isPublished ? 'outline' : 'success'}>
              {lp.isPublished ? 'إلغاء النشر' : 'نشر الصفحة'}
            </Button>
          </div>
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

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[#1a2232] flex items-center gap-2">
                    <Gift className="w-4 h-4 text-[#b8256e]" /> عروض المنتج
                  </h3>
                  <Button size="sm" onClick={() => setOfferForm({ name: '', quantity: 1, freeQuantity: 0, price: lp.product?.basePrice ?? 0, isDefault: offers.length === 0, sortOrder: offers.length, isActive: true })}>
                    <Plus className="w-4 h-4" /> إضافة عرض
                  </Button>
                </div>
                {offers.length === 0 ? (
                  <p className="text-xs text-[#697586]">لا توجد عروض — سيقوم النموذج بعرض سعر المنتج الأساسي فقط.</p>
                ) : (
                  <div className="space-y-2">
                    {offers.map((o: any) => (
                      <div key={o.id} className="flex items-center gap-2 rounded-xl border border-[#e3e8ef] bg-[#f8fafc] px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#121926] flex items-center gap-1.5">
                            {o.name}
                            {o.isDefault && <Star className="w-3.5 h-3.5 text-[#ffab00] fill-[#ffab00]" />}
                          </p>
                          <p className="text-[11px] text-[#697586]" dir="ltr">
                            {o.quantity} قطعة{o.freeQuantity > 0 ? ` + ${o.freeQuantity} هدية` : ''} — {o.price}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {!o.isDefault && (
                            <button title="اجعلها الافتراضية" onClick={() => toggleDefaultOffer(o)} className="p-1.5 rounded-lg hover:bg-[#eef2f6] text-[#697586]"><Star className="w-4 h-4" /></button>
                          )}
                          <button title="تعديل" onClick={() => setOfferForm({ ...o })} className="p-1.5 rounded-lg hover:bg-[#eef2f6] text-[#364152]"><Pencil className="w-4 h-4" /></button>
                          <button title="حذف" onClick={() => deleteOffer(o.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Offer form */}
                {offerForm && (
                  <div className="space-y-2 rounded-xl border border-[#b8256e]/30 bg-[#fdf2f7] p-3">
                    <Input placeholder="اسم العرض (مثال: قطعتان + هدية)" value={offerForm.name} onChange={(e: any) => setOfferForm({ ...offerForm, name: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" min="1" placeholder="الكمية" value={offerForm.quantity} onChange={(e: any) => setOfferForm({ ...offerForm, quantity: e.target.value })} />
                      <Input type="number" min="0" placeholder="الكمية المجانية" value={offerForm.freeQuantity} onChange={(e: any) => setOfferForm({ ...offerForm, freeQuantity: e.target.value })} />
                      <Input type="number" min="0" step="0.01" placeholder="السعر" value={offerForm.price} onChange={(e: any) => setOfferForm({ ...offerForm, price: e.target.value })} />
                      <Input type="number" min="0" placeholder="الترتيب" value={offerForm.sortOrder} onChange={(e: any) => setOfferForm({ ...offerForm, sortOrder: e.target.value })} />
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-[#364152]">
                        <input type="checkbox" checked={!!offerForm.isDefault} onChange={(e: any) => setOfferForm({ ...offerForm, isDefault: e.target.checked })} /> العرض الافتراضي
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-[#364152]">
                        <input type="checkbox" checked={!!offerForm.isActive} onChange={(e: any) => setOfferForm({ ...offerForm, isActive: e.target.checked })} /> فعال
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setOfferForm(null)}>إلغاء</Button>
                      <Button size="sm" onClick={saveOffer} disabled={offerSaving || !offerForm.name?.trim()}>
                        {offerSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} حفظ العرض
                      </Button>
                    </div>
                  </div>
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
