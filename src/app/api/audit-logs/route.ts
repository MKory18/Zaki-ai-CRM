import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('audit.view');

    const logs = await db.auditLog.findMany({
      where: { companyId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
