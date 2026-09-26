'use client';

import React from 'react';
import clsx from 'clsx';
import { moneyText } from '@/lib/money';

/**
 * EVERY FIGURE IN THE PRODUCT, DRAWN THE SAME WAY.
 *
 * Money was printed five different ways: ninety-one bare `.toFixed(2)`,
 * twenty `toLocaleString()`, and sixteen calls to one of the two shared
 * helpers. So the same amount appeared as «37.5», «37.50», «37.500 JOD» and
 * «٣٧٫٥٠٠» depending on which screen somebody happened to be on — and
 * nowhere at all with a thousands separator, which is the one thing that
 * makes «1500000» and «150000» tell themselves apart at a glance.
 *
 * ALIGNED, BECAUSE A COLUMN OF MONEY IS READ DOWNWARDS.
 *
 * `tabular-nums` gives every digit the same width, so the decimal points in
 * a list line up without a table cell to hold them. `dir="ltr"` pins the
 * currency code after the number: in a right-to-left paragraph a bare
 * «37,500 JOD» can reorder itself to «JOD 37,500», and it does so on some
 * screens and not others.
 *
 * TONE IS FOR A FIGURE THAT MEANS SOMETHING, NOT FOR EVERY FIGURE.
 *
 * A total is just a total. `tone="owed"` is for an amount somebody still
 * has to collect, `tone="lost"` for one that will not arrive. Left alone,
 * money is the colour of the text around it — which is what keeps the two
 * that are coloured worth noticing.
 */
export function Money({
  value,
  currency,
  minorUnit = 2,
  tone,
  size = 'inherit',
  className,
}: {
  value: number | string | null | undefined;
  /** The store's currency code. Absent prints the number bare, never a guess. */
  currency?: string | null;
  minorUnit?: number;
  tone?: 'owed' | 'lost' | 'collected';
  /** `figure` is the large tabular number a KPI leads with. */
  size?: 'inherit' | 'figure';
  className?: string;
}) {
  const n = Number(value ?? 0);
  const text = moneyText(Number.isFinite(n) ? n : 0, currency, minorUnit);

  return (
    <span
      dir="ltr"
      className={clsx(
        'tabular-nums whitespace-nowrap',
        size === 'figure' && 'text-display font-bold leading-none',
        tone === 'owed' && 'text-[var(--sys-warning)]',
        tone === 'lost' && 'text-[var(--sys-destructive)]',
        tone === 'collected' && 'text-[var(--sys-success)]',
        className
      )}
    >
      {text}
    </span>
  );
}
