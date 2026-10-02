import type { Prisma } from '@prisma/client';
import type { db as prismaDb } from './db';
import { drawDownStock, onHandTotal } from './receiving';
import { roundMinor } from './money';

type Tx = Prisma.TransactionClient | typeof prismaDb;

/**
 * WHERE A RESERVATION BECOMES A SALE.
 *
 * Confirming an order reserves units; delivering it was supposed to consume
 * them. It never did. The reservation was released the moment the order left
 * the open set, the batch kept its full remainder, and the unit quietly
 * returned to the sellable pool — so the same unit could be sold again, and
 * again. On this database: 115 delivered orders, 173 units handed to
 * customers, and every batch still reading 0 sold.
 *
 * Two rules hold everything together:
 *
 *   Units live in batches. A ledger line that does not move a batch moves
 *   nothing — it only makes the ledger disagree with the shelf.
 *
 *   Consuming twice is worse than not consuming. Couriers retry, webhooks
 *   redeliver, and a human presses the button again; so consumption is keyed
 *   to the order and asks the ledger before it touches anything.
 */

/** A movement of this type carrying this orderId means the order is settled. */
const SALE = 'SALE';
const RETURN = 'RETURN';

export interface ConsumptionResult {
  /** Units actually taken out of batches. */
  taken: number;
  /** Units the order needed that no batch could supply. */
  short: number;
  /** True when a previous call had already done the work. */
  alreadyDone: boolean;
  /** What those units cost, from the batches they actually came out of. */
  cost: number;
}

/**
 * Has this order already moved stock in this direction?
 *
 * The check is the ledger itself rather than a flag on the order, because the
 * ledger is what the stock figures are reconciled against; a flag can drift
 * from it, and then nobody can tell which one is lying.
 */
async function alreadyMoved(tx: Tx, orderId: string, type: string): Promise<boolean> {
  const seen = await tx.inventoryMovement.findFirst({
    where: { referenceId: orderId, type },
    select: { id: true },
  });
  return seen !== null;
}

/**
 * Take an order's goods out of stock, oldest batch first.
 *
 * Runs inside the caller's transaction so the units leave stock in the same
 * commit that marks the order delivered — there is no window in which the
 * order is delivered and the goods are still for sale.
 */
export async function consumeOrderStock(
  tx: Tx,
  input: { orderId: string; companyId: string; allowNegativeStock: boolean; userId?: string | null }
): Promise<ConsumptionResult> {
  if (await alreadyMoved(tx, input.orderId, SALE)) {
    return { taken: 0, short: 0, alreadyDone: true, cost: 0 };
  }

  const order = await tx.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: {
      orderNumber: true,
      // WHICH SHELF THESE UNITS LEAVE. Availability and reservation are both
      // store-scoped; this draw-down was not, so an order could be promised
      // from its own store's shelf and served out of another's.
      storeId: true,
      items: {
        select: { productId: true, productName: true, quantity: true, freeQuantity: true },
      },
      // The currency's minor unit, read from the order rather than asked of
      // the caller: it is a property of the order, and four callers would
      // otherwise each have to find it and could each find a different one.
      store: { select: { country: { select: { minorUnit: true } } } },
    },
  });
  if (!order) return { taken: 0, short: 0, alreadyDone: false, cost: 0 };
  const minorUnit = order.store?.country?.minorUnit ?? 2;

  let taken = 0;
  let short = 0;
  let cost = 0;

  for (const line of order.items) {
    // The gift units are goods too. Leaving them in stock is how a shelf
    // ends up holding inventory that was given away.
    const need = line.quantity + line.freeQuantity;
    if (need <= 0) continue;

    const result = await drawDownStock(tx, {
      companyId: input.companyId,
      storeId: order.storeId,
      productId: line.productId,
      quantity: need,
      allowNegative: input.allowNegativeStock,
    });
    taken += result.taken;
    short += result.short;
    cost += result.cost;

    if (result.taken > 0) {
      await tx.inventoryMovement.create({
        data: {
          companyId: input.companyId,
          productId: line.productId,
          type: SALE,
          quantity: -result.taken,
          balanceAfter: await onHandTotal(tx, input.companyId, line.productId),
          referenceId: input.orderId,
          reason: `تسليم الطلب ${order.orderNumber}`,
          createdById: input.userId ?? null,
        },
      });
    }
  }

  // The reservation has served its purpose: the units are gone, not held.
  await tx.orderItem.updateMany({
    where: { orderId: input.orderId, reservedQty: { gt: 0 } },
    data: { reservedQty: 0 },
  });

  /*
   * WHAT IT ACTUALLY COST, WRITTEN DOWN AT THE ONE MOMENT IT IS KNOWN.
   *
   * `estimatedCostOfGoods` is stamped when the order is WRITTEN, from a
   * weighted average of what happens to be on the shelf then — and it is
   * zero whenever the product had no costed batch at that moment, which
   * is every product imported before its first production run. Every
   * margin in the product is built on that figure.
   *
   * Here the goods have left, and the batches they left say what they
   * cost. `product-cost.ts` already describes exactly this — «the
   * CONSUMED cost… the figure that belongs in a closed order's profit» —
   * and nothing was recording it.
   *
   * The name stays `estimatedCostOfGoods` because thirteen readers use
   * it and renaming a column is not what this is. After delivery it is
   * no longer an estimate.
   *
   * Only when something was actually drawn: an order served from an
   * empty shelf (negative stock allowed) took no money out of any batch,
   * and writing zero over the estimate would be replacing a guess with a
   * falsehood.
   */
  if (taken > 0) {
    await tx.order.update({
      where: { id: input.orderId },
      // Rounded by the CURRENCY. Two decimals here was the same defect found
      // in four other files today, spelled differently — `Math.round(x * 100)
      // / 100` instead of `.toFixed(2)` — which is why the sweep that caught
      // those walked past this one. JOD has three.
      data: { estimatedCostOfGoods: roundMinor(cost, minorUnit) },
    });
  }

  return { taken, short, alreadyDone: false, cost: roundMinor(cost, minorUnit) };
}

