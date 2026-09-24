import { db } from './db';
import { localDay, DEVICE_LABEL, type DeviceClass } from './landing-views';

/**
 * LANDING PAGE ANALYTICS FOR ONE DATE WINDOW — views, orders, conversion;
 * per page, per device, per campaign.
 *
 * Views come from the daily rows (landing_page_views); orders are the
 * orders that came through a landing page in the window, by the order's
 * own landingPageId, deviceClass and campaignId. The same window as every
 * other table on the performance screen.
 *
 * Conversion is orders ÷ views — and only the orders from days whose views
 * were counted. Views are counted from the day this shipped; a window that
 * reaches further back holds orders with no views behind them, and dividing
 * those by the views that were counted produced rates of 200%. So the
 * orders column is every order in the window, and the rate uses the ones
 * since counting began. With no counted views the rate is empty rather
 * than a number that is not true.
 */

export interface AnalyticsRow {
  key: string;
  label: string;
  hint?: string;
  views: number;
  orders: number;
  conversion: number | null;
}

export interface LandingAnalytics {
  /** The first day views were counted for this store, or null if none yet. */
  countingSince: string | null;
  totals: AnalyticsRow;
  byPage: AnalyticsRow[];
  byDevice: AnalyticsRow[];
  byCampaign: AnalyticsRow[];
}

export function conversionOf(views: number, orders: number): number | null {
  if (views <= 0) return null;
  return Math.round((orders / views) * 1000) / 10;
}

/** A local "yyyy-MM-dd" as the Date a DATE column compares with. */
const asDateColumn = (day: string) => new Date(`${day}T00:00:00.000Z`);

function row(key: string, label: string, views: number, orders: number, ordersCounted: number, hint?: string): AnalyticsRow {
  return { key, label, ...(hint ? { hint } : {}), views, orders, conversion: conversionOf(views, ordersCounted) };
}

/** Busiest first: the rows a seller acts on are the ones with traffic. */
const byWeight = (a: AnalyticsRow, b: AnalyticsRow) => b.orders - a.orders || b.views - a.views || a.label.localeCompare(b.label);

