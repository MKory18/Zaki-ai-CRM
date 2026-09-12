/**
 * POST /api/telegram/messages/[id]/retry — reprocess a NEEDS_REVIEW/FAILED
 * message. Idempotent: already-processed messages are never re-ordered.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { processStoredMessage } from '@/lib/telegram/inbound';
import { apiErrorResponse } from '@/lib/api-error';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { companyId } = await requireCompanyTenant();
    await requirePermission('telegram.manage');

    const message = await db.telegramMessage.findUnique({ where: { id } });
    if (!message || message.companyId !== companyId) {
      return NextResponse.json({ error: 'غير موجودة' }, { status: 404 });
    }
    if (message.processingStatus === 'PROCESSED') {
      // Idempotent success — nothing to do
      return NextResponse.json({ success: true, status: 'PROCESSED', orderId: message.orderId });
    }
    if (!['NEEDS_REVIEW', 'FAILED', 'PENDING'].includes(message.processingStatus)) {
      return NextResponse.json({ error: 'لا يمكن إعادة معالجة هذه الرسالة' }, { status: 409 });
    }

    const result = await processStoredMessage(id);
    return NextResponse.json({ success: result.status === 'PROCESSED', ...result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
