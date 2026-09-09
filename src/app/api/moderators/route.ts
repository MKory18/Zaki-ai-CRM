import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant, hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

export async function GET() {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('users.view');

    const moderators = await db.user.findMany({
      where: {
        companyId,
        role: 'MODERATOR',
      },
      include: {
        assignedOrders: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            moderatorCommission: true,
            createdAt: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const enriched = moderators.map((mod) => {
      const orders = mod.assignedOrders;
      const totalOrders = orders.length;
      const confirmedOrders = orders.filter((o) =>
        ['CONFIRMED', 'READY_FOR_SHIPPING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(
          o.status
        )
      ).length;
      const rejectedOrders = orders.filter((o) =>
        ['REJECTED', 'CANCELLED', 'RETURNED'].includes(o.status)
      ).length;
      const postponedOrders = orders.filter((o) => o.status === 'POSTPONED').length;
      const deliveredOrders = orders.filter((o) => o.status === 'DELIVERED').length;

      const sales = orders
        .filter((o) => o.status === 'DELIVERED')
        .reduce((sum, o) => sum + o.totalAmount, 0);

      const commissions = orders
        .filter((o) => o.status === 'DELIVERED')
        .reduce((sum, o) => sum + o.moderatorCommission, 0);

      const confirmationRate =
        totalOrders > 0 ? Number(((confirmedOrders / totalOrders) * 100).toFixed(1)) : 0;
      const rejectionRate =
        totalOrders > 0 ? Number(((rejectedOrders / totalOrders) * 100).toFixed(1)) : 0;
      const deliveryRate =
        confirmedOrders > 0 ? Number(((deliveredOrders / confirmedOrders) * 100).toFixed(1)) : 0;

      return {
        id: mod.id,
        name: mod.name,
        email: mod.email,
        phone: mod.phone,
        status: mod.status,
        commissionRate: mod.commissionRate,
        stats: {
          totalOrders,
          confirmedOrders,
          rejectedOrders,
          postponedOrders,
          deliveredOrders,
          confirmationRate,
          rejectionRate,
          deliveryRate,
          sales: Number(sales.toFixed(2)),
          commissions: Number(commissions.toFixed(2)),
        },
      };
    });

    // Rank by confirmed orders
    enriched.sort((a, b) => b.stats.confirmedOrders - a.stats.confirmedOrders);

    return NextResponse.json({ moderators: enriched });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('users.create');

    const body = await req.json();
    const { name, email, phone, commissionRate, password } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and Email are required' }, { status: 400 });
    }

    const existing = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 400 });
    }

// Phase S: no default passwords - a password is mandatory
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password is required (min 8 chars)' }, { status: 400 });
    }
    const pwdHash = await hashPassword(password);

    const moderator = await db.user.create({
      data: {
        companyId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        role: 'MODERATOR',
        commissionRate: parseFloat(commissionRate) || 5.0,
        passwordHash: pwdHash,
        status: 'ACTIVE',
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'MODERATOR_CREATED',
      entity: 'User',
      entityId: moderator.id,
      newData: { id: moderator.id, name: moderator.name, email: moderator.email },
    });

    return NextResponse.json({ success: true, moderator });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
