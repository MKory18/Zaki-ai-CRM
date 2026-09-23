import { db } from '../db';
import { isAutoApplicable, type CourierEvent } from './types';
import { isValidShippingTransition } from '../shipping-workflow';

/**
 * ONE PLACE WHERE A COURIER'S WORD CHANGES AN ORDER.
 *
 * Two things now speak for a courier: the polling job, which asks every two
 * minutes, and the webhook, which is told. They must not disagree. A second
 * copy of these checks would drift — and the thing that drifts here is the
 * rule that stops a courier feed from declaring money collected.
 *
 * So both call this, and neither writes `shippingStatus` itself.
 *
 * The order of the guards matters:
 *   1. Can a machine assert this at all? DELIVERED, RETURNED,
 *      PARTIALLY_DELIVERED and CANCELLED move money or reverse it, and only
 *      the person at the door knows which. They wait for a human.
 *   2. Is it news? The same status arriving twice is not a change, and a
 *      webhook retried three times must not write three activity rows.
 *   3. Is the move legal? The transition machine decides, never the feed.
 */

export type ApplyOutcome =
  | 'APPLIED'
  | 'NOT_AUTO_APPLICABLE'
  | 'NO_CHANGE'
  | 'INVALID_TRANSITION'
  | 'UNKNOWN_STATUS';

export interface ApplyTarget {
  id: string;
  companyId: string;
  shippingStatus: string;
}

export async function applyCourierEvent(input: {
  order: ApplyTarget;
  event: CourierEvent;
  courierName: string;
  /** How we learned of it — kept on the activity row so the two are told apart. */
  source: 'POLL' | 'WEBHOOK';
}): Promise<ApplyOutcome> {
  const { order, event, courierName, source } = input;

  if (event.status === null) return 'UNKNOWN_STATUS';
  if (!isAutoApplicable(event)) return 'NOT_AUTO_APPLICABLE';
  if (event.status === order.shippingStatus) return 'NO_CHANGE';
  if (!isValidShippingTransition(order.shippingStatus, event.status)) return 'INVALID_TRANSITION';

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { shippingStatus: event.status!, version: { increment: 1 } },
    });
    await tx.orderActivity.create({
      data: {
        companyId: order.companyId,
        orderId: order.id,
        userId: null, // the courier's feed, not a person
        action: 'COURIER_STATUS_SYNCED',
        newStatus: event.status!,
        metadata: JSON.stringify({
          courier: courierName,
          rawStatus: event.rawStatus,
          note: event.note,
          source,
        }),
      },
    });
  });

  return 'APPLIED';
}
