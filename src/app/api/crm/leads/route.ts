// CRM Leads — list / create
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseListParams, listResponse, contains, dateRange } from '@/lib/crm';
import { requirePermission } from '@/lib/authorization';

const SORTABLE = ['name', 'email', 'phone', 'companyName', 'status', 'score', 'createdAt', 'updatedAt'];

const createSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().nullish(),
  phone: z.string().max(50).nullish(),
  companyName: z.string().max(200).nullish(),
  source: z.enum(['MANUAL', 'WEBSITE', 'REFERRAL', 'SOCIAL_MEDIA', 'CAMPAIGN', 'OTHER']).optional(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED']).optional(),
  score: z.number().int().min(0).max(100).optional(),
  assignedToId: z.string().uuid().nullish(),
  notes: z.string().max(5000).nullish(),
});

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.view');
    const { q, sort, dir, page, pageSize, filters, from, to } = parseListParams(req, SORTABLE);

    const where: any = { companyId, ...dateRange('createdAt', from, to) };
    if (q) {
      where.OR = [
        { name: contains(q) },
        { email: contains(q) },
        { phone: contains(q) },
        { companyName: contains(q) },
        { notes: contains(q) },
      ];
    }
    for (const key of ['status', 'source', 'assignedToId']) {
      if (filters[key]) where[key] = filters[key];
    }

    const [items, total] = await Promise.all([
      db.crmLead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { activities: true, crmNotes: true } },
        },
        orderBy: { [sort]: dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.crmLead.count({ where }),
    ]);

    return listResponse(items, total, page, pageSize);
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.manage');
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }
    const data = parsed.data;

    const lead = await db.crmLead.create({
      data: { ...data, companyId, assignedToId: data.assignedToId ?? user.id },
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_LEAD_CREATED',
      entity: 'CrmLead',
      entityId: lead.id,
      newData: lead,
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
