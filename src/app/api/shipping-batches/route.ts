import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';

import { logAudit } from '@/lib/audit';
import { can } from '@/lib/authorization';

/**
 * GET  /api/shipping-batches — company-scoped list (with order counts)
 * POST /api/shipping-batches — create batch (orders.shipping_status holders)
 *
 * Batch numbering is server-generated: SB-<year>-<####> per company.
 */
export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    const [total, batches] = await Promise.all([
      db.shippingBatch.count({ where: { companyId } }),
      db.shippingBatch.findMany({
        where: { companyId },
        include: {
          provider: { select: { id: true, name: true, code: true } },
          creator: { select: { id: true, name: true } },
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      batches,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    if (!can(user, 'orders.shipping_status')) {
      return NextResponse.json({ error: 'Forbidden: cannot manage shipping batches' }, { status: 403 });
    }

    const body = await req.json();
    const { deliveryProviderId, notes } = body as { deliveryProviderId?: string; notes?: string };

    let providerId: string | null = null;
    if (deliveryProviderId) {
      const provider = await db.deliveryProvider.findFirst({ where: { id: deliveryProviderId, companyId } });
      if (!provider) return NextResponse.json({ error: 'Provider not found in your company' }, { status: 404 });
      providerId = provider.id;
    }

    // Server-generated batch number (company-scoped sequence with retry)
    const count = await db.shippingBatch.count({ where: { companyId } });
    const batchNumber = `SB-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const batch = await db.shippingBatch.create({
      data: {
        companyId,            // session-derived
        batchNumber,          // server-generated
        deliveryProviderId: providerId,
        createdById: user.id, // server-derived actor
        notes: notes?.trim() || null,
      },
      include: { provider: { select: { id: true, name: true, code: true } } },
    });

    await logAudit({
      companyId, userId: user.id, action: 'SHIPPING_BATCH_CREATED',
      entity: 'ShippingBatch', entityId: batch.id,
      newData: { batchNumber, providerId, by: user.name },
    });

    return NextResponse.json({ success: true, batch });
  } catch (error: any) {
    // P2002 duplicate batch number under race → generic conflict
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}
