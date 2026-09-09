// CRM Deals — list / create
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseListParams, listResponse, contains, dateRange } from '@/lib/crm';
import { requirePermission } from '@/lib/authorization';

const SORTABLE = ['title', 'value', 'stage', 'probability', 'expectedCloseDate', 'position', 'createdAt', 'updatedAt'];

const createSchema = z.object({
  title: z.string().min(1).max(200),
  value: z.number().min(0).optional(),
  currency: z.string().max(10).optional(),
  stage: z.enum(['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().nullish(),
  crmContactId: z.string().uuid().nullish(),
  crmCompanyId: z.string().uuid().nullish(),
  assignedToId: z.string().uuid().nullish(),
  position: z.number().int().optional(),
  notes: z.string().max(5000).nullish(),
});

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.deals.view');
    const { q, sort, dir, page, pageSize, filters, from, to } = parseListParams(req, SORTABLE);

    const where: any = { companyId, ...dateRange('createdAt', from, to) };
    if (q) {
      where.OR = [{ title: contains(q) }, { notes: contains(q) }];
    }
    for (const key of ['stage', 'assignedToId', 'crmCompanyId', 'crmContactId']) {
      if (filters[key]) where[key] = filters[key];
    }

    const [items, total] = await Promise.all([
      db.crmDeal.findMany({
        where,
        include: {
          crmContact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
          crmCompany: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { activities: true, tasks: true, invoices: true } },
        },
        orderBy: { [sort]: dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.crmDeal.count({ where }),
    ]);

    return listResponse(items, total, page, pageSize);
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.deals.create');
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }
    const data = parsed.data;

    if (data.crmContactId) {
      const contact = await db.crmContact.findFirst({ where: { id: data.crmContactId, companyId } });
      if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    if (data.crmCompanyId) {
      const crmCompany = await db.crmCompany.findFirst({ where: { id: data.crmCompanyId, companyId } });
      if (!crmCompany) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const stage = data.stage || 'NEW';
    const deal = await db.crmDeal.create({
      data: {
        ...data,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
        companyId,
        assignedToId: data.assignedToId ?? user.id,
      },
      include: {
        crmContact: { select: { id: true, firstName: true, lastName: true } },
        crmCompany: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_DEAL_CREATED',
      entity: 'CrmDeal',
      entityId: deal.id,
      newData: deal,
    });

    return NextResponse.json({ deal }, { status: 201 });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
