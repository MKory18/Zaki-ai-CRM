'use client';

import React, { useEffect, useRef, useState } from 'react';

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
 *   · ONCE PER BATCH. The key is the batch's own identity (`serial`), kept
 *     in a ref. A re-render — a tick, a filter, a parent that re-drew —
 *     must not re-play it: a picture that flashes again because somebody
 *     scrolled is a glitch, not a reward. Two batches, two plays.
 *   · 2.5 SECONDS, THEN FADE. Long enough to read the number, short
 *     enough that nobody waiting to type is blocked behind it.
 *   · ZOOM OUT, slightly — 1.06 → 1. Settling, not punching. §8 of the
 *     series asked for «هدوء»; a zoom-in is an advertisement.
 *   · LATIN DIGITS. `ar-EG` would print ١٢, and the number here is a
 *     count, not prose: the column headers, the pagination and the totals
 *     are all Latin, and switching scripts for one sentence makes the
 *     quantity look like a different quantity.
 *   · NO SOUND. Nothing in this product has ever made a noise.
 *   · IT IS NOT A DIALOG. No focus trap, no backdrop that eats the next
 *     click, `pointer-events-none`, `aria-live="polite"`. It reports; it
 *     does not interrupt. Somebody already on the keyboard keeps working.
 *
 * The picture is decorative: `alt=""` and `aria-hidden` on the image, and
 * the sentence beside it carries the whole meaning.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** How long the picture is held before it starts to go. */
export const MOMENT_MS = 2500;
/** How long the fade takes. The element leaves after both. */
export const FADE_MS = 400;

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
  const lastSerial = useRef<number | null>(null);

  useEffect(() => {
    if (serial === null || count === null || count <= 0) return;
    // Already played for THIS batch — a re-render is not a second finishing.
    if (lastSerial.current === serial) return;
    lastSerial.current = serial;
    setShown({ serial, count });

    const hold = setTimeout(() => setShown(null), MOMENT_MS + FADE_MS);
    return () => clearTimeout(hold);
  }, [serial, count]);

  if (!shown) return null;

  return (
    <div
      // Above the bulk bar (z-30) and the toasts, below nothing else.
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-0 pt-0"
      aria-live="polite"
      role="status"
      data-bulk-moment={shown.serial}
    >
      <div className="zk-moment w-full max-w-3xl overflow-hidden rounded-b-2xl border-b border-[var(--sys-border)] shadow-lg">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            aria-hidden="true"
            className="block h-40 w-full object-cover sm:h-52"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <p className="text-center text-lg font-bold text-white drop-shadow sm:text-2xl">
              <span className="tabular-nums">{shown.count}</span>
              {' '}
              طلباً خلصوا
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
