// CRM Lead — convert into Contact (and optionally a Deal)
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

const convertSchema = z.object({
  createDeal: z.boolean().optional().default(false),
  dealValue: z.number().min(0).optional(),
  stage: z.enum(['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('crm.leads.edit');
    const { id } = await params;

    const lead = await db.crmLead.findUnique({ where: { id } });
    if (!lead || lead.companyId !== companyId) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    if (lead.status === 'CONVERTED') {
      return NextResponse.json({ error: 'Lead is already converted' }, { status: 400 });
    }

    const parsed = convertSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid body' }, { status: 400 });
    }
    const { createDeal, dealValue, stage } = parsed.data;

    // Link the lead's companyName to an existing CRM company, creating it if needed
    let crmCompanyId: string | null = null;
    if (lead.companyName) {
      const crmCompany = await db.crmCompany.findFirst({
        where: { companyId, name: { equals: lead.companyName, mode: 'insensitive' } },
      });
      if (crmCompany) {
        crmCompanyId = crmCompany.id;
      } else {
        const created = await db.crmCompany.create({
          data: { companyId, name: lead.companyName, status: 'ACTIVE' },
        });
        crmCompanyId = created.id;
      }
    }

    const contact = await db.crmContact.create({
      data: {
        companyId,
        crmCompanyId,
        firstName: lead.name,
        email: lead.email,
        phone: lead.phone || 'N/A',
        ownerId: lead.assignedToId || user.id,
        notes: lead.notes,
      },
    });

    let deal: any = null;
    if (createDeal) {
      deal = await db.crmDeal.create({
        data: {
          companyId,
          title: lead.name,
          value: dealValue ?? 0,
          stage: stage || 'NEW',
          crmContactId: contact.id,
          crmCompanyId,
          assignedToId: lead.assignedToId || user.id,
        },
      });
    }

    const updatedLead = await db.crmLead.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        convertedContactId: contact.id,
        convertedDealId: deal?.id || null,
      },
    });

    await db.crmActivity.create({
      data: {
        companyId,
        type: 'STATUS_CHANGE',
        subject: `Lead: ${lead.status} → CONVERTED`,
        description: `Converted to contact${deal ? ' and deal' : ''}`,
        crmLeadId: id,
        crmContactId: contact.id,
        crmDealId: deal?.id || null,
        userId: user.id,
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CRM_LEAD_CONVERTED',
      entity: 'CrmLead',
      entityId: id,
      newData: updatedLead,
    });

    return NextResponse.json({ contact, deal });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
