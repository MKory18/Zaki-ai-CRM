'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { AlertTriangle, Loader2, Plus, Pencil, Trash2, Megaphone } from 'lucide-react';

/**
 * التتبع والإعلانات — Settings section for the Global Tracking System.
 * UI redesigned to match the reference layout (tabs → platform cards →
 * simple pixel rows → Purchase settings → Google IDs → Google Analytics).
 *
 * Data & behavior are unchanged: pixels come from and go to the existing
 * /api/settings/tracking-pixels endpoints; Purchase/Google preferences are
 * stored as primitives in Company.settings via the existing /api/settings
 * PATCH (read-modify-write). The tracking engine itself is untouched.
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

type Platform = PixelRow['platform'];

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

const TABS = ['تحليلات وبكسل', 'بكسل التتبع', 'تحليلات جافا سكريبت مخصصة ووحدات بكسل'] as const;
const ACTIVE_TAB = 'بكسل التتبع';

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
    setLoading(true);
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
    if (!window.confirm(`حذف رقم التتبع "${p.pixelId}"؟`)) return;
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
    const name = window.prompt('اسم رقم التتبع', p.name);
    if (!name || !name.trim() || name.trim() === p.name) return;
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
      // Read-modify-write via the existing settings endpoint (same pattern
      // used by the CRM settings page). Primitives only — schema-safe.
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
    <div id="tracking" dir="rtl" className="space-y-4">
      <div className="rounded-[10px] border border-[#e5e7eb] bg-white">
        {/* ─── Header + top tabs ─── */}
        <div className="border-b border-[#e5e7eb] px-4 pt-4 sm:px-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#121926]">
            <Megaphone className="h-4 w-4 text-[#b8256e]" />
            التتبع والإعلانات
          </h2>
          <div className="mt-3 flex flex-wrap gap-6 text-sm">
            {TABS.map((tab) => {
              const active = tab === ACTIVE_TAB;
              return (
                <button
                  key={tab}
                  type="button"
                  className={`-mb-px cursor-pointer border-b-2 pb-3 font-semibold transition-colors ${
                    active
                      ? 'border-[#b8256e] text-[#b8256e]'
                      : 'border-transparent text-[#697586] hover:text-[#364152]'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-6">
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
      </div>
    </div>
  );
}
