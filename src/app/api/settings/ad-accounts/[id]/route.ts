import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { inStore } from '@/lib/store-filter';
import { adapterFor, readCredentials } from '@/lib/ads';

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * The campaigns in a connected account, and disconnecting one.
 *
 * The list exists so a seller can say which of OUR campaigns is which of
 * THEIRS — once, by hand, and by id forever after. Matching by name
 * automatically would break the first time somebody renamed a campaign in
 * Ads Manager, and it would break silently: the spend would simply stop
 * attaching to anything.
 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('settings.view');
    const { id } = await ctx.params;

    const account = await db.adAccount.findFirst({
      where: { id, ...inStore(companyId, storeId) },
      select: { id: true, platform: true, accountId: true, tokenEncrypted: true },
    });
    if (!account) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });

    const adapter = adapterFor(account.platform);
    if (!adapter) return NextResponse.json({ error: 'منصة غير مدعومة' }, { status: 400 });

    try {
      // Decrypted for this one call and never returned. The secrets exist in
      // memory for the length of a request and nowhere else.
      const campaigns = await adapter.listCampaigns(readCredentials(account.tokenEncrypted), account.accountId);
      // A token that started failing says so on the screen rather than
      // failing quietly every night.
      await db.adAccount.update({ where: { id: account.id }, data: { status: 'CONNECTED', lastError: null } });
      return NextResponse.json({ campaigns });
    } catch (e) {
      const message = adapter.explainError(e);
      await db.adAccount.update({
        where: { id: account.id },
        data: { status: 'ERROR', lastError: message.slice(0, 500) },
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (e) {
    return apiErrorResponse(e);
  }
}

/**
 * Disconnect.
 *
 * The campaigns survive, and so do the numbers already pulled into them —
 * that spend was real money, and losing the connection is not a reason to
 * forget what was paid. They simply go back to being typed in by hand.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('settings.manage');
    const { id } = await ctx.params;

    const account = await db.adAccount.findFirst({
      where: { id, ...inStore(companyId, storeId) },
      select: { id: true, accountId: true, accountName: true, _count: { select: { campaigns: true } } },
    });
    if (!account) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });

    await db.$transaction([
      db.campaign.updateMany({
        where: { adAccountId: account.id },
        data: { adAccountId: null, externalId: null, spendSource: 'MANUAL' },
      }),
      db.adAccount.delete({ where: { id: account.id } }),
    ]);

    await logAudit({
      companyId,
      userId: user.id,
      action: 'AD_ACCOUNT_DISCONNECTED',
      entity: 'AdAccount',
      entityId: account.id,
      previousData: { accountId: account.accountId, accountName: account.accountName },
    });

    return NextResponse.json({
      success: true,
      unlinked: account._count.campaigns,
      message: account._count.campaigns
        ? `فُصل الحساب. ${account._count.campaigns} حملة عادت إلى الإدخال اليدوي، وأرقامها المسحوبة باقية.`
        : 'فُصل الحساب.',
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
