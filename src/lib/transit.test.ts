import { describe, it, expect } from 'vitest';
import { arabicDays, lateLabel, transitStatus } from './transit';

describe('arabicDays — the number decides the word', () => {
  it('uses the four forms Arabic actually has', () => {
    expect(arabicDays(1)).toBe('يوماً واحداً');
    expect(arabicDays(2)).toBe('يومين');
    expect(arabicDays(3)).toBe('3 أيام');
    expect(arabicDays(10)).toBe('10 أيام');
    expect(arabicDays(11)).toBe('11 يوماً');
    expect(arabicDays(45)).toBe('45 يوماً');
  });

  it('never produces the template Arabic nobody writes', () => {
    // "15 أيام" is what a string template gives and what no reader accepts.
    for (let n = 11; n <= 100; n++) expect(arabicDays(n)).not.toContain('أيام');
  });
});

describe('lateLabel', () => {
  it('always names the shipping date as the starting point', () => {
    expect(lateLabel(4)).toBe('متأخرة 4 أيام من تاريخ الشحن');
    expect(lateLabel(12)).toBe('متأخرة 12 يوماً من تاريخ الشحن');
    expect(lateLabel(2)).toContain('من تاريخ الشحن');
  });
});

describe('transitStatus — measured from shipping, never creation', () => {
  const now = new Date('2026-09-24T12:00:00Z');

  it('counts from the day it left, not the day it was ordered', () => {
    // Ordered a week ago, shipped yesterday: ONE day in transit. Measuring
    // from creation would have called it eight and blamed the courier for
    // the confirmation queue.
    const shippedYesterday = new Date('2026-09-23T12:00:00Z');
    expect(transitStatus(shippedYesterday, 5, now)).toEqual({ days: 1, late: false });
  });

  it('is not late at all before it ships', () => {
    expect(transitStatus(null, 3, now)).toEqual({ days: null, late: false });
  });

  it('passes the threshold only after it is exceeded', () => {
    const shipped = new Date('2026-09-18T12:00:00Z');
    expect(transitStatus(shipped, 6, now)).toEqual({ days: 6, late: false });
    expect(transitStatus(shipped, 5, now)).toEqual({ days: 6, late: true });
  });

  it('never calls anything late when the region sets no threshold', () => {
    expect(transitStatus(new Date('2026-01-01'), 0, now).late).toBe(false);
  });
});
