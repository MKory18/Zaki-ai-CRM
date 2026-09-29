import type { Prisma } from '@prisma/client';
import { db } from './db';
import { roundMinor } from './money';
import { consumeOrderStock } from './stock-consumption';
import { appendDeliveryAttempt } from './delivery-attempts';

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
 *   - the refused units, returned to the caller so they re-enter stock
 *     through the normal count-and-inspect, never automatically.
 *
 * AND NOT THE MONEY. This wrote `collectedAmount` — the delivered goods plus
 * the full fee — and that was the one figure here nobody at the door can
 * know. A follow-up agent records what the courier told her on the phone;
 * the money is what the courier's statement says arrived, and those are not
 * the same fact.
 *
 * It was worse than a guess. The statement sweep only promotes orders still
 * in flight, so an order settled here left the set the statement checks —
 * recording a delivery did not anticipate the reconciliation, it CANCELLED
 * it, and the typed figure was never once compared with the courier's own.
 *
 * So the amount is computed and RETURNED, for the screen to show as what we
 * expect to be paid, and written by the statement when it arrives. The
 * division is the honest one: whoever stood at the door knows what happened
 * — who took what — and the courier's statement knows what money came in.
 *
 * Settlement compares the statement against `expectedAmountFor`, which reads
 * the delivered lines rather than the original total, so a partial delivery
 * is still measured against what was actually handed over.
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
  /** Units the customer kept, and units the courier is carrying back. */
  deliveredUnits: number;
  refusedUnits: number;
  /**
   * The two settlements this delivery just created, and which of them is
   * still open — see `completionOf` at the foot of this file. A partial
   * delivery is reported as half-done from the moment it is recorded, rather
   * than discovered to be half-done later by whoever chases it.
   */
  completion: Completion;
}

