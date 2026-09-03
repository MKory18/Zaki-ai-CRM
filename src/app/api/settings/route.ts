import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const { companyId } = await requireCompanyTenant();

    const company = await db.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        currency: company.currency,
        country: company.country,
        settings: company.settings ? JSON.parse(company.settings) : {},
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.manage');

    const body = await req.json();
    const { name, currency, country, settings } = body;

    const updated = await db.company.update({
      where: { id: companyId },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(currency ? { currency: currency.trim() } : {}),
        ...(country ? { country: country.trim() } : {}),
        ...(settings ? { settings: JSON.stringify(settings) } : {}),
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'SETTINGS_UPDATED',
      entity: 'Company',
      entityId: companyId,
      newData: updated,
    });

    return NextResponse.json({ success: true, company: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
