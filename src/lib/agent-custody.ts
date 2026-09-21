import type { Prisma } from '@prisma/client';
import { db } from './db';
import { roundMinor } from './money';

/**
 * AGENT CUSTODY — what a courier is holding right now.
 *
 * A shipping company sends a statement and we match it. An agent sends
 * nothing: he takes parcels from the warehouse, knocks on doors, collects
 * cash, and comes back. Between those two moments the company's goods and
 * the company's money are in his hands and nothing said how much.
 *
 * So custody is DERIVED from the orders he is carrying, exactly the way the
 * order state and the zone are derived — there is no custody column to fall
 * out of step with reality, and no second place to correct.
 *
 * Three questions, in the order anyone asks them:
 *
 *   ما زال بيده   — parcels shipped to him and not yet closed
 *   حصّله ولم يسلّمه — cash collected on delivered orders, not yet settled
 *   له علينا       — his delivery fees on those same orders
 *
 * The balance is what he owes us minus what we owe him. It is never stored:
 * the moment a receipt is recorded the orders behind it settle, and the same
 * calculation returns a smaller number.
 */

/** Statuses that mean the parcel is still out with him. */
const IN_HAND = ['SHIPPED', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURN_REQUESTED'];

/** Statuses that mean he has taken money for it. */
const COLLECTED = ['DELIVERED', 'PARTIALLY_DELIVERED'];

/** Settlement states that mean the cash has NOT reached us yet. */
const UNSETTLED = ['PENDING', 'PENDING_COLLECTION', 'COLLECTED'];

export interface CustodyOrder {
  id: string;
  orderNumber: string;
  merchantRef: string | null;
  customerName: string;
  regionName: string | null;
  shippingStatus: string;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  /** What the customer paid at the door. */
  collected: number;
  /** His fee for that door. */
  fee: number;
}

export interface AgentCustody {
  agent: { id: string; name: string; code: string };
  currencyCode: string;
  /** Parcels still out with him. */
  inHand: CustodyOrder[];
  /** Delivered, money taken, not yet handed over. */
  owing: CustodyOrder[];
  totals: {
    inHandCount: number;
    /** Value of the goods still out with him. */
    inHandValue: number;
    /** Cash he has collected and not handed over. */
    collected: number;
    /** Delivery fees we owe him on that same work. */
    fees: number;
    /** collected − fees: positive means he owes us. */
    balance: number;
  };
}

type Tx = Prisma.TransactionClient | typeof db;

interface Scope {
  companyId: string;
  storeId: string;
  minorUnit: number;
  currencyCode: string;
}

/** One agent's custody, or null when that provider is not an agent of ours. */
export async function agentCustody(
  tx: Tx,
  providerId: string,
  scope: Scope
): Promise<AgentCustody | null> {
  const agent = await tx.deliveryProvider.findFirst({
    where: { id: providerId, companyId: scope.companyId },
    select: { id: true, name: true, code: true, kind: true },
  });
  if (!agent) return null;

  const orders = await tx.order.findMany({
    where: {
      companyId: scope.companyId,
      storeId: scope.storeId,
      deliveryProviderId: providerId,
      OR: [
        { shippingStatus: { in: IN_HAND } },
        { shippingStatus: { in: COLLECTED }, settlementStatus: { in: UNSETTLED } },
      ],
    },
    select: {
      id: true, orderNumber: true, merchantRef: true,
      shippingStatus: true, shippedAt: true, deliveredAt: true,
      totalAmount: true, collectedAmount: true, deliveryFee: true,
      customer: { select: { fullName: true } },
      region: { select: { name: true } },
    },
    orderBy: { shippedAt: 'asc' },
  });

  const inHand: CustodyOrder[] = [];
  const owing: CustodyOrder[] = [];

  for (const o of orders) {
    const row: CustodyOrder = {
      id: o.id,
      orderNumber: o.orderNumber,
      merchantRef: o.merchantRef,
      customerName: o.customer?.fullName ?? '—',
      regionName: o.region?.name ?? null,
      shippingStatus: o.shippingStatus,
      shippedAt: o.shippedAt,
      deliveredAt: o.deliveredAt,
      // What he actually took at the door when it is recorded; the order's
      // own total only while it is still out and nothing has been taken.
      collected: Number(o.collectedAmount ?? o.totalAmount ?? 0),
      fee: Number(o.deliveryFee ?? 0),
    };
    if (COLLECTED.includes(o.shippingStatus)) owing.push(row);
    else inHand.push(row);
  }

  const round = (n: number) => roundMinor(n, scope.minorUnit);
  const collected = round(owing.reduce((sum, o) => sum + o.collected, 0));
  const fees = round(owing.reduce((sum, o) => sum + o.fee, 0));

  return {
    agent: { id: agent.id, name: agent.name, code: agent.code },
    currencyCode: scope.currencyCode,
    inHand,
    owing,
    totals: {
      inHandCount: inHand.length,
      inHandValue: round(inHand.reduce((sum, o) => sum + o.collected, 0)),
      collected,
      fees,
      balance: round(collected - fees),
    },
  };
}

/** Every agent of this company, with their custody. Quiet agents included:
 *  a zero balance is an answer, and its absence looks like a missing page. */
export async function allAgentCustody(tx: Tx, scope: Scope): Promise<AgentCustody[]> {
  const agents = await tx.deliveryProvider.findMany({
    where: { companyId: scope.companyId, kind: 'AGENT' },
    select: { id: true },
    orderBy: { name: 'asc' },
  });

  const rows = await Promise.all(agents.map((a) => agentCustody(tx, a.id, scope)));
  return rows.filter((r): r is AgentCustody => r !== null);
}
