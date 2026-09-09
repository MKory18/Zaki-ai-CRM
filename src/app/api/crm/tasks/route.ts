// CRM Tasks — list / create
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseListParams, listResponse, contains, dateRange } from '@/lib/crm';
import { requirePermission } from '@/lib/authorization';

const SORTABLE = ['title', 'priority', 'status', 'dueDate', 'createdAt', 'updatedAt'];

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullish(),
  dueDate: z.string().datetime().nullish(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  assignedToId: z.string().uuid().nullish(),
  crmContactId: z.string().uuid().nullish(),
  crmDealId: z.string().uuid().nullish(),
});

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.tasks.view');
    const { q, sort, dir, page, pageSize, filters, from, to } = parseListParams(req, SORTABLE);

    const where: any = { companyId, ...dateRange('createdAt', from, to) };
    if (q) {
      where.OR = [{ title: contains(q) }, { description: contains(q) }];
    }
    for (const key of ['status', 'priority', 'assignedToId', 'crmContactId', 'crmDealId']) {
      if (filters[key]) where[key] = filters[key];
    }

    const [items, total] = await Promise.all([
      db.crmTask.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true } },
          crmContact: { select: { id: true, firstName: true, lastName: true, phone: true } },
          crmDeal: { select: { id: true, title: true, stage: true, value: true } },
        },
        orderBy: { [sort]: dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.crmTask.count({ where }),
    ]);

    return listResponse(items, total, page, pageSize);
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.tasks.create');
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }
    const data = parsed.data;

    if (data.crmContactId) {
      const contact = await db.crmContact.findFirst({ where: { id: data.crmContactId, companyId } });
      if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    if (data.crmDealId) {
      const deal = await db.crmDeal.findFirst({ where: { id: data.crmDealId, companyId } });
      if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    const task = await db.crmTask.create({
      data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : null, companyId, assignedToId: data.assignedToId ?? user.id },
      include: {
        assignedTo: { select: { id: true, name: true } },
        crmContact: { select: { id: true, firstName: true, lastName: true } },
        crmDeal: { select: { id: true, title: true } },
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_TASK_CREATED',
      entity: 'CrmTask',
      entityId: task.id,
      newData: task,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
