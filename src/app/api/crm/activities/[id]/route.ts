// CRM Activity — get / delete (GET/DELETE only)
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

const includeDetail = {
  user: { select: { id: true, name: true } },
  crmContact: { select: { id: true, firstName: true, lastName: true } },
  crmDeal: { select: { id: true, title: true } },
  crmLead: { select: { id: true, name: true } },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.activities.view');
    const { id } = await params;

    const record = await db.crmActivity.findUnique({ where: { id }, include: includeDetail });
    if (!record || record.companyId !== companyId) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    return NextResponse.json({ activity: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.activities.delete');
    const { id } = await params;

    const existing = await db.crmActivity.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    await db.crmActivity.delete({ where: { id } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_ACTIVITY_DELETED',
      entity: 'CrmActivity',
      entityId: id,
      previousData: existing,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
