'use client';

import React, { useEffect, useRef, useState } from 'react';
import { StarMark } from '@/components/ui/StarMark';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE MOMENT — TWELVE ORDERS, ONE PICTURE, AND A NUMBER THAT IS NOT SHRUGGING.
 *
 * Finishing one order is a click. Finishing thirty is a shift's worth of
 * work, and the product answered it with the same small green toast it
 * uses for «تم الحفظ» on a settings field. That is the whole reason this
 * exists: the completion of a BATCH gets one full-width picture, held for
 * two and a half seconds, then it fades and the screen is a screen again.
 *
 * ── THE RULES, AND WHY EACH ONE ──
 *
 *   · A BATCH IS TEN OR MORE. `MOMENT_MIN` is the floor and it lives HERE,
 *     not at each caller: a screen passes every batch that finished cleanly
 *     and this decides whether it was big enough to be a moment. Three
 *     labels printed is a click; a picture for it would be noise, and a
 *     reward that fires for everything stops being one by the second day.
 *   · ONCE PER BATCH. The key is the batch's own identity (`serial`), kept
 *     in a ref. A re-render — a tick, a filter, a parent that re-drew —
 *     must not re-play it: a picture that flashes again because somebody
 *     scrolled is a glitch, not a reward. Two batches, two plays. (The bar
 *     that renders this keeps it at ONE place in its tree for the same
 *     reason: a remount would forget the serial and replay it.)
 *   · 2.5 SECONDS, THEN A 0.4-SECOND FADE. Long enough to read the number,
 *     short enough that nobody waiting to type is blocked behind it. The
 *     timers belong to the PICTURE, not to the props: a parent that clears
 *     `done` or re-sends a different count mid-moment must not cancel the
 *     fade and leave the picture on screen for ever.
 *   · SETTLE, DO NOT PUNCH. It arrives at 1.06 and settles to 1 while it
 *     fades in. §8 of the series asked for «هدوء»; a zoom-in is an
 *     advertisement.
 *   · NO NEW STYLESHEET RULE. The first-load sheet has about a hundred
 *     bytes left under the ceiling `quality-gates.test.ts` enforces, so the
 *     motion is built from utilities the product already ships (`transition`,
 *     `opacity-0`, `opacity-100`) and the three numbers no shipped utility
 *     carries — the 1.06, the 400 ms and the house easing curve — ride as
 *     inline style, which costs the sheet nothing.
 *   · REDUCED MOTION IS ALREADY ANSWERED. `system.css` ends with the house
 *     `@media (prefers-reduced-motion: reduce)` block that pins every
 *     transition and animation to 1 ms with `!important` — and `!important`
 *     in a sheet beats inline style. So for somebody who asked for less
 *     motion the picture simply appears and leaves, and the star stands
 *     still. A `motion-reduce:` utility here would be a second, NEW rule
 *     saying the same thing, paid for out of the hundred bytes.
 *   · LATIN DIGITS. `ar-EG` would print ١٢, and the number here is a
 *     count, not prose: the column headers, the pagination and the totals
 *     are all Latin, and switching scripts for one sentence makes the
 *     quantity look like a different quantity.
 *   · ORNAMENT NEVER SITS BEHIND NUMBERS — the doctrine of
 *     `system-themes.ts`. The picture is a strip ABOVE the sentence, and the
 *     count sits on the card's own colour in the theme's own text colour,
 *     so it reads on all thirteen palettes without a veil or a shadow.
 *   · NO SOUND. Nothing in this product has ever made a noise.
 *   · IT IS NOT A DIALOG. No focus trap, no backdrop that eats the next
 *     click, `pointer-events-none`, `aria-live="polite"`. It reports; it
 *     does not interrupt. Somebody already on the keyboard keeps working.
 *     The live region itself is ALWAYS in the document (empty and zero
 *     high when idle): a region inserted together with its words is one a
 *     screen reader often never announces.
 *
 * The picture is decorative: `alt=""` and `aria-hidden` on the image, and
 * the sentence beside it carries the whole meaning.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** How long the picture is held before it starts to go. */
