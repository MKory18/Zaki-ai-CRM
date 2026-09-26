'use client';

import { RiCloseLine } from '@remixicon/react';

/**
 * THE ✕ THAT CLOSES A MESSAGE — ONCE, NOT SIX TIMES.
 *
 * Six screens had written this by hand, and all six had written the same
 * three faults into it:
 *
 *   — the mark was the CHARACTER «✕», drawn by whatever font the device
 *     loaded rather than by the icon set, so it never matched the stroke of
 *     the icons around it;
 *   — it had no accessible name, so a screen reader announced a button and
 *     then nothing about what it does;
 *   — and it was about 12px by 16px of tappable area. A thumb is wider than
 *     that, which is why dismissing a banner on a phone took two or three
 *     tries — and the second try often landed on whatever was behind it.
 *
 * So the target here is 44px, the size a finger actually is, while the mark
 * inside it stays small: `-m-2 p-2` grows the hit area outwards without
 * moving the glyph or pushing the text of the banner around it.
 */
export function DismissButton({
  onClick,
  label = 'إغلاق',
  className = '',
}: {
  onClick: () => void;
  /** What it closes, for anyone who cannot see that it is an ✕. */
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`-m-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg opacity-60 transition-opacity hover:opacity-100 ${className}`}
    >
      <RiCloseLine className="h-4 w-4" aria-hidden />
    </button>
  );
}
