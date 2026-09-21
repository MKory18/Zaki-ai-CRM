import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { builtInApps } from '@/lib/apps/registry';
import { zodMessage } from '@/lib/zod-message';

/**
 * Installing, enabling and removing an app.
 *
 * Installing a built-in does not copy its settings screen: the install says
 * "this company uses this", and the screen that already configures it
 * configures it. Four config forms reproduced under an "apps" heading would
 * be four more places for a credential to go into the wrong field.
 *
 * Disabling is kept apart from removing. A seller turning an integration off
 * for an afternoon should not lose what they entered to turn it back on.
 */

const schema = z.object({
  appCode: z.string().trim().toUpperCase().min(2).max(40),
  action: z.enum(['install', 'enable', 'disable', 'uninstall']),
});

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('apps.manage');

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const { appCode, action } = parsed.data;

    // The code must name something real — a built-in, or an app this company
    // registered. An install row pointing at nothing is a row nobody can
    // explain later.
    const builtIn = builtInApps(db).find((b) => b.code === appCode);
    const external = builtIn
      ? null
      : await db.app.findFirst({ where: { companyId, code: appCode }, select: { id: true, name: true } });

    if (!builtIn && !external) {
      return NextResponse.json({ error: 'التطبيق غير معروف' }, { status: 404 });
    }
    const appName = builtIn?.name ?? external!.name;

    const existing = await db.appInstall.findFirst({ where: { companyId, appCode }, select: { id: true } });

    if (action === 'uninstall') {
      if (!existing) return NextResponse.json({ success: true });
      await db.appInstall.delete({ where: { id: existing.id } });
      await logAudit({
        companyId, userId: user.id, action: 'APP_UNINSTALLED',
        entity: 'AppInstall', entityId: existing.id, newData: { appCode, appName },
      });
      return NextResponse.json({ success: true });
    }

    const enabled = action !== 'disable';

    const install = existing
      ? await db.appInstall.update({
          where: { id: existing.id },
          data: { enabled },
          select: { id: true, appCode: true, enabled: true, installedAt: true },
        })
      : await db.appInstall.create({
          data: {
            companyId,
            appCode,
            appId: external?.id ?? null,
            enabled,
            installedById: user.id,
          },
          select: { id: true, appCode: true, enabled: true, installedAt: true },
        });

    await logAudit({
      companyId,
      userId: user.id,
      action: existing ? (enabled ? 'APP_ENABLED' : 'APP_DISABLED') : 'APP_INSTALLED',
      entity: 'AppInstall',
      entityId: install.id,
      newData: { appCode, appName, enabled },
    });

    return NextResponse.json({
      success: true,
      install,
      // Where to finish the job, for a built-in whose settings live elsewhere.
      settingsPath: builtIn?.settingsPath ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
