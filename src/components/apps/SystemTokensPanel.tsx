'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiFetch, apiJson } from '@/lib/api-client';
import { useConfirm } from '@/components/ui/Confirm';
import { arDateTime } from '@/lib/format';
import {
  RiAddLine,
  RiAlertLine,
  RiFileCopyLine,
  RiKey2Line,
  RiShieldCheckLine,
  RiStopCircleLine,
} from '@remixicon/react';

/**
 * «توكنات الأنظمة» — the keys another system calls `/api/v1` with.
 *
 * It lives inside «التطبيقات المثبتة» and not on a screen of its own,
 * because that is where the question is already being asked: this panel
 * answers «ما هو موصول بشركتك» for the systems that call US, beside the
 * list of the ones we call.
 *
 * ── THE KEY IS SHOWN ONCE, AND THE SCREEN SAYS SO BEFORE IT IS MADE ──
 *
 * Only the SHA-256 is stored, so there is nothing to show a second time —
 * `GET` cannot return it and neither can anything else. A person who closes
 * this box without copying has to stop the key and make another, and being
 * told that afterwards is being told too late. So the warning is above the
 * button, not after it.
 */

interface TokenRow {
  id: string;
  name: string;
  system: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  state: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}

interface Shelf {
  scopeCatalog: { key: string; ar: string }[];
  repliesScopes: string[];
  defaultDays: number;
  tokens: TokenRow[];
}

const STATE_AR: Record<TokenRow['state'], string> = {
  ACTIVE: 'شغّال',
  EXPIRED: 'منتهي',
  REVOKED: 'موقوف',
};

