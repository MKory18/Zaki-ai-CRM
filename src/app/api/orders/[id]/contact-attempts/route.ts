import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { assertOrderAccess } from '@/lib/rbac';
import { CONTACT_METHODS, CONTACT_RESULTS } from '@/lib/confirmation-workflow';
import { logAudit } from '@/lib/audit';
import { NO_ANSWER_LIMIT } from '@/lib/confirmation-workflow';
import { releaseOrderLines } from '@/lib/reservation';
import { can, authorize } from '@/lib/authorization';

/**
 * GET  /api/orders/[id]/contact-attempts — chronological attempt history
 * POST /api/orders/[id]/contact-attempts — record one attempt (append-only)
 *
 * Server derives: employeeId, employeeRole, attemptNumber, createdAt.
 * Client can NEVER forge: companyId, employeeId, employeeRole, attemptNumber.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();
    const access = await assertOrderAccess(id, user, { companyId, storeId }, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found' }, { status: map[access.reason] });
    }

    const attempts = await db.orderContactAttempt.findMany({
      where: { orderId: id, companyId },
      orderBy: { attemptNumber: 'asc' },
      include: { employee: { select: { id: true, name: true } } },
    });

    const last = attempts.length ? attempts[attempts.length - 1] : null;
    return NextResponse.json({
      attempts,
      summary: {
        total: attempts.length,
        lastAttempt: last,
        lastEmployee: last?.employee?.name ?? null,
        lastResult: last?.result ?? null,
        nextFollowUpAt: last?.nextFollowUpAt ?? null,
      },
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

function parseFollowUpDate(v: unknown): { ok: true; date: Date | null } | { ok: false; error: string } {
  if (v === undefined || v === null || v === '') return { ok: true, date: null };
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return { ok: false, error: 'Invalid nextFollowUpAt date' };
  // Server-time check: follow-up must be in the future (1 min tolerance)
  if (d.getTime() < Date.now() - 60_000) return { ok: false, error: 'nextFollowUpAt must be in the future' };
  return { ok: true, date: d };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();

    if (!can(user, 'orders.edit') && !can(user, 'orders.claim')) {
      return NextResponse.json({ error: 'Forbidden: cannot record contact attempts' }, { status: 403 });
    }

    const access = await assertOrderAccess(id, user, { companyId, storeId }, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: map[access.reason] });
    }
    const order = access.order;

    // Edit authority is scope-evaluated (ASSIGNED covers own-assignment);
    // claim holders may record attempts on the claimable queue.
    if (!authorize(user, 'orders.edit', order).allowed && !can(user, 'orders.claim')) {
      return NextResponse.json({ error: 'Forbidden: cannot record contact attempts' }, { status: 403 });
    }

    const body = await req.json();
    const { contactMethod, result, note, nextFollowUpAt } = body as {
      contactMethod?: string; result?: string; note?: string; nextFollowUpAt?: string;
    };

    // ── Server-side validation (never trust frontend) ──
    if (!contactMethod || !(CONTACT_METHODS as readonly string[]).includes(contactMethod)) {
      return NextResponse.json({ error: 'Invalid contactMethod' }, { status: 400 });
    }
    if (!result || !(CONTACT_RESULTS as readonly string[]).includes(result)) {
      return NextResponse.json({ error: 'Invalid contact result' }, { status: 400 });
    }
    if (note && note.length > 2000) {
      return NextResponse.json({ error: 'Note too long (max 2000)' }, { status: 400 });
    }
    const fu = parseFollowUpDate(nextFollowUpAt);
    if (!fu.ok) return NextResponse.json({ error: fu.error }, { status: 400 });

    // Attempt number computed server-side; unique(orderId, attemptNumber) backstops races
    const lastAttempt = await db.orderContactAttempt.findFirst({
      where: { orderId: id },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    });
    const attemptNumber = (lastAttempt?.attemptNumber ?? 0) + 1;

    // ── The 1/2/3 no-answer rule ──
    // The third no-answer closes the order under its OWN reason, in the same
    // transaction as the attempt, and releases the reservation. It is not a
    // customer rejection and must never be reported as one.
    const { attempt, autoClosed, noAnswerCount } = await db.$transaction(async (tx) => {
      const created = await tx.orderContactAttempt.create({
        data: {
          companyId,            // from session — never client
          orderId: id,
          employeeId: user.id,  // server-derived — forged employeeId impossible
          employeeRole: user.role,
          attemptNumber,
          contactMethod: contactMethod!,
          result: result!,
          note: note?.trim() || null,
          nextFollowUpAt: fu.date,
        },
        include: { employee: { select: { id: true, name: true } } },
      });

      const noAnswers = await tx.orderContactAttempt.count({
        where: { orderId: id, result: { in: ['NO_ANSWER', 'BUSY'] } },
      });

      const terminal = ['CONFIRMED', 'REJECTED', 'CANCELLED'].includes(order.confirmationStatus);
      if (result === 'NO_ANSWER' && noAnswers >= NO_ANSWER_LIMIT && !terminal) {
        await tx.order.update({
          where: { id },
          data: {
            confirmationStatus: 'CANCELLED',
            status: 'CANCELLED',
            rejectionReason: 'NO_ANSWER_3_ATTEMPTS',
            rejectionNote: `إغلاق تلقائي بعد ${noAnswers} محاولات بلا رد`,
            followUpStatus: order.nextFollowUpAt ? 'CANCELLED' : order.followUpStatus,
            version: { increment: 1 },
          },
        });
        await releaseOrderLines(tx, id);
        await tx.orderStatusLog.create({
          data: {
            companyId, orderId: id, statusType: 'CONFIRMATION',
            previousValue: order.confirmationStatus, newValue: 'CANCELLED',
            changedById: user.id, changedByRole: user.role,
            note: 'AUTO_CLOSE_NO_ANSWER_3_ATTEMPTS',
          },
        });
        await tx.orderNote.create({
          data: {
            companyId, orderId: id, authorId: user.id, kind: 'follow_up',
            body: `أُغلق الطلب تلقائياً بعد ${noAnswers} محاولات اتصال بلا رد.`,
          },
        });
        return { attempt: created, autoClosed: true, noAnswerCount: noAnswers };
      }
      return { attempt: created, autoClosed: false, noAnswerCount: noAnswers };
    });

    await logAudit({
      companyId, userId: user.id, action: 'CONTACT_ATTEMPT_RECORDED',
      entity: 'Order', entityId: id,
      newData: { attemptNumber, contactMethod, result, nextFollowUpAt: fu.date },
    });

    return NextResponse.json({
      success: true,
      attempt,
      noAnswerCount,
      noAnswerLimit: NO_ANSWER_LIMIT,
      autoClosed,
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
