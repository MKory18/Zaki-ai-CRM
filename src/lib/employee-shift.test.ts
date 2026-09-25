import { describe, expect, it } from 'vitest';
import { hasOwnShift, parseHhMm, parseRestDays, shiftCalendar } from './employee-shift';

/**
 * THE NOON SHIFT.
 *
 * Lateness was measured against the COUNTRY's work hours. Somebody whose
 * day genuinely begins at noon therefore read as three hours late every
 * single day, and their attendance record said so for as long as they
 * worked here. Once a deduction is calculated from that figure, the
 * mistake stops being cosmetic and starts taking money.
 *
 * The property that matters most below is the boring one: an employee with
 * no shift set must be measured EXACTLY as they were before shifts existed.
 * A migration that quietly re-times everybody is not a feature.
 */

const COUNTRY = {
  workHoursStart: '09:00',
  workHoursEnd: '17:00',
  weekendDays: [5, 6],
  timezone: 'Asia/Damascus',
};

describe('nobody with a shift set', () => {
  it('is measured exactly as before — the country’s hours and weekend', () => {
    expect(shiftCalendar({ shiftStart: null, shiftEnd: null, restDays: null }, COUNTRY)).toEqual(COUNTRY);
  });

  it('and a person with no row at all is the same', () => {
    expect(shiftCalendar(null, COUNTRY)).toEqual(COUNTRY);
    expect(shiftCalendar(undefined, COUNTRY)).toEqual(COUNTRY);
  });

  it('which is what `hasOwnShift` reports', () => {
    expect(hasOwnShift({ shiftStart: null, shiftEnd: null, restDays: null })).toBe(false);
    expect(hasOwnShift({ shiftStart: '12:00', shiftEnd: null, restDays: null })).toBe(true);
  });
});

describe('a person with their own hours', () => {
  it('is measured by them', () => {
    const cal = shiftCalendar({ shiftStart: '12:00', shiftEnd: '20:00', restDays: null }, COUNTRY);
    expect(cal.workHoursStart).toBe('12:00');
    expect(cal.workHoursEnd).toBe('20:00');
  });

  it('keeps the country’s other end when only one is set', () => {
    // Half a form filled is not an instruction to forget the rest.
    const cal = shiftCalendar({ shiftStart: '12:00', shiftEnd: null, restDays: null }, COUNTRY);
    expect(cal.workHoursStart).toBe('12:00');
    expect(cal.workHoursEnd).toBe('17:00');
  });

  it('and always the country’s timezone — a shift is hours, not a place', () => {
    const cal = shiftCalendar({ shiftStart: '12:00', shiftEnd: '20:00', restDays: '0' }, COUNTRY);
    expect(cal.timezone).toBe('Asia/Damascus');
  });
});

describe('their own rest days', () => {
  it('replace the country’s weekend', () => {
    // A night shift does not rest on Friday.
    expect(shiftCalendar({ shiftStart: null, shiftEnd: null, restDays: '1,2' }, COUNTRY).weekendDays).toEqual([1, 2]);
  });

  it('an EMPTY list is a real arrangement, not "use the country’s"', () => {
    // Collapsing it would quietly hand somebody a weekend they do not have,
    // and every one of those days would stop counting as late.
    expect(shiftCalendar({ shiftStart: null, shiftEnd: null, restDays: '' }, COUNTRY).weekendDays).toEqual([5, 6]);
    expect(parseRestDays([])).toBe('');
  });
});

describe('what it refuses to believe', () => {
  it('a shift that ends before it starts — the country’s hours stand', () => {
    // An inverted window makes every working minute zero, and somebody who
    // worked no minutes at all looks like somebody who did nothing.
    const cal = shiftCalendar({ shiftStart: '20:00', shiftEnd: '08:00', restDays: null }, COUNTRY);
    expect(cal.workHoursStart).toBe('09:00');
    expect(cal.workHoursEnd).toBe('17:00');
  });

  it('a time that is not a time', () => {
    expect(parseHhMm('noon')).toBeNull();
    expect(parseHhMm('25:00')).toBeNull();
    expect(parseHhMm('12:60')).toBeNull();
    expect(parseHhMm('')).toBeNull();
    expect(parseHhMm(12)).toBeNull();
  });

  it('but accepts a single-digit hour and pads it', () => {
    expect(parseHhMm('9:30')).toBe('09:30');
  });

  it('a weekday that is not a weekday, and a day listed twice', () => {
    expect(parseRestDays('9,1,1,-2,x')).toBe('1');
  });

  it('and sorts them, so two identical arrangements compare equal', () => {
    expect(parseRestDays('6,0,3')).toBe('0,3,6');
  });
});