/**
 * WHAT THE DAMAGED UNITS COST, CARRIED BY THE ONES THAT SURVIVED.
 *
 * «إذا في توالف (تالف) لازم تنقص من المخزون بس داخلة ضمن التكلفة تبع
 * المخزون للمنتج» — the owner's ruling, and it is not the obvious one.
 *
 * The obvious treatment writes the damaged units off: the shelf loses four
 * units and the business books their cost as a loss. That is what a
 * factory's accounts do. This shop is not asking for that. It is saying the
 * money is already spent on this product and must stay ON it — so the units
 * still on the shelf are what it has to be earned back from. Twelve
 * survivors of a run of sixteen each carry a sixteenth of the run, not a
 * twelfth, and a price set from that cost is the one that actually recovers
 * the money.
 *
 * So nothing is written off and nothing is invented: the SAME total money
 * goes back into stock over FEWER units, and the unit cost rises by exactly
 * the ratio between them.
 *
 * AND WHEN NOTHING CAME BACK SOUND, NOTHING CAN CARRY IT. A parcel whose
 * every unit is damaged leaves no survivor to absorb anything, and inventing
 * a unit to hold the cost would be inventing stock. That case returns zero
 * and says so, rather than quietly pushing the cost onto another batch.
 *
 * Pure, so the arithmetic can be read and tested without a database.
 */
export interface AbsorbedDamage {
  /** Units that go back on the shelf — the sound ones, never the damaged. */
  quantity: number;
  /** The money those units carry, including the damaged ones' share. */
  totalCost: number;
  /** What one surviving unit now costs. */
  costPerUnit: number;
  /** The money moved off the damaged units and onto the survivors. */
  absorbed: number;
}

/**
 * `minorUnit` DEFAULTS TO TWO, AND THAT DEFAULT IS FOR A CALLER WITHOUT A
 * CURRENCY — NOT A GUESS ABOUT THE MONEY.
 *
 * `costPerUnit` here is WRITTEN, onto a production batch, so two decimals was
 * the same defect found in five other files today: JOD has three, and a fils
 * was dropped from the cost every returned parcel put back on the shelf.
 */
export function absorbDamaged(input: {
  sound: number;
  damaged: number;
  costPerUnit: number;
  minorUnit?: number;
}): AbsorbedDamage {
  const sound = Math.max(0, Math.trunc(input.sound));
  const damaged = Math.max(0, Math.trunc(input.damaged));
  const cost = Number.isFinite(input.costPerUnit) && input.costPerUnit > 0 ? input.costPerUnit : 0;
  const unit = input.minorUnit ?? 2;
  if (sound <= 0) return { quantity: 0, totalCost: 0, costPerUnit: 0, absorbed: 0 };
  const totalCost = roundMinor(cost * (sound + damaged), unit);
  return {
    quantity: sound,
    totalCost,
    costPerUnit: roundMinor(totalCost / sound, unit),
    absorbed: roundMinor(cost * damaged, unit),
  };
}

/**
 * Put returned goods back on the shelf.
 *
 * The returns screen already wrote a RETURN line to the ledger — and stopped
 * there, so the ledger said the goods were back while no batch had gained a
 * single unit and the shipment screen still reported a shortage. Units go
 * into a batch of their own, at the cost they left at, so a return cannot
 * quietly rewrite the cost of goods on stock that never moved.
 */
