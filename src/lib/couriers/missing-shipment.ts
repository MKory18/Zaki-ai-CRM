import type { Prisma } from '@prisma/client';
import { db } from '../db';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * A PARCEL THE COURIER HAS NO RECORD OF.
 *
 * The poll asked about every in-transit parcel every two minutes and threw
 * away anything that came back that was not a status. A barcode the courier
 * does not recognise — mistyped at creation, cancelled at their end, lost
 * between two systems — was therefore asked about for ever, silently, while
 * the order sat in SHIPPED. Nobody found out until a customer rang to ask
 * where their parcel was.
 *
 * Three consecutive misses is the line. One is a blip in somebody's API;
 * two is a bad afternoon; three over six minutes, with every other barcode
 * in the same sweep answering normally, is a parcel that is not there.
 *
 * The alert fires ONCE. An alarm that repeats every two minutes is an alarm
 * people build a filter for, and a filtered alarm is worse than none —
 * it is a thing everybody believes is working.
 */

export const MISSES_BEFORE_ALERT = 3;

export interface MissOutcome {
  orderId: string;
  misses: number;
  /** True only on the poll that crossed the line — never again after. */
  alertNow: boolean;
}

/**
 * Record that this poll found nothing for this parcel.
 *
 * `missingSince` is stamped on the FIRST miss, not the third: the question
 * a human asks is "how long has it been gone", and answering from the third
 * miss would understate it by every minute of the first two.
 */
export async function recordMiss(
  tx: Tx,
  order: { id: string; trackingMissCount: number; trackingMissingAlertedAt: Date | null },
  now = new Date()
): Promise<MissOutcome> {
  const misses = order.trackingMissCount + 1;
  const alertNow = misses >= MISSES_BEFORE_ALERT && !order.trackingMissingAlertedAt;

  await tx.order.update({
    where: { id: order.id },
    data: {
      trackingMissCount: misses,
      ...(order.trackingMissCount === 0 ? { trackingMissingSince: now } : {}),
      ...(alertNow ? { trackingMissingAlertedAt: now } : {}),
    },
  });

  return { orderId: order.id, misses, alertNow };
}

/**
 * The courier answered about this parcel — so it is not missing.
 *
 * Clears the alert stamp too. A barcode that goes missing, comes back, and
 * goes missing again is two separate incidents, and the second one deserves
 * to be shouted about as loudly as the first.
 */
export async function clearMiss(
  tx: Tx,
  order: { id: string; trackingMissCount: number; trackingMissingAlertedAt: Date | null }
): Promise<void> {
  if (order.trackingMissCount === 0 && !order.trackingMissingAlertedAt) return;
  await tx.order.update({
    where: { id: order.id },
    data: { trackingMissCount: 0, trackingMissingSince: null, trackingMissingAlertedAt: null },
  });
}

/** How long it has been gone, in whole hours, for the message. */
export function missingHours(since: Date | null, now = new Date()): number {
  if (!since) return 0;
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 3_600_000));
}
