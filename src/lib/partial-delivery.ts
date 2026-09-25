import type { Prisma } from '@prisma/client';
import { db } from './db';
import { roundMinor } from './money';
import { consumeOrderStock } from './stock-consumption';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * PARTIAL DELIVERY — the customer took some lines and refused others.
 *
 * The rule the whole thing hangs on: the delivery fee is charged IN FULL.
 * The courier travelled to that door whether one line was taken or all of
 * them, so prorating the fee across the delivered lines would quietly make
 * every partial delivery cheaper than it was and leave the difference
 * unexplained in the settlement.
 *
 * What is recorded:
 *   - per line, how many units were taken and how many came back;
 *   - collectedAmount: the delivered goods plus the FULL fee, which is what
 *     the customer actually paid at the door;
 *   - the refused units, returned to the caller so they re-enter stock
 *     through the normal count-and-inspect, never automatically.
 *
 * Settlement then compares the courier's statement against collectedAmount
 * rather than the original total — expectedAmountFor already does that. A
 * partial delivery measured against the original total would look like the
 * courier short-paid every time.
 */

export interface DeliveredLine {
  /** OrderItem id. */
  itemId: string;
  /** Units the customer took. Gift units count as units. */
  deliveredQty: number;
}

export interface PartialOutcome {
  status: 'DELIVERED' | 'PARTIALLY_DELIVERED' | 'RETURNED';
  /** What the customer paid: delivered goods + the full delivery fee. */
  collectedAmount: number;
  /** Goods only, before the fee. */
  deliveredValue: number;
  deliveryFee: number;
  /** Units to put back on the shelf, once counted and inspected. */
  returnedUnits: { itemId: string; productId: string; productName: string; quantity: number }[];
  linesDelivered: number;
  linesReturned: number;
}

export class PartialDeliveryRefused extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** States at which a parcel can still be settled at the door. */
const SETTLEABLE = ['OUT_FOR_DELIVERY', 'SHIPPED'];

/**
 * Works out what a partial delivery means, and writes it.
 *
 * Returns the refused units rather than restocking them: stock re-entry is
 * count-and-inspect, done when the parcel is physically back, not when the
 * courier says it is coming.
 */
