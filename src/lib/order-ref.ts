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
  // Counting rows is wrong: delete or void one and the count drops back onto
  // a number already in use, the insert hits the unique index, and on
  // Postgres that poisons the whole transaction — so the retry that was
  // supposed to recover cannot even run. Continue from the HIGHEST number
  // issued for this prefix and year instead; a gap is harmless, a collision
  // is not.
  const year = now.getFullYear();
  const stem = `${orderPrefix}-${year}-`;

  const last = await tx.order.findFirst({
    where: { companyId, orderNumber: { startsWith: stem } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });

  const highest = last ? Number.parseInt(last.orderNumber.slice(stem.length), 10) : 0;
  const next = (Number.isFinite(highest) ? highest : 0) + 1 + attempt;
  return `${stem}${String(next).padStart(4, '0')}`;
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