export async function landingAnalytics(scope: {
  companyId: string;
  storeId: string;
  start: Date;
  end: Date;
}): Promise<LandingAnalytics> {
  const { companyId, storeId, start, end } = scope;
  const viewWhere = {
    companyId,
    storeId,
    day: { gte: asDateColumn(localDay(start)), lte: asDateColumn(localDay(end)) },
  };
  const orderWhere = { companyId, storeId, landingPageId: { not: null }, createdAt: { gte: start, lte: end } };

  const first = await db.landingPageView.findFirst({
    where: { companyId, storeId },
    orderBy: { day: 'asc' },
    select: { day: true },
  });
  // The first counted day, as a local midnight — orders from then on have
  // views behind them. None counted yet: no order does.
  const countedFrom = first
    ? new Date(first.day.getUTCFullYear(), first.day.getUTCMonth(), first.day.getUTCDate())
    : null;
  const rateWhere = countedFrom
    ? { ...orderWhere, createdAt: { gte: countedFrom > start ? countedFrom : start, lte: end } }
    : null;
  const none = async () => [] as never[];

  const [viewsByPage, viewsByDevice, viewsByCampaign, ordersByPage, ordersByDevice, ordersByCampaign, ratePage, rateDevice, rateCampaign] =
    await Promise.all([
      db.landingPageView.groupBy({ by: ['landingPageId'], where: viewWhere, _sum: { count: true } }),
      db.landingPageView.groupBy({ by: ['device'], where: viewWhere, _sum: { count: true } }),
      db.landingPageView.groupBy({ by: ['campaignId'], where: viewWhere, _sum: { count: true } }),
      db.order.groupBy({ by: ['landingPageId'], where: orderWhere, _count: { _all: true } }),
      db.order.groupBy({ by: ['deviceClass'], where: orderWhere, _count: { _all: true } }),
      db.order.groupBy({ by: ['campaignId'], where: orderWhere, _count: { _all: true } }),
      rateWhere ? db.order.groupBy({ by: ['landingPageId'], where: rateWhere, _count: { _all: true } }) : none(),
      rateWhere ? db.order.groupBy({ by: ['deviceClass'], where: rateWhere, _count: { _all: true } }) : none(),
      rateWhere ? db.order.groupBy({ by: ['campaignId'], where: rateWhere, _count: { _all: true } }) : none(),
    ]);

  const sum = (rows: { _sum: { count: number | null } }[]) => rows.reduce((n, r) => n + (r._sum.count ?? 0), 0);
  const cnt = (rows: { _count: { _all: number } }[]) => rows.reduce((n, r) => n + r._count._all, 0);

  // ── per page ──
  const pageIds = [...new Set([
    ...viewsByPage.map((r) => r.landingPageId),
    ...ordersByPage.map((r) => r.landingPageId).filter((id): id is string => !!id),
  ])];
  const pages = pageIds.length
    ? await db.landingPage.findMany({ where: { id: { in: pageIds }, companyId }, select: { id: true, name: true, slug: true } })
    : [];
  const byPage = pageIds.map((id) => {
    const p = pages.find((x) => x.id === id);
    return row(
      id,
      p?.name ?? 'صفحة محذوفة',
      viewsByPage.find((r) => r.landingPageId === id)?._sum.count ?? 0,
      ordersByPage.find((r) => r.landingPageId === id)?._count._all ?? 0,
      ratePage.find((r) => r.landingPageId === id)?._count._all ?? 0,
      p ? `/lp/${p.slug}` : undefined
    );
  }).sort(byWeight);

  // ── per device ──
  const devices: (DeviceClass | null)[] = ['mobile', 'desktop', 'tablet'];
  const byDevice = devices
    .map((d) => row(
      d as string,
      DEVICE_LABEL[d as DeviceClass],
      viewsByDevice.find((r) => r.device === d)?._sum.count ?? 0,
      ordersByDevice.find((r) => r.deviceClass === d)?._count._all ?? 0,
      rateDevice.find((r) => r.deviceClass === d)?._count._all ?? 0
    ));
  // Orders from before the device was recorded: shown, so the rows add up.
  const unknownOrders = ordersByDevice.find((r) => r.deviceClass === null)?._count._all ?? 0;
  if (unknownOrders) byDevice.push(row('unknown', 'غير مسجَّل', 0, unknownOrders, 0, 'طلبات من قبل تسجيل نوع الجهاز'));

  // ── per campaign ──
  const campaignIds = [...new Set([
    ...viewsByCampaign.map((r) => r.campaignId).filter((id) => id !== ''),
    ...ordersByCampaign.map((r) => r.campaignId).filter((id): id is string => !!id),
  ])];
  const campaigns = campaignIds.length
    ? await db.campaign.findMany({ where: { id: { in: campaignIds }, companyId }, select: { id: true, name: true, code: true } })
    : [];
  const byCampaign = campaignIds.map((id) => {
    const c = campaigns.find((x) => x.id === id);
    return row(
      id,
      c?.name ?? 'حملة محذوفة',
      viewsByCampaign.find((r) => r.campaignId === id)?._sum.count ?? 0,
      ordersByCampaign.find((r) => r.campaignId === id)?._count._all ?? 0,
      rateCampaign.find((r) => r.campaignId === id)?._count._all ?? 0,
      c ? `?c=${c.code}` : undefined
    );
  }).sort(byWeight);
  const direct = row(
    'none',
    'بلا حملة',
    viewsByCampaign.find((r) => r.campaignId === '')?._sum.count ?? 0,
    ordersByCampaign.find((r) => r.campaignId === null)?._count._all ?? 0,
    rateCampaign.find((r) => r.campaignId === null)?._count._all ?? 0,
    'زيارات وطلبات لم تأتِ من رابط حملة'
  );
  if (direct.views || direct.orders) byCampaign.push(direct);

  return {
    countingSince: first ? first.day.toISOString().slice(0, 10) : null,
    totals: row('all', 'الكل', sum(viewsByPage), cnt(ordersByPage), cnt(ratePage)),
    byPage,
    byDevice,
    byCampaign,
  };
}