/** What the door saw, in the words the note is prefixed with. */
const DOOR_OUTCOME_AR: Record<string, string> = {
  DELIVERED: 'تسليم كامل',
  PARTIALLY_DELIVERED: 'تسليم جزئي',
  RETURNED: 'رفض الاستلام',
};

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
      id: true, orderNumber: true, shippingStatus: true, deliveryFee: true, customerId: true,
      priceIncludesDelivery: true, deliveredAt: true, returnedAt: true, deliveryProviderId: true,
      // Read, never written here: the money half belongs to the courier's
      // statement, and this only needs to know whether it is already closed.
      settlementStatus: true,
      items: {
        select: {
          id: true, productId: true, productName: true,
          quantity: true, freeQuantity: true, unitPrice: true, discountShare: true,
        },
      },
    },
  });
  if (!order) throw new PartialDeliveryRefused('NOT_FOUND', 'الطلب غير موجود');

  /**
   * ALREADY RECORDED?
   *
   * This asked whether `collectedAmount` was set, which stopped being the
   * door's signal the moment the door stopped writing money. The door's own
   * marks are the dates it stamps, and one of the two is always set —
   * `deliveredAt` when anything was taken, `returnedAt` when nothing was.
   */
  // Truthy, not `!== null`: a caller that selected neither column hands over
  // `undefined`, and `undefined !== null` would refuse every delivery.
  if (order.deliveredAt || order.returnedAt) {
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
      // NOT collectedAmount. See the note at the top of this file: the money
      // is the courier's statement's to write, and writing a typed figure
      // here also removed the order from the set that statement checks.
      deliveredAt: nothingTaken ? null : new Date(),
      returnedAt: nothingTaken ? new Date() : null,
      ...(nothingTaken ? { returnReason: input.note ?? 'رفض الاستلام بالكامل' } : {}),
      version: { increment: 1 },
    },
  });

  // THE KNOCK. This is the screen built for the person at the door, and it
  // was the one recording no attempt at all.
  //
  // Refusing everything is a FAILED attempt whose reason is the refusal —
  // not a «returned» attempt. The parcel coming back is what happens next,
  // at a warehouse; what happened at the door is that somebody would not
  // take it.
  /**
   * AND THE CUSTOMER'S OWN RECORD.
   *
   * `Customer.deliveredOrders` and `cancelledOrders` are what the customers
   * screen grades somebody on — «هل يستلم؟», the only question that matters
   * before shipping to them on cash-on-delivery. They were incremented by
   * exactly one path: the manual status change on `PATCH /api/orders/:id`.
   *
   * Measured: 111 counted against 115 actually delivered. Neither this door
   * nor the courier's statement touched them, so a customer who takes every
   * parcel at the door reads as somebody with no history at all — and the
   * grade built on that counter would be wrong for the commonest way an
   * order actually completes.
   *
   * Anything taken is a delivery for this purpose. A partial is a customer
   * who opened the door and paid; grading them beside somebody who refused
   * the lot would be the wrong sentence about the wrong person.
   */
  await tx.customer.update({
    where: { id: order.customerId },
    data: nothingTaken
      ? { cancelledOrders: { increment: 1 } }
      : { deliveredOrders: { increment: 1 }, totalPurchaseValue: { increment: collectedAmount } },
  });

  await appendDeliveryAttempt(tx, {
    orderId: order.id,
    companyId: input.companyId,
    result: nothingTaken ? 'FAILED' : status === 'PARTIALLY_DELIVERED' ? 'PARTIALLY_DELIVERED' : 'DELIVERED',
    failureReason: nothingTaken ? 'CUSTOMER_REFUSED' : null,
    note: input.note ?? null,
    deliveryProviderId: order.deliveryProviderId,
    userId: input.userId,
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

  /**
   * AND THE SENTENCE GOES WHERE SENTENCES GO.
   *
   * The note typed at the door was written into the delivery attempt and
   * into this activity's metadata, and into nothing a person reads. The
   * order's own note thread — the one every screen shows and the one the
   * confirmation team, the returns desk and the owner all open — never saw
   * it. So «العميل رفض القطعة الثانية لأنّ اللون غير المطلوب» was recorded
   * in three machine places and no human one.
   *
   * It is the follow-up agent speaking, so it is an internal note on the
   * order, in the same transaction as the outcome it explains: a note that
   * survives while the delivery it describes rolls back would be a note
   * about something that never happened.
   */
  if (input.note?.trim()) {
    await tx.orderNote.create({
      data: {
        companyId: input.companyId,
        orderId: order.id,
        authorId: input.userId,
        kind: 'internal',
        body: `${DOOR_OUTCOME_AR[status] ?? status}: ${input.note.trim()}`,
      },
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
        // What we EXPECT the courier to remit for this parcel. The figure
        // that lands on the order comes from their statement.
        expectedCollection: collectedAmount,
        deliveredValue,
        deliveryFee: chargedFee,
        feeChargedInFull: !nothingTaken,
        linesDelivered,
        linesReturned,
        note: input.note ?? null,
      }),
    },
  });

  const deliveredUnits = updates.reduce((sum, u) => sum + u.deliveredQty, 0);
  const refusedUnits = updates.reduce((sum, u) => sum + u.returnedQty, 0);

  return {
    status,
    collectedAmount,
    deliveredValue,
    deliveryFee: chargedFee,
    returnedUnits,
    linesDelivered,
    linesReturned,
    deliveredUnits,
    refusedUnits,
    // No receipt can exist yet: the refused units are in the van, and the
    // returns desk counts them in later. Saying so here is what turns «سُلّم
    // جزئياً» from an end state into the first of two.
    completion: completionOf({
      deliveredUnits,
      refusedUnits,
      settlementStatus: order.settlementStatus,
      hasReturnReceipt: false,
    }),
  };
}

/* ─────────────────────────────────────────────────────────────────────
 * THE ORDER IS SETTLED TWICE.
 *
 *   «بصير الطلب بيتمم مرتين — مرة بيتمم للمستلم ومرة للطلب الراجع. واذا
 *    اتمم واحد فهو اتمم جزءي، ما بنغلق غير كامل»
 *
 * A partial delivery splits one order into two obligations, settled by two
 * different people, on two different days, out of two different facts:
 *
 *   MONEY — what the customer kept. Settled when the courier's statement
 *           lands and the collection is recorded.
 *   GOODS — what the customer refused. Settled when the returns desk counts
 *           the units in and puts the sound ones back on a shelf.
 *
 * Neither half knew about the other, and nothing in the system did. The door
 * writes PARTIALLY_DELIVERED; `order-state.ts` maps that state to the CLOSED
 * zone; so an order with units still in a courier's van and money still in
 * his pocket read, everywhere, as finished. The returns desk's own branch in
 * `/api/ops/returns` is careful NOT to rewrite the status — correctly,
 * because stamping RETURNED would erase the delivery — but that left the
 * completion of the first half recorded nowhere at all.
 *
 * So completion is DERIVED, never stored. That is this repository's rule for
 * the zone and for the core state, and for the same reason: a fourth column
 * drifts from the facts it summarises, and then nobody can say which of them
 * is lying. The facts are the delivered units, the settlement status, and
 * whether a return receipt exists.
 * ───────────────────────────────────────────────────────────────────── */

