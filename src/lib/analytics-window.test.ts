import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ db: {} }));

import { getDateRange } from './analytics';

/**
 * What "الكل" covers.
 *
 * It was computed as clampStart(todayStart) — and clamping TODAY against a
 * minimum of ninety-days-ago returns today, because today is not earlier
 * than it. So the period labelled "الكل" was the last twenty-four hours, and
 * every headline figure on the dashboard and the performance screen was a
 * day's worth of business wearing the word "all".
 *
 * On live data it read zero: a hundred and forty-six orders taken yesterday
 * were outside a window that began this morning.
 */

const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

describe('the analytics window', () => {
  it('reaches back the full ninety days for "الكل"', () => {
    const { start, end } = getDateRange({ period: 'all' });
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    expect(days(start!, end!)).toBeGreaterThanOrEqual(89);
  });

  it('includes what happened yesterday', () => {
    // The failure that started this: yesterday's orders were not in "all".
    const { start, end } = getDateRange({ period: 'all' });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(yesterday >= start!).toBe(true);
    expect(yesterday <= end!).toBe(true);
  });

  it('keeps "today" to today', () => {
    const { start, end } = getDateRange({ period: 'today' });
    // Same calendar day, start of it to the end of it.
    expect(start!.toDateString()).toBe(end!.toDateString());
    expect(start!.getHours()).toBe(0);
  });

  it('still refuses to reach further back than the safety window', () => {
    // An explicit range from years ago is pulled forward, not honoured.
    const { start } = getDateRange({
      period: 'custom' as never,
      startDate: '2020-01-01',
      endDate: new Date().toISOString().slice(0, 10),
    });
    const ninetyAgo = new Date();
    ninetyAgo.setDate(ninetyAgo.getDate() - 91);
    expect(start! >= ninetyAgo).toBe(true);
  });

  it('honours a short explicit range exactly', () => {
    const { start, end } = getDateRange({ startDate: '2026-09-01', endDate: '2026-09-07' });
    expect(start!.getFullYear()).toBe(2026);
    expect(start!.getMonth()).toBe(8);
    expect(start!.getDate()).toBe(1);
    expect(end!.getDate()).toBe(7);
  });

  it('gives a single picked day its whole 24 hours', () => {
    // Picking one day used to return midnight-to-midnight — a window of
    // zero width — and every figure on the screen came back zero.
    const { start, end } = getDateRange({ startDate: '2026-09-21', endDate: '2026-09-21' });
    expect(start!.getHours()).toBe(0);
    expect(end!.getHours()).toBe(23);
    expect(end!.getTime() - start!.getTime()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it('reads a picked day in the reader’s own time, not UTC', () => {
    // The period branches build local dates; an explicit range that parsed
    // as UTC meant the two halves disagreed about when a day begins.
    const { start } = getDateRange({ startDate: '2026-09-21', endDate: '2026-09-21' });
    const local = new Date(2026, 8, 21);
    expect(start!.getTime()).toBe(local.getTime());
  });

  it('never returns a window that ends before it starts', () => {
    for (const period of ['today', 'yesterday', '7d', '30d', 'month', 'last_month', 'all'] as const) {
      const { start, end } = getDateRange({ period });
      expect(start!.getTime(), period).toBeLessThanOrEqual(end!.getTime());
    }
  });
});
