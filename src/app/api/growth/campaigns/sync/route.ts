import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { inStore } from '@/lib/store-filter';
import { decryptSecret } from '@/lib/secrets';
import { fetchSpend, metaDate, explainMetaError } from '@/lib/ads/meta';

/**
 * PULLING WHAT WAS SPENT.
 *
 * For every campaign linked to an ad account, ask the platform what it cost
 * over the campaign's own window and write that in. Everything beside it —
 * the orders, the confirmations, the deliveries, the money collected — was
 * already ours; this is the one number we could not witness.
 *
 * Only LINKED campaigns are touched. A campaign the seller types the spend
 * into keeps its typed number, and nothing here overwrites it: a figure a
 * person entered changing overnight, with no explanation, is worse than a
 * figure that was never automatic.
 *
 * One account failing does not stop the others. A shop running Meta and
 * TikTok should not lose both because one token expired, so each account is
 * its own try and its own error line in the result.
 */

/** A campaign with no end is still running; ask up to today. */
function windowFor(c: { startDate: Date; endDate: Date | null }): { since: string; until: string } {
  const today = new Date();
  const end = c.endDate && c.endDate < today ? c.endDate : today;
  return { since: metaDate(c.startDate), until: metaDate(end) };
}

export async function POST() {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('reports.view').catch(async () => requirePermission('analytics.view'));

    const accounts = await db.adAccount.findMany({
      where: inStore(companyId, storeId),
      select: {
        id: true, platform: true, accountId: true, accountName: true, tokenEncrypted: true,
        campaigns: {
          where: { externalId: { not: null } },
          select: { id: true, name: true, externalId: true, startDate: true, endDate: true, spend: true },
        },
      },
    });

    if (accounts.length === 0) {
      return NextResponse.json({
        updated: 0,
        accounts: [],
        message: 'لا حساب إعلاني مربوط. اربط حساباً من الإعدادات أولاً.',
      });
    }

    const report: { account: string; updated: number; error: string | null }[] = [];
    let total = 0;

    for (const account of accounts) {
      if (account.campaigns.length === 0) {
        report.push({ account: account.accountName ?? account.accountId, updated: 0, error: null });
        continue;
      }

      try {
        // The widest window any of this account's campaigns needs, asked
        // ONCE. A call per campaign would multiply the rate limit by the
        // number of campaigns, which is how a sync starts failing the month
        // a shop gets busy.
        const since = account.campaigns.reduce(
          (min, c) => (c.startDate < min ? c.startDate : min),
          account.campaigns[0].startDate
        );
        const rows = await fetchSpend(
          decryptSecret(account.tokenEncrypted),
          account.accountId,
          metaDate(since),
          metaDate(new Date())
        );
        const byId = new Map(rows.map((r) => [r.campaignId, r]));

        let updated = 0;
        for (const c of account.campaigns) {
          const row = byId.get(c.externalId!);
          if (!row) continue;

          // Per-campaign window, so a campaign that ran for a week is not
          // charged with a month of the account's spend.
          const w = windowFor(c);
          const exact =
            w.since === metaDate(since) && w.until === metaDate(new Date())
              ? row
              : (await fetchSpend(decryptSecret(account.tokenEncrypted), account.accountId, w.since, w.until))
                  .find((r) => r.campaignId === c.externalId);

          const spend = Number((exact?.spend ?? row.spend).toFixed(2));
          if (Number(c.spend) === spend) continue;

          await db.campaign.update({
            where: { id: c.id },
            data: { spend, spendSource: 'SYNCED', lastSyncAt: new Date() },
          });
          updated++;
        }

        total += updated;
        await db.adAccount.update({
          where: { id: account.id },
          data: { status: 'CONNECTED', lastError: null, lastSyncAt: new Date() },
        });
        report.push({ account: account.accountName ?? account.accountId, updated, error: null });
      } catch (e) {
        const message = explainMetaError(e);
        await db.adAccount.update({
          where: { id: account.id },
          data: { status: 'ERROR', lastError: message.slice(0, 500) },
        });
        report.push({ account: account.accountName ?? account.accountId, updated: 0, error: message });
      }
    }

    if (total > 0) {
      await logAudit({
        companyId,
        userId: user.id,
        action: 'CAMPAIGN_SPEND_SYNCED',
        entity: 'Campaign',
        entityId: storeId ?? '',
        newData: { updated: total, accounts: report.length },
      });
    }

    return NextResponse.json({ updated: total, accounts: report });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