export async function restoreOrderStock(
  tx: Tx,
  input: {
    orderId: string;
    companyId: string;
    /** Units confirmed sound after counting — never the shipped quantity. */
    receivedQty: number;
    /** Units that came back broken. They do not return to stock; their cost does. */
    damagedQty?: number;
    userId?: string | null;
  }
): Promise<{ restored: number; alreadyDone: boolean; neverConsumed?: boolean; absorbed?: number }> {
  if (input.receivedQty <= 0) return { restored: 0, alreadyDone: false };
  if (await alreadyMoved(tx, input.orderId, RETURN)) {
    return { restored: 0, alreadyDone: true };
  }

  // NOTHING COMES BACK THAT NEVER LEFT.
  //
  // Consumption happens at DELIVERY, not at dispatch — so an order refused
  // at the door, or cancelled in transit, never took its units out of any
  // batch. Putting them "back" then does not restore stock, it INVENTS it:
  // a brand-new batch of units the shelf already holds, and the figure
  // climbs by the whole parcel every time one comes back undelivered.
  //
  // The ledger is the authority, not the order's status, for the same
  // reason `alreadyMoved` is: a status can be rewritten by a later path,
  // and then nobody can tell which of the two is lying.
  if (!(await alreadyMoved(tx, input.orderId, SALE))) {
    return { restored: 0, alreadyDone: false, neverConsumed: true };
  }

  const order = await tx.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: {
      orderNumber: true,
      /*
       * WHICH SHELF THEY COME BACK TO.
       *
       * The returned batch was created with no `storeId` at all, so the units
       * landed in the company-wide pile — invisible to the store-scoped
       * `onHand` the store's own availability reads. The goods were restored
       * and were never sellable again by the store that lost them.
       */
      storeId: true,
      items: { select: { productId: true, quantity: true, freeQuantity: true } },
      // Read from the order for the same reason `consumeOrderStock` reads it:
      // the currency is the order's, and asking each caller to find it is how
      // two of them find different answers.
      store: { select: { country: { select: { minorUnit: true } } } },
    },
  });
  if (!order) return { restored: 0, alreadyDone: false };
  const restoreUnit = order.store?.country?.minorUnit ?? 2;

  let remaining = input.receivedQty;
  let restored = 0;
  let absorbedTotal = 0;
  // The damaged units belong to whichever line they were counted from, and
  // the counting does not say which. They are shared out in the same
  // proportion as the sound ones: exact on a single-line order, and the only
  // defensible split on any other.
  let damagedLeft = Math.max(0, Math.trunc(input.damagedQty ?? 0));
  const soundTotal = input.receivedQty;

  for (const line of order.items) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, line.quantity + line.freeQuantity);
    if (take <= 0) continue;
    remaining -= take;

    // What did this unit cost when it left? Its own batches are the honest
    // answer, and a return at an invented cost silently moves the profit.
    const lastCost = await tx.productionBatch.findFirst({
      // The store's own last cost. Another store's batch is another shelf's
      // money, and a return priced off it moves this store's profit.
      where: {
        companyId: input.companyId,
        productId: line.productId,
        ...(order.storeId ? { storeId: order.storeId } : {}),
      },
      orderBy: { productionDate: 'desc' },
      select: { costPerUnit: true },
    });
    const costPerUnit = lastCost?.costPerUnit ?? 0;

    // This line's share of the damage, with the last line to take units
    // absorbing whatever the rounding left, so no unit's cost is dropped.
    const share = soundTotal > 0 ? Math.round(damagedLeft * (take / soundTotal)) : 0;
    const damagedHere = remaining <= 0 ? damagedLeft : Math.min(damagedLeft, share);
    damagedLeft -= damagedHere;
    const carried = absorbDamaged({ sound: take, damaged: damagedHere, costPerUnit, minorUnit: restoreUnit });
    absorbedTotal += carried.absorbed;

    const batch = await tx.productionBatch.create({
      data: {
        companyId: input.companyId,
        // Back onto the shelf it left, not into the company-wide pile.
        storeId: order.storeId,
        productId: line.productId,
        batchNumber: `RET-${order.orderNumber}-${line.productId.slice(0, 6)}`,
        quantityProduced: take,
        quantityRemaining: take,
        quantitySold: 0,
        manufacturingCost: 0,
        totalProductionCost: carried.totalCost,
        costPerUnit: carried.costPerUnit,
        productionDate: new Date(),
        notes:
          damagedHere > 0
            ? `مرتجع الطلب ${order.orderNumber} — بعد العد والفحص. ${damagedHere} تالفة لا تعود للرفّ وكلفتُها محمولةٌ على ${take} السليمة`
            : `مرتجع الطلب ${order.orderNumber} — بعد العد والفحص`,
        status: 'COMPLETED',
      },
    });

    await tx.inventoryMovement.create({
      data: {
        companyId: input.companyId,
        productId: line.productId,
        batchId: batch.id,
        type: RETURN,
        quantity: take,
        balanceAfter: await onHandTotal(tx, input.companyId, line.productId),
        referenceId: input.orderId,
        reason: `مرتجع ${order.orderNumber} — بعد العد والفحص`,
        createdById: input.userId ?? null,
      },
    });

    restored += take;
  }

  return { restored, alreadyDone: false, absorbed: roundMinor(absorbedTotal, restoreUnit) };
}
