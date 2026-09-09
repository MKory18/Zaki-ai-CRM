// CRM Note — get / update / delete
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

const updateSchema = z.object({
  body: z.string().min(1).max(10000).optional(),
});

const includeDetail = {
  user: { select: { id: true, name: true } },
  crmContact: { select: { id: true, firstName: true, lastName: true } },
  crmCompany: { select: { id: true, name: true } },
  crmDeal: { select: { id: true, title: true } },
  crmLead: { select: { id: true, name: true } },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('crm.notes.view');
    const { id } = await params;

    const record = await db.crmNote.findUnique({ where: { id }, include: includeDetail });
    if (!record || record.companyId !== companyId) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    return NextResponse.json({ note: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.notes.edit');
    const { id } = await params;

    const existing = await db.crmNote.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }

    const record = await db.crmNote.update({ where: { id }, data: parsed.data });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_NOTE_UPDATED',
      entity: 'CrmNote',
      entityId: id,
      previousData: existing,
      newData: record,
    });

    return NextResponse.json({ note: record });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.notes.delete');
    const { id } = await params;

    const existing = await db.crmNote.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    await db.crmNote.delete({ where: { id } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_NOTE_DELETED',
      entity: 'CrmNote',
      entityId: id,
      previousData: existing,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
