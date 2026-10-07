/**
 * GET /api/telegram/messages — recent Telegram messages for the dashboard.
 * Query: status (PENDING|PROCESSED|IGNORED|NEEDS_REVIEW|FAILED), limit.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { readLimit } from '@/lib/numeric-input';

const STATUSES = ['PENDING', 'PROCESSED', 'IGNORED', 'NEEDS_REVIEW', 'FAILED'] as const;

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('telegram.view');

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status')?.trim();
    /*
     * This spelling caught `NaN` and nothing else: there was no lower clamp,
     * so `?limit=0` was `take: 0` — an empty inbox for a door that had
     * messages — and `?limit=-5` was `take: -5`, which Prisma accepts as
     * «the last five», i.e. the OLDEST five in reverse.
     */
    const limit = readLimit(searchParams, 50, 100);

    const messages = await db.telegramMessage.findMany({
      where: {
        companyId,
        ...(status && (STATUSES as readonly string[]).includes(status) ? { processingStatus: status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        source: { select: { chatTitle: true, topicName: true, chatId: true, topicId: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
