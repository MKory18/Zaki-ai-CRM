import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { customerRisk } from '@/lib/customer-risk';
import { POSTPONE_LEAD_DAYS } from '@/lib/confirmation-queue';
import { deriveCoreState, type StateSource } from '@/lib/order-state';
import { NO_ANSWER_LIMIT } from '@/lib/confirmation-workflow';
import { firstActionTimes } from '@/lib/response-clock';

/**
 * GET /api/confirmation/mine — the agent's own two sections:
 * in-confirmation (workable) and already-confirmed (read-only; changes go
 * through a change request). The customer risk panel is computed here, never
 * in the browser.
 */

const OPEN = ['NEW', 'IN_PROGRESS', 'NO_ANSWER', 'FOLLOW_UP_REQUIRED', 'POSTPONED'];

const ORDER_SELECT = {
  id: true, orderNumber: true, merchantRef: true, createdAt: true, confirmedAt: true, version: true,
  // When she pulled it — the moment the response clock starts.
  claimedAt: true,
  confirmationStatus: true, shippingStatus: true, totalAmount: true, currency: true,
  postponedUntil: true, postponePreferredTime: true, postponeCount: true,
  nextFollowUpAt: true, followUpReason: true, discountAmount: true,
  customer: { select: { id: true, fullName: true, phone: true, rawPhone: true, city: true, address: true, totalOrders: true } },
  items: { select: { id: true, productName: true, quantity: true, freeQuantity: true, lineTotal: true, reservedQty: true } },
  _count: { select: { contactAttempts: true, notes: true } },
} as const;

/** No-answer attempts logged so far — drives the 1/2/3 counter in the UI. */
async function noAnswerCounts(orderIds: string[]) {
  if (orderIds.length === 0) return new Map<string, number>();
  const rows = await db.orderContactAttempt.groupBy({
    by: ['orderId'],
    where: { orderId: { in: orderIds }, result: { in: ['NO_ANSWER', 'BUSY'] } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.orderId, r._count._all]));
}

export async function GET() {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('confirmation.work');

    const scope = { companyId, storeId, claimedById: user.id };

    const [inConfirmation, confirmed] = await Promise.all([
      db.order.findMany({
        where: { ...scope, confirmationStatus: { in: OPEN } },
        orderBy: [{ nextFollowUpAt: 'asc' }, { claimedAt: 'asc' }],
        take: 200,
        select: ORDER_SELECT,
      }),
      db.order.findMany({
        where: { ...scope, confirmationStatus: 'CONFIRMED' },
        orderBy: { confirmedAt: 'desc' },
        take: 100,
        select: { ...ORDER_SELECT, changeRequests: { where: { status: 'PENDING' }, select: { id: true, createdAt: true } } },
      }),
    ]);

    // Risk is per customer, company-wide — one lookup per distinct customer.
    const customerIds = [...new Set(inConfirmation.map((o) => o.customer.id))];
    const risks = await Promise.all(customerIds.map((id) => customerRisk(db, companyId, id)));
    const riskByCustomer = new Map(customerIds.map((id, i) => [id, risks[i]]));
    const noAnswer = await noAnswerCounts(inConfirmation.map((o) => o.id));

    // The response clock. An order pulled from the pool and not yet called
    // is the most expensive thing on this desk, so she sees how long each
    // one has been waiting on her, and how long since she took anything new.
    const firstAction = await firstActionTimes(inConfirmation.map((o) => o.id));
    const lastClaim = await db.orderClaimHistory.findFirst({
      where: { companyId, userId: user.id, action: 'CLAIMED', order: { storeId } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      leadDays: POSTPONE_LEAD_DAYS,
      noAnswerLimit: NO_ANSWER_LIMIT,
      // The server's own clock, so a wrong clock on her machine cannot make
      // an order look answered or overdue.
      serverNow: new Date().toISOString(),
      lastClaimAt: lastClaim?.createdAt ?? null,
      // One derived state and one repeat-customer counter everywhere.
      inConfirmation: inConfirmation.map((o) => ({
        ...o,
        state: deriveCoreState(o as unknown as StateSource),
        previousOrders: Math.max(0, (o.customer.totalOrders ?? 1) - 1),
        risk: riskByCustomer.get(o.customer.id) ?? null,
        noAnswerCount: noAnswer.get(o.id) ?? 0,
        firstActionAt: firstAction.get(o.id) ?? null,
      })),
      confirmed: confirmed.map((o) => ({
        ...o,
        state: deriveCoreState(o as unknown as StateSource),
        previousOrders: Math.max(0, (o.customer.totalOrders ?? 1) - 1),
        noAnswerCount: 0,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
