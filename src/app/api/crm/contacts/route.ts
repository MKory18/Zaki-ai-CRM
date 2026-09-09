// CRM Contacts — list / create
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseListParams, listResponse, contains, dateRange } from '@/lib/crm';
import { requirePermission } from '@/lib/authorization';

const SORTABLE = ['firstName', 'lastName', 'email', 'phone', 'status', 'createdAt', 'updatedAt'];

const createSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).nullish(),
  email: z.string().email().nullish(),
  phone: z.string().min(1).max(50),
  position: z.string().max(100).nullish(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  crmCompanyId: z.string().uuid().nullish(),
  ownerId: z.string().uuid().nullish(),
  notes: z.string().max(5000).nullish(),
});

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.contacts.view');
    const { q, sort, dir, page, pageSize, filters, from, to } = parseListParams(req, SORTABLE);

    const where: any = { companyId, ...dateRange('createdAt', from, to) };
    if (q) {
      where.OR = [
        { firstName: contains(q) },
        { lastName: contains(q) },
        { email: contains(q) },
        { phone: contains(q) },
        { position: contains(q) },
      ];
    }
    for (const key of ['status', 'crmCompanyId', 'ownerId']) {
      if (filters[key]) where[key] = filters[key];
    }

    const [items, total] = await Promise.all([
      db.crmContact.findMany({
        where,
        include: {
          crmCompany: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
          _count: { select: { deals: true, tasks: true } },
        },
        orderBy: { [sort]: dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.crmContact.count({ where }),
    ]);

    return listResponse(items, total, page, pageSize);
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.contacts.create');
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }
    const data = parsed.data;

    // Validate company reference belongs to the same tenant
    if (data.crmCompanyId) {
      const crmCompany = await db.crmCompany.findFirst({ where: { id: data.crmCompanyId, companyId } });
      if (!crmCompany) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const contact = await db.crmContact.create({
      data: { ...data, companyId, ownerId: data.ownerId ?? user.id },
      include: {
        crmCompany: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_CONTACT_CREATED',
      entity: 'CrmContact',
      entityId: contact.id,
      newData: contact,
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