/** The per-line facts both halves are read from. Any OrderItem row fits. */
export interface SettledLineFacts {
  itemId?: string;
  id?: string;
  productId?: string;
  productName?: string;
  quantity: number;
  freeQuantity: number;
  /** Units the customer kept. Null until the door settled the parcel. */
  deliveredQty?: number | null;
}

export interface SettledLine {
  itemId: string;
  productId: string;
  productName: string;
  /** Units that left the warehouse on this line — gift units included. */
  shipped: number;
  /** Units the customer kept, or null while the door has not spoken. */
  delivered: number | null;
  /** Units owed back to a shelf: shipped minus delivered. */
  expectedBack: number;
}

/**
 * WHICH PRODUCT, HOW MANY TAKEN, HOW MANY COMING BACK — per line.
 *
 *   «شو المنتج الي استلمو وكم قطعة وشو الي رجع»
 *
 * The door records this per line already. The returns desk could not read
 * it: its screen listed every line at the full shipped quantity, so a clerk
 * holding one refused unit was told to expect three, and the one figure that
 * was right — the total in the next column — contradicted the list beside it.
 */
export function settledLines(items: SettledLineFacts[]): SettledLine[] {
  return items.map((i) => {
    const shipped = i.quantity + i.freeQuantity;
    const delivered = i.deliveredQty ?? null;
    return {
      itemId: i.itemId ?? i.id ?? '',
      productId: i.productId ?? '',
      productName: i.productName ?? '',
      shipped,
      delivered,
      // A line the door never spoke about owes the whole parcel back: that
      // is the announced-return case, where nothing was handed over.
      expectedBack: Math.max(0, shipped - (delivered ?? 0)),
    };
  });
}

/**
 * How many units are actually coming back.
 *
 * The whole parcel, LESS whatever the customer kept at the door. Counting
 * the full ordered quantity made every partial return read as a shortage —
 * two units "missing" that the customer is holding and has paid for — and
 * put that shortfall on the courier's record for goods he delivered right.
 *
 * The returns route held its own copy of this sum. One rule, one place: the
 * route and the screen now read the same arithmetic, so the list of lines
 * and the total above it cannot disagree again.
 */
export function expectedBackTotal(items: SettledLineFacts[]): number {
  return settledLines(items).reduce((sum, l) => sum + l.expectedBack, 0);
}

/** Units kept and units refused, and whether the door spoke at all. */
export function doorUnits(items: SettledLineFacts[]): {
  delivered: number;
  refused: number;
  recorded: boolean;
} {
  const lines = settledLines(items);
  return {
    delivered: lines.reduce((sum, l) => sum + (l.delivered ?? 0), 0),
    refused: lines.reduce((sum, l) => sum + l.expectedBack, 0),
    // Null everywhere means no door settlement yet — an announced return,
    // not a customer who refused every unit.
    recorded: items.some((i) => i.deliveredQty != null),
  };
}

export type HalfKey = 'MONEY' | 'GOODS';

export interface DeliveryHalf {
  key: HalfKey;
  /** Arabic, Western digits — the screen prints this as it stands. */
  label: string;
  settled: boolean;
  /** Units this half is about. */
  units: number;
}

export interface Completion {
  /** Only the halves this order actually has. A full delivery has one. */
  halves: DeliveryHalf[];
  settledCount: number;
  /** «اتمم واحد فهو اتمم جزءي» — none of them, some, or all. */
  degree: 'NONE' | 'PARTIAL' | 'FULL';
  /** «ما بنغلق غير كامل» — the only thing allowed to close an order. */
  complete: boolean;
  awaiting: HalfKey[];
  label: string;
}

/**
 * Settlement states after which no money is outstanding.
 *
 * These are exactly the terminal states of `SETTLEMENT_TRANSITIONS` in
 * finance-workflow.ts: the money has arrived, gone back, or been written
 * off, and no further transition is offered from any of them.
 *
 * PARTIALLY_SETTLED is deliberately not one, and neither is
 * PENDING_COLLECTION — every live order in this database sits in that
 * second one. A partly-paid half is «اتمم جزءي», which is precisely the
 * state the owner's rule refuses to call closed.
 */
export const MONEY_RESOLVED = ['SETTLED', 'REFUNDED', 'CANCELLED'] as const;

const HALF_LABEL: Record<HalfKey, string> = {
  MONEY: 'تحصيل مال ما استلمه العميل',
  GOODS: 'استلام الراجع وعدّه في المستودع',
};

/**
 * Is this order finished — both halves of it?
 *
 * Pure, so the route that writes the receipt and the screen that shows the
 * row answer identically. It is fed units and the settlement status, and
 * NOT the shipping status: a courier feed can write the word
 * PARTIALLY_DELIVERED without ever recording a line, and then the units that
 * word implies do not exist and neither half can be checked.
 */
