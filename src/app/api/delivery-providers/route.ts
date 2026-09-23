import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { zodMessage } from '@/lib/zod-message';

const providerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_-]+$/i, 'Code: letters/numbers only'),
  // A مندوب delivers immediately and is settled by hand; a company has its
  // own pipeline and sends statements. The difference decides whether a
  // parcel may be moved away without raising a replacement order.
  kind: z.enum(['COMPANY', 'AGENT']).default('COMPANY'),
  phone: z.string().trim().max(25).optional(),
  email: z.string().trim().email().optional(),
  address: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  /**
   * Which store this courier is for. Omitted means every store — the same
   * thing every courier meant before stores had their own.
   */
  storeId: z.string().uuid().nullish(),
  /**
   * Which platform this courier runs on. A courier is not a platform:
   * "Basha Delivery" is who ships, "LOGESTECHS" is what they ship on, and
   * two different couriers can run on the same one under separate accounts.
   */
  adapterCode: z.enum(['LOGESTECHS', 'MANUAL']).nullish(),
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
      select: {
        id: true, name: true, code: true, kind: true, phone: true, email: true,
        address: true, isActive: true, createdAt: true, storeId: true,
        // Which platform it ships on, and whose store it is: the two things
        // the list could not answer, which is why the screen could not either.
        adapterCode: true, apiEnabled: true,
        store: { select: { name: true } },
      },
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
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const { name, code, kind, phone, email, address, notes, storeId, adapterCode } = parsed.data;

    // A store the caller does not own is not a store they may file under.
    if (storeId) {
      const store = await db.store.findFirst({ where: { id: storeId, companyId }, select: { id: true } });
      if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 400 });
    }

    const clash = await db.deliveryProvider.findFirst({ where: { companyId, code: code.toUpperCase() } });
    if (clash) return NextResponse.json({ error: 'الرمز مستعمل لشركة أخرى', code: 'CODE_TAKEN' }, { status: 409 });

    const provider = await db.deliveryProvider.create({
      data: {
        companyId, name, code: code.toUpperCase(), kind, phone, email, address, notes,
        storeId: storeId || null,
        // MANUAL is "no platform", which is the absence of an adapter rather
        // than an adapter named MANUAL — storing the word would make
        // adapterFor look for one that does not exist.
        adapterCode: adapterCode && adapterCode !== 'MANUAL' ? adapterCode : null,
        apiEnabled: Boolean(adapterCode && adapterCode !== 'MANUAL'),
      },
      // Same reason as the PATCH: this row can hold an encrypted account,
      // and returning it whole is how ciphertext reaches a browser.
      select: {
        id: true, name: true, code: true, kind: true, phone: true,
        email: true, address: true, notes: true, isActive: true, createdAt: true, storeId: true,
        adapterCode: true, apiEnabled: true,
      },
    });

    await logAudit({
      companyId, userId: user.id, action: 'DELIVERY_PROVIDER_CREATED',
      entity: 'DeliveryProvider', entityId: provider.id, newData: { name, code, kind },
    });

    return NextResponse.json({ success: true, provider });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}
