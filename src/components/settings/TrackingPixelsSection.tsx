'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAsk, useConfirm } from '@/components/ui/Confirm';
import { useApp } from '@/context/AppContext';
import { userCan } from '@/lib/can';
import { SCOPE_CHOICES, scopeChoice, type TrackingPlatform, type TrackingScope } from '@/lib/tracking/tracking-types';
import { validateTrackingPixelId, pixelIdHint } from '@/lib/tracking/tracking-validation';
import { RiAddCircleLine, RiAlertLine, RiDeleteBinLine, RiLoader4Line, RiPencilLine, RiRadarLine } from '@remixicon/react';

/**
 * بكسل التتبع — every pixel the company's selling pages load, on one panel.
 *
 * This was three tabs. The first repeated landing-page numbers that belong
 * to the performance screen (they are read there now); the third stored a
 * "custom analytics script" that was never executed and carried a card
 * advertising webhooks that needed a logged-in session. Between them sat
 * the real thing, plus a Google box and "purchase settings" nothing ever
 * read. What is left is the real thing — with Google as a real platform,
 * and the scope of each pixel visible and changeable, which it never was.
 *
 * The server half (Conversions API, custom conversions) and the ad
 * accounts sit under this panel on the same screen.
 */

interface PixelRow {
  id: string;
  platform: TrackingPlatform;
  name: string;
  pixelId: string;
  enabled: boolean;
  scope: TrackingScope;
  createdAt: string;
}

