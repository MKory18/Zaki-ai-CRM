/**
 * ═══════════════════════════════════════════════════════════════════════
 * WHEN A DAY BEGINS, IN ONE PLACE.
 *
 * `«2026-09-21»` parses as midnight UTC. Compared against a window built
 * from `new Date(y, m, d)` — midnight here — the two halves of the same
 * question disagree by the offset, and in Amman that is three hours in
 * which an order belongs to yesterday on one screen and today on another.
 *
 * These three lived inside `analytics.ts` as private functions. «أكّدتها»
 * needs the same answer for its day picker, and a second copy of a date
 * boundary is how two screens come to disagree about what «اليوم» means.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** `yyyy-MM-dd` → that day's first instant locally. Null for anything else. */
export function startOfLocalDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** `yyyy-MM-dd` → that day's last instant locally. Null for anything else. */
export function endOfLocalDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999) : null;
}

/**
 * A moment → the `yyyy-MM-dd` of the day it fell on, locally.
 *
 * Not `toISOString().slice(0, 10)`: that is the UTC day, so for three
 * hours of every Amman evening it names tomorrow — and the screen would
 * default its day picker to a day that has not started yet.
 */
export function localDayKey(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}