export function SystemTokensPanel() {
  const confirm = useConfirm();
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('نظام الردود');
  const [chosen, setChosen] = useState<string[]>([]);
  /** The one and only moment this value exists outside a header. */
  const [issued, setIssued] = useState<{ secret: string; notice: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await apiJson<Shelf>('/api/settings/system-tokens');
      setShelf(s);
      // The replies system's five scopes are the default selection: that is
      // what this door was built for, and a person who wants fewer unticks
      // them rather than hunting for the right five.
      setChosen((already) => (already.length ? already : s.repliesScopes));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المفاتيح');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async () => {
    setError(null);
    try {
      const made = await apiJson<{ secret: string; notice: string }>('/api/settings/system-tokens', {
        method: 'POST',
        body: JSON.stringify({ name, system: 'replies', scopes: chosen }),
      });
      setIssued({ secret: made.secret, notice: made.notice });
      setCopied(false);
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء المفتاح');
    }
  }, [name, chosen, load]);

  const revoke = useCallback(
    async (id: string, name: string) => {
      // Stopping a key is not undone: the door sets `revokedAt` and nothing sets it back, so the system holding it is cut off at
      // once and needs a new key. A system that has stopped calling in is a bad way to learn that.
      const ok = await confirm({
        title: `إيقاف المفتاح «${name}»؟`,
        body: 'أيّ نظام يستعمله يتوقّف عن الاتصال فوراً. الإيقاف لا يُلغى: تحتاج مفتاحاً جديداً.',
        tone: 'danger',
      });
      if (!ok) return;
      setError(null);
      try {
        const res = await apiFetch('/api/settings/system-tokens', {
          method: 'DELETE',
          body: JSON.stringify({ id }),
        });
        if (!res.ok) throw new Error('تعذر إيقاف المفتاح');
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'تعذر إيقاف المفتاح');
      }
    },
    [load, confirm]
  );

  const copy = useCallback(async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.secret);
      setCopied(true);
    } catch {
      // A browser that refuses the clipboard is not a failure worth a
      // banner: the key is on the screen and can be selected by hand.
      setCopied(false);
    }
  }, [issued]);

  if (!shelf) return null;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold text-[var(--sys-muted-foreground)]">
          <RiKey2Line className="h-4 w-4" /> توكنات الأنظمة
        </h2>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
          <RiAddLine className="h-4 w-4" /> مفتاح جديد
        </Button>
      </div>

      <p className="mb-2 text-xs text-[var(--sys-muted-foreground)]">
        مفتاح واحد لكل نظام خارجي يرسل لنا طلبات على <span dir="ltr" className="font-mono">/api/v1</span>.
        المفتاح يُعرض مرة واحدة عند إنشائه ولا يمكن استرجاعه بعدها.
      </p>

      {error && (
        <p className="mb-2 rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] p-3 text-sm text-[var(--sys-destructive)]">
          {error}
        </p>
      )}

      {issued && (
        <div className="mb-2 rounded-lg border border-[var(--sys-warning)] bg-[var(--sys-warning-soft)] p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--sys-warning)]">
            <RiAlertLine className="h-4 w-4" /> {issued.notice}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-[var(--sys-card)] p-2 font-mono text-xs text-[var(--sys-foreground)]"
              dir="ltr"
            >
              {issued.secret}
            </code>
            <Button size="sm" variant="outline" onClick={copy}>
              <RiFileCopyLine className="h-4 w-4" /> {copied ? 'نُسخ' : 'انسخ'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
              أخفِه
            </Button>
          </div>
        </div>
      )}

      {adding && (
        <div className="mb-2 space-y-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-3">
          <Input
            label="اسم المفتاح"
            name="systemTokenName"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div>
            <p className="mb-1 text-xs font-semibold text-[var(--sys-muted-foreground)]">الصلاحيات</p>
            <div className="flex flex-wrap gap-2">
              {shelf.scopeCatalog.map((s) => (
                <label
                  key={s.key}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--sys-border)] px-2.5 py-1 text-xs md:min-h-0"
                >
                  <input
                    type="checkbox"
                    name={`scope-${s.key}`}
                    checked={chosen.includes(s.key)}
                    onChange={(e) =>
                      setChosen((was) =>
                        e.target.checked ? [...was, s.key] : was.filter((k) => k !== s.key)
                      )
                    }
                  />
                  {s.ar}
                </label>
              ))}
            </div>
          </div>
          <p className="text-xs text-[var(--sys-muted)]">
            ينتهي بعد {shelf.defaultDays} يوماً، وبحدّ ستين طلباً في الدقيقة.
          </p>
          <Button size="sm" onClick={create} disabled={chosen.length === 0}>
            أنشئ المفتاح
          </Button>
        </div>
      )}

      {shelf.tokens.length === 0 ? (
        <p className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-6 text-center text-xs text-[var(--sys-muted-foreground)]">
          لا مفاتيح بعد — أنشئ واحداً والصقه في إعدادات النظام الخارجي.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--sys-border)] rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)]">
          {shelf.tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
              {t.state === 'ACTIVE' ? (
                <RiShieldCheckLine className="h-4 w-4 shrink-0 text-[var(--sys-success)]" />
              ) : (
                <RiStopCircleLine className="h-4 w-4 shrink-0 text-[var(--sys-muted-foreground)]" />
              )}
              <span className="text-sm font-bold text-[var(--sys-heading)]">{t.name}</span>
              <span className="font-mono text-xs text-[var(--sys-muted-foreground)]" dir="ltr">
                {t.prefix}…
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  t.state === 'ACTIVE'
                    ? 'bg-[var(--sys-success-soft)] text-[var(--sys-success)]'
                    : 'bg-[var(--sys-surface-strong)] text-[var(--sys-muted-foreground)]'
                }`}
              >
                {STATE_AR[t.state]}
              </span>
              <span className="text-xs text-[var(--sys-muted)]">
                {t.lastUsedAt ? `آخر استخدام ${arDateTime(t.lastUsedAt)}` : 'لم يُستخدم بعد'}
              </span>
              <span className="text-xs text-[var(--sys-muted)]">
                {t.expiresAt ? `ينتهي ${arDateTime(t.expiresAt)}` : 'بلا انتهاء'}
              </span>
              <span className="flex flex-wrap gap-1">
                {t.scopes.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-[var(--sys-surface-strong)] px-2 py-0.5 font-mono text-xs text-[var(--sys-foreground)]"
                    dir="ltr"
                  >
                    {s}
                  </span>
                ))}
              </span>
              {t.state === 'ACTIVE' && (
                <span className="ms-auto">
                  <Button size="sm" variant="danger" onClick={() => revoke(t.id, t.name)}>
                    <RiStopCircleLine className="h-4 w-4" /> أوقفه
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
