// CRM Deal — get / update / delete
// PATCH handles stage changes (with DEAL_STAGE activity + closedAt) and Kanban reordering.
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

const STAGES = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  value: z.number().min(0).optional(),
  currency: z.string().max(10).optional(),
  stage: z.enum(STAGES).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().nullish(),
  crmContactId: z.string().uuid().nullish(),
  crmCompanyId: z.string().uuid().nullish(),
  assignedToId: z.string().uuid().nullish(),
  position: z.number().int().optional(),
  notes: z.string().max(5000).nullish(),
});

const includeDetail = {
  crmContact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  crmCompany: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  activities: { orderBy: { occurredAt: 'desc' as const }, take: 20 },
  _count: { select: { tasks: true, invoices: true } },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.deals.view');
    const { id } = await params;

    const record = await db.crmDeal.findUnique({ where: { id }, include: includeDetail });
    if (!record || record.companyId !== companyId) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    return NextResponse.json({ deal: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.deals.edit');
    const { id } = await params;

    const existing = await db.crmDeal.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }
    const data: any = { ...parsed.data };
    if (data.expectedCloseDate !== undefined) {
      data.expectedCloseDate = data.expectedCloseDate ? new Date(data.expectedCloseDate) : null;
    }

    const oldStage = existing.stage;
    const newStage = data.stage;

    // Stage transition rules: closed stages freeze closedAt, WON locks probability at 100
    const stageChanged = newStage && newStage !== oldStage;
    if (stageChanged) {
      if (newStage === 'WON' || newStage === 'LOST') {
        data.closedAt = new Date();
        if (newStage === 'WON') data.probability = 100;
      } else {
        data.closedAt = null;
      }
    }

    const record = await db.crmDeal.update({ where: { id }, data });

    if (stageChanged) {
      await db.crmActivity.create({
        data: {
          companyId,
          type: 'DEAL_STAGE',
          subject: `Stage: ${oldStage} → ${newStage}`,
          crmDealId: id,
          crmContactId: record.crmContactId,
          userId: user.id,
        },
      });
    }

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_DEAL_UPDATED',
      entity: 'CrmDeal',
      entityId: id,
      previousData: existing,
      newData: record,
    });

    return NextResponse.json({ deal: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.deals.delete');
    const { id } = await params;

    const existing = await db.crmDeal.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    await db.crmDeal.delete({ where: { id } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_DEAL_DELETED',
      entity: 'CrmDeal',
      entityId: id,
      previousData: existing,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
