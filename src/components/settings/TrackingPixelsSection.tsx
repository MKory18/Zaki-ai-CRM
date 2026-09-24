'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useAsk, useConfirm } from '@/components/ui/Confirm';
import { Input, Select, Textarea } from '@/components/ui/Input';
import {
  AlertTriangle,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Megaphone,
  Eye,
  ShoppingBag,
  ArrowLeft,
  Lock,
} from 'lucide-react';

/**
 * التتبع والإعلانات — Settings section for the Global Tracking System.
 *
 * Three functional tabs (real state, no page reload):
 *  1. analytics-pixels        → live tracking overview + landing-page analytics
 *  2. tracking-pixels         → Meta/TikTok/Snapchat pixels (multiple, scoped),
 *                               Purchase settings, Google tracking IDs/Analytics
 *  3. custom-scripts-pixels   → safe storage for custom analytics scripts
 *                               (NOT auto-executed — see security note) +
 *                               existing external ingestion integrations
 *
 * Data & behavior are unchanged: pixels come from and go to the existing
 * /api/settings/tracking-pixels endpoints; preferences are stored as
 * primitives in Company.settings via the existing /api/settings PATCH
 * (read-modify-write). The tracking engine itself is untouched.
 */

interface PixelRow {
  id: string;
  platform: 'META' | 'TIKTOK' | 'SNAPCHAT';
  name: string;
  pixelId: string;
  enabled: boolean;
  scope: 'GLOBAL' | 'PUBLIC' | 'LANDING_PAGES';
  createdAt: string;
}

interface LandingPageStats {
  id: string;
  name: string;
  slug: string;
  isPublished: boolean;
  viewsCount: number;
  ordersCount: number;
  conversionRate: number | null;
}

type Platform = PixelRow['platform'];
type ActiveTab = 'analytics-pixels' | 'tracking-pixels' | 'custom-scripts-pixels';

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'analytics-pixels', label: 'تحليلات وبكسل' },
  { key: 'tracking-pixels', label: 'بكسل التتبع' },
  { key: 'custom-scripts-pixels', label: 'تحليلات جافا سكريبت مخصصة ووحدات بكسل' },
];

const PLATFORMS: {
  key: Platform;
  label: string;
  hint: string;
  placeholder: string;
  icon: React.ReactNode;
  iconBg: string;
}[] = [
  {
    key: 'META',
    label: 'Facebook pixels',
    hint: 'أرقام فقط، 15-16 خانة',
    placeholder: '123456789012345',
    icon: <span className="text-[13px] font-bold text-white">f</span>,
    iconBg: '#1877f2',
  },
  {
    key: 'SNAPCHAT',
    label: 'Snapchat pixels',
    hint: 'UUID بصيغة قياسية',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    icon: <span className="text-[13px]">👻</span>,
    iconBg: '#fffc00',
  },
  {
    key: 'TIKTOK',
    label: 'Tiktok Pixels',
    hint: 'حروف وأرقام إنجليزية فقط، 8-32 خانة',
    placeholder: 'C4ABCD1234567890',
    icon: <span className="text-[13px] font-bold text-white">♪</span>,
    iconBg: '#000000',
  },
];

const SCOPES: { key: PixelRow['scope']; label: string }[] = [
  { key: 'GLOBAL', label: 'الموقع بالكامل' },
  { key: 'PUBLIC', label: 'الصفحات العامة' },
  { key: 'LANDING_PAGES', label: 'Landing Pages' },
];

function clientValidate(platform: Platform, pixelId: string): string | null {
  const v = pixelId.trim();
  if (!v) return 'أدخل رقم التتبع أولًا';
  switch (platform) {
    case 'META':
      return /^\d{15,16}$/.test(v) ? null : 'Meta Pixel ID غير صالح (أرقام فقط، 15-16 خانة)';
    case 'TIKTOK':
      return /^[A-Za-z0-9]{8,32}$/.test(v) ? null : 'TikTok Pixel ID غير صالح (حروف وأرقام إنجليزية فقط، 8-32 خانة)';
    case 'SNAPCHAT':
      return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v)
        ? null
        : 'Snapchat Pixel ID غير صالح (يجب أن يكون بصيغة UUID)';
  }
}

