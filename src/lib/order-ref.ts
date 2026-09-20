import type { Prisma } from '@prisma/client';
import { db } from './db';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * ORDER REFERENCE — one generator for every intake path (manual, AI, Telegram,
 * landing page). Before Stage 3 each path built its own string, which is how
 * two orders end up with the same number.
 *
 * The merchant reference IS the order number: one identifier, generated for
 * every order, read-only afterwards, and the value sent in the courier's
 * dedicated reference field (never in notes). Two separate identifiers would
 * be two things to reconcile.
 */
export async function nextOrderNumber(
  tx: Tx,
  companyId: string,
  orderPrefix: string,
  attempt = 0,
  now: Date = new Date()
): Promise<string> {
  const count = await tx.order.count({ where: { companyId } });
  return `${orderPrefix}-${now.getFullYear()}-${String(count + 1 + attempt).padStart(4, '0')}`;
}

/** Fields every order carries at creation: the number and its merchant ref. */
export async function orderRefFields(
  tx: Tx,
  companyId: string,
  orderPrefix: string,
  attempt = 0,
  now: Date = new Date()
): Promise<{ orderNumber: string; merchantRef: string }> {
  const orderNumber = await nextOrderNumber(tx, companyId, orderPrefix, attempt, now);
  return { orderNumber, merchantRef: orderNumber };
}
