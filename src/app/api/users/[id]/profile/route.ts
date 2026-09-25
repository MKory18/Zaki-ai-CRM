import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/authorization';


/**
 * GET /api/users/[id]/profile — employee profile + workload counts.
 * Server enforces users.view; company isolation applied on workload queries.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { companyId } = await requirePermission('users.view');

    const user = await db.user.findFirst({
      where: {
        id,
        // Phase S: company isolation — platform SUPER_ADMIN exempt
        ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : {}),
      },
      select: {
        id: true, name: true, email: true, role: true, status: true,
        lastLoginAt: true, createdAt: true, phone: true, commissionRate: true,
        companyId: true,
        // The field on the screen was writeable and never read back: it
        // saved, and then opened empty the next time somebody looked, so
        // nobody could tell whether it had been set at all.
        commissionCurrency: true,
        // When they start and hand over, and their rest days. Null means
        // the country's — and the screen says so rather than showing 09:00
        // as though somebody had chosen it.
        shiftStart: true, shiftEnd: true, restDays: true,
        assignedBy: { select: { name: true } },
      },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Company admins may only view users inside their company (or unclaimed
    // platform accounts). Reading another company's ACTIVE user is blocked:
    if (companyId && user.companyId === null && user.role === 'SUPER_ADMIN') {
      // platform super-admin profile is only readable by platform super admin
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Workload scoped to the admin's company — never cross-tenant.
    // SUPER_ADMIN may be platform-level (companyId null) → global counts.
    const tenantWhere = companyId ? { companyId } : {};
    const [assigned, claimed, created] = await Promise.all([
      db.order.count({ where: { ...tenantWhere, assignedToId: id } }),
      db.order.count({ where: { ...tenantWhere, claimedById: id } }),
      db.order.count({ where: { ...tenantWhere, moderatorId: id } }),
    ]);

    return NextResponse.json({ ...user, workload: { assigned, claimed, created } });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
