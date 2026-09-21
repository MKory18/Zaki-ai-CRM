import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { encryptJson, decryptJson, encryptionAvailable, secretHint } from '@/lib/secrets';
import { logesTechsFromCredentials, type LogesTechsCredentials } from '@/lib/couriers/logestechs';
import { zodMessage } from '@/lib/zod-message';

/**
 * A courier's account on its shipping platform.
 *
 * The password is WRITE-ONLY. It goes in encrypted and never comes back out:
 * GET reports that an account exists, when it was saved and by whom, and the
 * last three characters of the login so you can tell which account it is.
 * An endpoint that can return a password is an endpoint that will, one day,
 * return it to the wrong person.
 *
 * Saving is refused outright when no encryption key is configured, rather
 * than falling back to plaintext. A visible failure beats an invisible one.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

const credentialsSchema = z.object({
  email: z.string().min(3).max(200),
  password: z.string().min(1).max(200),
  companyId: z.coerce.number().int().min(1),
  originCityId: z.coerce.number().int().min(1),
  senderName: z.string().min(1).max(120),
  senderPhone: z.string().min(5).max(40),
  senderBusiness: z.string().max(120).optional(),
  originAddress: z.string().max(200).optional(),
  originAddress2: z.string().max(200).optional(),
  baseUrl: z.string().max(300).optional(),
  serviceTypeId: z.coerce.number().int().optional(),
  vehicleTypeId: z.coerce.number().int().optional(),
  parcelTypeId: z.coerce.number().int().optional(),
});

async function loadProvider(id: string, companyId: string) {
  return db.deliveryProvider.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      name: true,
      adapterCode: true,
      code: true,
      apiEnabled: true,
      apiCredentials: true,
      credentialsUpdatedAt: true,
      credentialsUpdatedById: true,
    },
  });
}

/** What a screen may know: that an account exists, not what it is. */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { companyId } = await requireContext();
    await requirePermission('settings.view');
    const { id } = await ctx.params;

    const provider = await loadProvider(id, companyId);
    if (!provider) return NextResponse.json({ error: 'شركة الشحن غير موجودة' }, { status: 404 });

    const stored = decryptJson<LogesTechsCredentials>(provider.apiCredentials);
    const savedBy = provider.credentialsUpdatedById
      ? await db.user.findUnique({
          where: { id: provider.credentialsUpdatedById },
          select: { name: true },
        })
      : null;

    return NextResponse.json({
      providerId: provider.id,
      name: provider.name,
      adapterCode: provider.adapterCode || provider.code,
      apiEnabled: provider.apiEnabled,
      encryptionAvailable: encryptionAvailable(),
      hasCredentials: Boolean(provider.apiCredentials),
      // Unreadable credentials are reported, not hidden: the courier is
      // silently manual until someone is told why.
      readable: provider.apiCredentials ? stored !== null : null,
      savedAt: provider.credentialsUpdatedAt,
      savedBy: savedBy?.name ?? null,
      // Never the password. Enough of the login to recognise the account.
      emailHint: stored ? secretHint(stored.email) : null,
      accountCompanyId: stored?.companyId ?? null,
      senderName: stored?.senderName ?? null,
      originCityId: stored?.originCityId ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('settings.manage');
    const { id } = await ctx.params;

    const provider = await loadProvider(id, companyId);
    if (!provider) return NextResponse.json({ error: 'شركة الشحن غير موجودة' }, { status: 404 });

    if (!encryptionAvailable()) {
      return NextResponse.json(
        {
          error:
            'مفتاح التشفير غير مُهيّأ على الخادم (APP_ENCRYPTION_KEY) — لن تُحفظ كلمة المرور بلا تشفير.',
          code: 'ENCRYPTION_KEY_MISSING',
        },
        { status: 503 }
      );
    }

    const parsed = credentialsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodMessage(parsed.error) },
        { status: 400 }
      );
    }

    // Would these credentials actually produce a working adapter? Saying so
    // now beats discovering it on the first parcel of the day.
    if (!logesTechsFromCredentials(parsed.data as LogesTechsCredentials)) {
      return NextResponse.json({ error: 'الحساب غير مكتمل — راجع الحقول المطلوبة' }, { status: 400 });
    }

    await db.deliveryProvider.update({
      where: { id: provider.id },
      data: {
        apiCredentials: encryptJson(parsed.data),
        credentialsUpdatedAt: new Date(),
        credentialsUpdatedById: user.id,
      },
    });

    // The audit records THAT it changed and who changed it. Never the values:
    // an audit log that holds passwords is a second place to steal them from.
    await logAudit({
      companyId,
      userId: user.id,
      action: 'COURIER_CREDENTIALS_SAVED',
      entity: 'DeliveryProvider',
      entityId: provider.id,
      newData: {
        provider: provider.name,
        accountCompanyId: parsed.data.companyId,
        emailHint: secretHint(parsed.data.email),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Forget the account. The courier falls back to manual on the next parcel. */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('settings.manage');
    const { id } = await ctx.params;

    const provider = await loadProvider(id, companyId);
    if (!provider) return NextResponse.json({ error: 'شركة الشحن غير موجودة' }, { status: 404 });

    await db.deliveryProvider.update({
      where: { id: provider.id },
      data: { apiCredentials: null, credentialsUpdatedAt: null, credentialsUpdatedById: null },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'COURIER_CREDENTIALS_CLEARED',
      entity: 'DeliveryProvider',
      entityId: provider.id,
      newData: { provider: provider.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
