import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ContextError, requireContext } from '@/lib/geo-context';
import { can } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { awaitingConfirmationCount, waitingCount } from '@/lib/confirmation-queue';
import { kindsFor, type WorkItem, type WorkKey } from '@/lib/my-work';

/**
 * GET /api/me/work — what is waiting for THIS person. Counts, never lists.
 *
 * This is `/api/confirmation/counter` widened. That route was the right
 * idea applied to one role — «how many orders are waiting to be pulled» —
 * and everybody else got a header identical whatever their job. The rule it
 * was written with is unchanged and carried here: the SERVER decides which
 * numbers a person gets, by permission, and a count never becomes a list.
 *
 * Polled in the background, so a missing store is «no work», not an error.
 * Answering 400 to a poll once sent the whole tab to the store picker,
 * mid-form, without a click.
 */

/** A hard ceiling on the work: past this the number is «كثير» either way. */
const CAP = 999;

export async function GET() {
  try {
    let context;
    try {
      context = await requireContext();
    } catch (e) {
      if (e instanceof ContextError) return NextResponse.json({ items: [] });
      throw e;
    }
    const { user, companyId, storeId } = context;
    const scope = { companyId, storeId };
    const kinds = kindsFor((p) => can(user, p));
    if (kinds.length === 0) return NextResponse.json({ items: [] });

    const wanted = new Set<WorkKey>(kinds.map((k) => k.key));
    const counts: Partial<Record<WorkKey, number>> = {};

    /**
     * Only what this person may see is counted. A query run for a number
     * nobody is shown is a query run for nothing, on every poll, for every
     * user in the company.
     */
    if (wanted.has('CONFIRM_POOL')) counts.CONFIRM_POOL = await waitingCount(db, scope);
    if (wanted.has('MY_UNCONFIRMED')) {
      counts.MY_UNCONFIRMED = await awaitingConfirmationCount(db, scope, user.id);
    }

    if (wanted.has('READY_TO_SHIP')) {
      counts.READY_TO_SHIP = await db.order.count({
        where: {
          ...scope,
          confirmationStatus: 'CONFIRMED',
          shippingStatus: 'NOT_READY',
          shippingBatchId: null,
          // A held parcel is not waiting for anybody until its day comes —
          // the same filter the shipment list itself uses.
          OR: [{ shipHoldUntil: null }, { shipHoldUntil: { lte: new Date() } }],
        },
      });
    }

    if (wanted.has('RETURNS_WAITING')) {
      counts.RETURNS_WAITING = await db.order.count({
        where: {
          ...scope,
          shippingStatus: { in: ['RETURN_REQUESTED', 'RETURNED', 'FAILED_DELIVERY', 'PARTIALLY_DELIVERED'] },
          returnReceipt: null,
        },
      });
    }

    if (wanted.has('CHANGE_REQUESTS')) {
      counts.CHANGE_REQUESTS = await db.orderChangeRequest.count({
        where: { companyId, status: 'PENDING', order: { storeId } },
      });
    }

    /**
     * LATE IS PER REGION, AND THE THRESHOLD IS THE COURIER'S OWN.
     *
     * A parcel to a neighbouring town and one across the country are not
     * late at the same age, and `delivery_fees` already carries the days
     * for each (courier, region). Counting them against one number would
     * flag the far ones every week and teach people to ignore the chip.
     */
    if (wanted.has('LATE_SHIPMENTS')) {
      const fees = await db.deliveryFee.findMany({
        where: { companyId, isActive: true },
        select: { regionId: true, deliveryProviderId: true, lateThresholdDays: true },
      });
      const daysFor = new Map(fees.map((f) => [`${f.deliveryProviderId}:${f.regionId}`, f.lateThresholdDays]));

      const flying = await db.order.findMany({
        where: {
          ...scope,
          shippingStatus: { in: ['SHIPPED', 'OUT_FOR_DELIVERY'] },
          shippedAt: { not: null },
        },
        select: { shippedAt: true, regionId: true, deliveryProviderId: true },
        take: 2000,
      });

      const now = Date.now();
      counts.LATE_SHIPMENTS = flying.filter((o) => {
        const key = `${o.deliveryProviderId}:${o.regionId}`;
        const threshold = daysFor.get(key);
        // No threshold on file is not «late»: it is «we never said». Guessing
        // one would put a red number on a screen nobody can act on.
        if (!threshold || threshold <= 0) return false;
        const days = Math.floor((now - new Date(o.shippedAt as Date).getTime()) / 86_400_000);
        return days > threshold;
      }).length;
    }

    const items: WorkItem[] = kinds.map((k) => ({
      key: k.key,
      ar: k.ar,
      count: Math.min(CAP, counts[k.key] ?? 0),
      href: k.href,
      icon: k.icon,
      tone: k.tone,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
