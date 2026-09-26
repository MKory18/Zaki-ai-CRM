'use client';

import React from 'react';
import clsx from 'clsx';
import { moneyText } from '@/lib/money';
import { useStoreCurrency } from '@/context/StoreCurrency';

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
  minorUnit,
  tone,
  size = 'inherit',
  className,
}: {
  value: number | string | null | undefined;
  /**
   * Usually omitted: the selected store's currency is the default, taken
   * from the shell. Pass one only for a figure that is genuinely in
   * another currency — and outside the shell there is no default, so an
   * amount prints bare rather than dressed in a code that might be wrong.
   */
  currency?: string | null;
  minorUnit?: number;
  tone?: 'owed' | 'lost' | 'collected';
  /** `figure` is the large tabular number a KPI leads with. */
  size?: 'inherit' | 'figure';
  className?: string;
}) {
  const store = useStoreCurrency();
  const n = Number(value ?? 0);
  // `currency === null` is a deliberate "print it bare"; `undefined` means
  // "whatever this store is in".
  const code = currency !== undefined ? currency : store?.code ?? null;
  const digits = minorUnit ?? (currency !== undefined ? 2 : store?.minorUnit ?? 2);
  const text = moneyText(Number.isFinite(n) ? n : 0, code, digits);

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
