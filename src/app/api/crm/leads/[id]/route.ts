// CRM Lead — get / update / delete
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullish(),
  phone: z.string().max(50).nullish(),
  companyName: z.string().max(200).nullish(),
  source: z.enum(['MANUAL', 'WEBSITE', 'REFERRAL', 'SOCIAL_MEDIA', 'CAMPAIGN', 'OTHER']).optional(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED']).optional(),
  score: z.number().int().min(0).max(100).optional(),
  assignedToId: z.string().uuid().nullish(),
  notes: z.string().max(5000).nullish(),
});

const includeDetail = {
  assignedTo: { select: { id: true, name: true } },
  activities: { orderBy: { occurredAt: 'desc' as const }, take: 20 },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.leads.view');
    const { id } = await params;

    const record = await db.crmLead.findUnique({ where: { id }, include: includeDetail });
    if (!record || record.companyId !== companyId) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json({ lead: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.leads.edit');
    const { id } = await params;

    const existing = await db.crmLead.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }

    const record = await db.crmLead.update({ where: { id }, data: parsed.data });

    // Log a status change activity when the lead moves to a new status
    if (parsed.data.status && parsed.data.status !== existing.status) {
      await db.crmActivity.create({
        data: {
          companyId,
          type: 'STATUS_CHANGE',
          subject: `Lead: ${existing.status} → ${parsed.data.status}`,
          crmLeadId: id,
          userId: user.id,
        },
      });
    }

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_LEAD_UPDATED',
      entity: 'CrmLead',
      entityId: id,
      previousData: existing,
      newData: record,
    });

    return NextResponse.json({ lead: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.leads.delete');
    const { id } = await params;

    const existing = await db.crmLead.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await db.crmLead.delete({ where: { id } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_LEAD_DELETED',
      entity: 'CrmLead',
      entityId: id,
      previousData: existing,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
