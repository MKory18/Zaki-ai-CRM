'use client';

import React, { useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { SYSTEM_THEMES, sanitizeTheme } from '@/lib/system-themes';

/**
 * CHOOSING HOW THE SYSTEM LOOKS.
 *
 * It applies the moment it is clicked — the attribute on the frame changes
 * and every screen follows, with no reload. Saving happens after, quietly.
 * A picker that made somebody wait for a round trip to see a colour is a
 * picker they cannot actually choose with, because choosing a theme means
 * looking at it.
 *
 * And if the save fails the choice STAYS applied for this session and says
 * so. Snapping back to the old theme while they are looking at the new one
 * would read as the click not having worked.
 *
 * Each swatch shows the real palette — the page, the card, the accent and
 * the three semantic colours — because the whole question is what the
 * screen will look like, and a named square answers a different one.
 */

/** The frame the server rendered the theme onto. */
function applyNow(key: string) {
  const frame = document.querySelector('[data-sys-theme]');
  if (frame) frame.setAttribute('data-sys-theme', key);
}

export function ThemePicker({ initial }: { initial: string | null | undefined }) {
  const [chosen, setChosen] = useState(() => sanitizeTheme(initial));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const pick = async (key: string) => {
    // Applied first, always. The save is bookkeeping.
    applyNow(key);
    setChosen(key);
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch('/api/profile/theme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: key }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section dir="rtl">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--sys-foreground)]">
        <Palette className="h-3.5 w-3.5 text-[var(--sys-primary)]" /> مظهر النظام
      </h3>
      <p className="mb-2 text-[11px] leading-relaxed text-[var(--sys-muted-foreground)]">
        اختيارك أنت وحدك، ويتبعك بين الأجهزة. ألوان المعاني لا تتغيّر بين المظاهر: الأحمر متأخر أو
        خسارة، والأخضر محصَّل، والكهرماني يحتاج انتباهاً — يتغيّر السطح فقط. ولا يمسّ هذا شكل متجرك
        إطلاقاً.
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        {SYSTEM_THEMES.map((theme) => {
          const active = theme.key === chosen;
          return (
            <button
              key={theme.key}
              type="button"
              disabled={busy}
              onClick={() => pick(theme.key)}
              className={`rounded-lg border p-2.5 text-right transition disabled:opacity-60 ${
                active
                  ? 'border-[var(--sys-primary)] ring-1 ring-[var(--sys-primary)]'
                  : 'border-[var(--sys-border)] hover:border-[var(--sys-border-strong)]'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--sys-heading)]">{theme.ar}</span>
                {active && <Check className="h-3.5 w-3.5 text-[var(--sys-primary)]" />}
              </span>

              {/* The real palette, not a name. */}
              <span
                className="mt-2 flex h-12 items-end gap-1 rounded border p-1.5"
                style={{ background: theme.vars.background, borderColor: theme.vars.border }}
              >
                <span
                  className="h-full flex-1 rounded-sm border"
                  style={{ background: theme.vars.card, borderColor: theme.vars.border }}
                />
                {(['primary', 'destructive', 'warning', 'success'] as const).map((k) => (
                  <span key={k} className="h-3 w-3 rounded-full" style={{ background: theme.vars[k] }} />
                ))}
              </span>

              <span className="mt-1.5 block text-[10px] leading-relaxed text-[var(--sys-muted-foreground)]">
                {theme.note}
              </span>
            </button>
          );
        })}
      </div>

      {failed && (
        <p className="mt-2 text-[11px] text-[var(--sys-warning)]">
          طُبِّق المظهر هنا، لكن تعذّر حفظه — سيعود إلى السابق على جهاز آخر.
        </p>
      )}
    </section>
  );
}
