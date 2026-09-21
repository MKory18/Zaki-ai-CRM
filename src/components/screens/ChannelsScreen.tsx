'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Radio, Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react';
import { apiJson } from '@/lib/api-client';

/**
 * /settings/channels — where this shop's orders come from.
 *
 * The order's source was free text, so the same channel arrived spelled
 * three different ways and nothing could be counted per channel. Here they
 * are named once. The platform behind the name is a separate field on
 * purpose: "تيكتوك — صفحة الكريم" and "تيكتوك — صفحة القطرة" are two
 * channels and one platform, and both questions get asked.
 *
 * A channel with orders is never deleted, only switched off: it leaves the
 * lists people pick from and stays in the numbers.
 */

const KIND_AR: Record<string, string> = {
  LANDING_PAGE: 'صفحة هبوط',
  FACEBOOK: 'فيسبوك',
  INSTAGRAM: 'إنستغرام',
  TIKTOK: 'تيكتوك',
  WHATSAPP: 'واتساب',
  TELEGRAM: 'تلجرام',
  PHONE: 'هاتف',
  SHEET: 'شيت',
  WEBSITE: 'الموقع',
  OTHER: 'أخرى',
};

const KIND_TONE: Record<string, string> = {
  LANDING_PAGE: 'bg-[#eef4ff] text-[#2563eb] border-[#c7dbff]',
  FACEBOOK: 'bg-[#eef4ff] text-[#1d4ed8] border-[#c7dbff]',
  INSTAGRAM: 'bg-[#fdf2f8] text-[#be185d] border-[#fbcfe8]',
  TIKTOK: 'bg-[#f1f5f9] text-[#0f172a] border-[#e2e8f0]',
  WHATSAPP: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
  TELEGRAM: 'bg-[#eff6ff] text-[#0284c7] border-[#bae6fd]',
  PHONE: 'bg-[#f8fafc] text-[#475569] border-[#e2e8f0]',
  SHEET: 'bg-[#fefce8] text-[#a16207] border-[#fde68a]',
  WEBSITE: 'bg-[#f5f3ff] text-[#6d28d9] border-[#ddd6fe]',
  OTHER: 'bg-[#f8fafc] text-[#697586] border-[#e3e8ef]',
};

interface Channel {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
  sortOrder: number;
  orders: number;
}

const INPUT =
  'w-full h-9 px-3 rounded-[8px] border border-[#e3e8ef] text-sm focus:outline-none focus:border-[#b8256e]';

