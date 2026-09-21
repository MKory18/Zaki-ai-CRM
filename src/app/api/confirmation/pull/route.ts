import { NextResponse } from 'next/server';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { pullNextOrder } from '@/lib/confirmation-queue';
import { db } from '@/lib/db';

/**
 * POST /api/confirmation/pull — take the next order.
 *
 * Requires confirmation.pull, which moderators never hold: pulling orders is
 * not the moderator's job. Refusals are explicit (untouched order, caps,
 * empty queue) so the screen can say why instead of showing a dead button.
 */
export async function POST() {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('confirmation.pull');

    const result = await pullNextOrder(
      { companyId, storeId },
      { id: user.id, role: user.role },
      {
        workHoursStart: country.workHoursStart,
        workHoursEnd: country.workHoursEnd,
        weekendDays: country.weekendDays,
        timezone: country.timezone,
      }
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.refusal?.message, code: result.refusal?.code, autoReleased: result.released },
        { status: result.refusal?.code === 'QUEUE_EMPTY' ? 404 : 409 }
      );
    }

    const order = await db.order.findUnique({
      where: { id: result.orderId },
      select: {
        id: true, orderNumber: true, merchantRef: true, totalAmount: true, currency: true,
        confirmationStatus: true, createdAt: true,
        customer: { select: { id: true, fullName: true, phone: true, rawPhone: true, city: true, address: true } },
        items: { select: { id: true, productName: true, quantity: true, freeQuantity: true, lineTotal: true } },
      },
    });

    return NextResponse.json({ order, autoReleased: result.released }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
