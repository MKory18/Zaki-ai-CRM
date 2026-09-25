import { SHIPPING_GONE } from './order-state';

/**
 * WHEN AN ORDER STOPS BEING OURS TO CHANGE.
 *
 * A batch is open while the warehouse is still filling it: orders go in,
 * addresses get corrected, a line is added. Then somebody presses "استلمت
 * شركة الشحن" and the parcels physically leave the building. From that
 * moment the paper on the box, the address the driver has and the amount he
 * will collect are all fixed somewhere we do not control.
 *
 * So the batch closing is the seal, and it seals the orders inside it. This
 * is one line rather than a state per order on purpose: the warehouse hands
 * over a trolley, not twelve separate decisions, and a rule a person can
 * say out loud is a rule they will follow.
 *
 * A sealed order is not frozen — it is no longer editable IN PLACE. What
 * was a direct edit becomes a change request: somebody who can reach the
 * courier decides whether the change can still be made, and says what has
 * to happen if it cannot. Silence never approves it.
 *
 * WHAT IS SEALED is what the courier already acted on: who the parcel goes
 * to, where, what is in it, and what he collects. Notes, workflow status
 * and attribution are ours and stay editable — correcting a note does not
 * send a driver to the wrong street.
 */

/** Batch states in which the goods have left our hands. */
export const SEALED_BATCH_STATUSES = ['SHIPPED', 'CLOSED'] as const;

/**
 * The fields the courier is already acting on.
 *
 * Deliberately NOT here: internalNotes, customerNotes, confirmationStatus,
 * shippingStatus, trackingCode, moderatorId, channelId, postponedUntil.
 * None of them changes what the driver does today.
 */
export const SEALED_FIELDS = [
  'customerName',
  'customerPhone',
  'customerAltPhone',
  'customerAddress',
  'regionId',
  'items',
  'sellingPrice',
  'quantity',
  'discountAmount',
  'shippingCost',
] as const;

export interface SealSource {
  shippingBatch?: { status: string; batchNumber: string } | null;
  /** The order's own shipping state — the parcel may have left alone. */
  shippingStatus?: string;
  shippedAt?: Date | string | null;
  /** The waybill is printed and on the box. */
  labelPrintedAt?: Date | string | null;
}

/** Shipping states in which the parcel is out of our hands — one list. */
const GONE: readonly string[] = SHIPPING_GONE;

export interface Seal {
  sealed: boolean;
  /** The batch that sealed it, for a message a human can act on. */
  batchNumber?: string;
  /** Which of the three facts closed it. */
  reason?: 'BATCH' | 'SHIPPED' | 'LABELLED';
}

/**
 * Is this order out of our hands?
 *
 * TWO ways in, and either is enough.
 *
 * The batch being handed over is the common one: the trolley left, so
 * everything on it left. But an order can ship on its own — marked shipped
 * by hand, dispatched individually, moved between couriers — while the
 * batch it belongs to is still open and taking work. Keying only on the
 * batch left exactly that order editable after the parcel was on a van,
 * which is the case that costs money: a driver at an address nobody told
 * him about, collecting an amount nobody agreed to.
 *
 * So the order's own shipping state seals it too. Whichever happens first.
 */
export function orderSeal(order: SealSource): Seal {
  const batch = order.shippingBatch;
  if (batch && SEALED_BATCH_STATUSES.includes(batch.status as (typeof SEALED_BATCH_STATUSES)[number])) {
    return { sealed: true, batchNumber: batch.batchNumber, reason: 'BATCH' };
  }
  // shippedAt is the fact; a status that moved on afterwards does not
  // un-ship a parcel that already left.
  if (order.shippedAt || GONE.includes(order.shippingStatus ?? '')) {
    return { sealed: true, batchNumber: batch?.batchNumber, reason: 'SHIPPED' };
  }
  // The waybill is the address. Once it is printed and stuck on the box,
  // changing the address in here changes nothing the driver will ever read
  // — it only makes our record disagree with the parcel. This is the
  // earliest of the three, and it is the one that matches what actually
  // fixes a delivery: paper on a carton.
  if (order.labelPrintedAt) {
    return { sealed: true, batchNumber: batch?.batchNumber, reason: 'LABELLED' };
  }
  return { sealed: false };
}

/**
 * Which of the requested changes the seal refuses.
 *
 * Returns the field names, so the refusal can name them rather than saying
 * "something in there is not allowed" and leaving somebody guessing.
 */
export function sealedFieldsIn(body: Record<string, unknown>): string[] {
  return SEALED_FIELDS.filter((f) => body[f] !== undefined);
}

/** Arabic names for the refusal message. */
const FIELD_NAMES: Record<string, string> = {
  customerName: 'اسم العميل',
  customerPhone: 'هاتف العميل',
  customerAltPhone: 'الهاتف البديل',
  customerAddress: 'العنوان',
  regionId: 'المحافظة',
  items: 'أصناف الطلب',
  sellingPrice: 'السعر',
  quantity: 'الكمية',
  discountAmount: 'الخصم',
  shippingCost: 'الشحن والتوصيل',
};

export function sealMessage(
  batchNumber: string | undefined,
  fields: string[],
  reason: Seal['reason'] = 'BATCH'
): string {
  const names = fields.map((f) => FIELD_NAMES[f] ?? f).join('، ');
  const where =
    reason === 'SHIPPED'
      ? 'الطلب شُحن وخرج من المستودع'
      : reason === 'LABELLED'
        ? 'بوليصة الطلب طُبعت ولُصقت على الطرد — العنوان الذي سيقرأه السائق لم يعد يتغيّر من هنا'
        : `الطلب سُلِّم لشركة الشحن ضمن دفعة مقفلة${batchNumber ? ` (${batchNumber})` : ''}`;
  return `${where}. لتعديل ${names} ارفع طلب تعديل ليُبَتّ فيه.`;
}
