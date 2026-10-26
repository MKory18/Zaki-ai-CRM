import { getDateRange, type DateFilter } from './analytics';

/**
 * THE WINDOW THE CAMPAIGNS SCREEN READS — «ضروري يكون في تواريخ».
 *
 * Measured on production: the screen sent `this_month` and `last_30`, the server knew neither, and both fell through
 * to the 90-day safety window — «هذا الشهر» and «آخر 30 يوماً» showed the same last 90 days, and «كل الوقت» was
 * capped at 90 days too. Here the screen's keys are the server's, the two old spellings still mean what they said,
 * «كل الوقت» is the whole history, and a picked range is the WHOLE of both days, however long it is.
 */

export const CAMPAIGN_PERIODS = ['today', 'yesterday', '7d', '30d', 'month', 'last_month', 'all'] as const;
export type CampaignPeriod = (typeof CAMPAIGN_PERIODS)[number];

const LEGACY: Record<string, CampaignPeriod> = { this_month: 'month', last_30: '30d' };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function campaignWindow(q: URLSearchParams): { start?: Date; end?: Date } {
  const from = q.get('startDate');
  const to = q.get('endDate');
  if (from && to && DAY.test(from) && DAY.test(to)) {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59.999`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) return { start, end };
  }
  const raw = q.get('period') || 'month';
  const period = (LEGACY[raw] ?? raw) as CampaignPeriod;
  if (period === 'all') return {};
  if (!(CAMPAIGN_PERIODS as readonly string[]).includes(period)) return getDateRange({ period: 'month' });
  return getDateRange({ period: period as DateFilter['period'] });
}
