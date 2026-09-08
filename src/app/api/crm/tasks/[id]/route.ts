// CRM Task — get / update / delete
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullish(),
  dueDate: z.string().datetime().nullish(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  assignedToId: z.string().uuid().nullish(),
  crmContactId: z.string().uuid().nullish(),
  crmDealId: z.string().uuid().nullish(),
});

const includeDetail = {
  assignedTo: { select: { id: true, name: true } },
  crmContact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  crmDeal: { select: { id: true, title: true, stage: true, value: true } },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.view');
    const { id } = await params;

    const record = await db.crmTask.findUnique({ where: { id }, include: includeDetail });
    if (!record || record.companyId !== companyId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.manage');
    const { id } = await params;

    const existing = await db.crmTask.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }
    const data: any = { ...parsed.data };
    if (data.dueDate !== undefined) {
      data.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }

    const record = await db.crmTask.update({ where: { id }, data });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_TASK_UPDATED',
      entity: 'CrmTask',
      entityId: id,
      previousData: existing,
      newData: record,
    });

    return NextResponse.json({ task: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.manage');
    const { id } = await params;

    const existing = await db.crmTask.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    await db.crmTask.delete({ where: { id } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_TASK_DELETED',
      entity: 'CrmTask',
      entityId: id,
      previousData: existing,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
