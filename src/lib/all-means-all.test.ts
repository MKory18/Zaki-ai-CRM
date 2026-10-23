import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDateRange, reportRange } from './analytics';

/**
 * «الكل مش اخر 90 يوم» — the owner, 23/10, over a dashboard that said «الكل»
 * and counted 12,449 of 17,328 orders. On the screens that read the profit
 * engine, «الكل» is the whole history; everywhere else the safety window
 * that `getDateRange` keeps is unchanged.
 */
describe('«الكل» on the dashboard is every order', () => {
  it('has no start and no end', () => {
    expect(reportRange({ period: 'all' })).toEqual({});
    expect(reportRange({})).toEqual({});
  });

  it('a named period is still that period', () => {
    expect(reportRange({ period: '30d' })).toEqual(getDateRange({ period: '30d' }));
    expect(reportRange({ period: 'month' }).start).toBeInstanceOf(Date);
  });

  it('two picked dates are still a window, even under «all»', () => {
    const r = reportRange({ period: 'all', startDate: '2026-10-01', endDate: '2026-10-05' });
    expect(r.start).toBeInstanceOf(Date);
    expect(r.end).toBeInstanceOf(Date);
  });

  it('and getDateRange itself keeps its safety window for the screens that read it as a span', () => {
    expect(getDateRange({ period: 'all' }).start).toBeInstanceOf(Date);
  });

  it('the profit engine and the dashboard route both read the whole history', () => {
    const lib = readFileSync(join(process.cwd(), 'src/lib/analytics.ts'), 'utf8');
    const route = readFileSync(join(process.cwd(), 'src/app/api/analytics/route.ts'), 'utf8');
    expect(lib).toContain('window ?? reportRange(filter)');
    expect(route).toContain('reportRange(filter)');
    expect(route).not.toMatch(/getDateRange\(filter\)/);
  });
});
