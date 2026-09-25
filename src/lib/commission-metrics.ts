import type { Prisma } from '@prisma/client';
import { db } from './db';
import { CONFIRMATION_REFUSED, DELIVERED_SHIPPING, rateOf } from './order-state';
import type { CommissionMetric } from './commission-rules';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * WHAT A PERSON DID IN A SPAN — the numbers a commission rule counts.
 *
 * Each metric is read from the same columns the performance screens read, so
 * a payslip and a screen can never disagree about the same week. In
 * particular "delivered" includes a partial delivery everywhere EXCEPT the
 * accrual rule in commission.ts, which the owner deliberately limited to a
 * full delivery — see the comment there before widening anything.
 */

export interface MetricScope {
  companyId: string;
  storeId: string;
  userId: string;
  start: Date;
  /** Exclusive: the first moment AFTER the span. */
  end: Date;
  /** A target on one product rather than on everything sold. */
  productId?: string | null;
}

export interface MetricResult {
  /** What the rule's tiers are matched against. */
  count: number;
  /** The money a PERCENT rule applies to. */
  amount: number;
  /** The orders behind the figure, so an entry can point at them. */
  orderIds: string[];
}

const EMPTY: MetricResult = { count: 0, amount: 0, orderIds: [] };

/** Orders whose sale money counts: delivered inside the span. */
function deliveredIn(scope: MetricScope) {
  return {
    companyId: scope.companyId,
    storeId: scope.storeId,
    shippingStatus: { in: [...DELIVERED_SHIPPING] },
    deliveredAt: { gte: scope.start, lt: scope.end },
  };
}

/** The sale, without the courier's fee — the same basis accrual uses. */
function saleOf(order: { totalAmount: number | Prisma.Decimal; deliveryFee: number | Prisma.Decimal | null }): number {
  return Number(order.totalAmount) - Number(order.deliveryFee ?? 0);
}

async function ordersFor(tx: Tx, where: Prisma.OrderWhereInput) {
  return tx.order.findMany({
    where,
    select: { id: true, totalAmount: true, deliveryFee: true },
  });
}

/**
 * How many units this person ADDED to orders — the confirmation agent's
 * cross-sell.
 *
 * Only what was added AFTER intake, by this person. An order that arrived
 * already carrying three units because the landing page offered a bundle was
 * sold by the page, not by the agent on the phone, and it earns them
 * nothing: those lines are stamped INTAKE at creation, by every door.
 */
async function crossSellUnits(tx: Tx, scope: MetricScope): Promise<MetricResult> {
  const orders = await ordersFor(tx, deliveredIn(scope));
  if (orders.length === 0) return EMPTY;

  const lines = await tx.orderItem.findMany({
    where: {
      companyId: scope.companyId,
      orderId: { in: orders.map((o) => o.id) },
      addedById: scope.userId,
      addedStage: { not: 'INTAKE' },
      ...(scope.productId ? { productId: scope.productId } : {}),
    },
    select: { orderId: true, quantity: true },
  });

  const touched = new Set(lines.map((l) => l.orderId));
  return {
    count: lines.reduce((sum, l) => sum + l.quantity, 0),
    amount: orders.filter((o) => touched.has(o.id)).reduce((sum, o) => sum + saleOf(o), 0),
    orderIds: [...touched],
  };
}

/**
 * Orders this moderator brought that arrived with more than one unit — the
 * moderator's cross-sell, and a DIFFERENT thing from the agent's.
 *
 * The agent earns on units they added during a call. The moderator earns on
 * an order that came in multi-unit at all, because the offer that sold it is
 * theirs. Merging the two would pay one person for the other's work.
 */
async function multiUnitOrders(tx: Tx, scope: MetricScope): Promise<MetricResult> {
  const orders = await tx.order.findMany({
    where: { ...deliveredIn(scope), moderatorId: scope.userId },
    select: {
      id: true, totalAmount: true, deliveryFee: true,
      items: {
        ...(scope.productId ? { where: { productId: scope.productId } } : {}),
        select: { quantity: true, freeQuantity: true },
      },
    },
  });

  const multi = orders.filter(
    (o) => o.items.reduce((sum, i) => sum + i.quantity + i.freeQuantity, 0) > 1
  );
  return {
    count: multi.length,
    amount: multi.reduce((sum, o) => sum + saleOf(o), 0),
    orderIds: multi.map((o) => o.id),
  };
}

