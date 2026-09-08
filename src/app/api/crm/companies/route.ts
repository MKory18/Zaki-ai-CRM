// CRM Companies — list / create
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseListParams, listResponse, contains, dateRange } from '@/lib/crm';
import { requirePermission } from '@/lib/authorization';

const SORTABLE = ['name', 'status', 'industry', 'createdAt', 'updatedAt'];

const createSchema = z.object({
  name: z.string().min(1).max(200),
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

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.view');
    const { q, sort, dir, page, pageSize, filters, from, to } = parseListParams(req, SORTABLE);

    const where: any = { companyId, ...dateRange('createdAt', from, to) };
    if (q) {
      where.OR = [
        { name: contains(q) },
        { industry: contains(q) },
        { email: contains(q) },
        { phone: contains(q) },
        { city: contains(q) },
        { website: contains(q) },
      ];
    }
    for (const key of ['status', 'industry', 'city', 'country', 'size']) {
      if (filters[key]) where[key] = filters[key];
    }

    const [items, total] = await Promise.all([
      db.crmCompany.findMany({
        where,
        include: {
          _count: { select: { contacts: true, deals: true, invoices: true } },
        },
        orderBy: { [sort]: dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.crmCompany.count({ where }),
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

    const company = await db.crmCompany.create({
      data: { ...data, companyId },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_COMPANY_CREATED',
      entity: 'CrmCompany',
      entityId: company.id,
      newData: company,
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
