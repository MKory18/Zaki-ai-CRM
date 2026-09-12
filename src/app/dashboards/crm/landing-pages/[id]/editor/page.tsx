'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { crmApi } from '@/lib/crm-client';
import {
  ArrowRight, Save, Eye, Globe, Code2, Palette, Monitor, Tablet, Smartphone,
  Image as ImageIcon, Package, MousePointerClick, Gift, ListPlus, Type, Upload, Loader2,
} from 'lucide-react';

/**
 * CUSTOM LANDING PAGE EDITOR — Phase 1
 *
 *   Header:  Back | page name | Save Draft | Preview | Publish
 *   LEFT:    Insert toolbar (product/image/button/order form/offers/recommendations)
 *   CENTER:  HTML tab | CSS tab  +  live preview (desktop/tablet/mobile)
 *   RIGHT:   Page settings (width/background/direction/font)
 *
 * Isolation model:
 *  - The live preview iframe uses sandbox="" (NO allow-scripts, NO
 *    allow-same-origin) → the rendered HTML/CSS cannot execute scripts,
 *    cannot touch the dashboard DOM, cookies, localStorage or parent window.
 *  - HTML is sanitized AGAIN on the server at save time (defense in depth).
 *  - Dynamic variables ({{product.name}}...) are a fixed whitelist, resolved
 *    server-side from the DB on the public page — never in the editor.
 */

type Tab = 'html' | 'css';
type Device = 'desktop' | 'tablet' | 'mobile';

const DEVICE_WIDTHS: Record<Device, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

// ── Insert snippets (data-zaki-* placeholders — rendered by the public
//    pipeline later; inert in Phase 1 by design) ──
const INSERT_SNIPPETS: { label: string; icon: any; snippet: string }[] = [
  { label: 'المنتج', icon: Package, snippet: '<div data-zaki-product>\n  <h2 class="product-title">{{product.name}}</h2>\n  <img class="product-image" src="{{product.image}}" alt="{{product.name}}">\n  <p class="product-desc">{{product.description}}</p>\n</div>' },
  { label: 'صورة', icon: ImageIcon, snippet: '<img src="https://example.com/image.webp" alt="" class="lp-img">' },
  { label: 'زر', icon: MousePointerClick, snippet: '<a href="#zaki-order-form" class="lp-btn">اطلب الآن</a>' },
  { label: 'نموذج الطلب', icon: ListPlus, snippet: '<div data-zaki-order-form></div>' },
  { label: 'العروض', icon: Gift, snippet: '<div data-zaki-offers></div>' },
  { label: 'منتجات مقترحة', icon: Package, snippet: '<div data-zaki-recommendations></div>' },
];

const VARIABLES = [
  { label: 'اسم المنتج', value: '{{product.name}}' },
  { label: 'اسم المنتج (EN)', value: '{{product.nameEn}}' },
  { label: 'صورة المنتج', value: '{{product.image}}' },
  { label: 'وصف المنتج', value: '{{product.description}}' },
  { label: 'سعر المنتج', value: '{{product.price}}' },
];

const STARTER_HTML = `<div class="zaki-page-wrap hero">
  <span class="tag">عرض خاص</span>
  <h1 class="product-title">{{product.name}}</h1>
  <img class="product-image" src="{{product.image}}" alt="{{product.name}}">
  <p class="product-desc">{{product.description}}</p>
  <div data-zaki-order-form></div>
  <a href="#zaki-order-form" class="lp-btn">اطلب الآن</a>
</div>`;

const STARTER_CSS = `.hero {
  text-align: center;
  padding: 48px 20px;
}
.tag {
  display: inline-block;
  background: #b8256e;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 99px;
}
.product-title {
  font-size: 42px;
  font-weight: 800;
  margin: 16px 0;
}
.product-image {
  max-width: 100%;
  border-radius: 16px;
}
.product-desc {
  color: #555;
  font-size: 16px;
  line-height: 1.8;
}
.lp-btn {
  display: inline-block;
  background: #b8256e;
  color: #fff;
  font-weight: 700;
  padding: 14px 40px;
  border-radius: 12px;
  text-decoration: none;
  margin-top: 16px;
}`;

