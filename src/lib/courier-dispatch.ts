import { db } from './db';
import { adapterFor } from './couriers';
import { courierBelongsToStore } from './courier-scope';
import { logAudit } from './audit';

/**
 * HANDING THE ORDERS TO THE COURIER.
 *
 * The batch screen already groups orders and marks them ready for pickup —
 * but that all happened here, on our side. Nothing was ever sent to the
 * shipping company, so nothing came back: no barcode, and therefore no way
 * to track a parcel, print a courier-recognised waybill, or match their
 * statement line to our order.
 *
 * The barcode IS the reference. We send them our order number as the
 * merchant reference; they answer with their barcode, and from that moment
 * the two systems can find the same parcel from either side.
 *
 * Three rules shape this:
 *
 *   NEVER inside a database transaction. A call to somebody else's server
 *   can hang for thirty seconds, and holding row locks on twenty orders
 *   while it does is how a warehouse stops working.
 *
 *   NEVER twice for one order. A second create is a second parcel at the
 *   courier, billed and collected twice, and the customer opens the door to
 *   a duplicate. An order that already carries a tracking number is skipped,
 *   not retried.
 *
 *   ONE order at a time, reported per order. Twenty orders where three fail
 *   is seventeen parcels that must still ship — an all-or-nothing dispatch
 *   would hold them hostage to a bad phone number on someone else's.
 */

export interface DispatchOutcome {
  orderId: string;
  orderNumber: string;
  ok: boolean;
  /** The courier's barcode — our tracking number from now on. */
  trackingNumber?: string;
  skipped?: 'ALREADY_SENT' | 'NOT_AUTOMATED' | 'NO_PROVIDER';
  error?: string;
}

export interface DispatchSummary {
  sent: number;
  skipped: number;
  failed: number;
  outcomes: DispatchOutcome[];
}

/**
 * Send a batch's orders to their courier and record what came back.
 *
 * `orderIds` narrows it to a retry of the ones that failed; omitted, the
 * whole batch is attempted and the ones already sent are skipped.
 */
