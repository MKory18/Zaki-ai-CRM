// CRM Company — get / update / delete
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  industry: z.string().max(100).nullish(),
  website: z.string().max(300).nullish(),
  phone: z.string().max(50).nullish(),
  email: z.string().email().nullish(),
  address: z.string().max(500).nullish(),
  city: z.string().max(100).nullish(),
  country: z.string().max(100).nullish(),
  size: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']).nullish(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PROSPECT']).optional(),
  notes: z.string().max(5000).nullish(),
});

const includeDetail = {
  contacts: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  deals: { select: { id: true, title: true, value: true, stage: true } },
  invoices: { select: { id: true, invoiceNumber: true, status: true, total: true } },
  _count: { select: { contacts: true, deals: true, invoices: true } },
};

async function getScoped(id: string, companyId: string) {
  const record = await db.crmCompany.findUnique({ where: { id }, include: includeDetail });
  if (!record || record.companyId !== companyId) return null;
  return record;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.view');
    const { id } = await params;

    const record = await getScoped(id, companyId);
    if (!record) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    return NextResponse.json({ company: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.manage');
    const { id } = await params;

    const existing = await db.crmCompany.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }

    const record = await db.crmCompany.update({ where: { id }, data: parsed.data });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_COMPANY_UPDATED',
      entity: 'CrmCompany',
      entityId: id,
      previousData: existing,
      newData: record,
    });

    return NextResponse.json({ company: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.manage');
    const { id } = await params;

    const existing = await db.crmCompany.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    await db.crmCompany.delete({ where: { id } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_COMPANY_DELETED',
      entity: 'CrmCompany',
      entityId: id,
      previousData: existing,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