/** Orders this person confirmed inside the span. */
async function confirmedCount(tx: Tx, scope: MetricScope): Promise<MetricResult> {
  const orders = await ordersFor(tx, {
    companyId: scope.companyId,
    storeId: scope.storeId,
    confirmedById: scope.userId,
    confirmationStatus: 'CONFIRMED',
    confirmedAt: { gte: scope.start, lt: scope.end },
    ...(scope.productId ? { items: { some: { productId: scope.productId } } } : {}),
  });
  return {
    count: orders.length,
    amount: orders.reduce((sum, o) => sum + saleOf(o), 0),
    orderIds: orders.map((o) => o.id),
  };
}

/** Orders this moderator brought in, counted when they arrived. */
async function sourcedCount(tx: Tx, scope: MetricScope): Promise<MetricResult> {
  const orders = await ordersFor(tx, {
    companyId: scope.companyId,
    storeId: scope.storeId,
    moderatorId: scope.userId,
    createdAt: { gte: scope.start, lt: scope.end },
    ...(scope.productId ? { items: { some: { productId: scope.productId } } } : {}),
  });
  return {
    count: orders.length,
    amount: orders.reduce((sum, o) => sum + saleOf(o), 0),
    orderIds: orders.map((o) => o.id),
  };
}

/** Orders delivered in the span that this person confirmed. */
async function orderDelivered(tx: Tx, scope: MetricScope): Promise<MetricResult> {
  const orders = await ordersFor(tx, {
    ...deliveredIn(scope),
    confirmedById: scope.userId,
    ...(scope.productId ? { items: { some: { productId: scope.productId } } } : {}),
  });
  return {
    count: orders.length,
    amount: orders.reduce((sum, o) => sum + saleOf(o), 0),
    orderIds: orders.map((o) => o.id),
  };
}

/**
 * Delivered out of what this person confirmed, as a whole number.
 *
 * The denominator is every order they confirmed in the span — including the
 * ones that shipped and the ones that came back — because an order confirmed
 * is an order the courier was given. `count` is the RATE here, which is what
 * a tier like "70% and above" is matched against; `amount` is the money of
 * the delivered ones, for a rule that pays a percentage of it.
 */
async function deliveryRate(tx: Tx, scope: MetricScope): Promise<MetricResult> {
  const confirmed = await tx.order.findMany({
    where: {
      companyId: scope.companyId,
      storeId: scope.storeId,
      confirmedById: scope.userId,
      confirmationStatus: { notIn: [...CONFIRMATION_REFUSED] },
      confirmedAt: { gte: scope.start, lt: scope.end },
    },
    select: { id: true, shippingStatus: true, totalAmount: true, deliveryFee: true },
  });
  if (confirmed.length === 0) return EMPTY;

  const delivered = confirmed.filter((o) => (DELIVERED_SHIPPING as readonly string[]).includes(o.shippingStatus));
  return {
    count: rateOf(delivered.length, confirmed.length) ?? 0,
    amount: delivered.reduce((sum, o) => sum + saleOf(o), 0),
    orderIds: delivered.map((o) => o.id),
  };
}

const READERS: Record<CommissionMetric | 'MULTI_UNIT_ORDERS', (tx: Tx, scope: MetricScope) => Promise<MetricResult>> = {
  ORDER_DELIVERED: orderDelivered,
  CONFIRMED_COUNT: confirmedCount,
  SOURCED_COUNT: sourcedCount,
  DELIVERY_RATE: deliveryRate,
  CROSS_SELL_UNITS: crossSellUnits,
  MULTI_UNIT_ORDERS: multiUnitOrders,
};

/** What this person did in this span, by the measure a rule asks for. */
export async function measure(tx: Tx, metric: string, scope: MetricScope): Promise<MetricResult> {
  const read = READERS[metric as keyof typeof READERS];
  if (!read) return EMPTY;
  return read(tx, scope);
}

/**
 * How many ORDERS the figure rests on.
 *
 * A delivery rate of 100% out of two orders is not performance, and a rule
 * can refuse to pay below a minimum. For the rate that is the confirmed
 * count, not the delivered one; for everything else the count is itself.
 */
export async function sampleSize(tx: Tx, metric: string, scope: MetricScope): Promise<number> {
  if (metric !== 'DELIVERY_RATE') return (await measure(tx, metric, scope)).count;
  return tx.order.count({
    where: {
      companyId: scope.companyId,
      storeId: scope.storeId,
      confirmedById: scope.userId,
      confirmationStatus: { notIn: [...CONFIRMATION_REFUSED] },
      confirmedAt: { gte: scope.start, lt: scope.end },
    },
  });
}