export function TrackingPixelsSection() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tracking-pixels');

  return (
    <div id="tracking" dir="rtl" className="space-y-4">
      <div className="rounded-[10px] border border-[#e5e7eb] bg-white">
        {/* ─── Header + top tabs (real state, no reload) ─── */}
        <div className="border-b border-[#e5e7eb] px-4 pt-4 sm:px-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#121926]">
            <Megaphone className="h-4 w-4 text-[#b8256e]" />
            التتبع والإعلانات
          </h2>
          <div className="mt-3 flex flex-wrap gap-6 text-sm" role="tablist">
            {TABS.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid={`tab-${tab.key}`}
                  onClick={() => setActiveTab(tab.key)}
                  className={`-mb-px cursor-pointer border-b-2 pb-3 font-semibold transition-colors ${
                    active
                      ? 'border-[#b8256e] text-[#b8256e]'
                      : 'border-transparent text-[#697586] hover:text-[#364152]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-5 sm:px-6">
          {activeTab === 'analytics-pixels' && <AnalyticsPixelsTab />}
          {activeTab === 'tracking-pixels' && <TrackingPixelsTab />}
          {activeTab === 'custom-scripts-pixels' && <CustomScriptsTab />}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ TAB 1: تحليلات وبكسل ═══════════════════════ */

function AnalyticsPixelsTab() {
  const [pixels, setPixels] = useState<PixelRow[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPageStats[] | null>(null);
  const [lpDenied, setLpDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/tracking-pixels');
        if (res.ok && !cancelled) setPixels((await res.json()).pixels || []);
      } catch {
        /* non-fatal */
      }
      try {
        const res = await fetch('/api/landing-pages?limit=8');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setLandingPages(data.landingPages || []);
        } else if (res.status === 403 && !cancelled) {
          setLpDenied(true); // no landing_pages.view permission → hide section
        }
      } catch {
        /* non-fatal */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const map: Record<Platform, { total: number; enabled: number }> = {
      META: { total: 0, enabled: 0 },
      TIKTOK: { total: 0, enabled: 0 },
      SNAPCHAT: { total: 0, enabled: 0 },
    };
    for (const p of pixels) {
      map[p.platform].total += 1;
      if (p.enabled) map[p.platform].enabled += 1;
    }
    return map;
  }, [pixels]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-[#697586]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-[#697586]">
        نظرة عامة حية على إعدادات التتبع والتحليلات الخاصة بموقعك. لإدارة أو إضافة/حذف البكسلات استخدم تبويب «بكسل التتبع».
      </p>

      {/* Platform summary — real data from the tracking-pixels API */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PLATFORMS.map((meta) => {
          const s = summary[meta.key];
          return (
            <div
              key={meta.key}
              className="flex h-[60px] items-center justify-between rounded-[10px] border border-[#e5e7eb] bg-white px-4"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-black/5"
                  style={{ backgroundColor: meta.iconBg }}
                >
                  {meta.icon}
                </span>
                <span className="text-sm font-semibold text-[#364152]">{meta.label}</span>
              </div>
              <span className="text-xs font-semibold text-[#697586]">
                {s.total} بكسل • <span className={s.enabled > 0 ? 'text-[#00a344]' : 'text-[#9aa4b2]'}>{s.enabled} مفعّل</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Landing pages performance — existing /api/landing-pages analytics */}
      {!lpDenied && (
        <div className="space-y-3 border-t border-[#e5e7eb] pt-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#121926]">
            <Eye className="h-4 w-4 text-[#b8256e]" /> أداء صفحات الهبوط
          </h3>
          {landingPages === null ? (
            <p className="text-xs text-[#9aa4b2]">تعذر تحميل بيانات صفحات الهبوط.</p>
          ) : landingPages.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-[#e5e7eb] py-6 text-center text-xs text-[#9aa4b2]">
              لا توجد صفحات هبوط بعد.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#697586]">
                    <th className="px-3 py-2 text-start font-semibold">الصفحة</th>
                    <th className="px-3 py-2 text-start font-semibold">الحالة</th>
                    <th className="px-3 py-2 text-start font-semibold">الزيارات</th>
                    <th className="px-3 py-2 text-start font-semibold">الطلبات</th>
                    <th className="px-3 py-2 text-start font-semibold">معدل التحويل</th>
                  </tr>
                </thead>
                <tbody>
                  {landingPages.map((lp) => (
                    <tr key={lp.id} className="border-t border-[#f1f3f6]">
                      <td className="max-w-[220px] truncate px-3 py-2.5 font-semibold text-[#121926]">{lp.name}</td>
                      <td className="px-3 py-2.5">
                        {lp.isPublished ? (
                          <span className="font-semibold text-[#00a344]">منشورة</span>
                        ) : (
                          <span className="text-[#9aa4b2]">مسودة</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[#364152]" dir="ltr">{lp.viewsCount}</td>
                      <td className="px-3 py-2.5 text-[#364152]" dir="ltr">
                        <span className="inline-flex items-center gap-1">
                          <ShoppingBag className="h-3 w-3 text-[#b8256e]" />
                          {lp.ordersCount}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-[#121926]" dir="ltr">
                        {lp.conversionRate ?? 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link
            href="/growth/performance"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#b8256e] hover:underline"
          >
            التحليلات الكاملة <ArrowLeft className="h-3 w-3" />
          </Link>
        </div>
      )}
      {lpDenied && (
        <p className="text-xs text-[#9aa4b2]">
          أداء صفحات الهبوط يتطلب صلاحية عرض Landing Pages.
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════ TAB 2: بكسل التتبع ═══════════════════════ */

function TrackingPixelsTab() {
  const ask = useConfirm();
  const askText = useAsk();
  const [pixels, setPixels] = useState<PixelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<Platform>('META');
  const [newPixelId, setNewPixelId] = useState('');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [canEdit, setCanEdit] = useState(true);

  // Purchase + Google preferences — stored in Company.settings (primitives)
  // through the existing /api/settings PATCH endpoint (no API changes).
  const [deliveryRate, setDeliveryRate] = useState('');
  const [codConversionType, setCodConversionType] = useState('Purchase');
  const [googleIds, setGoogleIds] = useState('');
  const [newGoogleId, setNewGoogleId] = useState('');
  const [googleAnalytics, setGoogleAnalytics] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/tracking-pixels');
      if (res.ok) {
        const data = await res.json();
        setPixels(data.pixels || []);
      } else if (res.status === 403) {
        setCanEdit(false);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSettingsPrefs = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        const s = data.company?.settings || {};
        setDeliveryRate(s.deliveryRate != null ? String(s.deliveryRate) : '');
        setCodConversionType(typeof s.codConversionType === 'string' ? s.codConversionType : 'Purchase');
        setGoogleIds(typeof s.googleTrackingIds === 'string' ? s.googleTrackingIds : '');
        setGoogleAnalytics(typeof s.googleAnalytics === 'string' ? s.googleAnalytics : '');
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    load();
    loadSettingsPrefs();
  }, [load, loadSettingsPrefs]);

  const byPlatform = useMemo(() => {
    const map: Record<Platform, PixelRow[]> = { META: [], TIKTOK: [], SNAPCHAT: [] };
    for (const p of pixels) if (map[p.platform]) map[p.platform].push(p);
    return map;
  }, [pixels]);

  const platformMeta = PLATFORMS.find((x) => x.key === platform)!;
  const rows = byPlatform[platform];

  const addPixel = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = clientValidate(platform, newPixelId);
    if (invalid) {
      setMsg({ ok: false, text: invalid });
      return;
    }
    setAdding(true);
    setMsg(null);
    try {
      const res = await fetch('/api/settings/tracking-pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          name: `${platformMeta.label} ${byPlatform[platform].length + 1}`,
          pixelId: newPixelId.trim(),
          scope: 'GLOBAL',
          enabled: true,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setNewPixelId('');
        setMsg({ ok: true, text: 'تمت إضافة رقم التتبع' });
        await load();
      } else {
        setMsg({ ok: false, text: data?.error || 'تعذر إضافة رقم التتبع' });
      }
    } catch {
      setMsg({ ok: false, text: 'تعذر الاتصال بالسيرفر' });
    } finally {
      setAdding(false);
    }
  };

  const remove = async (p: PixelRow) => {
    if (!(await ask({ title: `حذف رقم التتبع «${p.pixelId}»؟`, tone: 'danger' }))) return;
    try {
      const res = await fetch(`/api/settings/tracking-pixels/${p.id}`, { method: 'DELETE' });
      if (res.ok) {
        setMsg({ ok: true, text: 'تم حذف رقم التتبع' });
        await load();
      }
    } catch {
      /* non-fatal */
    }
  };

  const toggle = async (p: PixelRow) => {
    try {
      const res = await fetch(`/api/settings/tracking-pixels/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      if (res.ok) await load();
    } catch {
      /* non-fatal */
    }
  };

  const rename = async (p: PixelRow) => {
    const name = await askText({
      title: 'إعادة تسمية رقم التتبع',
      confirmLabel: 'احفظ',
      input: { label: 'الاسم', initial: p.name, required: true, maxLength: 80 },
    });
    if (!name || name === p.name) return;
    try {
      const res = await fetch(`/api/settings/tracking-pixels/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) await load();
    } catch {
      /* non-fatal */
    }
  };

  const saveSettingsPrefs = async () => {
    setSavingSettings(true);
    setMsg(null);
    try {
      const cur = await fetch('/api/settings');
      if (!cur.ok) throw new Error();
      const curData = await cur.json();
      const existing = curData.company?.settings || {};
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            ...existing,
            deliveryRate: deliveryRate.trim() === '' ? '' : Number(deliveryRate) || 0,
            codConversionType,
            googleTrackingIds: googleIds.trim(),
            googleAnalytics: googleAnalytics.slice(0, 4000),
          },
        }),
      });
      const data = await res.json().catch(() => null);
      setMsg(res.ok ? { ok: true, text: 'تم حفظ الإعدادات' } : { ok: false, text: data?.error || 'تعذر الحفظ' });
    } catch {
      setMsg({ ok: false, text: 'تعذر الاتصال بالسيرفر' });
    } finally {
      setSavingSettings(false);
    }
  };

  const googleIdList = useMemo(
    () => googleIds.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
    [googleIds]
  );

  const inputCls = 'h-[52px] text-sm rounded-[10px]';
  const addBtnCls = 'h-[48px] rounded-[10px]';

  return (
    <div className="space-y-5">
      {/* ─── Warning box ─── */}
      <div className="flex w-full items-start gap-2.5 rounded-[10px] border border-[#fde8c8] bg-white px-4 py-3.5">
        <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[#f59e0b]" />
        <p className="text-xs leading-relaxed text-[#364152]">
          يرجى أخذ بعين الاعتبار أن إضافة أكثر من بكسل واحد قد يؤثر على سرعة تحميل الصفحة أو يجعلها غير مستجيبة.
        </p>
      </div>

      {/* ─── Platform selector cards ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PLATFORMS.map((meta) => {
          const active = meta.key === platform;
          return (
            <button
              key={meta.key}
              type="button"
              data-testid={`platform-${meta.key}`}
              onClick={() => setPlatform(meta.key)}
              className={`flex h-[60px] cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border bg-white px-3 text-sm font-semibold transition-colors ${
                active ? 'border-[#121926] text-[#121926]' : 'border-[#e5e7eb] text-[#697586] hover:border-[#c9d0da]'
              }`}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-black/5"
                style={{ backgroundColor: meta.iconBg }}
              >
                {meta.icon}
              </span>
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* ─── Selected platform pixels ─── */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-[#121926]">{platformMeta.label}</h3>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[#697586]" />
          </div>
        ) : (
          <div className="space-y-3">
            {rows.length === 0 && (
              <p className="rounded-[10px] border border-dashed border-[#e5e7eb] py-6 text-center text-xs text-[#9aa4b2]">
                لا يوجد رقم تتبع مضاف بعد لهذه المنصة.
              </p>
            )}
            {rows.map((p) => (
              <div
                key={p.id}
                data-testid="pixel-row"
                className="flex h-[58px] items-center justify-between gap-3 rounded-[10px] border border-[#e5e7eb] bg-white px-4"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${p.enabled ? 'bg-[#00a344]' : 'bg-[#c9d0da]'}`}
                    title={p.enabled ? 'فعال' : 'غير فعال'}
                  />
                  <span className="truncate font-mono text-sm text-[#121926]" dir="ltr">
                    {p.pixelId}
                  </span>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => rename(p)}
                      title="تعديل الاسم"
                      className="rounded-lg p-1.5 text-[#697586] transition hover:bg-[#f8fafc] hover:text-[#364152]"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(p)}
                      className="rounded-lg px-2 py-1 text-[11px] font-bold text-[#697586] transition hover:bg-[#f8fafc] hover:text-[#364152]"
                    >
                      {p.enabled ? 'تعطيل' : 'تفعيل'}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      title="حذف"
                      className="rounded-lg p-1.5 text-[#9aa4b2] transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Add pixel — inline in the same card (no modal) */}
            {canEdit && (
              <form onSubmit={addPixel} className="space-y-3 pt-1">
                <Input
                  dir="ltr"
                  value={newPixelId}
                  onChange={(e) => setNewPixelId(e.target.value)}
                  placeholder={`أدخل رقم التتبع (${platformMeta.hint})`}
                  className={inputCls}
                  maxLength={64}
                  disabled={adding}
                />
                <Button
                  type="submit"
                  variant="outline"
                  className={`${addBtnCls} w-full gap-1.5 font-semibold text-[#b8256e] hover:text-[#b8256e]`}
                  disabled={adding}
                >
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 text-[#b8256e]" />
                  )}
                  أضف رقم التتبع
                </Button>
              </form>
            )}
          </div>
        )}
        <p className="mt-2 text-[11px] text-[#9aa4b2]">
          النطاقات المدعومة: {SCOPES.map((s) => s.label).join(' • ')} — يُدار لكل بكسل من واجهة الإضافة/التعديل.
        </p>
      </div>

      {/* ─── Purchase settings ─── */}
      <div className="space-y-3 border-t border-[#e5e7eb] pt-5">
        <h3 className="text-sm font-bold text-[#121926]">إعدادات الشراء</h3>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#364152]">
            معدل التسليم (فقط في الدفع عند الاستلام)
          </label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={deliveryRate}
            onChange={(e) => setDeliveryRate(e.target.value)}
            placeholder="أدخل معدل التسليم"
            className={inputCls}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#364152]">
            نوع التحويل (فقط في الدفع عند الاستلام)
          </label>
          <Select
            value={codConversionType}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCodConversionType(e.target.value)}
            className={inputCls}
            disabled={!canEdit}
          >
            <option value="Purchase">Purchase</option>
          </Select>
        </div>
      </div>

      {/* ─── Google tracking IDs ─── */}
      <div className="space-y-3 border-t border-[#e5e7eb] pt-5">
        <h3 className="text-sm font-bold text-[#121926]">Google tracking IDs</h3>
        {googleIdList.length > 0 && (
          <div className="space-y-3">
            {googleIdList.map((gid) => (
              <div
                key={gid}
                className="flex h-[58px] items-center justify-between gap-3 rounded-[10px] border border-[#e5e7eb] bg-white px-4"
              >
                <span className="truncate font-mono text-sm text-[#121926]" dir="ltr">
                  {gid}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setGoogleIds(googleIdList.filter((x) => x !== gid).join(','))}
                    title="حذف"
                    className="rounded-lg p-1.5 text-[#9aa4b2] transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="space-y-3">
            <Input
              dir="ltr"
              value={newGoogleId}
              onChange={(e) => setNewGoogleId(e.target.value)}
              placeholder="أدخل رقم التتبع"
              className={inputCls}
              maxLength={64}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const v = newGoogleId.trim();
                if (!v) return;
                if (/^[A-Za-z0-9-]{4,32}$/.test(v) && !googleIdList.includes(v)) {
                  setGoogleIds([...googleIdList, v].join(','));
                  setNewGoogleId('');
                  setMsg(null);
                } else {
                  setMsg({ ok: false, text: 'Google Tracking ID غير صالح أو مكرر' });
                }
              }}
              className={`${addBtnCls} w-full gap-1.5 font-semibold text-[#b8256e] hover:text-[#b8256e]`}
            >
              <Plus className="h-4 w-4 text-[#b8256e]" />
              أضف رقم التتبع
            </Button>
          </div>
        )}
      </div>

      {/* ─── Google analytics ─── */}
      <div className="space-y-3 border-t border-[#e5e7eb] pt-5">
        <h3 className="text-sm font-bold text-[#121926]">Google analytics</h3>
        <Textarea
          dir="ltr"
          rows={5}
          value={googleAnalytics}
          onChange={(e) => setGoogleAnalytics(e.target.value)}
          placeholder="أدخل إعدادات Google Analytics (معرّف القياس مثل G-XXXXXXX)"
          className="rounded-[10px] font-mono text-sm"
          maxLength={4000}
          disabled={!canEdit}
        />
      </div>

      {/* ─── Messages + save ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] pt-4">
        {msg && (
          <p className={`text-xs font-semibold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>
        )}
        <span className="flex-1" />
        {canEdit && (
          <Button type="button" onClick={saveSettingsPrefs} disabled={savingSettings} className={addBtnCls}>
            {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ الإعدادات'}
          </Button>
        )}
      </div>
      {!canEdit && (
        <p className="text-xs text-[#697586]">عرض فقط — لا تملك صلاحية تعديل الإعدادات.</p>
      )}
    </div>
  );
}

/* ══════════ TAB 3: تحليلات جافا سكريبت مخصصة ووحدات بكسل ══════════ */

function CustomScriptsTab() {
  const [customHeadScript, setCustomHeadScript] = useState('');
  const [savedValue, setSavedValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [canEdit, setCanEdit] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.status === 403) setCanEdit(false);
        if (res.ok) {
          const data = await res.json();
          const s = data.company?.settings || {};
          const v = typeof s.customHeadScript === 'string' ? s.customHeadScript : '';
          setCustomHeadScript(v);
          setSavedValue(v);
        }
      } catch {
        /* non-fatal */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const cur = await fetch('/api/settings');
      if (!cur.ok) throw new Error();
      const curData = await cur.json();
      const existing = curData.company?.settings || {};
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            ...existing,
            customHeadScript: customHeadScript.slice(0, 4000),
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        const v = customHeadScript.slice(0, 4000);
        setSavedValue(v);
        setMsg({ ok: true, text: 'تم حفظ الكود المخصص' });
      } else {
        setMsg({ ok: false, text: data?.error || 'تعذر الحفظ' });
      }
    } catch {
      setMsg({ ok: false, text: 'تعذر الاتصال بالسيرفر' });
    } finally {
      setSaving(false);
    }
  };

  const dirty = customHeadScript !== savedValue;

  return (
    <div className="space-y-5">
      {/* Security contract — honest and explicit */}
      <div className="flex w-full items-start gap-2.5 rounded-[10px] border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3.5">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#364152]" />
        <p className="text-xs leading-relaxed text-[#364152]">
          <span className="font-bold">الأمان أولًا:</span> أكواد التتبع المنفَّذة فعليًا على الموقع (Meta / TikTok /
          Snapchat) تُدار حصريًا من تبويب «بكسل التتبع» ويولّدها محرك التتبع المركزي — لا يُنفَّذ أي كود JavaScript مخصص
          من هذا القسم داخل الموقع تلقائيًا، لمنع XSS وتجاوز CSP. هذا القسم مخصص لتخزين وإدارة كود التحليلات المخصص
          (تخزين موثّق ومراجَع في سجل التدقيق فقط)، ولا يعمل على Dashboard.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[#697586]" />
        </div>
      ) : (
        <>
          {/* Custom analytics script — storage + audit via existing settings API.
              Stored server-side (settings.edit protected), capped, NEVER injected. */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#121926]">كود تحليلات مخصص (تخزين فقط — لا يُنفّذ تلقائيًا)</h3>
            <Textarea
              dir="ltr"
              rows={7}
              value={customHeadScript}
              onChange={(e) => setCustomHeadScript(e.target.value)}
              placeholder="// ضع كود التحليلات المخصص هنا للتوثيق/المراجعة فقط — لا يُنفَّذ تلقائيًا"
              className="rounded-[10px] font-mono text-sm"
              maxLength={4000}
              disabled={!canEdit}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {msg && (
                <p className={`text-xs font-semibold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>
              )}
              <span className="flex-1" />
              {canEdit && (
                <Button type="button" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? 'حفظ التغييرات' : 'حفظ'}
                </Button>
              )}
            </div>
            <p className="text-[11px] text-[#9aa4b2]">
              الحد الأقصى 4000 حرف. يتم تسجيل كل تعديل في Audit Log مع تمويه المحتوى الحساس. الحفظ يتطلب صلاحية تعديل
              الإعدادات (settings.edit).
            </p>
          </div>

          {/* Existing external integrations (real functionality, documented) */}
          <div className="space-y-3 border-t border-[#e5e7eb] pt-5">
            <h3 className="text-sm font-bold text-[#121926]">التكاملات الخارجية الموجودة</h3>
            <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-4">
              <p className="text-xs font-bold text-[#121926]">New Order Ingestion Webhook</p>
              <p className="mt-1 font-mono text-[11px] text-[#697586]" dir="ltr">
                POST /api/orders (JSON — Facebook Lead Ads / TikTok / Shopify / n8n)
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#697586]">
                يستقبل طلبات من منصات خارجية إلى نفس نظام الطلبات (يتطلب جلسة مصادقة) — بديل آمن عن حقن سكريبتات خارجية.
              </p>
            </div>
            <p className="text-[11px] text-[#9aa4b2]">
              كل الأحداث المتاحة محددة مسبقًا (PageView / ViewContent / InitiateCheckout / Purchase) — لا يمكن إضافة
              أسماء أحداث عشوائية لأسباب أمنية.
            </p>
          </div>
        </>
      )}
    </div>
  );
}