export async function recordPartialDelivery(
  tx: Tx,
  input: {
    companyId: string;
    orderId: string;
    lines: DeliveredLine[];
    minorUnit: number;
    userId: string;
    note?: string | null;
    /** The country's rule when a batch cannot cover what went out the door. */
    allowNegativeStock?: boolean;
  }
): Promise<PartialOutcome> {
  const order = await tx.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: {
      id: true, orderNumber: true, shippingStatus: true, deliveryFee: true,
      priceIncludesDelivery: true, collectedAmount: true,
      items: {
        select: {
          id: true, productId: true, productName: true,
          quantity: true, freeQuantity: true, unitPrice: true, discountShare: true,
        },
      },
    },
  });
  if (!order) throw new PartialDeliveryRefused('NOT_FOUND', 'الطلب غير موجود');

  if (order.collectedAmount !== null) {
    throw new PartialDeliveryRefused('ALREADY_SETTLED', 'سُجِّل تسليم هذا الطلب مسبقاً');
  }
  if (!SETTLEABLE.includes(order.shippingStatus)) {
    throw new PartialDeliveryRefused(
      'NOT_AT_DOOR',
      'لا يمكن تسجيل التسليم قبل خروج الشحنة للتوصيل'
    );
  }
  if (order.items.length === 0) {
    throw new PartialDeliveryRefused('NO_LINES', 'الطلب بلا بنود');
  }

  const byId = new Map(order.items.map((i) => [i.id, i]));
  const given = new Map<string, number>();

  for (const line of input.lines) {
    const item = byId.get(line.itemId);
    if (!item) throw new PartialDeliveryRefused('UNKNOWN_LINE', 'بند لا ينتمي لهذا الطلب');

    const shipped = item.quantity + item.freeQuantity;
    if (!Number.isInteger(line.deliveredQty) || line.deliveredQty < 0 || line.deliveredQty > shipped) {
      throw new PartialDeliveryRefused(
        'QUANTITY_OUT_OF_RANGE',
        `الكمية المسلَّمة من ${item.productName} يجب أن تكون بين صفر و${shipped}`
      );
    }
    given.set(line.itemId, line.deliveredQty);
  }

  // A line not mentioned was not delivered.
  let deliveredValue = 0;
  let linesDelivered = 0;
  let linesReturned = 0;
  const returnedUnits: PartialOutcome['returnedUnits'] = [];
  const updates: { id: string; deliveredQty: number; returnedQty: number }[] = [];

  for (const item of order.items) {
    const shipped = item.quantity + item.freeQuantity;
    const delivered = given.get(item.id) ?? 0;
    const returned = shipped - delivered;

    if (delivered > 0) {
      linesDelivered++;
      // Charge for paid units only; gift units are real stock at zero price.
      const paidDelivered = Math.min(delivered, item.quantity);
      const unit = Number(item.unitPrice);
      const discountPerUnit = item.quantity > 0 ? Number(item.discountShare) / item.quantity : 0;
      deliveredValue += paidDelivered * (unit - discountPerUnit);
    }
    if (returned > 0) {
      linesReturned++;
      returnedUnits.push({
        itemId: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: returned,
      });
    }

    updates.push({ id: item.id, deliveredQty: delivered, returnedQty: returned });
  }

  deliveredValue = roundMinor(Math.max(0, deliveredValue), input.minorUnit);

  // THE rule: the fee is charged in full, whatever was taken. The courier
  // travelled. It is only waived when nothing at all was delivered, because
  // then the trip ends as a return and the return fee is its own question.
  const fee = roundMinor(Number(order.deliveryFee ?? 0), input.minorUnit);
  const nothingTaken = linesDelivered === 0;
  const chargedFee = nothingTaken ? 0 : fee;

  // With the price including delivery the fee is already inside the line
  // prices, so adding it again would charge it twice.
  const collectedAmount = order.priceIncludesDelivery
    ? deliveredValue
    : roundMinor(deliveredValue + chargedFee, input.minorUnit);

  const status: PartialOutcome['status'] = nothingTaken
    ? 'RETURNED'
    : linesReturned === 0
      ? 'DELIVERED'
      : 'PARTIALLY_DELIVERED';

  for (const update of updates) {
    await tx.orderItem.update({
      where: { id: update.id },
      data: { deliveredQty: update.deliveredQty, returnedQty: update.returnedQty },
    });
  }

  await tx.order.update({
    where: { id: order.id },
    data: {
      shippingStatus: status,
      collectedAmount,
      deliveredAt: nothingTaken ? null : new Date(),
      returnedAt: nothingTaken ? new Date() : null,
      ...(nothingTaken ? { returnReason: input.note ?? 'رفض الاستلام بالكامل' } : {}),
      version: { increment: 1 },
    },
  });

  // THE GOODS LEAVE THE SHELF HERE.
  //
  // This is the door-side settlement, and until now it was the one delivery
  // path that never drew stock down. The manual transition
  // (`/api/orders/[id]/shipping`) consumes; this one wrote the order, the
  // lines and the money and left every batch untouched — so a parcel handed
  // over at the door stayed on the shelf for ever. Nothing caught it later
  // either: the statement sweep only promotes orders still in flight
  // (`SHIPPED`, `OUT_FOR_DELIVERY`, `READY_FOR_PICKUP`), and an order
  // settled here is past all three.
  //
  // The FULL ordered quantity is consumed, not the delivered quantity —
  // every unit left the warehouse, including the refused ones, which are in
  // the courier's van. They come back onto the shelf when the returns desk
  // counts them in, never before. That is the same arithmetic the manual
  // path uses, so the two agree.
  //
  // Nothing taken is the one case that consumes nothing: the parcel is
  // coming back whole, and it was never consumed to begin with.
  if (!nothingTaken) {
    await consumeOrderStock(tx, {
      orderId: order.id,
      companyId: input.companyId,
      allowNegativeStock: input.allowNegativeStock ?? false,
      userId: input.userId,
    });
  }

  await tx.orderActivity.create({
    data: {
      companyId: input.companyId,
      orderId: order.id,
      userId: input.userId,
      action: 'PARTIAL_DELIVERY_RECORDED',
      newStatus: status,
      metadata: JSON.stringify({
        collectedAmount,
        deliveredValue,
        deliveryFee: chargedFee,
        feeChargedInFull: !nothingTaken,
        linesDelivered,
        linesReturned,
        note: input.note ?? null,
      }),
    },
  });

  return {
    status,
    collectedAmount,
    deliveredValue,
    deliveryFee: chargedFee,
    returnedUnits,
    linesDelivered,
    linesReturned,
  };
}
