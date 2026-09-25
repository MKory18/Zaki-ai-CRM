import { CONFIRMATION_REFUSED, DELIVERED_SHIPPING, rateOf } from '@/lib/order-state';
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant, hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { commissionByUserForOrders } from '@/lib/commission';

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
            // The two real columns. The legacy merged `status` is not written
            // by the courier feed or by the door-side partial-delivery
            // recorder, so every count below read from it was blind to the
            // orders those two paths finished.
            confirmationStatus: true,
            shippingStatus: true,
            totalAmount: true,
            collectedAmount: true,
            createdAt: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // One grouped read for everybody, rather than a query per moderator.
    // Scoped on `shippingStatus`, which is the column the ledger itself
    // accrues on (`accrueForOrder` refuses anything but DELIVERED there).
    // The legacy combined `status` is NOT synced by every path that
    // delivers an order — the courier webhook writes `shippingStatus` alone
    // — so filtering on it here would silently drop the commission on every
    // order a courier feed delivered.
    const commissionByUser = await commissionByUserForOrders({ companyId, shippingStatus: 'DELIVERED' });

    const enriched = moderators.map((mod) => {
      const orders = mod.assignedOrders;
      const totalOrders = orders.length;
      // Ever confirmed — it stays true after the parcel ships, which is what
      // a delivery rate has to be measured against.
      const confirmedOrders = orders.filter((o) => o.confirmationStatus === 'CONFIRMED').length;
      // A confirmation refusal only: a parcel that came back is not this
      // person refusing to confirm, and RETURNED here blamed them for it.
      const rejectedOrders = orders.filter((o) =>
        (CONFIRMATION_REFUSED as readonly string[]).includes(o.confirmationStatus)
      ).length;
      const postponedOrders = orders.filter((o) =>
        ['POSTPONED', 'FOLLOW_UP_REQUIRED'].includes(o.confirmationStatus)
      ).length;
      const delivered = orders.filter((o) =>
        (DELIVERED_SHIPPING as readonly string[]).includes(o.shippingStatus)
      );
      const deliveredOrders = delivered.length;

      // What was actually collected where the door recorded it — the same
      // rule the profit screen uses. A partial delivery is the case where
      // the collected figure and the order total differ.
      const sales = delivered.reduce((sum, o) => sum + Number(o.collectedAmount ?? o.totalAmount), 0);

      // The ledger's figure for this person, not a sum of the legacy column.
      const commissions = Number((commissionByUser.get(mod.id) ?? 0).toFixed(2));

      // Out of what was DECIDED. Dividing by everything assigned counted the
      // orders still sitting in this person's queue as failures, so the rate
      // fell as the queue grew — it measured the backlog, not the work.
      const decidedOrders = confirmedOrders + rejectedOrders;
      const confirmationRate = rateOf(confirmedOrders, decidedOrders) ?? 0;
      const rejectionRate = rateOf(rejectedOrders, decidedOrders) ?? 0;
      const deliveryRate = rateOf(deliveredOrders, confirmedOrders) ?? 0;

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
