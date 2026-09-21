import { format } from 'date-fns';
import { ar as arLocale } from 'date-fns/locale';

/**
 * One way to write a date and one way to write money.
 *
 * The screens had drifted into three of each: the orders list printed
 * "Sep 20, 2026", the order inside it printed "20 September 2026 — 8:39 PM",
 * and the shipping section printed "20 Sep, 8:40 PM" — in an Arabic,
 * right-to-left interface. Money was worse: the list showed "25.00 USD" from
 * the store's own currency while the same order, opened, showed "$٢٥٫٠٠" —
 * a hard-coded dollar sign and Arabic-Indic digits, on a store whose
 * currency might be JOD.
 *
 * Numbers stay Latin on purpose. They sit next to tracking numbers, phone
 * numbers and order references, all of which are Latin, and an Arabic-Indic
 * total in that company reads as a different kind of thing entirely.
 */

/** 20 سبتمبر 2026 · 20:39 — the long form, for a header. */
export function arDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'd MMMM yyyy · HH:mm', { locale: arLocale });
}

/** 20 سبتمبر · 20:39 — the short form, for a timeline row. */
export function arDateShort(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'd MMM · HH:mm', { locale: arLocale });
}

/** 20 سبتمبر 2026 — a day with no time. */
export function arDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'd MMMM yyyy', { locale: arLocale });
}

export interface Currency {
  code: string;
  minorUnit: number;
}

/**
 * 25.00 USD — the store's currency, never a guessed one.
 *
 * Without a currency the amount is printed bare rather than dressed in a
 * symbol that might be wrong; a missing currency is a loading state, not a
 * licence to assume dollars.
 */
export function amount(value: number | string | null | undefined, currency?: Currency | null): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const digits = currency?.minorUnit ?? 2;
  const text = safe.toFixed(digits);
  return currency?.code ? `${text} ${currency.code}` : text;
}

/** 20:39 — a clock time on its own, for a lock that expires today. */
export function arTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'HH:mm');
}
