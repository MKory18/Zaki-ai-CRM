import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { assertOrderAccess } from '@/lib/rbac';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';

/**
 * ENTRY ISSUES — data errors on orders a MODERATOR entered.
 *
 *   GET  /api/confirmation/issues
 *   POST /api/confirmation/issues   { orderId, reason, note }
 *
 * A store-sourced order (landing page, Telegram, POS) can never raise an
 * entry issue: there is no moderator to return it to. An issue is never
 * counted as a cancellation against the agent, and the order keeps its
 * original created_at — it returns to the queue, it is not recreated.
 */

export const ISSUE_REASONS = [
  'WRONG_PHONE', 'WRONG_ADDRESS', 'WRONG_PRODUCT', 'MISSING_DATA', 'DUPLICATE', 'OTHER',
] as const;

const createSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.enum(ISSUE_REASONS),
  note: z.string().trim().max(500).optional(),
});

export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('confirmation.issues');

    const status = new URL(req.url).searchParams.get('status') ?? 'OPEN';
    const rows = await db.orderIssue.findMany({
      where: { companyId, ...(status === 'all' ? {} : { status }), order: { storeId } },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        order: {
          select: {
            id: true, orderNumber: true, merchantRef: true, createdAt: true, source: true,
            confirmationStatus: true, moderatorId: true,
            // The screen corrects the data in place, so it needs the values it
            // is about to overwrite — and the version, because the correction
            // saves through the ordinary order edit and that takes the same
            // lost-update guard as every other edit.
            version: true,
            regionId: true,
            region: { select: { id: true, name: true } },
            product: { select: { name: true } },
            quantity: true,
            customer: {
              select: { id: true, fullName: true, phone: true, rawPhone: true, altPhone: true, city: true, address: true },
            },
            moderator: { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json({ count: rows.length, issues: rows });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('confirmation.issues');

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    const access = await assertOrderAccess(parsed.data.orderId, user, { companyId, storeId }, 'orders.view');
    if (!access.allowed) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });
    const order = access.order;

    // Moderator-entered orders only.
    if (!order.moderatorId) {
      return NextResponse.json(
        {
          error: 'لا يمكن فتح إشكال إدخال على طلب من مصدر خارجي — لا يوجد مودريتور لإعادته إليه',
          code: 'NOT_MODERATOR_ENTERED',
        },
        { status: 409 }
      );
    }

    const existing = await db.orderIssue.findFirst({ where: { orderId: order.id, status: 'OPEN' }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: 'يوجد إشكال مفتوح على هذا الطلب', code: 'ISSUE_OPEN' }, { status: 409 });
    }

    const issue = await db.$transaction(async (tx) => {
      const created = await tx.orderIssue.create({
        data: {
          companyId,
          orderId: order.id,
          raisedById: user.id,
          reason: parsed.data.reason,
          note: parsed.data.note ?? null,
        },
      });
      // The order leaves the agent's hands and waits for the moderator; its
      // created_at is untouched, and no cancellation is recorded anywhere.
      await tx.order.update({
        where: { id: order.id },
        data: {
          claimedById: null,
          claimedAt: null,
          currentOwnerId: null,
          confirmationStatus: 'NEW',
          status: 'NEW',
          signatureStatus: 'UNSIGNED',
          version: { increment: 1 },
        },
      });
      await tx.orderNote.create({
        data: {
          companyId,
          orderId: order.id,
          authorId: user.id,
          kind: 'internal',
          body: `إشكال إدخال (${parsed.data.reason})${parsed.data.note ? `: ${parsed.data.note}` : ''}`,
        },
      });
      return created;
    });

    await logAudit({
      companyId, userId: user.id, action: 'ORDER_ISSUE_RAISED',
      entity: 'Order', entityId: order.id, newData: { issueId: issue.id, reason: parsed.data.reason },
    });

    return NextResponse.json({ issue }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