export function completionOf(order: {
  /** Units the customer kept. */
  deliveredUnits: number;
  /** Units refused at the door and owed back to a shelf. */
  refusedUnits: number;
  settlementStatus: string;
  /** Has the returns desk counted the refused units in? */
  hasReturnReceipt: boolean;
}): Completion {
  const halves: DeliveryHalf[] = [];

  // The MONEY half exists because UNITS were handed over, not because a
  // value was computed: a parcel of gift units is worth nothing, still owes
  // the delivery fee, and the courier is still holding that fee.
  if (order.deliveredUnits > 0) {
    halves.push({
      key: 'MONEY',
      label: HALF_LABEL.MONEY,
      settled: (MONEY_RESOLVED as readonly string[]).includes(order.settlementStatus),
      units: order.deliveredUnits,
    });
  }
  if (order.refusedUnits > 0) {
    halves.push({
      key: 'GOODS',
      label: HALF_LABEL.GOODS,
      settled: order.hasReturnReceipt,
      units: order.refusedUnits,
    });
  }

  const settledCount = halves.filter((h) => h.settled).length;
  const awaiting = halves.filter((h) => !h.settled).map((h) => h.key);
  const complete = halves.length > 0 && settledCount === halves.length;
  const degree: Completion['degree'] =
    halves.length === 0 || settledCount === 0 ? 'NONE' : complete ? 'FULL' : 'PARTIAL';

  const label =
    halves.length === 0
      ? 'لم يُسجَّل تسليم على الباب بعد'
      : complete
        ? halves.length === 2
          ? 'مكتمل — المستلَم والراجع كلاهما مُسوَّى'
          : 'مكتمل'
        : `تمّ ${settledCount} من ${halves.length} — بانتظار ${awaiting.map((k) => HALF_LABEL[k]).join(' و')}`;

  return { halves, settledCount, degree, complete, awaiting, label };
}

/**
 * Does this order need the extra question at all?
 *
 *   «إذا الأوردر فيه أكثر من كمية واستلم أو رفض قطعة»
 *
 * Two clauses, and ONE test covers both: a parcel with some units kept and
 * some refused necessarily held more than one unit. A separate «شُحن أكثر من
 * واحد» check was written here first and then deleted — a mutation that
 * broke it changed nothing, which is how it was found to be unreachable, and
 * an unreachable guard is a second rule that only looks like it is working.
 *
 * So the single-unit parcel is excluded by arithmetic rather than by a
 * clause: it was taken or it was not, one yes/no answers it, and there is no
 * second half to ask about. A parcel of three that came back whole is a
 * plain return and is excluded the same way. The question exists for the
 * case in between, and in this database that case is 48 of 171 orders — 41
 * lines of 3 units and 7 of 2.
 */
export function needsExtraAction(items: SettledLineFacts[]): boolean {
  const units = doorUnits(items);
  return units.recorded && units.delivered > 0 && units.refused > 0;
}

/**
 * THE EXTRA ACTION.
 *
 *   «إذا الأوردر فيه أكثر من كمية واستلم أو رفض قطعة، حط إجراء إضافي مثل:
 *    هل الطلب استلم؟ نعم / لا»
 *
 * An order of three units that came back as two-kept-one-refused cannot be
 * answered by the single yes/no the tracking screen offers. It needs a second
 * one, asked later, about the half that is still open — and the words have to
 * be the same in the screen that asks it and the route that records the
 * answer, which is why they live here and not in either.
 *
 * THE CALLER NAMES ITS HALF. This picked the first open half instead, and
 * that is wrong for every screen that owns one: the returns desk was handed
 * the money question, because MONEY happens to be pushed first. A desk asks
 * about the half it is standing at, and gets nothing back when that half is
 * already settled — which is also how it knows not to ask.
 */
export function extraAction(
  completion: Completion,
  half: HalfKey
): { key: HalfKey; question: string; yes: string; no: string } | null {
  if (!completion.awaiting.includes(half)) return null;
  return half === 'GOODS'
    ? {
        key: 'GOODS',
        question: 'هل رجعت القطع المرفوضة إلى المستودع؟',
        yes: 'نعم — عددتها واستلمتها',
        no: 'لا — لم تصل بعد',
      }
    : {
        key: 'MONEY',
        question: 'هل وصل مال ما استلمه العميل؟',
        yes: 'نعم — حُصِّل',
        no: 'لا — بانتظار كشف شركة الشحن',
      };
}
