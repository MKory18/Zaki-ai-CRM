import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can } from '@/lib/authorization';
import { BEFORE_OPERATIONS } from '@/lib/change-request-routing';
import { apiErrorResponse } from '@/lib/api-error';

/**
 * GET /api/control/change-requests?status=PENDING
 * The supervisor / shipping review queue. Overdue rows are flagged by the
 * server: an expired SLA escalates, it never approves anything by itself.
 */
export async function GET(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();

    // A supervisor sees the whole desk. An agent sees the requests she is
    // the one who has to answer — the ones on orders still in her hands.
    // Sending her to a screen that refuses her, or showing her a queue she
    // cannot act on, are both ways of making the request sit unanswered.
    const supervises =
      can(user, 'control.change_requests') ||
      ['SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'CONFIRMATION_SUPERVISOR'].includes(user.role);
    const mine = supervises
      ? {}
      : { order: { claimedById: user.id, confirmationStatus: { in: BEFORE_OPERATIONS } } };

    const status = new URL(req.url).searchParams.get('status') ?? 'PENDING';
    const now = new Date();

    // AWAITING_APPLY is not a stored status: it is an approved request whose
    // change has not been carried out yet — the queue's second list. Named
    // here so the screen asks for a state rather than assembling a filter.
    const statusWhere =
      status === 'all'
        ? {}
        : status === 'AWAITING_APPLY'
          ? { status: 'APPROVED', appliedAt: null }
          : { status };

    const rows = await db.orderChangeRequest.findMany({
      where: {
        companyId,
        ...statusWhere,
        order: { storeId, ...(mine.order ?? {}) },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 200,
      include: {
        order: {
          select: {
            id: true, orderNumber: true, merchantRef: true, confirmationStatus: true, shippingStatus: true,
            customer: { select: { fullName: true, phone: true } },
          },
        },
      },
    });

    const requesterIds = [...new Set(rows.map((r) => r.requestedById))];
    const requesters = requesterIds.length
      ? await db.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(requesters.map((u) => [u.id, u.name]));

    return NextResponse.json({
      count: rows.length,
      requests: rows.map((r) => ({
        ...r,
        requestedByName: nameOf.get(r.requestedById) ?? null,
        overdue: r.status === 'PENDING' && !!r.slaDueAt && new Date(r.slaDueAt) < now,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
