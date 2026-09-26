'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import { RiAddCircleLine, RiCheckLine, RiCloseLine, RiDeleteBinLine, RiLoader4Line, RiPencilLine } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';

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
  LANDING_PAGE: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]',
  FACEBOOK: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]',
  INSTAGRAM: 'bg-[var(--sys-primary-soft)] text-[var(--sys-primary)] border-[#fbcfe8]',
  TIKTOK: 'bg-[var(--sys-surface-strong)] text-[#0f172a] border-[var(--sys-border)]',
  WHATSAPP: 'bg-[var(--sys-success-soft)] text-[var(--sys-success)] border-[#a7f3d0]',
  TELEGRAM: 'bg-[var(--sys-surface)] text-[#0284c7] border-[#bae6fd]',
  PHONE: 'bg-[var(--sys-surface)] text-[#475569] border-[var(--sys-border)]',
  SHEET: 'bg-[var(--sys-warning-soft)] text-[var(--sys-warning)] border-[var(--sys-warning)]',
  WEBSITE: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[#ddd6fe]',
  OTHER: 'bg-[var(--sys-surface)] text-[var(--sys-muted-foreground)] border-[var(--sys-border)]',
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
  'w-full h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm focus:outline-none focus:border-[var(--sys-primary)]';

export function ChannelsScreen() {
  const toast = useToast();
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
      toast.failed('اكتب اسم القناة');
      return;
    }
    setBusy('new');
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
      toast.failed(e instanceof Error ? e.message : 'تعذر الإضافة');
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      await apiJson(`/api/settings/channels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setEditing(null);
      await load();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(null);
    }
  }

  async function remove(channel: Channel) {
    setBusy(channel.id);
    try {
      await apiJson(`/api/settings/channels/${channel.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toast.failed(e instanceof Error ? e.message : 'تعذر الحذف');
    } finally {
      setBusy(null);
    }
  }

  if (!channels) {
    return (
      <div className="flex items-center justify-center gap-2 text-[var(--sys-muted-foreground)] text-sm py-16">
        <RiLoader4Line className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const total = channels.reduce((sum, c) => sum + c.orders, 0);

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="قنوات الطلبات"
          description="من أين تصل الطلبات — تُختار عند الإدخال وتُحسب عليها الأرقام."
          actions={
            <>{!adding && (
          <button
            onClick={() => { setAdding(true); setError(null); }}
            className="px-3 py-2 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <RiAddCircleLine className="w-4 h-4" />
            قناة جديدة
          </button>
        )}</>
          }
        />

      {error && (
        <p className="text-sm text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] rounded-lg p-3">{error}</p>
      )}

      {adding && (
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">اسم القناة</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
                placeholder="مثال: تيكتوك — صفحة كريم الندبات"
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-[var(--sys-foreground)] mb-1">المنصة</span>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className={INPUT}>
                {Object.entries(KIND_AR).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-[var(--sys-muted)]">
            عدة قنوات قد تشترك بمنصة واحدة — هكذا تعرف كم جاء من تيكتوك كلها، وكم من كل صفحة فيها.
          </p>
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={busy === 'new'}
              className="px-3 py-1.5 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium disabled:opacity-50"
            >
              {busy === 'new' ? 'جارٍ الإضافة…' : 'أضف القناة'}
            </button>
            <button
              onClick={() => { setAdding(false); setError(null); }}
              className="px-3 py-1.5 rounded-lg border border-[var(--sys-border)] text-xs text-[var(--sys-muted-foreground)]"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg divide-y divide-[var(--sys-border)]">
        {channels.length === 0 && (
          <p className="p-6 text-sm text-[var(--sys-muted-foreground)] text-center">لا قنوات بعد — أضف أول واحدة.</p>
        )}

        {channels.map((c) => (
          <div key={c.id} className={`p-3 ${c.isActive ? '' : 'bg-[var(--sys-surface)]'}`}>
            {editing === c.id ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[180px]">
                  <span className="block text-xs text-[var(--sys-muted-foreground)] mb-1">الاسم</span>
                  <input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                    autoFocus
                    className={INPUT}
                  />
                </label>
                <label className="w-40">
                  <span className="block text-xs text-[var(--sys-muted-foreground)] mb-1">المنصة</span>
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
                  className="h-10 px-3 rounded-lg bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] text-xs font-medium disabled:opacity-50"
                >
                  <RiCheckLine className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="h-10 px-3 rounded-lg border border-[var(--sys-border)] text-xs text-[var(--sys-muted-foreground)]"
                >
                  <RiCloseLine className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-md border ${KIND_TONE[c.kind] ?? KIND_TONE.OTHER}`}>
                  {KIND_AR[c.kind] ?? c.kind}
                </span>
                <span className={`text-sm font-medium ${c.isActive ? 'text-[var(--sys-heading)]' : 'text-[var(--sys-muted)] line-through'}`}>
                  {c.name}
                </span>
                <span className="text-xs text-[var(--sys-muted)] tabular-nums">
                  {c.orders} طلب
                  {total > 0 && c.orders > 0 && ` · ${Math.round((c.orders / total) * 100)}%`}
                </span>

                <div className="ms-auto flex items-center gap-1">
                  <button
                    onClick={() => { setEditing(c.id); setEditDraft({ name: c.name, kind: c.kind }); setError(null); }}
                    className="p-1.5 rounded-md text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-surface)]"
                    title="تعديل"
                  >
                    <RiPencilLine className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => patch(c.id, { isActive: !c.isActive })}
                    disabled={busy === c.id}
                    className="text-xs px-2 py-1 rounded-md border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)]"
                  >
                    {c.isActive ? 'إيقاف' : 'تفعيل'}
                  </button>
                  {c.orders === 0 && (
                    <button
                      onClick={() => remove(c)}
                      disabled={busy === c.id}
                      className="p-1.5 rounded-md text-[var(--sys-muted)] hover:text-[var(--sys-destructive)] hover:bg-[var(--sys-destructive-soft)]"
                      title="حذف — لا طلبات عليها"
                    >
                      <RiDeleteBinLine className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--sys-muted)]">
        القناة التي عليها طلبات لا تُحذف — تُوقَف فتختفي من قوائم الاختيار وتبقى في الإحصاءات.
      </p>
    </div>
  );
}
