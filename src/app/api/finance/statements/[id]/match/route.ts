import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { runMatching } from '@/lib/settlement';

/**
 * POST /api/finance/statements/:id/match — step 3 of settlement.
 *
 * Runs ON DEMAND and only after a receipt exists: matching what the courier
 * claims against what we expect is pointless before we know what arrived.
 * The key is the merchant reference, then the barcode — never the phone.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('settlement.review');

    const statement = await db.courierStatement.findFirst({
      where: { id, companyId, storeId },
      select: { id: true, status: true, reference: true, _count: { select: { receipts: true } } },
    });
    if (!statement) return NextResponse.json({ error: 'الكشف غير موجود' }, { status: 404 });
    if (statement._count.receipts === 0) {
      return NextResponse.json(
        { error: 'سجّل إيصال الاستلام أولاً — المطابقة تأتي بعده', code: 'RECEIPT_REQUIRED' },
        { status: 409 }
      );
    }

    const outcome = await db.$transaction(
      (tx) => runMatching(tx, { companyId, storeId, statementId: id, minorUnit: country.minorUnit }),
      { timeout: 30_000 }
    );

    await db.courierStatement.update({ where: { id }, data: { status: 'MATCHED' } });

    await logAudit({
      companyId, userId: user.id, action: 'STATEMENT_MATCHED',
      entity: 'CourierStatement', entityId: id,
      newData: { reference: statement.reference, ...outcome },
    });

    return NextResponse.json({ outcome });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
