import { describe, expect, it } from 'vitest';
import {
  addBusinessMinutes,
  businessMinutesBetween,
  isWithinBusinessHours,
  zonedTimeToInstant,
} from './business-calendar';

/** SLA counters freeze outside work hours and on weekend days. */

const JO = { workHoursStart: '09:00', workHoursEnd: '17:00', weekendDays: [5, 6], timezone: 'Asia/Amman' };
const at = (y: number, m: number, d: number, hh: number, mm: number) => zonedTimeToInstant(JO.timezone, y, m, d, hh, mm);

describe('businessMinutesBetween', () => {
  it('counts plain minutes inside one working day', () => {
    expect(businessMinutesBetween(at(2026, 9, 20, 10, 0), at(2026, 9, 20, 12, 30), JO)).toBe(150);
  });

  it('stops counting after closing time', () => {
    // 16:30 -> 18:30 on the same day = 30 business minutes
    expect(businessMinutesBetween(at(2026, 9, 20, 16, 30), at(2026, 9, 20, 18, 30), JO)).toBe(30);
  });

  it('skips the weekend entirely', () => {
    // Thursday 16:30 -> Sunday 09:30, with Friday and Saturday off
    expect(businessMinutesBetween(at(2026, 9, 17, 16, 30), at(2026, 9, 20, 9, 30), JO)).toBe(60);
  });

  it('is zero for a window that lies fully inside the weekend', () => {
    expect(businessMinutesBetween(at(2026, 9, 18, 10, 0), at(2026, 9, 19, 16, 0), JO)).toBe(0);
  });

  it('is zero when end precedes start', () => {
    expect(businessMinutesBetween(at(2026, 9, 20, 12, 0), at(2026, 9, 20, 10, 0), JO)).toBe(0);
  });

  it('follows a different country calendar', () => {
    const sy = { workHoursStart: '10:00', workHoursEnd: '18:00', weekendDays: [5], timezone: 'Asia/Damascus' };
    const start = zonedTimeToInstant(sy.timezone, 2026, 9, 17, 17, 0);
    const end = zonedTimeToInstant(sy.timezone, 2026, 9, 19, 11, 0); // Saturday is a work day here
    expect(businessMinutesBetween(start, end, sy)).toBe(60 + 60);
  });
});

describe('addBusinessMinutes', () => {
  it('lands inside the same day when there is room', () => {
    const out = addBusinessMinutes(at(2026, 9, 20, 10, 0), 90, JO);
    expect(out.getTime()).toBe(at(2026, 9, 20, 11, 30).getTime());
  });

  it('carries the remainder into the next working day', () => {
    // Thursday 16:30 + 90 business minutes -> Sunday 10:00 (Fri/Sat off)
    const out = addBusinessMinutes(at(2026, 9, 17, 16, 30), 90, JO);
    expect(out.getTime()).toBe(at(2026, 9, 20, 10, 0).getTime());
  });
});

describe('isWithinBusinessHours', () => {
  it('is false on a weekend day and outside hours', () => {
    expect(isWithinBusinessHours(at(2026, 9, 18, 11, 0), JO)).toBe(false);
    expect(isWithinBusinessHours(at(2026, 9, 20, 7, 0), JO)).toBe(false);
    expect(isWithinBusinessHours(at(2026, 9, 20, 11, 0), JO)).toBe(true);
  });
});
