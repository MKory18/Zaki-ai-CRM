// CRM Invoice — get / update (amountPaid & status with auto PAID / PARTIALLY_PAID) / delete
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

const STATUSES = ['DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED'] as const;

const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  amountPaid: z.number().min(0).optional(),
  dueDate: z.string().datetime().nullish(),
  issueDate: z.string().datetime().optional(),
  notes: z.string().max(5000).nullish(),
  crmContactId: z.string().uuid().nullish(),
  crmCompanyId: z.string().uuid().nullish(),
  crmDealId: z.string().uuid().nullish(),
});

const includeDetail = {
  crmContact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  crmCompany: { select: { id: true, name: true } },
  crmDeal: { select: { id: true, title: true, stage: true } },
};

function safeParseItems(itemsJson: string) {
  try {
    return JSON.parse(itemsJson);
  } catch {
    return [];
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.view');
    const { id } = await params;

    let record = await db.crmInvoice.findUnique({ where: { id }, include: includeDetail });
    if (!record || record.companyId !== companyId) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Auto-derive OVERDUE for unpaid past-due invoices
    const now = new Date();
    if (['SENT', 'PARTIALLY_PAID'].includes(record.status) && record.dueDate && record.dueDate < now) {
      record = await db.crmInvoice.update({ where: { id }, data: { status: 'OVERDUE' }, include: includeDetail });
    }

    return NextResponse.json({ invoice: { ...record, items: safeParseItems(record.itemsJson) } });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.manage');
    const { id } = await params;

    const existing = await db.crmInvoice.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }
    const data: any = { ...parsed.data };
    if (data.dueDate !== undefined) data.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.issueDate !== undefined) data.issueDate = new Date(data.issueDate);

    const amountPaid = data.amountPaid ?? existing.amountPaid;
    const total = existing.total;

    // Payment-derived status: auto PAID / PARTIALLY_PAID unless explicitly cancelled
    if (data.amountPaid !== undefined && data.status === undefined) {
      if (total > 0 && amountPaid >= total) {
        data.status = 'PAID';
      } else if (amountPaid > 0) {
        data.status = 'PARTIALLY_PAID';
      }
    }

    const record = await db.crmInvoice.update({ where: { id }, data, include: includeDetail });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_INVOICE_UPDATED',
      entity: 'CrmInvoice',
      entityId: id,
      previousData: existing,
      newData: record,
    });

    return NextResponse.json({ invoice: { ...record, items: safeParseItems(record.itemsJson) } });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.manage');
    const { id } = await params;

    const existing = await db.crmInvoice.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    await db.crmInvoice.delete({ where: { id } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_INVOICE_DELETED',
      entity: 'CrmInvoice',
      entityId: id,
      previousData: existing,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
