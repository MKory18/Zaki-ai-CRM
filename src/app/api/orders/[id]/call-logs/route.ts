import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();

    const body = await req.json();
    const { result, notes, nextFollowUpDate, callDate } = body;

    if (!result) {
      return NextResponse.json({ error: 'Call Result is required' }, { status: 400 });
    }

    const order = await db.order.findUnique({
      where: { id },
    });

    if (!order || order.companyId !== companyId) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const callLog = await db.callLog.create({
      data: {
        companyId,
        orderId: id,
        moderatorId: user.id,
        callDate: callDate ? new Date(callDate) : new Date(),
        result,
        notes: notes?.trim() || null,
        nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
      },
    });

    // Map call result to appropriate order status
    let mappedStatus: string | null = null;
    if (result === 'CONFIRMED') mappedStatus = 'CONFIRMED';
    else if (result === 'REJECTED') mappedStatus = 'REJECTED';
    else if (result === 'POSTPONED') mappedStatus = 'POSTPONED';
    else if (result === 'NO_ANSWER') mappedStatus = 'NO_ANSWER';
    else if (result === 'CALLBACK_REQUESTED') mappedStatus = 'CONTACTING';

    if (mappedStatus && mappedStatus !== order.status) {
      await db.order.update({
        where: { id },
        data: {
          status: mappedStatus,
          ...(mappedStatus === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
          ...(mappedStatus === 'POSTPONED' && nextFollowUpDate
            ? { postponedUntil: new Date(nextFollowUpDate) }
            : {}),
        },
      });

      await db.orderActivity.create({
        data: {
          companyId,
          orderId: id,
          userId: user.id,
          action: 'CALL_MADE',
          previousStatus: order.status,
          newStatus: mappedStatus,
          metadata: JSON.stringify({
            callResult: result,
            notes: notes || '',
            caller: user.name,
          }),
        },
      });
    } else {
      await db.orderActivity.create({
        data: {
          companyId,
          orderId: id,
          userId: user.id,
          action: 'CALL_MADE',
          metadata: JSON.stringify({
            callResult: result,
            notes: notes || '',
            caller: user.name,
          }),
        },
      });
    }

    return NextResponse.json({ success: true, callLog });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
