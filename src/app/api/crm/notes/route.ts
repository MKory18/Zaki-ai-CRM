// CRM Notes — list / create
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseListParams, listResponse, contains, dateRange } from '@/lib/crm';
import { requirePermission } from '@/lib/authorization';

const SORTABLE = ['body', 'createdAt', 'updatedAt'];

const createSchema = z.object({
  body: z.string().min(1).max(10000),
  crmContactId: z.string().uuid().nullish(),
  crmCompanyId: z.string().uuid().nullish(),
  crmDealId: z.string().uuid().nullish(),
  crmLeadId: z.string().uuid().nullish(),
});

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.notes.view');
    const { q, sort, dir, page, pageSize, filters, from, to } = parseListParams(req, SORTABLE);

    const where: any = { companyId, ...dateRange('createdAt', from, to) };
    if (q) {
      where.OR = [{ body: contains(q) }];
    }
    for (const key of ['crmContactId', 'crmCompanyId', 'crmDealId', 'crmLeadId', 'userId']) {
      if (filters[key]) where[key] = filters[key];
    }

    const [items, total] = await Promise.all([
      db.crmNote.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          crmContact: { select: { id: true, firstName: true, lastName: true } },
          crmCompany: { select: { id: true, name: true } },
          crmDeal: { select: { id: true, title: true } },
          crmLead: { select: { id: true, name: true } },
        },
        orderBy: { [sort]: dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.crmNote.count({ where }),
    ]);

    return listResponse(items, total, page, pageSize);
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.notes.create');
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
    if (data.crmCompanyId) {
      const crmCompany = await db.crmCompany.findFirst({ where: { id: data.crmCompanyId, companyId } });
      if (!crmCompany) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    if (data.crmDealId) {
      const deal = await db.crmDeal.findFirst({ where: { id: data.crmDealId, companyId } });
      if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }
    if (data.crmLeadId) {
      const lead = await db.crmLead.findFirst({ where: { id: data.crmLeadId, companyId } });
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const note = await db.crmNote.create({
      data: { ...data, companyId, userId: user.id },
      include: {
        user: { select: { id: true, name: true } },
        crmContact: { select: { id: true, firstName: true, lastName: true } },
        crmCompany: { select: { id: true, name: true } },
        crmDeal: { select: { id: true, title: true } },
        crmLead: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_NOTE_CREATED',
      entity: 'CrmNote',
      entityId: note.id,
      newData: note,
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
