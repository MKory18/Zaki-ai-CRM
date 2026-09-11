/**
 * GET /api/whatsapp/conversations — shared inbox list (permission-scoped,
 * tenant-scoped). Filters: status (OPEN/CLOSED), q (phone/name search),
 * assigned (me/all/unassigned/userId). No fake data ever.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';
import { normalizePhoneNumber } from '@/lib/phone';
import { apiErrorResponse } from '@/lib/api-error';

export async function GET(req: Request) {
  try {
    await requirePermission('whatsapp.view');
    const { companyId } = await requireCompanyTenant();
    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status') === 'CLOSED' ? 'CLOSED' : 'OPEN';
    const assigned = searchParams.get('assigned')?.trim() || '';
    const q = searchParams.get('q')?.trim() || '';
    const cursor = searchParams.get('cursor')?.trim() || '';

    const { user } = await requireCompanyTenant();
    const where: any = { companyId, status };
    if (assigned === 'me') where.assignedUserId = user.id;
    else if (assigned === 'unassigned') where.assignedUserId = null;
    else if (assigned && assigned !== 'all') where.assignedUserId = assigned;
    if (q) {
      const norm = normalizePhoneNumber(q);
      where.OR = [
        { customerPhone: { contains: norm || q } },
        { customerName: { contains: q } },
      ];
    }

    const take = 50;
    const conversations = await db.whatsAppConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        assignedTo: { select: { id: true, name: true } },
        customer: { select: { id: true, fullName: true, phone: true } },
      },
    });
    const hasMore = conversations.length > take;
    return NextResponse.json({
      conversations: conversations.slice(0, take),
      nextCursor: hasMore ? conversations[take - 1].id : null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
