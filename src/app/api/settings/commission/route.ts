import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';

/**
 * Commission rules — DATA, not code.
 *
 *   GET   /api/settings/commission
 *   POST  /api/settings/commission     add a rule with its effective date
 *   PATCH /api/settings/commission     end a rule (never edit history)
 *
 * A rule is never edited in place: changing the numbers would silently
 * rewrite what people already earned. Ending a rule and starting a new one
 * from a date keeps every closed period exactly as it was.
 */

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  appliesToRole: z.string().trim().max(40).optional().nullable(),
  appliesToUserId: z.string().uuid().optional().nullable(),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().min(0).max(1_000_000),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minSampleOrders: z.number().int().min(0).max(1000).default(30),
});

const endSchema = z.object({
  ruleId: z.string().uuid(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET() {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('settings.view');

    const rules = await db.commissionRule.findMany({
      // This store's agreement. One store's arrangement with its agents is
      // not the other's to read, let alone to be paid under.
      where: { companyId, storeId },
      orderBy: [{ isActive: 'desc' }, { effectiveFrom: 'desc' }],
    });
    const userIds = rules.map((r) => r.appliesToUserId).filter(Boolean) as string[];
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, u.name]));

    return NextResponse.json({
      rules: rules.map((r) => ({
        ...r,
        value: Number(r.value),
        appliesToUserName: r.appliesToUserId ? nameOf.get(r.appliesToUserId) ?? null : null,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('settings.edit');

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const input = parsed.data;
    if (!input.appliesToRole && !input.appliesToUserId) {
      return NextResponse.json({ error: 'حدّد الدور أو الموظف الذي تنطبق عليه القاعدة' }, { status: 400 });
    }

    const rule = await db.commissionRule.create({
      data: {
        companyId,
        // From the session, never the body.
        storeId,
        name: input.name,
        appliesToRole: input.appliesToUserId ? null : input.appliesToRole ?? null,
        appliesToUserId: input.appliesToUserId ?? null,
        basis: 'ORDER_DELIVERED', // accrual point per contract
        type: input.type,
        value: input.value,
        minSampleOrders: input.minSampleOrders,
        effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
        createdById: user.id,
      },
    });

    await logAudit({
      companyId, userId: user.id, action: 'COMMISSION_RULE_CREATED',
      entity: 'CommissionRule', entityId: rule.id, newData: input,
    });

    return NextResponse.json({ rule: { ...rule, value: Number(rule.value) } }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('settings.edit');

    const parsed = endSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    const rule = await db.commissionRule.findFirst({ where: { id: parsed.data.ruleId, companyId, storeId } });
    if (!rule) return NextResponse.json({ error: 'القاعدة غير موجودة' }, { status: 404 });

    const ended = await db.commissionRule.update({
      where: { id: rule.id },
      data: { effectiveTo: new Date(`${parsed.data.effectiveTo}T23:59:59.000Z`), isActive: false },
    });

    await logAudit({
      companyId, userId: user.id, action: 'COMMISSION_RULE_ENDED',
      entity: 'CommissionRule', entityId: rule.id,
      previousData: { effectiveTo: rule.effectiveTo, isActive: rule.isActive },
      newData: { effectiveTo: parsed.data.effectiveTo },
    });

    return NextResponse.json({ rule: { ...ended, value: Number(ended.value) } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
