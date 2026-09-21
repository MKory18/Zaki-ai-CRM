import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';

/**
 * GET /api/apps/deliveries — what each app was told, and whether it heard.
 *
 * A webhook that fails silently is an integration that stops silently: the
 * seller believes the two systems are in step, and the developer has no way
 * to find out they are not. This is the page that answers "did it arrive".
 *
 * The payload is returned, because a developer debugging a bad request needs
 * to see what was actually sent — and it holds nothing the app was not
 * already going to receive.
 */
export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('apps.view');

    const { searchParams } = new URL(req.url);
    const appCode = searchParams.get('appCode')?.trim().toUpperCase() || undefined;
    const status = searchParams.get('status')?.trim().toUpperCase() || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);

    const deliveries = await db.appDelivery.findMany({
      where: {
        companyId,
        ...(status && ['PENDING', 'OK', 'FAILED'].includes(status) ? { status } : {}),
        ...(appCode ? { install: { appCode } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, event: true, url: true, status: true, attempts: true,
        responseCode: true, error: true, nextAttemptAt: true,
        deliveredAt: true, createdAt: true, payload: true,
        install: { select: { appCode: true } },
      },
    });

    // The counters a screen leads with, counted rather than inferred from
    // the page above — a page of fifty says nothing about a thousand.
    const [pending, failed, ok] = await Promise.all([
      db.appDelivery.count({ where: { companyId, status: 'PENDING' } }),
      db.appDelivery.count({ where: { companyId, status: 'FAILED' } }),
      db.appDelivery.count({ where: { companyId, status: 'OK' } }),
    ]);

    return NextResponse.json({
      deliveries: deliveries.map((d) => ({
        ...d,
        appCode: d.install.appCode,
        install: undefined,
      })),
      totals: { pending, failed, ok },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
