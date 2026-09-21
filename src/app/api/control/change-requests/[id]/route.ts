import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { mayDecide } from '@/lib/change-request-routing';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';

/**
 * PATCH /api/control/change-requests/:id — decide one request.
 *
 * Approving unblocks the order and records the decision; it does NOT rewrite
 * the order by itself, because an approved change may touch quantity, offer
 * or discount, and those must run through the order's own money path rather
 * than a blind field copy. The response lists the fields to apply.
 *
 * There is no auto-approval anywhere: an expired SLA escalates, silence is
 * never consent.
 */
const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();

    const parsed = decideSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    if (parsed.data.decision === 'REJECTED' && !parsed.data.note) {
      return NextResponse.json({ error: 'الرفض يتطلب سبباً' }, { status: 400 });
    }

    const request = await db.orderChangeRequest.findFirst({
      where: { id, companyId, order: { storeId } },
      // Who may decide depends on how far the order has travelled, so the
      // stage travels with the request.
      include: {
        order: {
          select: { id: true, orderNumber: true, confirmationStatus: true, claimedById: true },
        },
      },
    });
    if (!request) return NextResponse.json({ error: 'طلب التعديل غير موجود' }, { status: 404 });
    if (request.status !== 'PENDING') {
      return NextResponse.json({ error: 'تم البت في هذا الطلب مسبقاً', code: 'ALREADY_DECIDED' }, { status: 409 });
    }
    if (request.requestedById === user.id) {
      return NextResponse.json(
        { error: 'لا يمكنك اعتماد طلب تعديل قدّمته بنفسك', code: 'SELF_APPROVAL' },
        { status: 403 }
      );
    }

    // The only person who can answer "can this still be changed?" is the one
    // holding the order. Before confirmation that is the agent on the phone
    // with the customer; after it the order is in a batch or on a van and the
    // question becomes whether the courier can still be reached — which was
    // never the agent's authority. A supervisor may decide either way, so an
    // escalation path never depends on one person being at their desk.
    const routing = mayDecide(user, request.order);
    if (!routing.allowed) {
      return NextResponse.json(
        {
          error: routing.reason,
          errorAr: routing.reason,
          code: 'NOT_THE_DECIDER',
          decider: routing.decider,
        },
        { status: 403 }
      );
    }

    const decided = await db.$transaction(async (tx) => {
      const updated = await tx.orderChangeRequest.update({
        where: { id },
        data: {
          status: parsed.data.decision,
          decidedById: user.id,
          decidedAt: new Date(),
          decisionNote: parsed.data.note ?? null,
        },
      });
      await tx.orderNote.create({
        data: {
          companyId,
          orderId: request.orderId,
          authorId: user.id,
          kind: 'internal',
          body:
            parsed.data.decision === 'APPROVED'
              ? `تم اعتماد طلب التعديل${parsed.data.note ? `: ${parsed.data.note}` : ''}`
              : `تم رفض طلب التعديل: ${parsed.data.note}`,
        },
      });
      return updated;
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: parsed.data.decision === 'APPROVED' ? 'CHANGE_REQUEST_APPROVED' : 'CHANGE_REQUEST_REJECTED',
      entity: 'OrderChangeRequest',
      entityId: id,
      previousData: { status: 'PENDING' },
      newData: { status: parsed.data.decision, note: parsed.data.note ?? null },
    });

    return NextResponse.json({
      request: decided,
      // The approved fields still have to be applied through the order APIs.
      fieldsToApply: parsed.data.decision === 'APPROVED' ? decided.changes : null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