export const MOMENT_MS = 2500;
/** How long the fade takes. The element leaves after both. */
export const FADE_MS = 400;
/** The smallest batch that earns the picture. */
export const MOMENT_MIN = 10;
/**
 * One beat at the starting pose before it settles — the browser needs a
 * painted «from» to transition from, or the picture simply appears.
 */
export const SETTLE_MS = 30;

/** Where the picture starts: a hair larger, settling to its own size. */
const ARRIVE_SCALE = '1.06';

/**
 * The counted noun, by the rule Arabic counts by — it is read by people
 * who notice: 3–10 take the plural («10 طلبات»), 11–99 the singular
 * accusative («12 طلبًا»), and a round hundred or thousand the plain
 * singular («100 طلب»). Past a hundred the last two digits decide, the
 * way «103 طلبات» and «111 طلبًا» are said.
 */
export function ordersNoun(count: number): string {
  const tail = count % 100;
  if (tail >= 3 && tail <= 10) return 'طلبات';
  if (tail >= 11) return 'طلبًا';
  return 'طلب';
}

type Phase = 'arrive' | 'hold' | 'leave';

export function BulkDoneMoment({
  /** The batch's identity. A new value is a new batch; the same value never replays. */
  serial,
  count,
  /** Defaults to the brief's picture; overridable so the test is not about a path. */
  src = '/brand/themes/islamic-done.webp',
}: {
  serial: number | null;
  count: number | null;
  src?: string;
}) {
  const [shown, setShown] = useState<{ serial: number; count: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('arrive');
  const lastSerial = useRef<number | null>(null);

  useEffect(() => {
    if (serial === null || count === null || count < MOMENT_MIN) return;
    // Already played for THIS batch — a re-render is not a second finishing.
    if (lastSerial.current === serial) return;
    lastSerial.current = serial;
    setPhase('arrive');
    setShown({ serial, count });
  }, [serial, count]);

  /*
   * The clock is keyed on the picture being shown — a new object per batch —
   * and on nothing the parent sends, so only a NEW batch or the unmount can
   * stop it. A second batch inside the window restarts the clock for its
   * own picture, which is what «two batches, two plays» means.
   */
  useEffect(() => {
    if (!shown) return;
    const settle = setTimeout(() => setPhase('hold'), SETTLE_MS);
    const fade = setTimeout(() => setPhase('leave'), MOMENT_MS);
    const gone = setTimeout(() => setShown(null), MOMENT_MS + FADE_MS);
    return () => {
      clearTimeout(settle);
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [shown]);

  return (
    <div
      // Above the bulk bar (z-30) and the toasts, below nothing else.
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      aria-live="polite"
      role="status"
      data-bulk-moment={shown ? shown.serial : undefined}
    >
      {shown && (
        <div
          data-phase={phase}
          className={
            'm-3 w-full max-w-md overflow-hidden rounded-lg border border-[var(--sys-border)] ' +
            'bg-[var(--sys-card)] shadow-overlay transition ' +
            (phase === 'hold' ? 'opacity-100' : 'opacity-0')
          }
          style={{
            scale: phase === 'arrive' ? ARRIVE_SCALE : '1',
            transitionDuration: `${FADE_MS}ms`,
            transitionTimingFunction: 'var(--ease-standard)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" aria-hidden="true" decoding="async" className="block h-40 w-full object-cover" />
          <p className="flex items-center justify-center gap-2 px-4 py-3 text-lg font-bold text-[var(--sys-foreground)]">
            <StarMark size={20} className="text-[var(--sys-primary)]" />
            <span>
              <span className="tabular-nums">{String(shown.count)}</span> {ordersNoun(shown.count)} خلصوا
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