const PLATFORMS: {
  key: TrackingPlatform;
  label: string;
  placeholder: string;
  mark: React.ReactNode;
  markBg: string;
}[] = [
  { key: 'META', label: 'Meta', placeholder: '123456789012345', mark: <span className="text-sm font-bold text-[var(--sys-primary-foreground)]">f</span>, markBg: '#1877f2' },
  { key: 'TIKTOK', label: 'TikTok', placeholder: 'C4ABCD1234567890', mark: <span className="text-sm font-bold text-[var(--sys-primary-foreground)]">♪</span>, markBg: '#000000' },
  { key: 'SNAPCHAT', label: 'Snapchat', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', mark: <span className="text-sm">👻</span>, markBg: '#fffc00' },
  { key: 'GOOGLE', label: 'Google', placeholder: 'G-XXXXXXXXXX أو AW-123456789/التسمية', mark: <span className="text-sm font-bold text-[#4285f4]">G</span>, markBg: '#ffffff' },
];

export function TrackingPixelsSection() {
  const { currentUser } = useApp();
  const canEdit = userCan(currentUser, 'settings.edit');
  const confirm = useConfirm();
  const askText = useAsk();

  const [pixels, setPixels] = useState<PixelRow[] | null>(null);
  const [platform, setPlatform] = useState<TrackingPlatform>('META');
  const [newId, setNewId] = useState('');
  const [newScope, setNewScope] = useState<TrackingScope>('GLOBAL');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/tracking-pixels');
      const data = await res.json().catch(() => ({}));
      setPixels(res.ok ? data.pixels ?? [] : []);
    } catch {
      setPixels([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of pixels ?? []) out[p.platform] = (out[p.platform] ?? 0) + 1;
    return out;
  }, [pixels]);

  const meta = PLATFORMS.find((p) => p.key === platform)!;
  const rows = (pixels ?? []).filter((p) => p.platform === platform);

  async function send(url: string, init: RequestInit, ok: string): Promise<boolean> {
    setMsg(null);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data?.error || 'تعذر الحفظ' });
        return false;
      }
      setMsg({ ok: true, text: ok });
      await load();
      return true;
    } catch {
      setMsg({ ok: false, text: 'تعذر الاتصال بالخادم' });
      return false;
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const id = validateTrackingPixelId(platform, newId);
    if (!id) {
      setMsg({ ok: false, text: pixelIdHint(platform) });
      return;
    }
    setBusy(true);
    const ok = await send(
      '/api/settings/tracking-pixels',
      {
        method: 'POST',
        body: JSON.stringify({
          platform,
          name: `${meta.label} ${(counts[platform] ?? 0) + 1}`,
          pixelId: id,
          scope: newScope,
          enabled: true,
        }),
      },
      'أُضيف البكسل.'
    );
    if (ok) setNewId('');
    setBusy(false);
  }

  async function rename(p: PixelRow) {
    const name = await askText({
      title: 'اسم البكسل',
      confirmLabel: 'احفظ',
      input: { label: 'الاسم', initial: p.name, required: true, maxLength: 80 },
    });
    if (!name || name.trim() === p.name) return;
    await send(`/api/settings/tracking-pixels/${p.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }, 'حُفظ الاسم.');
  }

  async function remove(p: PixelRow) {
    const ok = await confirm({
      title: `حذف البكسل «${p.name}»؟`,
      body: 'يتوقف تحميله على صفحاتك فوراً. التحويلات المخصّصة المربوطة به تُحذف معه.',
      confirmLabel: 'احذف',
      cancelLabel: 'إلغاء',
      tone: 'danger',
    });
    if (!ok) return;
    await send(`/api/settings/tracking-pixels/${p.id}`, { method: 'DELETE' }, 'حُذف البكسل.');
  }

  return (
    <section id="tracking" dir="rtl" className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <RiRadarLine className="h-4 w-4 text-[var(--sys-primary)]" />
        <h1 className="text-base font-bold text-[var(--sys-heading)]">بكسل التتبع والحملات</h1>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">
        البكسلات تعمل على صفحات البيع وحدها — صفحات الهبوط وواجهات المتاجر — ولا تُحمَّل أبداً داخل لوحة التحكم
        ولا في المعاينة.
      </p>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-[var(--sys-warning)]/40 bg-[var(--sys-warning-soft)] px-3 py-2.5">
        <RiAlertLine className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sys-warning)]" />
        <p className="text-xs leading-relaxed text-[var(--sys-warning)]">
          كل بكسل إضافي سكربت آخر يحمّله متصفح الزبون قبل أن تكتمل الصفحة — أضف ما تحتاجه فعلاً، وعطّل ما لم تعد
          تستعمله بدل أن تتركه يعمل.
        </p>
      </div>

      {/* The four platforms, each with how many pixels it has. */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist">
        {PLATFORMS.map((p) => {
          const active = p.key === platform;
          return (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`platform-${p.key}`}
              onClick={() => { setPlatform(p.key); setNewId(''); setMsg(null); }}
              className={`flex h-12 items-center justify-center gap-2 rounded-lg border px-2 text-sm font-semibold transition ${
                active ? 'border-[var(--sys-heading)] text-[var(--sys-heading)]' : 'border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:border-[var(--sys-border-strong)]'
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-black/10" style={{ backgroundColor: p.markBg }}>
                {p.mark}
              </span>
              {p.label}
              {counts[p.key] ? (
                <span className="rounded-full bg-[var(--sys-surface-strong)] px-1.5 text-xs tabular-nums text-[var(--sys-foreground)]">{counts[p.key]}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {pixels === null ? (
        <div className="flex h-20 items-center justify-center text-[var(--sys-muted-foreground)]">
          <RiLoader4Line className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--sys-border)] py-5 text-center text-xs text-[var(--sys-muted)]">
              لا بكسل {meta.label} بعد.
            </p>
          )}

          {rows.map((p) => (
            <div key={p.id} data-testid="pixel-row" className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--sys-border)] px-3 py-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${p.enabled ? 'bg-[var(--sys-success)]' : 'bg-[var(--sys-border-strong)]'}`}
                title={p.enabled ? 'يعمل' : 'معطّل'}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-[var(--sys-heading)]">{p.name}</p>
                <p className="truncate font-mono text-xs text-[var(--sys-muted-foreground)]" dir="ltr">{p.pixelId}</p>
              </div>

              <select
                aria-label="أين يعمل"
                value={scopeChoice(p.scope)}
                disabled={!canEdit}
                onChange={(e) =>
                  void send(`/api/settings/tracking-pixels/${p.id}`, { method: 'PATCH', body: JSON.stringify({ scope: e.target.value }) }, 'حُفظ.')
                }
                className="h-8 rounded-md border border-[var(--sys-border)] bg-[var(--sys-card)] px-2 text-xs text-[var(--sys-foreground)] disabled:bg-[var(--sys-surface)]"
              >
                {SCOPE_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>

              {canEdit && (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      void send(`/api/settings/tracking-pixels/${p.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !p.enabled }) }, p.enabled ? 'عُطّل البكسل.' : 'فُعّل البكسل.')
                    }
                    className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)] hover:text-[var(--sys-foreground)]"
                  >
                    {p.enabled ? 'تعطيل' : 'تفعيل'}
                  </button>
                  <button type="button" onClick={() => void rename(p)} title="تعديل الاسم" className="rounded-md p-1.5 text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)]">
                    <RiPencilLine className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void remove(p)} title="حذف" className="rounded-md p-1.5 text-[var(--sys-muted)] hover:bg-[var(--sys-destructive-soft)] hover:text-[var(--sys-destructive)]">
                    <RiDeleteBinLine className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {canEdit ? (
            <form onSubmit={add} className="flex flex-wrap items-center gap-2 pt-1">
              <input
                dir="ltr"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder={meta.placeholder}
                maxLength={64}
                disabled={busy}
                aria-label={`رقم بكسل ${meta.label}`}
                className="h-10 min-w-[200px] flex-1 rounded-lg border border-[var(--sys-border)] px-3 font-mono text-sm outline-none focus:border-[var(--sys-primary)]"
              />
              <select
                aria-label="أين يعمل"
                value={newScope}
                onChange={(e) => setNewScope(e.target.value as TrackingScope)}
                className="h-10 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-2 text-xs text-[var(--sys-foreground)]"
              >
                {SCOPE_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <Button type="submit" variant="outline" disabled={busy || !newId.trim()} className="h-10">
                {busy ? <RiLoader4Line className="h-4 w-4 animate-spin" /> : <RiAddCircleLine className="h-4 w-4" />}
                أضف
              </Button>
            </form>
          ) : (
            <p className="text-xs text-[var(--sys-muted-foreground)]">عرض فقط — تعديل البكسلات يحتاج صلاحية تعديل الإعدادات.</p>
          )}

          {msg && (
            <p className={`text-xs font-medium ${msg.ok ? 'text-[var(--sys-success)]' : 'text-[var(--sys-destructive)]'}`} role="status">{msg.text}</p>
          )}
        </div>
      )}
    </section>
  );
}
