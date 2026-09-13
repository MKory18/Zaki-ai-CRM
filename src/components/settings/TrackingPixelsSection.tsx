'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Loader2, Plus, Pencil, Trash2, Megaphone } from 'lucide-react';

/**
 * التتبع والإعلانات — Settings section for the Global Tracking System.
 * Manage multiple Meta / TikTok / Snapchat pixels per platform with scope,
 * enable/disable and full validation (mirrored server-side, fail closed).
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
type Scope = PixelRow['scope'];

const PLATFORMS: { key: Platform; label: string; color: string; hint: string; placeholder: string }[] = [
  { key: 'META', label: 'Facebook / Meta', color: '#1877f2', hint: 'أرقام فقط، 15-16 خانة', placeholder: '123456789012345' },
  { key: 'TIKTOK', label: 'TikTok', color: '#000000', hint: 'حروف وأرقام إنجليزية فقط، 8-32 خانة', placeholder: 'C4ABCD1234567890' },
  { key: 'SNAPCHAT', label: 'Snapchat', color: '#fffc00', hint: 'UUID بصيغة قياسية', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
];

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'GLOBAL', label: 'الموقع بالكامل' },
  { key: 'PUBLIC', label: 'الصفحات العامة' },
  { key: 'LANDING_PAGES', label: 'Landing Pages' },
];

const scopeLabel = (s: Scope) => SCOPES.find((x) => x.key === s)?.label || s;
const platformLabel = (p: Platform) => PLATFORMS.find((x) => x.key === p)?.label || p;

function clientValidate(platform: Platform, pixelId: string): string | null {
  const v = pixelId.trim();
  if (!v) return 'Pixel ID مطلوب';
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

interface ModalState {
  mode: 'create' | 'edit';
  platform: Platform;
  id?: string;
  name: string;
  pixelId: string;
  scope: Scope;
  enabled: boolean;
}

export function TrackingPixelsSection() {
  const [pixels, setPixels] = useState<PixelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [canEdit, setCanEdit] = useState(true);

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

  useEffect(() => {
    load();
  }, [load]);

  const byPlatform = useMemo(() => {
    const map: Record<Platform, PixelRow[]> = { META: [], TIKTOK: [], SNAPCHAT: [] };
    for (const p of pixels) if (map[p.platform]) map[p.platform].push(p);
    return map;
  }, [pixels]);

  const openCreate = (platform: Platform) =>
    setModal({ mode: 'create', platform, name: '', pixelId: '', scope: 'GLOBAL', enabled: true });

  const openEdit = (p: PixelRow) =>
    setModal({ mode: 'edit', platform: p.platform, id: p.id, name: p.name, pixelId: p.pixelId, scope: p.scope, enabled: p.enabled });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    const invalid = clientValidate(modal.platform, modal.pixelId);
    if (invalid) {
      setMsg({ ok: false, text: invalid });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const isEdit = modal.mode === 'edit';
      const res = await fetch(
        isEdit ? `/api/settings/tracking-pixels/${modal.id}` : '/api/settings/tracking-pixels',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isEdit
              ? { name: modal.name, pixelId: modal.pixelId.trim(), scope: modal.scope, enabled: modal.enabled }
              : { platform: modal.platform, name: modal.name, pixelId: modal.pixelId.trim(), scope: modal.scope, enabled: modal.enabled }
          ),
        }
      );
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setMsg({ ok: true, text: isEdit ? 'تم تحديث البكسل' : 'تمت إضافة البكسل' });
        setModal(null);
        await load();
      } else {
        setMsg({ ok: false, text: data?.error || 'تعذر الحفظ' });
      }
    } catch {
      setMsg({ ok: false, text: 'تعذر الاتصال بالسيرفر' });
    } finally {
      setSaving(false);
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

  const remove = async (p: PixelRow) => {
    if (!window.confirm(`حذف البكسل "${p.name}"؟`)) return;
    try {
      const res = await fetch(`/api/settings/tracking-pixels/${p.id}`, { method: 'DELETE' });
      if (res.ok) await load();
    } catch {
      /* non-fatal */
    }
  };

  const modalMeta = modal ? PLATFORMS.find((x) => x.key === modal.platform)! : null;

  return (
    <div id="tracking" className="space-y-4">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center space-x-2">
              <Megaphone className="w-4 h-4 text-[#b8256e]" />
              <span>التتبع والإعلانات</span>
            </span>
          }
          subtitle="إدارة أكواد التتبع والإعلانات لجميع صفحات الموقع."
        />
        <CardContent className="space-y-6">
          {!canEdit && (
            <p className="rounded-xl bg-[#f8fafc] p-3 text-xs text-[#697586]">
              عرض فقط — لا تملك صلاحية تعديل الإعدادات.
            </p>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#697586]" />
            </div>
          ) : (
            PLATFORMS.map((meta) => {
              const rows = byPlatform[meta.key];
              const enabledCount = rows.filter((r) => r.enabled).length;
              return (
                <div key={meta.key} className="rounded-2xl border border-[#e3e8ef] bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e8ef] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full border border-[#e3e8ef]" style={{ backgroundColor: meta.color }} />
                      <h3 className="text-sm font-bold text-[#121926]">{meta.label}</h3>
                      <span className="rounded-full bg-[#f8fafc] px-2 py-0.5 text-[11px] font-semibold text-[#697586]">
                        {rows.length} بكسل • {enabledCount} مفعّل
                      </span>
                    </div>
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => openCreate(meta.key)}>
                        <Plus className="w-3.5 h-3.5" /> إضافة {meta.label} Pixel
                      </Button>
                    )}
                  </div>
                  {rows.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-[#9aa4b2]">لا توجد بكسلات مضافة بعد.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-start text-xs">
                        <thead>
                          <tr className="text-[#697586]">
                            <th className="px-4 py-2 text-start font-semibold">اسم البكسل</th>
                            <th className="px-4 py-2 text-start font-semibold">Pixel ID</th>
                            <th className="px-4 py-2 text-start font-semibold">النطاق</th>
                            <th className="px-4 py-2 text-start font-semibold">الحالة</th>
                            {canEdit && <th className="px-4 py-2 text-start font-semibold">الإجراءات</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((p) => (
                            <tr key={p.id} className="border-t border-[#f1f3f6]">
                              <td className="px-4 py-2.5 font-semibold text-[#121926]">{p.name}</td>
                              <td className="px-4 py-2.5 font-mono text-[#364152]" dir="ltr">{p.pixelId}</td>
                              <td className="px-4 py-2.5 text-[#364152]">{scopeLabel(p.scope)}</td>
                              <td className="px-4 py-2.5">
                                {p.enabled ? (
                                  <span className="flex items-center gap-1 font-semibold text-[#00a344]">🟢 فعال</span>
                                ) : (
                                  <span className="flex items-center gap-1 text-[#9aa4b2]">⚪ غير فعال</span>
                                )}
                              </td>
                              {canEdit && (
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openEdit(p)}
                                      title="تعديل"
                                      className="rounded-lg border border-[#e3e8ef] p-1.5 text-[#364152] transition hover:bg-[#f8fafc]"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggle(p)}
                                      className="rounded-lg border border-[#e3e8ef] px-2 py-1.5 text-[11px] font-bold text-[#364152] transition hover:bg-[#f8fafc]"
                                    >
                                      {p.enabled ? 'تعطيل' : 'تفعيل'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => remove(p)}
                                      title="حذف"
                                      className="rounded-lg border border-rose-200 p-1.5 text-rose-600 transition hover:bg-rose-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {msg && (
            <p className={`text-xs font-semibold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit modal */}
      {modal && modalMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setModal(null)}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-bold text-[#121926]">
              {modal.mode === 'create' ? 'إضافة' : 'تعديل'} {platformLabel(modal.platform)} Pixel
            </h3>
            <div className="mt-4 space-y-3">
              <Input
                label="اسم البكسل *"
                value={modal.name}
                onChange={(e) => setModal({ ...modal, name: e.target.value })}
                placeholder={modal.mode === 'create' ? 'مثال: Saudi Campaign' : undefined}
                maxLength={80}
                required
              />
              <Input
                label="Pixel ID *"
                dir="ltr"
                value={modal.pixelId}
                onChange={(e) => setModal({ ...modal, pixelId: e.target.value })}
                placeholder={modalMeta.placeholder}
                maxLength={64}
                required
                className="font-mono"
              />
              <p className="text-[11px] text-[#697586]">{modalMeta.hint}</p>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#364152]">النطاق</label>
                <Select
                  value={modal.scope}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setModal({ ...modal, scope: e.target.value as Scope })
                  }
                >
                  {SCOPES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[#364152]">
                <input
                  type="checkbox"
                  checked={modal.enabled}
                  onChange={(e) => setModal({ ...modal, enabled: e.target.checked })}
                />
                فعال
              </label>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModal(null)} disabled={saving}>
                إلغاء
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : modal.mode === 'create' ? 'إضافة' : 'حفظ'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
