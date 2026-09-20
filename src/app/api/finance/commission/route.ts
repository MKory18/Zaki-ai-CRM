import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { accrueForOrder, periodOf } from '@/lib/commission';

/**
 * Commission entries.
 *
 *   GET  /api/finance/commission?period=YYYY-MM   what each person earned
 *   POST /api/finance/commission                  accrue for delivered orders
 *
 * Accrual happens on DELIVERED and is idempotent, so running it twice pays
 * nobody twice. Entries become PAYABLE only when the settlement that covers
 * their order is approved.
 */
const accrueSchema = z.object({
  orderIds: z.array(z.string().uuid()).max(500).optional(),
});

export async function GET(req: Request) {
  try {
    const { companyId, country } = await requireContext();
    await requirePermission('finance.view');

    const period = new URL(req.url).searchParams.get('period') ?? periodOf(new Date());

    const entries = await db.commissionEntry.findMany({
      where: { companyId, periodMonth: period },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: { order: { select: { orderNumber: true, merchantRef: true, deliveredAt: true } } },
    });

    const userIds = [...new Set(entries.map((e) => e.userId))];
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: true } })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, u.name]));

    const byUser = new Map<string, { userId: string; name: string; accrued: number; payable: number; paid: number; reversed: number }>();
    for (const entry of entries) {
      const row = byUser.get(entry.userId) ?? {
        userId: entry.userId,
        name: nameOf.get(entry.userId) ?? '—',
        accrued: 0, payable: 0, paid: 0, reversed: 0,
      };
      const amount = Number(entry.amount);
      if (entry.status === 'ACCRUED') row.accrued += amount;
      else if (entry.status === 'PAYABLE') row.payable += amount;
      else if (entry.status === 'PAID') row.paid += amount;
      else row.reversed += amount;
      byUser.set(entry.userId, row);
    }

    return NextResponse.json({
      period,
      currencyCode: country.currencyCode,
      totals: [...byUser.values()],
      entries: entries.map((e) => ({
        ...e,
        amount: Number(e.amount),
        userName: nameOf.get(e.userId) ?? null,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('finance.create');

    const parsed = accrueSchema.safeParse(await req.json().catch(() => ({})));
    const explicitIds = parsed.success ? parsed.data.orderIds : undefined;

    // Default: every delivered order of this store that has no entry yet.
    const orders = await db.order.findMany({
      where: {
        companyId,
        storeId,
        shippingStatus: 'DELIVERED',
        ...(explicitIds && explicitIds.length > 0 ? { id: { in: explicitIds } } : { commissions: { none: {} } }),
      },
      select: { id: true },
      take: 500,
    });

    let created = 0;
    const skipped: Record<string, number> = {};
    for (const order of orders) {
      const result = await db.$transaction((tx) =>
        accrueForOrder(tx, { companyId, orderId: order.id, minorUnit: country.minorUnit })
      );
      created += result.created;
      if (result.skipped) skipped[result.skipped] = (skipped[result.skipped] ?? 0) + 1;
    }

    await logAudit({
      companyId, userId: user.id, action: 'COMMISSION_ACCRUED',
      entity: 'CommissionEntry', entityId: 'batch',
      newData: { orders: orders.length, created, skipped },
    });

    return NextResponse.json({ orders: orders.length, created, skipped });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
