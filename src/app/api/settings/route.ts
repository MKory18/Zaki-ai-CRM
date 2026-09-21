import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit, redactSensitiveValues } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';

/**
 * Settings JSON validation (PATCH).
 *
 * Known top-level keys get strict types; unknown keys are allowed only
 * as primitives (string/number/boolean) so legacy integrations keep
 * working. Whole document is capped at 8KB serialized / depth 4 /
 * keys <= 32 chars to prevent storing arbitrary oversized blobs.
 */
const MAX_SETTINGS_BYTES = 8 * 1024; // 8KB serialized
const MAX_DEPTH = 4;

const crmSchema = z
  .object({
    defaultCurrency: z.string().max(8).optional(),
    pipelineStages: z.array(z.string()).max(12).optional(),
    dealPrefix: z.string().max(8).optional(),
  })
  .passthrough();

const settingsSchema = z
  .object({
    defaultShippingCost: z.number().optional(),
    currencySymbol: z.string().max(10).optional(),
    timezone: z.string().max(64).optional(),
    crm: crmSchema.optional(),
  })
  // Unknown keys are allowed but only as primitive values
  .catchall(z.union([z.string(), z.number(), z.boolean()]))
  .superRefine((val, ctx) => {
    const serialized = JSON.stringify(val);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SETTINGS_BYTES) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'حجم الإعدادات يتجاوز الحد المسموح' });
    }
    for (const key of Object.keys(val)) {
      if (key.length > 32) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'اسم المفتاح طويل جداً' });
        break;
      }
    }
    // Depth check (path segments); known nested objects count as depth 2
    const checkDepth = (obj: unknown, depth: number): boolean => {
      if (depth > MAX_DEPTH) return false;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return Object.values(obj).every((v) => checkDepth(v, depth + 1));
      }
      return true;
    };
    if (!checkDepth(val, 1)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'تداخل الإعدادات عميق جداً' });
    }
  });

export async function GET() {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.view');

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
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');

    const body = await req.json();
    const { name, currency, country, settings } = body;

    let validatedSettings: unknown;
    if (settings !== undefined) {
      const parsed = settingsSchema.safeParse(settings);
      if (!parsed.success) {
        return NextResponse.json(
          { error: `إعدادات غير صالحة: ${zodMessage(parsed.error)}` },
          { status: 400 }
        );
      }
      validatedSettings = parsed.data;
    }

    const updated = await db.company.update({
      where: { id: companyId },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(currency ? { currency: currency.trim() } : {}),
        ...(country ? { country: country.trim() } : {}),
        ...(validatedSettings !== undefined ? { settings: JSON.stringify(validatedSettings) } : {}),
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'SETTINGS_UPDATED',
      entity: 'Company',
      entityId: companyId,
      // Audit redaction: values under password/secret/token/key-like
      // keys are replaced with '[REDACTED]' before persistence. The
      // settings JSON string is parsed first so nested keys are covered.
      newData: redactSensitiveValues({
        ...updated,
        settings: updated.settings ? JSON.parse(updated.settings) : null,
      }),
    });

    return NextResponse.json({ success: true, company: updated });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
