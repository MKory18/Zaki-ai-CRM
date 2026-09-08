import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { deriveFollowUpState } from '@/lib/confirmation-workflow';

/**
 * GET /api/orders/follow-ups — backend-enforced follow-up queues.
 *
 * Query params:
 *   bucket = today | overdue | upcoming | my | all   (server decides eligibility)
 *   page / limit
 *
 * Derivation is SERVER-TIME based (deriveFollowUpState) — browser clock never used.
 */
export async function GET(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    const { searchParams } = new URL(req.url);
    const bucket = searchParams.get('bucket') || 'today';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    // Base: orders with an active (scheduled) follow-up in this company
    const base: Record<string, unknown> = {
      companyId,
      nextFollowUpAt: { not: null },
      followUpStatus: { notIn: ['COMPLETED', 'CANCELLED'] },
    };

    // Role scoping: agents see only their own cases + company queue
    const isSelfScoped = ['CONFIRMATION_AGENT', 'FOLLOW_UP_AGENT', 'MODERATOR'].includes(user.role);
    const isGlobalView = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'DELIVERY_MANAGER', 'SETTLEMENT_OFFICER', 'ACCOUNTANT'].includes(user.role);

    if (bucket === 'my') {
      base.OR = [{ claimedById: user.id }, { assignedToId: user.id }, { currentOwnerId: user.id }];
    } else if (isSelfScoped && !isGlobalView) {
      // Self-scoped roles: own cases + unclaimed eligible queue only
      base.OR = [
        { claimedById: user.id },
        { assignedToId: user.id },
        { currentOwnerId: user.id },
        { claimedById: null, signatureStatus: 'UNSIGNED' }, // claimable follow-up pool
      ];
    } else if (!isGlobalView) {
      base.id = '__no_access__';
    }
    // Global-view roles: company-wide follow-ups (companyId already scoped)

    switch (bucket) {
      case 'today':
        base.nextFollowUpAt = { gte: startOfToday, lt: endOfToday };
        break;
      case 'overdue':
        base.nextFollowUpAt = { lt: now };
        break;
      case 'upcoming':
        base.nextFollowUpAt = { gte: endOfToday };
        break;
      case 'my':
      case 'all':
      default:
        break;
    }

    const [total, orders] = await Promise.all([
      db.order.count({ where: base as any }),
      db.order.findMany({
        where: base as any,
        include: {
          customer: { select: { id: true, fullName: true, phone: true, rawPhone: true, city: true } },
          product: { select: { id: true, name: true, image: true } },
          owner: { select: { id: true, name: true } },
          claimer: { select: { id: true, name: true } },
        },
        orderBy:
          bucket === 'overdue'
            ? { nextFollowUpAt: 'asc' }   // oldest overdue first
            : { nextFollowUpAt: 'asc' },  // soonest first
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Enrich with server-derived bucket state (DUE / OVERDUE / SCHEDULED)
    const enriched = orders.map((o) => ({
      ...o,
      followUpState: deriveFollowUpState(o.nextFollowUpAt, o.followUpStatus, now),
    }));

    // Summary counts (single round trip)
    const [dueToday, overdue, upcoming, mine] = await Promise.all([
      db.order.count({ where: { ...base, nextFollowUpAt: { gte: startOfToday, lt: endOfToday } } as any }),
      db.order.count({ where: { ...base, nextFollowUpAt: { lt: now } } as any }),
      db.order.count({ where: { ...base, nextFollowUpAt: { gte: endOfToday } } as any }),
      db.order.count({
        where: {
          companyId,
          nextFollowUpAt: { not: null },
          followUpStatus: { notIn: ['COMPLETED', 'CANCELLED'] },
          OR: [{ claimedById: user.id }, { assignedToId: user.id }, { currentOwnerId: user.id }],
        } as any,
      }),
    ]);

    return NextResponse.json({
      orders: enriched,
      summary: { dueToday, overdue, upcoming, mine: mine },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
