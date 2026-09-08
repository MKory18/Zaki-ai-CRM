// CRM Contact — get / update / delete
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

const updateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).nullish(),
  email: z.string().email().nullish(),
  phone: z.string().min(1).max(50).optional(),
  position: z.string().max(100).nullish(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  crmCompanyId: z.string().uuid().nullish(),
  ownerId: z.string().uuid().nullish(),
  notes: z.string().max(5000).nullish(),
});

const includeDetail = {
  crmCompany: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  deals: { select: { id: true, title: true, value: true, stage: true } },
  tasks: { select: { id: true, title: true, status: true, dueDate: true } },
  _count: { select: { deals: true, tasks: true, activities: true } },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.view');
    const { id } = await params;

    const record = await db.crmContact.findUnique({ where: { id }, include: includeDetail });
    if (!record || record.companyId !== companyId) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ contact: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.manage');
    const { id } = await params;

    const existing = await db.crmContact.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }

    if (parsed.data.crmCompanyId) {
      const crmCompany = await db.crmCompany.findFirst({ where: { id: parsed.data.crmCompanyId, companyId } });
      if (!crmCompany) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const record = await db.crmContact.update({ where: { id }, data: parsed.data });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_CONTACT_UPDATED',
      entity: 'CrmContact',
      entityId: id,
      previousData: existing,
      newData: record,
    });

    return NextResponse.json({ contact: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.manage');
    const { id } = await params;

    const existing = await db.crmContact.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    await db.crmContact.delete({ where: { id } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_CONTACT_DELETED',
      entity: 'CrmContact',
      entityId: id,
      previousData: existing,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
