import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';

export async function GET() {
  try {
    const { companyId } = await requireCompanyTenant();
    requirePermission('orders.view');

    const orders = await db.order.findMany({
      where: { companyId },
      include: {
        customer: true,
        product: true,
        offer: true,
        moderator: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'Order Number',
      'Date',
      'Customer Name',
      'Phone',
      'City',
      'Product',
      'Offer',
      'Quantity',
      'Price',
      'Total Amount',
      'Status',
      'Moderator',
      'Source',
    ];

    const rows = orders.map((o) => [
      o.orderNumber,
      o.createdAt.toISOString(),
      `"${(o.customer?.fullName || '').replace(/"/g, '""')}"`,
      `"${o.customer?.rawPhone || o.customer?.phone || ''}"`,
      `"${(o.customer?.city || '').replace(/"/g, '""')}"`,
      `"${(o.product?.name || '').replace(/"/g, '""')}"`,
      `"${(o.offer?.name || 'Direct').replace(/"/g, '""')}"`,
      o.quantity,
      o.sellingPrice,
      o.totalAmount,
      o.status,
      `"${(o.moderator?.name || 'Unassigned').replace(/"/g, '""')}"`,
      `"${o.source}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="salesflow_orders_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
