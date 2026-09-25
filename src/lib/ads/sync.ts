import { db } from '../db';
import { inStore } from '../store-filter';
import { adapterFor, readCredentials, adDate } from './index';

/**
 * PULLING WHAT WAS SPENT.
 *
 * For every campaign linked to an ad account, ask the platform what it cost
 * over the campaign's own window and write that in. Everything beside it —
 * the orders, the confirmations, the deliveries, the money collected — was
 * already ours; this is the one number we could not witness.
 *
 * It lived inside a route handler, which meant the spend was only ever
 * pulled when somebody opened the campaigns screen. A shop whose owner did
 * not look for a week had a week of campaigns showing a profit computed
 * from a cost of zero. It is the same code in both places now: the button
 * still works, and the job runs it before anybody arrives.
 *
 * Only LINKED campaigns are touched. A campaign the seller types the spend
 * into keeps its typed number: a figure a person entered changing overnight
 * with no explanation is worse than a figure that was never automatic.
 *
 * One account failing does not stop the others. A shop running Meta and
 * TikTok should not lose both because one token expired, so each account is
 * its own try and its own error line.
 *
 * No platform is named anywhere below. Each account hands over its adapter
 * and the loop asks it the same questions, so a fourth platform needs
 * nothing here at all.
 */

export interface AccountReport {
  account: string;
  updated: number;
  error: string | null;
}

export interface SpendSyncResult {
  updated: number;
  accounts: AccountReport[];
  /** Said plainly when there is nothing to sync, rather than a silent zero. */
  message?: string;
}

/** A campaign with no end is still running; ask up to today. */
function windowFor(c: { startDate: Date; endDate: Date | null }): { since: string; until: string } {
  const today = new Date();
  const end = c.endDate && c.endDate < today ? c.endDate : today;
  return { since: adDate(c.startDate), until: adDate(end) };
}

export async function syncAdSpend(scope: {
  companyId: string;
  storeId: string | null;
}): Promise<SpendSyncResult> {
  const accounts = await db.adAccount.findMany({
    where: inStore(scope.companyId, scope.storeId),
    select: {
      id: true, platform: true, accountId: true, accountName: true, tokenEncrypted: true,
      campaigns: {
        where: { externalId: { not: null } },
        select: { id: true, name: true, externalId: true, startDate: true, endDate: true, spend: true },
      },
    },
  });

  if (accounts.length === 0) {
    return { updated: 0, accounts: [], message: 'لا حساب إعلاني مربوط. اربط حساباً من الإعدادات أولاً.' };
  }

  const report: AccountReport[] = [];
  let total = 0;

  for (const account of accounts) {
    const label = account.accountName ?? account.accountId;

    if (account.campaigns.length === 0) {
      report.push({ account: label, updated: 0, error: null });
      continue;
    }

    const adapter = adapterFor(account.platform);
    if (!adapter) {
      report.push({ account: label, updated: 0, error: `منصة غير مدعومة: ${account.platform}` });
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
      const creds = readCredentials(account.tokenEncrypted);
      const rows = await adapter.fetchSpend(creds, account.accountId, adDate(since), adDate(new Date()));
      const byId = new Map(rows.map((r) => [r.campaignId, r]));

      let updated = 0;
      for (const c of account.campaigns) {
        const row = byId.get(c.externalId!);
        if (!row) continue;

        // Per-campaign window, so a campaign that ran for a week is not
        // charged with a month of the account's spend.
        const w = windowFor(c);
        const exact =
          w.since === adDate(since) && w.until === adDate(new Date())
            ? row
            : (await adapter.fetchSpend(creds, account.accountId, w.since, w.until)).find(
                (r) => r.campaignId === c.externalId
              );

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
      report.push({ account: label, updated, error: null });
    } catch (e) {
      const message = adapter.explainError(e);
      await db.adAccount.update({
        where: { id: account.id },
        data: { status: 'ERROR', lastError: message.slice(0, 500) },
      });
      report.push({ account: label, updated: 0, error: message });
    }
  }

  return { updated: total, accounts: report };
}
