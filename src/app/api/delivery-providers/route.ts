import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

const providerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_-]+$/i, 'Code: letters/numbers only'),
  phone: z.string().trim().max(25).optional(),
  email: z.string().trim().email().optional(),
  address: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});

/** GET /api/delivery-providers — company-scoped list.
 *  Tenant-only on purpose (no permission gate): reference data needed by the
 *  shipping UI for any employee who handles delivery. */
export async function GET() {
  try {
    const { companyId } = await requireCompanyTenant();
    const providers = await db.deliveryProvider.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      // apiBaseUrl is internal config — not exposed broadly
      select: { id: true, name: true, code: true, phone: true, email: true, address: true, isActive: true, createdAt: true },
    });
    return NextResponse.json({ providers });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}

/** POST /api/delivery-providers — create (settings.edit or SUPER_ADMIN/COMPANY_ADMIN) */
export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');
    const parsed = providerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }
    const { name, code, phone, email, address, notes } = parsed.data;

    const clash = await db.deliveryProvider.findFirst({ where: { companyId, code: code.toUpperCase() } });
    if (clash) return NextResponse.json({ error: 'Provider code already exists' }, { status: 409 });

    const provider = await db.deliveryProvider.create({
      data: { companyId, name, code: code.toUpperCase(), phone, email, address, notes },
    });

    await logAudit({
      companyId, userId: user.id, action: 'DELIVERY_PROVIDER_CREATED',
      entity: 'DeliveryProvider', entityId: provider.id, newData: { name, code },
    });

    return NextResponse.json({ success: true, provider });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}