export function ChannelsScreen() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', kind: 'LANDING_PAGE' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: '', kind: 'OTHER' });

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ channels: Channel[] }>('/api/settings/channels');
      setChannels(res.channels);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (draft.name.trim().length < 2) {
      setError('اكتب اسم القناة');
      return;
    }
    setBusy('new');
    setError(null);
    try {
      await apiJson('/api/settings/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name.trim(), kind: draft.kind }),
      });
      setDraft({ name: '', kind: 'LANDING_PAGE' });
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الإضافة');
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      await apiJson(`/api/settings/channels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(null);
    }
  }

  async function remove(channel: Channel) {
    setBusy(channel.id);
    setError(null);
    try {
      await apiJson(`/api/settings/channels/${channel.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحذف');
    } finally {
      setBusy(null);
    }
  }

  if (!channels) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const total = channels.reduce((sum, c) => sum + c.orders, 0);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#121926] flex items-center gap-2">
            <Radio className="w-6 h-6 text-[#b8256e]" />
            قنوات الطلبات
          </h1>
          <p className="text-xs text-[#697586] mt-1">
            من أين تصل الطلبات — تُختار عند الإدخال وتُحسب عليها الأرقام.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setError(null); }}
            className="px-3 py-2 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            قناة جديدة
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>
      )}

      {adding && (
        <div className="bg-white border border-[#e3e8ef] rounded-[8px] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-[#364152] mb-1">اسم القناة</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
                placeholder="مثال: تيكتوك — صفحة كريم الندبات"
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-[#364152] mb-1">المنصة</span>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className={INPUT}>
                {Object.entries(KIND_AR).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-[#9aa4b2]">
            عدة قنوات قد تشترك بمنصة واحدة — هكذا تعرف كم جاء من تيكتوك كلها، وكم من كل صفحة فيها.
          </p>
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={busy === 'new'}
              className="px-3 py-1.5 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium disabled:opacity-50"
            >
              {busy === 'new' ? 'جارٍ الإضافة…' : 'أضف القناة'}
            </button>
            <button
              onClick={() => { setAdding(false); setError(null); }}
              className="px-3 py-1.5 rounded-[8px] border border-[#e3e8ef] text-xs text-[#697586]"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#e3e8ef] rounded-[8px] divide-y divide-[#e3e8ef]">
        {channels.length === 0 && (
          <p className="p-6 text-sm text-[#697586] text-center">لا قنوات بعد — أضف أول واحدة.</p>
        )}

        {channels.map((c) => (
          <div key={c.id} className={`p-3 ${c.isActive ? '' : 'bg-[#f8fafc]'}`}>
            {editing === c.id ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[180px]">
                  <span className="block text-[11px] text-[#697586] mb-1">الاسم</span>
                  <input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                    autoFocus
                    className={INPUT}
                  />
                </label>
                <label className="w-40">
                  <span className="block text-[11px] text-[#697586] mb-1">المنصة</span>
                  <select
                    value={editDraft.kind}
                    onChange={(e) => setEditDraft({ ...editDraft, kind: e.target.value })}
                    className={INPUT}
                  >
                    {Object.entries(KIND_AR).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => patch(c.id, { name: editDraft.name.trim(), kind: editDraft.kind })}
                  disabled={busy === c.id}
                  className="h-9 px-3 rounded-[8px] bg-[#b8256e] text-white text-xs font-medium disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="h-9 px-3 rounded-[8px] border border-[#e3e8ef] text-xs text-[#697586]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[11px] px-2 py-0.5 rounded-[6px] border ${KIND_TONE[c.kind] ?? KIND_TONE.OTHER}`}>
                  {KIND_AR[c.kind] ?? c.kind}
                </span>
                <span className={`text-sm font-medium ${c.isActive ? 'text-[#121926]' : 'text-[#9aa4b2] line-through'}`}>
                  {c.name}
                </span>
                <span className="text-[11px] text-[#9aa4b2] tabular-nums">
                  {c.orders} طلب
                  {total > 0 && c.orders > 0 && ` · ${Math.round((c.orders / total) * 100)}%`}
                </span>

                <div className="ms-auto flex items-center gap-1">
                  <button
                    onClick={() => { setEditing(c.id); setEditDraft({ name: c.name, kind: c.kind }); setError(null); }}
                    className="p-1.5 rounded-[6px] text-[#697586] hover:text-[#b8256e] hover:bg-[#f8fafc]"
                    title="تعديل"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => patch(c.id, { isActive: !c.isActive })}
                    disabled={busy === c.id}
                    className="text-[11px] px-2 py-1 rounded-[6px] border border-[#e3e8ef] text-[#697586] hover:text-[#b8256e]"
                  >
                    {c.isActive ? 'إيقاف' : 'تفعيل'}
                  </button>
                  {c.orders === 0 && (
                    <button
                      onClick={() => remove(c)}
                      disabled={busy === c.id}
                      className="p-1.5 rounded-[6px] text-[#9aa4b2] hover:text-[#fb323f] hover:bg-[#feecee]"
                      title="حذف — لا طلبات عليها"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[#9aa4b2]">
        القناة التي عليها طلبات لا تُحذف — تُوقَف فتختفي من قوائم الاختيار وتبقى في الإحصاءات.
      </p>
    </div>
  );
}
