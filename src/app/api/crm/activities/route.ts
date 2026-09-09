// CRM Activities — list / create (GET/POST/DELETE only)
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseListParams, listResponse, contains, dateRange } from '@/lib/crm';
import { requirePermission } from '@/lib/authorization';

const SORTABLE = ['type', 'subject', 'occurredAt', 'createdAt'];

const createSchema = z.object({
  type: z.enum(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'STATUS_CHANGE', 'DEAL_STAGE']),
  subject: z.string().min(1).max(300),
  description: z.string().max(5000).nullish(),
  crmContactId: z.string().uuid().nullish(),
  crmDealId: z.string().uuid().nullish(),
  crmLeadId: z.string().uuid().nullish(),
  occurredAt: z.string().datetime().optional(),
});

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.activities.view');
    const { q, sort, dir, page, pageSize, filters, from, to } = parseListParams(req, SORTABLE);

    const where: any = { companyId, ...dateRange('occurredAt', from, to) };
    if (q) {
      where.OR = [{ subject: contains(q) }, { description: contains(q) }];
    }
    for (const key of ['type', 'crmContactId', 'crmDealId', 'crmLeadId', 'userId']) {
      if (filters[key]) where[key] = filters[key];
    }

    const [items, total] = await Promise.all([
      db.crmActivity.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          crmContact: { select: { id: true, firstName: true, lastName: true } },
          crmDeal: { select: { id: true, title: true } },
          crmLead: { select: { id: true, name: true } },
        },
        orderBy: { [sort]: dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.crmActivity.count({ where }),
    ]);

    return listResponse(items, total, page, pageSize);
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.activities.create');
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }
    const data = parsed.data;

    // Validate references belong to the same tenant
    if (data.crmContactId) {
      const contact = await db.crmContact.findFirst({ where: { id: data.crmContactId, companyId } });
      if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    if (data.crmDealId) {
      const deal = await db.crmDeal.findFirst({ where: { id: data.crmDealId, companyId } });
      if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }
    if (data.crmLeadId) {
      const lead = await db.crmLead.findFirst({ where: { id: data.crmLeadId, companyId } });
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const activity = await db.crmActivity.create({
      data: {
        ...data,
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
        companyId,
        userId: user.id,
      },
      include: {
        user: { select: { id: true, name: true } },
        crmContact: { select: { id: true, firstName: true, lastName: true } },
        crmDeal: { select: { id: true, title: true } },
        crmLead: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_ACTIVITY_CREATED',
      entity: 'CrmActivity',
      entityId: activity.id,
      newData: activity,
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
