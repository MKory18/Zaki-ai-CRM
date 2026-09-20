import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { customerRisk } from '@/lib/customer-risk';
import { POSTPONE_LEAD_DAYS } from '@/lib/confirmation-queue';
import { NO_ANSWER_LIMIT } from '@/lib/confirmation-workflow';

/**
 * GET /api/confirmation/mine — the agent's own two sections:
 * in-confirmation (workable) and already-confirmed (read-only; changes go
 * through a change request). The customer risk panel is computed here, never
 * in the browser.
 */

const OPEN = ['NEW', 'IN_PROGRESS', 'NO_ANSWER', 'FOLLOW_UP_REQUIRED', 'POSTPONED'];

const ORDER_SELECT = {
  id: true, orderNumber: true, merchantRef: true, createdAt: true, confirmedAt: true, version: true,
  confirmationStatus: true, shippingStatus: true, totalAmount: true, currency: true,
  postponedUntil: true, postponePreferredTime: true, postponeCount: true,
  nextFollowUpAt: true, followUpReason: true, discountAmount: true,
  customer: { select: { id: true, fullName: true, phone: true, rawPhone: true, city: true, address: true } },
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

    return NextResponse.json({
      leadDays: POSTPONE_LEAD_DAYS,
      noAnswerLimit: NO_ANSWER_LIMIT,
      inConfirmation: inConfirmation.map((o) => ({
        ...o,
        risk: riskByCustomer.get(o.customer.id) ?? null,
        noAnswerCount: noAnswer.get(o.id) ?? 0,
      })),
      confirmed: confirmed.map((o) => ({ ...o, noAnswerCount: 0 })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
