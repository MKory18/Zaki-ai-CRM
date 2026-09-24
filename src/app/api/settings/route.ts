import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';

/**
 * GET/PATCH /api/settings — the company's own name, and nothing else.
 *
 * This endpoint used to read and write the whole Company.settings JSON. It
 * returned it to anybody holding settings.view — the encrypted AI key and
 * its hint included — and it REPLACED it on save, so the system screen's
 * three fields wiped the AI key, its prompts and the message templates
 * every time somebody pressed save. The pixel screen, going the other way,
 * sent the whole blob back and was refused once anything nested lived in
 * it.
 *
 * Every key in that JSON now has an owner that reads and writes only its
 * own key: the AI settings (/api/settings/ai) and the message templates
 * (/api/settings/messages). What was left here — an org currency and
 * country that duplicated the Country model, a default fee and a default
 * commission nothing read, a model nothing used, preferences no page ever
 * loaded — is gone. The company name is the one field that is genuinely the
 * company's, and it has no other editor.
 */

const patchSchema = z
  .object({
    name: z.string().trim().min(2, 'اسم الشركة قصير جداً').max(120, 'اسم الشركة طويل جداً'),
  })
  .strict();

export async function GET() {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('settings.view');

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) return NextResponse.json({ error: 'الشركة غير موجودة' }, { status: 404 });

    return NextResponse.json({ company });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    const before = await db.company.findUnique({ where: { id: companyId }, select: { name: true } });
    const updated = await db.company.update({
      where: { id: companyId },
      data: { name: parsed.data.name },
      select: { id: true, name: true },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'SETTINGS_UPDATED',
      entity: 'Company',
      entityId: companyId,
      previousData: { name: before?.name ?? null },
      newData: { name: updated.name },
    });

    return NextResponse.json({ success: true, company: updated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
