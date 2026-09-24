/**
 * HOW LONG A SHIPMENT HAS BEEN OUT, AND HOW TO SAY SO.
 *
 * Pure, and deliberately in a file of its own: the tracking screen runs in
 * the browser and needs the same words the server uses. Living beside the
 * delivery-fee code meant importing the database client to count days,
 * which would have shipped Prisma to every operator's browser.
 */

/**
 * "N days" in Arabic, agreeing with the number.
 *
 * Arabic does not pluralise by adding a letter: one day, two days, three to
 * ten days and eleven-plus days are four different words. "متأخرة 15 أيام"
 * is what a template produces and what no Arabic speaker writes, and on a
 * screen agents read all day it reads as a system that does not speak
 * their language.
 */
export function arabicDays(n: number): string {
  if (n === 1) return 'يوماً واحداً';
  if (n === 2) return 'يومين';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

/**
 * The late label, said once for the whole system.
 *
 * FROM THE SHIPPING DATE, always. An order that sat unconfirmed for a week
 * and shipped yesterday is one day late for the courier, not eight — and
 * measuring from creation blamed the courier for the confirmation queue.
 */
export function lateLabel(daysSinceShipping: number): string {
  return `متأخرة ${arabicDays(daysSinceShipping)} من تاريخ الشحن`;
}

/** Days a shipment has been in transit, and whether that passes the region's threshold. */
export function transitStatus(shippedAt: Date | string | null, lateThresholdDays: number, now = new Date()) {
  if (!shippedAt) return { days: null as number | null, late: false };
  const days = Math.floor((now.getTime() - new Date(shippedAt).getTime()) / (24 * 60 * 60 * 1000));
  return { days, late: lateThresholdDays > 0 && days > lateThresholdDays };
}
