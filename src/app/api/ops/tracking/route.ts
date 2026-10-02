import { NextResponse } from 'next/server';
import { DEAD_CONFIRMATION, TRACKING_ACK_ACTION, trackingAlert } from '@/lib/tracking-alert';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { ruleFor } from '@/lib/phone-rules';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { transitStatus } from '@/lib/transit';
import { normalizePhoneNumber } from '@/lib/phone';
import { expectedAmountFor, SETTLEMENT_ORDER_SELECT } from '@/lib/settlement';
import { noteCustomersHandedOut } from '@/lib/pii-alert';

/**
 * GET /api/ops/tracking?q=&status=
 *
 * Search by order number, merchant reference, courier barcode, customer name
 * or phone. Days in transit and the late flag are computed here against the
 * region's own threshold — the screen never counts days itself. Collection
 * status is returned as its own field, never merged into delivery status.
 */
const IN_FLIGHT = ['SHIPPED', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'FAILED_DELIVERY', 'RETURN_REQUESTED'];

export async function GET(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('ops.track');

    const q = new URL(req.url).searchParams;
    const term = q.get('q')?.trim();
    const status = q.get('status')?.trim();

    const orders = await db.order.findMany({
      where: {
        companyId,
        storeId,
        // "all" means all. It used to fall back to the in-flight list, which
        // hid every delivered shipment — the very ones you collect against.
        ...(status === 'all'
          ? {}
          : { shippingStatus: status ? status : { in: IN_FLIGHT } }),
        ...(term
          ? {
              OR: [
                { orderNumber: { contains: term } },
                { merchantRef: { contains: term } },
                { trackingNumber: { contains: term } },
                { customer: { fullName: { contains: term } } },
                { customer: { phone: { contains: normalizePhoneNumber(term) || term } } },
              ],
            }
          : {}),
      },
      // Oldest in transit first — the ones waiting longest are the work.
      // Nulls last so a shipment with no date does not head the queue.
      orderBy: [{ shippedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true, orderNumber: true, merchantRef: true, trackingNumber: true,
        // The order may be dead while its parcel is still moving — see
        // src/lib/tracking-alert.ts for why that is the one thing this
        // screen was not saying.
        confirmationStatus: true, updatedAt: true,
        // Everything the settlement rule reads, in one spread — including
        // the delivered lines and the return receipt, which this screen does
        // not show and cannot compute `expectedCollection` without.
        ...SETTLEMENT_ORDER_SELECT,
        settlementStatus: true, shippedAt: true, outForDeliveryAt: true,
        deliveryFailureReason: true, currency: true, regionId: true,
        deliveryProviderId: true,
        customer: { select: { fullName: true, phone: true, city: true } },
        region: { select: { id: true, name: true } },
        deliveryProvider: { select: { id: true, name: true, kind: true } },
        _count: { select: { deliveryAttempts: true, notes: true } },
      },
    });

    /**
     * THE TWO THINGS THAT MAKE CHASING A PARCEL POINTLESS OR WRONG.
     *
     * Three small reads over the orders already fetched, not a join per
     * row: when each was cancelled, when an approved change was last
     * written onto it, and when somebody last said they saw either.
     */
    const ids = orders.map((o) => o.id);
    const [cancelLogs, applied, acks] = ids.length
      ? await Promise.all([
          db.orderStatusLog.findMany({
            where: { orderId: { in: ids }, statusType: 'CONFIRMATION', newValue: { in: [...DEAD_CONFIRMATION] } },
            orderBy: { createdAt: 'desc' },
            select: { orderId: true, createdAt: true },
          }),
          db.orderChangeRequest.findMany({
            where: { orderId: { in: ids }, appliedAt: { not: null } },
            orderBy: { appliedAt: 'desc' },
            select: { orderId: true, appliedAt: true },
          }),
          db.orderActivity.findMany({
            where: { orderId: { in: ids }, action: TRACKING_ACK_ACTION },
            orderBy: { createdAt: 'desc' },
            select: { orderId: true, createdAt: true },
          }),
        ])
      : [[], [], []];

    // Ordered newest-first above, so the first seen per order is the latest.
    const newest = <T extends { orderId: string }>(rows: T[], pick: (r: T) => Date | null) => {
      const m = new Map<string, Date>();
      for (const r of rows) if (!m.has(r.orderId)) { const d = pick(r); if (d) m.set(r.orderId, d); }
      return m;
    };
    const cancelledAt = newest(cancelLogs, (r) => r.createdAt);
    const changedAt = newest(applied, (r) => r.appliedAt);
    const ackedAt = newest(acks, (r) => r.createdAt);

    // One lookup per (courier, region) pair for the late thresholds.
    const pairs = [...new Set(orders.filter((o) => o.deliveryProviderId && o.regionId).map((o) => `${o.deliveryProviderId}|${o.regionId}`))];
    const fees = await db.deliveryFee.findMany({
      where: {
        OR: pairs.map((p) => {
          const [deliveryProviderId, regionId] = p.split('|');
          return { deliveryProviderId, regionId };
        }),
      },
      select: { deliveryProviderId: true, regionId: true, lateThresholdDays: true },
    });
    const thresholdOf = new Map(fees.map((f) => [`${f.deliveryProviderId}|${f.regionId}`, f.lateThresholdDays]));

    const rows = orders.map((order) => {
      // The lines, the add-ons and the return receipt are what the
      // EXPECTATION is built from, not something this screen prints — so they
      // feed the rule and stay off the wire. A row carrying every unit of
      // every parcel would also be a lot of somebody's order history in a
      // browser. `addOns` joined this list the day the rule started reading
      // it: three fields selected for the rule, none of them stripped, is how
      // a payload grows without anyone deciding it should.
      const { items: _items, returnReceipt: _returnReceipt, addOns: _addOns, ...o } = order;
      const threshold = thresholdOf.get(`${o.deliveryProviderId}|${o.regionId}`) ?? 0;
      const transit = transitStatus(o.shippedAt, threshold);
      return {
        ...o,
        daysInTransit: transit.days,
        lateThresholdDays: threshold,
        late: transit.late,
        // Delivery, settlement and collection stay three separate facts.
        collectionStatus: o.settlementStatus,
        /**
         * WHAT THE COURIER OWES ON THIS ORDER, by the settlement matcher's
         * own rule — computed here, where that rule lives.
         *
         * The collect dialog used to work it out as `totalAmount −
         * deliveryFee`, which is right for a whole delivery and wrong for a
         * partial one: on a partial the courier owes what the customer
         * actually took, and the full value makes every partial look like a
         * shortfall. The person then reads a total that accuses a rep of
         * keeping money he never received, and the server — which applies
         * the rule correctly — records a different figure.
         *
         * Rounded by the COUNTRY's minor unit inside the rule — JOD has
         * three places — so the screen receives a figure it only prints.
         *
         * AND `null` FOR A ROW THE RULE CANNOT ANSWER, RATHER THAN NO SCREEN.
         *
         * `expectedAmountFor` throws on an order with no lines, on the sound
         * ground that a caller who did not select `items` would otherwise
         * get the old total-based answer by accident. This route DOES select
         * them — `SETTLEMENT_ORDER_SELECT` is spread above — so an empty
         * array here is not a programming mistake: it is an order the
         * database really has no lines for.
         *
         * They exist. `confirmation/winback/route.ts:269` creates a real
         * order and writes no `OrderItem` row at all; it is born `NOT_READY`
         * and stays there, because `assertReadyToShip`
         * (`order-state.ts:238`) refuses an order with no lines. Invisible
         * on the default «قيد الشحن» filter, and reached the moment the
         * operator picks «الكل» or «غير جاهز» — and then one such row threw
         * an English message matching no branch in `api-error.ts`, so the
         * answer was a 500 and the screen went blank, taking ~199 healthy
         * rows with it.
         *
         * `null`, not 0: zero is the settled answer the rule gives a
         * RETURNED parcel — «owes nothing» — and this row's collection is
         * unknown, not nil. The browser already types the field as
         * `number | null` and sums it with `?? 0`, so the bar is unmoved.
         *
         * The guard is HERE and not in the rule because the rule's throw is
         * still right for every caller that forgot the select. If it should
         * instead report «I cannot answer» itself, that is a change to
         * `settlement.ts`, which this change does not touch.
         *
         * Written as two branches rather than a ternary so the call stays
         * verbatim: `the-frontend-invariants.test.ts:654` pins this exact
         * line as proof the route sends the RULE's figure and never a
         * formula of its own, and that remains the whole point.
         */
        ...(order.items.length > 0
          ? { expectedCollection: expectedAmountFor(order, country.minorUnit) }
          : { expectedCollection: null }),
        /**
         * The one thing worth saying about this row, or null. A cancelled
         * order with no surviving status log still announces itself — its
         * own last write is the honest approximation.
         */
        alert: trackingAlert({
          confirmationStatus: o.confirmationStatus,
          cancelledAt: cancelledAt.get(o.id) ?? o.updatedAt,
          changeAppliedAt: changedAt.get(o.id) ?? null,
          acknowledgedAt: ackedAt.get(o.id) ?? null,
        }),
      };
    });

    // Contact details left the building; the tally is the person's, not
    // this screen's. See noteCustomersHandedOut.
    await noteCustomersHandedOut({ companyId, storeId, user, where: 'شاشة التتبّع', rows });

    return NextResponse.json({
      // wa.me needs the number in full international form, and the rows
      // carry it in local form. The country is known here, not in the browser.
      dialCode: ruleFor(country.code)?.dialCode ?? null, count: rows.length, orders: rows, lateCount: rows.filter((r) => r.late).length });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