/** Client-side quick sanitize for PREVIEW ONLY (the iframe runs with
 *  sandbox="" — no scripts can execute regardless; this keeps visuals honest
 *  about what will actually be saved). Server sanitizes again at save. */
function quickSanitize(html: string): string {
  return (html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<\/?script\b[^>]*>/gi, '')
    .replace(/<iframe\b[\s\S]*?(<\/iframe\s*>|\/?>)/gi, '')
    .replace(/<object\b[\s\S]*?<\/object\s*>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function buildPreviewDoc(html: string, css: string, settings: any): string {
  const dir = settings?.direction === 'ltr' ? 'ltr' : 'rtl';
  const bg = typeof settings?.background === 'string' ? settings.background : '#ffffff';
  const ff = settings?.fontFamily ? `font-family:${settings.fontFamily};` : '';
  const wrapMax = settings?.width === 'contained' && settings?.maxWidth ? `.zaki-page-wrap{max-width:${settings.maxWidth}px;margin:0 auto;padding:0 16px;}` : '';
  return `<!doctype html><html dir="${dir}" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:${bg};${ff}}${wrapMax}</style>
<style>${css || ''}</style>
</head><body>${quickSanitize(html)}</body></html>`;
}

export default function LandingPageEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const lpId = params?.id ?? null;

  const [lp, setLp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [html, setHtml] = useState('');
  const [css, setCss] = useState('');
  const [settings, setSettings] = useState<any>({ width: 'full', background: '#ffffff', direction: 'rtl', fontFamily: '' });

  const [tab, setTab] = useState<Tab>('html');
  const [device, setDevice] = useState<Device>('desktop');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [varOpen, setVarOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!lpId) return;
    setLoading(true);
    try {
      const data = await crmApi(`/api/landing-pages/${lpId}`);
      const page = data.landingPage;
      setLp(page);
      setHtml(page.htmlContent || STARTER_HTML);
      setCss(page.cssContent || STARTER_CSS);
      if (page.pageSettings) {
        try { setSettings({ width: 'full', background: '#ffffff', direction: 'rtl', fontFamily: '', ...JSON.parse(page.pageSettings) }); } catch {}
      }
      setDirty(false);
    } catch (e: any) {
      setPageError(e.message || 'تعذر تحميل الصفحة');
    } finally {
      setLoading(false);
    }
  }, [lpId]);

  useEffect(() => { load(); }, [load]);

  // Live preview: debounced rebuild (no script execution — sandbox="")
  const previewDoc = useMemo(
    () => buildPreviewDoc(html, css, settings),
    [html, css, settings]
  );
  useEffect(() => {
    const t = setTimeout(() => setPreviewKey((k) => k + 1), 400);
    return () => clearTimeout(t);
  }, [previewDoc]);

  const insertAtCursor = (snippet: string) => {
    if (tab === 'css') setTab('html');
    // wait a tick if switching tabs — textarea must be mounted
    requestAnimationFrame(() => {
      const el = htmlRef.current;
      if (!el) { setHtml((h) => h + '\n' + snippet); setDirty(true); return; }
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + snippet + el.value.slice(end);
      setHtml(next);
      setDirty(true);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + snippet.length;
        el.setSelectionRange(pos, pos);
      });
    });
  };

  const saveDraft = async () => {
    if (!lpId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await crmApi(`/api/landing-pages/${lpId}/content`, {
        method: 'PUT',
        body: JSON.stringify({ html, css, settings }),
      });
      setSaveMsg({ ok: true, text: 'تم حفظ المسودة' });
      setDirty(false);
    } catch (e: any) {
      setSaveMsg({ ok: false, text: e.message || 'تعذر الحفظ' });
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    if (!lp) return;
    setPublishing(true);
    setSaveMsg(null);
    try {
      // save first, then publish — published page must reflect the latest draft
      await crmApi(`/api/landing-pages/${lpId}/content`, { method: 'PUT', body: JSON.stringify({ html, css, settings }) });
      await crmApi(`/api/landing-pages/${lpId}`, { method: 'PATCH', body: JSON.stringify({ isPublished: !lp.isPublished }) });
      setLp({ ...lp, isPublished: !lp.isPublished });
      setDirty(false);
      setSaveMsg({ ok: true, text: !lp.isPublished ? 'تم نشر الصفحة' : 'تم إلغاء النشر' });
    } catch (e: any) {
      setSaveMsg({ ok: false, text: e.message || 'تعذر النشر' });
    } finally {
      setPublishing(false);
    }
  };

  const uploadImages = async (files: FileList) => {
    if (!lpId || files.length === 0) return;
    setUploading(true);
    setSaveMsg(null);
    try {
      const fd = new FormData();
      Array.from(files).slice(0, 5).forEach((f) => fd.append('files', f));
      const res = await fetch(`/api/landing-pages/${lpId}/image`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const urls: string[] = data.urls || [];
      if (urls.length > 0) {
        const imgTag = urls.map((u) => `<img src="${u}" alt="">`).join('\n');
        insertAtCursor(imgTag);
        setSaveMsg({ ok: true, text: `تم رفع ${urls.length} صورة وإدراجها` });
        setDirty(true);
      }
    } catch (e: any) {
      setSaveMsg({ ok: false, text: e.message || 'تعذر رفع الصور' });
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // Tab key inside the editors inserts spaces (editor UX basic)
  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, setter: (f: (v: string) => string) => void) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    setter((v) => v.slice(0, start) + '  ' + v.slice(end));
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  };

  const lineCount = (text: string) => text.split('\n').length;

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-[60vh] items-center justify-center text-sm text-[#697586]">
          <Loader2 className="h-5 w-5 animate-spin" /> جارٍ تحميل المحرر...
        </div>
      </AppLayout>
    );
  }
  if (pageError || !lp) {
    return (
      <AppLayout>
        <div className="p-10 text-center text-sm text-rose-600">{pageError || 'صفحة الهبوط غير موجودة'}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col" dir="rtl">
        {/* ─── Header ─── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e8ef] bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => router.push(`/dashboards/crm/landing-pages/${lp.id}`)}>
              <ArrowRight className="h-4 w-4" /> Landing Pages
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-base font-bold text-[#121926]">
                <Globe className="h-4 w-4 text-[#b8256e]" /> {lp.name}
                <span className="text-xs font-normal text-[#697586]" dir="ltr">/lp/{lp.slug}</span>
              </h1>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${lp.isPublished ? 'bg-[#e6f9ee] text-[#00a651]' : 'bg-[#fff7e6] text-[#b8860b]'}`}>
              {lp.isPublished ? 'منشورة' : 'مسودة'}
            </span>
            {dirty && <span className="text-[10px] text-[#ffab00]">● تغييرات غير محفوظة</span>}
          </div>
          <div className="flex items-center gap-2">
            {saveMsg && <span className={`text-xs ${saveMsg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{saveMsg.text}</span>}
            <Button variant="outline" size="sm" onClick={saveDraft} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
            </Button>
            {lp.isPublished && (
              <a href={`/lp/${lp.slug}`} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /> معاينة</Button>
              </a>
            )}
            <Button variant={lp.isPublished ? 'outline' : 'success'} size="sm" onClick={togglePublish} disabled={publishing}>
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              {lp.isPublished ? 'إلغاء النشر' : 'نشر'}
            </Button>
          </div>
        </div>

        {/* ─── 3-column workspace ─── */}
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[220px_1fr_260px]">
          {/* LEFT: Insert toolbar */}
          <div className="border-b border-[#e3e8ef] bg-white p-3 lg:border-b-0 lg:border-l lg:border-[#e3e8ef]">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#697586]">إدراج</p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {INSERT_SNIPPETS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => insertAtCursor(item.snippet)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#e3e8ef] px-2.5 py-2 text-xs font-medium text-[#364152] transition-colors hover:border-[#b8256e]/40 hover:bg-[#fdf2f7]"
                >
                  <item.icon className="h-3.5 w-3.5 text-[#b8256e]" /> {item.label}
                </button>
              ))}
            </div>

            <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-[#697586]">متغيرات</p>
            <div className="relative">
              <Button variant="outline" size="sm" className="w-full" onClick={() => setVarOpen((v) => !v)}>
                <Type className="h-3.5 w-3.5" /> إدراج متغير
              </Button>
              {varOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-[#e3e8ef] bg-white py-1 shadow-lg">
                  {VARIABLES.map((v) => (
                    <button
                      key={v.value}
                      className="block w-full cursor-pointer px-3 py-1.5 text-right text-xs text-[#364152] hover:bg-[#f8fafc]"
                      onClick={() => { insertAtCursor(v.value); setVarOpen(false); }}
                    >
                      {v.label} <span className="font-mono text-[10px] text-[#9aa4b2]" dir="ltr">{v.value}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-[#697586]">الصور</p>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && uploadImages(e.target.files)}
            />
            <Button variant="outline" size="sm" className="w-full" onClick={() => imageInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} رفع صورة
            </Button>

            <p className="mt-4 text-[10px] leading-relaxed text-[#697586]">
              العناصر المدرجة هي placeholders — تُحوَّل للعناصر الحقيقية في الصفحة المنشورة. نموذج الطلب الموثوق يعمل خارج HTML المخصص دائمًا.
            </p>
          </div>

          {/* CENTER: editors + live preview */}
          <div className="flex flex-col gap-3 bg-[#f1f5f9] p-3">
            {/* Code editors */}
            <div className="overflow-hidden rounded-xl border border-[#e3e8ef]">
              <div className="flex items-center gap-1 border-b border-[#202939] bg-[#121926] px-2 py-1.5">
                <button
                  onClick={() => setTab('html')}
                  className={`flex cursor-pointer items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold ${tab === 'html' ? 'bg-[#1a2232] text-white' : 'text-[#697586] hover:text-white'}`}
                >
                  <Code2 className="h-3.5 w-3.5" /> HTML
                </button>
                <button
                  onClick={() => setTab('css')}
                  className={`flex cursor-pointer items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold ${tab === 'css' ? 'bg-[#1a2232] text-white' : 'text-[#697586] hover:text-white'}`}
                >
                  <Palette className="h-3.5 w-3.5" /> CSS
                </button>
                <span className="mr-auto text-[10px] text-[#5b6474]">{tab === 'html' ? `${lineCount(html)} سطر` : `${lineCount(css)} سطر`}</span>
              </div>
              {tab === 'html' ? (
                <div className="flex bg-[#121926]" dir="ltr">
                  <div className="select-none border-l border-[#202939] bg-[#0d1117] px-2 py-3 text-right font-mono text-[11px] leading-5 text-[#5b6474]">
                    {Array.from({ length: lineCount(html) }, (_, i) => <div key={i}>{i + 1}</div>)}
                  </div>
                  <textarea
                    ref={htmlRef}
                    value={html}
                    onChange={(e) => { setHtml(e.target.value); setDirty(true); }}
                    onKeyDown={(e) => handleTabKey(e, setHtml)}
                    spellCheck={false}
                    className="h-72 w-full resize-y bg-[#121926] p-3 font-mono text-[12px] leading-5 text-[#c9d1d9] outline-none"
                  />
                </div>
              ) : (
                <div className="flex bg-[#121926]" dir="ltr">
                  <div className="select-none border-l border-[#202939] bg-[#0d1117] px-2 py-3 text-right font-mono text-[11px] leading-5 text-[#5b6474]">
                    {Array.from({ length: lineCount(css) }, (_, i) => <div key={i}>{i + 1}</div>)}
                  </div>
                  <textarea
                    value={css}
                    onChange={(e) => { setCss(e.target.value); setDirty(true); }}
                    onKeyDown={(e) => handleTabKey(e, setCss)}
                    spellCheck={false}
                    className="h-72 w-full resize-y bg-[#121926] p-3 font-mono text-[12px] leading-5 text-[#c9d1d9] outline-none"
                  />
                </div>
              )}
            </div>

            {/* Live preview */}
            <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-[#e3e8ef] bg-white">
              <div className="flex items-center justify-between border-b border-[#e3e8ef] px-3 py-2">
                <span className="text-xs font-semibold text-[#364152]">معاينة مباشرة</span>
                <div className="flex items-center gap-1">
                  {([
                    ['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone],
                  ] as [Device, any][]).map(([d, Icon]) => (
                    <button
                      key={d}
                      onClick={() => setDevice(d)}
                      title={d}
                      className={`cursor-pointer rounded p-1.5 ${device === d ? 'bg-[#fdf2f7] text-[#b8256e]' : 'text-[#697586] hover:bg-[#f8fafc]'}`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => setPreviewKey((k) => k + 1)} title="تحديث">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-1 justify-center overflow-auto bg-[#eef2f6] p-3">
                {/* sandbox="" → no scripts, no same-origin: the preview can
                    never touch the dashboard DOM, cookies or localStorage */}
                <iframe
                  key={previewKey}
                  title="معاينة الصفحة"
                  sandbox=""
                  srcDoc={previewDoc}
                  className="h-full min-h-[400px] rounded-lg border border-[#e3e8ef] bg-white shadow-sm"
                  style={{ width: DEVICE_WIDTHS[device], maxWidth: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* RIGHT: Page settings */}
          <div className="border-t border-[#e3e8ef] bg-white p-4 lg:border-r lg:border-t-0">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#697586]">إعدادات الصفحة</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#364152]">عرض الصفحة</label>
                <Select value={settings.width} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setSettings({ ...settings, width: e.target.value }); setDirty(true); }} className="text-xs">
                  <option value="full">ملء الشاشة</option>
                  <option value="contained">عرض محدود</option>
                </Select>
              </div>
              {settings.width === 'contained' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#364152]">أقصى عرض (px)</label>
                  <Input
                    type="number" min="320" max="1920" dir="ltr"
                    value={settings.maxWidth ?? 960}
                    onChange={(e) => { setSettings({ ...settings, maxWidth: Number(e.target.value) }); setDirty(true); }}
                    className="text-xs"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#364152]">لون الخلفية</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.background || '#ffffff'}
                    onChange={(e) => { setSettings({ ...settings, background: e.target.value }); setDirty(true); }}
                    className="h-8 w-10 cursor-pointer rounded border border-[#e3e8ef]"
                  />
                  <Input
                    dir="ltr"
                    value={settings.background || '#ffffff'}
                    onChange={(e) => { setSettings({ ...settings, background: e.target.value }); setDirty(true); }}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#364152]">اتجاه النص</label>
                <Select value={settings.direction} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setSettings({ ...settings, direction: e.target.value }); setDirty(true); }} className="text-xs">
                  <option value="rtl">RTL (عربي)</option>
                  <option value="ltr">LTR (إنجليزي)</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#364152]">الخط الافتراضي</label>
                <Select value={settings.fontFamily || ''} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setSettings({ ...settings, fontFamily: e.target.value }); setDirty(true); }} className="text-xs">
                  <option value="">النظام الافتراضي</option>
                  <option value="'Tajawal', sans-serif">Tajawal</option>
                  <option value="system-ui, sans-serif">System UI</option>
                  <option value="Georgia, serif">Georgia</option>
                </Select>
              </div>
              <p className="text-[10px] leading-relaxed text-[#697586]">
                الإعدادات تُطبَّق كأنماط أساسية — CSS المخصص لك يتجاوزها دائمًا عند التعارض.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