export async function dispatchBatch(input: {
  batchId: string;
  companyId: string;
  storeId: string;
  userId: string;
  orderIds?: string[];
}): Promise<DispatchSummary> {
  const batch = await db.shippingBatch.findFirst({
    where: { id: input.batchId, companyId: input.companyId, storeId: input.storeId },
    select: {
      id: true,
      batchNumber: true,
      provider: {
        select: { id: true, code: true, adapterCode: true, apiEnabled: true, apiConfig: true, apiCredentials: true, companyId: true, storeId: true },
      },
    },
  });
  if (!batch) throw new Error('BATCH_NOT_FOUND');

  /**
   * The courier must be this store's, or one shared by all of them.
   *
   * Each store holds its own account with the same courier, so using
   * another store's row creates the parcel under another store's login —
   * and the collection, the statement and the money come back against that
   * account. The screens only offer the right ones; this is the check that
   * holds when the endpoint is called directly.
   */
  if (batch.provider && !courierBelongsToStore(batch.provider, input.companyId, input.storeId)) {
    throw new Error('COURIER_NOT_IN_STORE');
  }

  const adapter = adapterFor(batch.provider);

  const orders = await db.order.findMany({
    where: {
      shippingBatchId: batch.id,
      companyId: input.companyId,
      ...(input.orderIds?.length ? { id: { in: input.orderIds } } : {}),
    },
    select: {
      id: true, orderNumber: true, merchantRef: true, trackingNumber: true,
      totalAmount: true, currency: true, quantity: true, freeQuantity: true,
      customerNotes: true, deliveryProviderId: true,
      customer: { select: { fullName: true, rawPhone: true, phone: true, address: true } },
      regionId: true,
      region: { select: { name: true } },
    },
    orderBy: { orderNumber: 'asc' },
  });

  // One read for the whole batch rather than one per parcel.
  const cityIds = new Map<string, number>(
    (
      await db.deliveryFee.findMany({
        where: { deliveryProviderId: batch.provider?.id, courierCityId: { not: null } },
        select: { regionId: true, courierCityId: true },
      })
    ).map((f) => [f.regionId, f.courierCityId!])
  );

  const outcomes: DispatchOutcome[] = [];

  for (const order of orders) {
    // Already has a barcode: sending again would create a second parcel at
    // the courier for the same goods.
    if (order.trackingNumber) {
      outcomes.push({ orderId: order.id, orderNumber: order.orderNumber, ok: false, skipped: 'ALREADY_SENT' });
      continue;
    }
    if (!order.deliveryProviderId) {
      outcomes.push({ orderId: order.id, orderNumber: order.orderNumber, ok: false, skipped: 'NO_PROVIDER' });
      continue;
    }
    // A manual courier has no API to send to; the parcel goes by hand and
    // the tracking number is typed in when they give one.
    if (!adapter.automated) {
      outcomes.push({ orderId: order.id, orderNumber: order.orderNumber, ok: false, skipped: 'NOT_AUTOMATED' });
      continue;
    }

    try {
      const result = await adapter.createShipment({
        // The courier's own id for this region, agreed once and stored on
        // the fee row. Without it the adapter has to search their API by
        // name on every single shipment — a round trip that needs their
        // password, and a name match that quietly takes the first of
        // several hits. A parcel addressed to the wrong governorate is not
        // a thing you find out about until the driver calls.
        cityId: cityIds.get(order.regionId ?? '') ?? undefined,
        orderId: order.id,
        // Our order number, so their statement line can be matched back.
        merchantRef: order.merchantRef || order.orderNumber,
        codAmount: Number(order.totalAmount ?? 0),
        currencyCode: order.currency,
        customer: {
          fullName: order.customer?.fullName ?? '',
          // The phone AS TYPED: couriers dial it, and a normalized form can
          // lose the leading zero their system expects.
          phone: order.customer?.rawPhone || order.customer?.phone || '',
          address: order.customer?.address ?? '',
          regionName: order.region?.name ?? null,
        },
        pieces: Math.max(1, (order.quantity ?? 1) + (order.freeQuantity ?? 0)),
        note: order.customerNotes ?? null,
      });

      await db.order.update({
        where: { id: order.id },
        data: {
          trackingNumber: result.trackingNumber,
          version: { increment: 1 },
        },
      });

      await db.orderActivity.create({
        data: {
          companyId: input.companyId,
          orderId: order.id,
          userId: input.userId,
          action: 'SHIPMENT_SENT_TO_COURIER',
          metadata: JSON.stringify({
            batch: batch.batchNumber,
            adapter: adapter.code,
            merchantRef: order.merchantRef || order.orderNumber,
            barcode: result.trackingNumber,
          }),
        },
      });

      outcomes.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        ok: true,
        trackingNumber: result.trackingNumber,
      });
    } catch (e) {
      // The courier's own words, kept: "city unknown" and "invalid phone"
      // are different problems, and a generic failure teaches nothing.
      outcomes.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        ok: false,
        error: e instanceof Error ? e.message.slice(0, 300) : 'تعذر الإرسال',
      });
    }
  }

  const summary: DispatchSummary = {
    sent: outcomes.filter((o) => o.ok).length,
    skipped: outcomes.filter((o) => o.skipped).length,
    failed: outcomes.filter((o) => !o.ok && !o.skipped).length,
    outcomes,
  };

  await logAudit({
    companyId: input.companyId,
    userId: input.userId,
    action: 'SHIPMENT_BATCH_DISPATCHED',
    entity: 'ShippingBatch',
    entityId: batch.id,
    newData: {
      batchNumber: batch.batchNumber,
      adapter: adapter.code,
      sent: summary.sent,
      skipped: summary.skipped,
      failed: summary.failed,
    },
  });

  return summary;
}
