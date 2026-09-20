import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';

/**
 * GET /api/control/change-requests?status=PENDING
 * The supervisor / shipping review queue. Overdue rows are flagged by the
 * server: an expired SLA escalates, it never approves anything by itself.
 */
export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('control.change_requests');

    const status = new URL(req.url).searchParams.get('status') ?? 'PENDING';
    const now = new Date();

    const rows = await db.orderChangeRequest.findMany({
      where: {
        companyId,
        ...(status === 'all' ? {} : { status }),
        order: { storeId },
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
