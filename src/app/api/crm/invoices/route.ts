// CRM Invoices — list / create
// POST auto-generates sequential invoice numbers (INV-000001) per company with retry on conflict.
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseListParams, listResponse, contains, dateRange } from '@/lib/crm';
import { requirePermission } from '@/lib/authorization';

const SORTABLE = ['invoiceNumber', 'status', 'issueDate', 'dueDate', 'total', 'amountPaid', 'createdAt', 'updatedAt'];

const STATUSES = ['DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED'] as const;

const itemSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
});

const createSchema = z.object({
  crmContactId: z.string().uuid().nullish(),
  crmCompanyId: z.string().uuid().nullish(),
  crmDealId: z.string().uuid().nullish(),
  status: z.enum(STATUSES).optional(),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().nullish(),
  taxRate: z.number().min(0).max(100).optional(),
  currency: z.string().max(10).optional(),
  items: z.array(itemSchema).min(1),
  notes: z.string().max(5000).nullish(),
});

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.invoices.view');
    const { q, sort, dir, page, pageSize, filters, from, to } = parseListParams(req, SORTABLE);

    const where: any = { companyId, ...dateRange('issueDate', from, to) };
    if (q) {
      where.OR = [{ invoiceNumber: contains(q) }, { notes: contains(q) }];
    }
    for (const key of ['status', 'crmContactId', 'crmCompanyId', 'crmDealId']) {
      if (filters[key]) where[key] = filters[key];
    }

    // List read-model: flag overdue invoices whose dueDate has passed
    const now = new Date();
    await db.crmInvoice.updateMany({
      where: { companyId, status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: now } },
      data: { status: 'OVERDUE' },
    });

    const [items, total] = await Promise.all([
      db.crmInvoice.findMany({
        where,
        include: {
          crmContact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
          crmCompany: { select: { id: true, name: true } },
          crmDeal: { select: { id: true, title: true, stage: true } },
        },
        orderBy: { [sort]: dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.crmInvoice.count({ where }),
    ]);

    // Parse the line items JSON for the client
    const mapped = items.map((inv) => ({ ...inv, items: safeParseItems(inv.itemsJson) }));

    return listResponse(mapped, total, page, pageSize);
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.invoices.create');
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
    if (data.crmDealId) {
      const deal = await db.crmDeal.findFirst({ where: { id: data.crmDealId, companyId } });
      if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    // Server-side money math: subtotal, tax, total
    const subtotal = data.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const taxRate = data.taxRate ?? 0;
    const taxAmount = (subtotal * taxRate) / 100;
    const total = subtotal + taxAmount;

    const invoice = await createWithSequentialNumber(companyId, {
      companyId,
      crmContactId: data.crmContactId ?? null,
      crmCompanyId: data.crmCompanyId ?? null,
      crmDealId: data.crmDealId ?? null,
      status: data.status || 'DRAFT',
      issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      subtotal,
      taxRate,
      taxAmount,
      total,
      amountPaid: 0,
      currency: data.currency || 'USD',
      itemsJson: JSON.stringify(data.items),
      notes: data.notes ?? null,
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_INVOICE_CREATED',
      entity: 'CrmInvoice',
      entityId: invoice.id,
      newData: invoice,
    });

    return NextResponse.json({ invoice: { ...invoice, items: data.items } }, { status: 201 });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

/** Generates INV-<zero-padded count+1>, retrying on unique conflicts under concurrency */
async function createWithSequentialNumber(companyId: string, data: any) {
  const maxAttempts = 5;
  let lastError: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const count = await db.crmInvoice.count({ where: { companyId } });
    const invoiceNumber = `INV-${String(count + 1).padStart(6, '0')}`;
    try {
      return await db.crmInvoice.create({ data: { ...data, invoiceNumber } });
    } catch (e: any) {
      // P2002: unique constraint violated — another request took this number, retry
      if (e?.code === 'P2002') {
        lastError = e;
        continue;
      }
      throw e;
    }
  }
  throw lastError || new Error('Failed to generate invoice number');
}

function safeParseItems(itemsJson: string) {
  try {
    return JSON.parse(itemsJson);
  } catch {
    return [];
  }
}
