import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { inStore } from '@/lib/store-filter';
import { adapterFor, readCredentials } from '@/lib/ads';
import { DISCONNECTED, isManualAccount, switchedToManualMessage } from '@/lib/ads/manual';

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
      select: { id: true, platform: true, accountId: true, tokenEncrypted: true, status: true },
    });
    if (!account) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });

    // A manual account has no token and nowhere to ask: there is nothing to
    // decrypt and no platform behind it. Said plainly, before the adapter is
    // even looked up, so no path can reach `readCredentials` with a null.
    if (isManualAccount(account) || !account.tokenEncrypted) {
      return NextResponse.json(
        { error: 'هذا حساب يدوي — لا ربط له بالمنصة. أدخل حملاته وإنفاقها بيدك من شاشة الحملات.' },
        { status: 400 }
      );
    }

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
      select: { id: true, accountId: true, accountName: true, status: true, _count: { select: { campaigns: true } } },
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
      previousData: { accountId: account.accountId, accountName: account.accountName, status: account.status },
    });

    // A manual account was never connected, so «فُصل» would be a lie about it.
    const manual = isManualAccount(account);
    return NextResponse.json({
      success: true,
      unlinked: account._count.campaigns,
      message: account._count.campaigns
        ? manual
          ? `حُذف الحساب. ${account._count.campaigns} حملة بقيت بلا حساب، وإنفاقها بيدك كما كان.`
          : `فُصل الحساب. ${account._count.campaigns} حملة عادت إلى الإدخال اليدوي، وأرقامها المسحوبة باقية.`
        : manual
          ? 'حُذف الحساب.'
          : 'فُصل الحساب.',
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

/**
 * Switch a connected account to MANUAL — «اوتوماتيك او ادخال يدوي بالكامل».
 *
 * The other direction needs no endpoint of its own: connecting an account
 * (the paste form or the sign-in) upserts on the platform's own id, so a
 * manual account entered WITH its id becomes connected the moment the same id
 * is connected. One made up without an id has nothing to match, and the seller
 * connects the real one beside it and moves the campaigns across.
 *
 * What switching does, all in one transaction:
 *
 *   • the token is DELETED from the row, not hidden — `DISCONNECTED` in
 *     `manual.ts`, which the migration's CHECK pairs with the status;
 *   • the account's campaigns STAY in it, and stop being synced
 *     (`externalId` cleared, `spendSource` back to MANUAL), because a campaign
 *     that kept its remote id would be waiting for a sync that can no longer
 *     arrive;
 *   • the spend already pulled is NOT touched. It was real money, and the
 *     disconnect above says the same.
 *
 * Idempotent: asking for MANUAL on a manual account answers 200 and changes
 * nothing, so a double tap on a slow connection is not an error.
 */
const switchSchema = z.object({ mode: z.literal('MANUAL') });

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('settings.manage');
    const { id } = await ctx.params;

    const parsed = switchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'الطلب غير صالح' }, { status: 400 });
    }

    const account = await db.adAccount.findFirst({
      where: { id, ...inStore(companyId, storeId) },
      select: { id: true, accountId: true, accountName: true, status: true, _count: { select: { campaigns: true } } },
    });
    if (!account) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });

    if (isManualAccount(account)) {
      return NextResponse.json({ success: true, changed: false, message: 'الحساب يدوي أصلاً.' });
    }

    await db.$transaction([
      db.campaign.updateMany({
        where: { adAccountId: account.id },
        data: { externalId: null, spendSource: 'MANUAL' },
      }),
      db.adAccount.update({ where: { id: account.id }, data: { ...DISCONNECTED } }),
    ]);

    await logAudit({
      companyId,
      userId: user.id,
      action: 'AD_ACCOUNT_SWITCHED_TO_MANUAL',
      entity: 'AdAccount',
      entityId: account.id,
      // Which account and what it was. Never the token, not even its hint.
      previousData: { accountId: account.accountId, accountName: account.accountName, status: account.status },
      newData: { status: 'MANUAL', campaigns: account._count.campaigns },
    });

    return NextResponse.json({
      success: true,
      changed: true,
      campaigns: account._count.campaigns,
      message: switchedToManualMessage(account._count.campaigns),
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
