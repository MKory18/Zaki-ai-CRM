import type { BusinessCalendar } from './business-calendar';

/**
 * WHEN THIS PERSON STARTS, AND WHEN THEY HAND OVER.
 *
 * The system measured lateness against the COUNTRY's work hours, which is
 * right for a shop where everybody comes at nine and wrong for every shop
 * that has ever run two shifts. Somebody who genuinely starts at noon read
 * as three hours late every day of their life, and every number built on
 * that — the attendance table, and now any penalty — was wrong in the same
 * direction, quietly, forever.
 *
 * So a person may have their own hours and their own rest days. Null means
 * the country's, which is what everybody has today: setting a shift is a
 * deliberate act, and until somebody performs it nothing moves.
 */

export interface PersonShift {
  shiftStart: string | null;
  shiftEnd: string | null;
  /** Comma-separated weekday numbers, 0 = Sunday. */
  restDays: string | null;
}

/** "HH:mm", or null if it is not one. Nothing half-parsed is ever stored. */
export function parseHhMm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Rest days as a clean, sorted, duplicate-free list — or null for "theirs
 * is the country's".
 *
 * An empty list is NOT null: somebody who rests on no day is a real
 * arrangement, and collapsing it to "use the country's" would quietly give
 * them a weekend they do not have.
 */
export function parseRestDays(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const days = [...new Set(raw.map((d) => Number(String(d).trim())).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  return days.sort((a, b) => a - b).join(',');
}

/**
 * The calendar THIS person is measured by.
 *
 * Field by field, so a person with a start time but no end time keeps the
 * country's end rather than losing it — half a shift set is a half-filled
 * form, not an instruction to forget the rest.
 *
 * A shift that ends before it starts is ignored entirely and the country's
 * hours stand: an inverted window would make every working minute zero,
 * and a person measured as having worked no minutes at all looks like a
 * person who did nothing.
 */
export function shiftCalendar(person: PersonShift | null | undefined, country: BusinessCalendar): BusinessCalendar {
  if (!person) return country;

  const start = parseHhMm(person.shiftStart) ?? country.workHoursStart;
  const end = parseHhMm(person.shiftEnd) ?? country.workHoursEnd;
  const rest = parseRestDays(person.restDays);

  const ordered = end > start;
  return {
    workHoursStart: ordered ? start : country.workHoursStart,
    workHoursEnd: ordered ? end : country.workHoursEnd,
    weekendDays: rest === null ? country.weekendDays : rest === '' ? [] : rest.split(',').map(Number),
    timezone: country.timezone,
  };
}

/** True when this person has hours of their own at all. */
export function hasOwnShift(person: PersonShift | null | undefined): boolean {
  if (!person) return false;
  return !!(parseHhMm(person.shiftStart) || parseHhMm(person.shiftEnd) || parseRestDays(person.restDays) !== null);
}
