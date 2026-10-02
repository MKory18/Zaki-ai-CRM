import { db as prisma } from './db';

/**
 * HOW LONG THIS GOVERNORATE ACTUALLY TAKES.
 *
 * «يتعلم السيستم خلال كم بصير التسليم لكل محافظة وعنوان، بحيث مستقبلاً لما
 * أدخل طلب بالمدينة والعنوان يعطيني خلال كم الفترة المتوقعة للاستلام».
 *
 * The system already had a number for this and it was not measured:
 * `deliveryFee.lateThresholdDays`, typed by hand and defaulting to 3 for
 * everywhere. It answers «when should I worry», which is a different
 * question from «what do I tell the customer», and a default of 3 tells
 * every customer the same thing whether they live in حلب or السويداء.
 *
 * Measured on this company when it was written: 119 delivered orders, every
 * one of them with both timestamps and a governorate. Eight governorates
 * carried 10–28 deliveries each; two carried one and two.
 *
 * WHICH IS WHY THERE IS A MINIMUM. A median of two deliveries is an
 * anecdote, and promising a customer a date computed from an anecdote is
 * worse than promising nothing. Below the minimum this says nothing at all
 * and the screen shows nothing — the same rule the store brief states:
 * «تحت الحد الأدنى للعيّنة بيختفي».
 */

/** Fewer deliveries than this and the median is an anecdote. */
export const MIN_DELIVERIES = 5;

export interface DeliveryWindow {
  /** The usual case. */
  medianDays: number;
  /** Where four out of five land, which is what a promise should use. */
  slowDays: number;
  /** How many real deliveries this is computed from. */
  samples: number;
}

/**
 * The median and the 80th percentile of a set of day-counts.
 *
 * Nearest-rank, not interpolated: these are whole days, and «1.6 days»
 * is not a thing anybody says to a customer. Pure, so the arithmetic can
 * be checked without a database.
 */
export function summariseDays(days: number[]): DeliveryWindow | null {
  const clean = days.filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b);
  if (clean.length < MIN_DELIVERIES) return null;
  const at = (q: number) => clean[Math.min(clean.length - 1, Math.ceil(q * clean.length) - 1)];
  return {
    medianDays: Math.round(at(0.5)),
    slowDays: Math.round(at(0.8)),
    samples: clean.length,
  };
}

/**
 * What a customer in this governorate has actually waited, per region.
 *
 * Read from delivered orders only, and from the two timestamps rather than
 * from any status: an order whose status was rolled back and forward still
 * left on one day and arrived on another.
 */
export async function deliveryWindows(scope: {
  companyId: string;
  storeId?: string | null;
  /** Deliveries older than this stop describing how the courier works now. */
  lookbackDays?: number;
}): Promise<Map<string, DeliveryWindow>> {
  const since = new Date(Date.now() - (scope.lookbackDays ?? 180) * 86_400_000);

  const rows = await prisma.order.findMany({
    where: {
      companyId: scope.companyId,
      ...(scope.storeId ? { storeId: scope.storeId } : {}),
      regionId: { not: null },
      shippedAt: { not: null, gte: since },
      deliveredAt: { not: null },
    },
    select: { regionId: true, shippedAt: true, deliveredAt: true },
  });

  const byRegion = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.regionId || !r.shippedAt || !r.deliveredAt) continue;
    const days = (r.deliveredAt.getTime() - r.shippedAt.getTime()) / 86_400_000;
    // A negative span is a clock or a correction, not a delivery.
    if (days < 0) continue;
    const list = byRegion.get(r.regionId) ?? [];
    list.push(days);
    byRegion.set(r.regionId, list);
  }

  const out = new Map<string, DeliveryWindow>();
  for (const [regionId, days] of byRegion) {
    const w = summariseDays(days);
    if (w) out.set(regionId, w);
  }

  /**
   * AND THE WHOLE COUNTRY, under `EVERYWHERE`.
   *
   * «إذا المحافظة مش معروفة، نطاق البلد». A visitor from a governorate
   * this shop has not delivered to five times yet is still owed an
   * answer, and the honest one is how long it takes in general — which
   * is a wider claim, so it is made only when the whole set clears the
   * same floor a single governorate has to clear.
   *
   * Computed from the rows already in hand: a second query over the same
   * delivered orders would be the same numbers, worked out twice.
   */
  const everywhere = summariseDays([...byRegion.values()].flat());
  if (everywhere) out.set(EVERYWHERE, everywhere);

  return out;
}

/**
 * The key the country-wide window is filed under.
 *
 * A reserved word rather than a second map: every caller already looks a
 * region up in this one, and a fallback that lived somewhere else would be
 * a fallback half the callers forget.
 */
export const EVERYWHERE = '*';

/**
 * The window to quote this visitor: their own governorate, else the
 * country, else nothing.
 *
 * Nothing is a real answer. A shop that has delivered four times has not
 * learned how long it takes, and «يصل خلال يومين» from four deliveries is
 * a promise made out of an anecdote — which the customer meets as a broken
 * one, at their door, four days later.
 */
export function windowFor(
  windows: Map<string, DeliveryWindow>,
  regionId: string | null | undefined
): DeliveryWindow | null {
  return (regionId ? windows.get(regionId) : null) ?? windows.get(EVERYWHERE) ?? null;
}

/**
 * The sentence, in the words a person says.
 *
 * One number when the usual and the slow case agree — «يوصل عادةً خلال يوم»
 * — and a range when they do not. Never a decimal, and never a promise the
 * sample cannot support, because there is no sentence at all below the
 * minimum.
 */
export function deliveryWindowAr(w: DeliveryWindow | null | undefined): string | null {
  if (!w) return null;
  const day = (n: number) => (n === 0 ? 'أقل من يوم' : n === 1 ? 'يوم' : n === 2 ? 'يومين' : `${n} أيام`);
  if (w.slowDays <= w.medianDays) return `يصل عادةً خلال ${day(w.medianDays)}`;
  return `يصل عادةً خلال ${day(w.medianDays)}، وحتى ${day(w.slowDays)} في الأبطأ`;
}
