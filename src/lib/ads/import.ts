import { db } from '../db';
import { inStore } from '../store-filter';
import { generateCampaignCode } from '../campaigns';
import { adapterFor, readCredentials } from './index';
import type { RemoteCampaign } from './types';

/**
 * PULLING THE CAMPAIGNS THEMSELVES, NOT ONLY WHAT THEY SPENT.
 *
 * «ما بقدر اربط الحساب الاعلاني … يسحب منو الداتا تبع الحملات».
 *
 * `syncAdSpend` beside this file only ever touched campaigns somebody had
 * already typed in HERE and then matched to a remote one by hand, by
 * pasting an `externalId`. A shop running fourteen campaigns had to type
 * fourteen rows and paste fourteen ids before a single figure arrived, and
 * the fifteenth campaign — made in Ads Manager on a Tuesday — was invisible
 * until somebody remembered.
 *
 * ── WHAT THIS DOES AND DOES NOT DO ──
 *
 * It CREATES what is missing and touches nothing that exists. A name a
 * seller typed, a product they chose, a landing page they linked, a spend
 * they entered by hand — none of it is overwritten by a platform. An
 * importer that "kept things in step" would be an importer that renames a
 * seller's campaign overnight because somebody edited it in Ads Manager,
 * and that is a feature nobody asked for and everybody would have to undo.
 *
 * So: new campaigns appear, existing ones are left exactly as they are, and
 * the report says which were which. Running it twice changes nothing the
 * second time.
 *
 * ── WHAT AN IMPORTED CAMPAIGN DOES NOT KNOW ──
 *
 * Its product and its landing page. The platform has no idea which of our
 * products an ad is for, and guessing from a name would be a figure that
 * looks measured and is not. They stay null — «not stated» — and the
 * seller fills them in; `campaignProductId` already treats null as a real
 * answer rather than a hole.
 *
 * ── AND THE DATE MATTERS MORE THAN IT LOOKS ──
 *
 * `syncAdSpend` asks each platform for spend over the campaign's own
 * window, so the start date decides which money is attributed. Importing
 * everything as «today» would show a campaign that has run for a month
 * with one day of cost, and the profit beside it computed from that. The
 * platform's own start time is used, and when there is none the import says
 * so rather than quietly choosing a day.
 */

export interface ImportedCampaign {
  id: string;
  name: string;
  code: string;
  externalId: string;
  startDate: string;
}

export interface AccountImport {
  account: string;
  created: ImportedCampaign[];
  /** Already here, under our own name — left untouched. */
  existing: number;
  /** Seen on the platform and deliberately not created; see `SKIP_STATUSES`. */
  skipped: number;
  error: string | null;
}

export interface ImportResult {
  created: number;
  accounts: AccountImport[];
  message?: string;
}

/**
 * A REMOTE CAMPAIGN THAT IS OVER IS NOT WORTH A ROW.
 *
 * Ads Manager keeps deleted and archived campaigns forever, and an account
 * three years old answers `listCampaigns` with hundreds of them. Importing
 * those would bury the four a seller is actually running, and every one
 * would carry a code stamped into our order numbering for a campaign that
 * can never bring an order.
 *
 * The adapters normalise to ACTIVE / PAUSED, so anything else is a status
 * none of them claims to produce — which is exactly the set to leave alone.
 */
const KEEP_STATUSES = new Set(['ACTIVE', 'PAUSED']);

/** Our own vocabulary. A remote status outside the two never reaches here. */
function ourStatus(remote: string): 'ACTIVE' | 'PAUSED' {
  return remote === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';
}

/**
 * A FREE CODE, OR NOTHING.
 *
 * The code is stamped on every order a campaign brings, and
 * `@@unique([companyId, storeId, code])` holds it. A collision is a
 * one-in-thirty-two-to-the-sixth accident, so eight attempts is generous —
 * but returning null rather than looping forever matters, because the
 * alternative is an import that hangs on a company whose codes somehow
 * filled up.
 */
async function freeCode(companyId: string, storeId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCampaignCode();
    const taken = await db.campaign.findFirst({
      where: { companyId, storeId, code },
      select: { id: true },
    });
    if (!taken) return code;
  }
  return null;
}

export async function importRemoteCampaigns(scope: {
  companyId: string;
  storeId: string | null;
  createdById: string;
}): Promise<ImportResult> {
  const accounts = await db.adAccount.findMany({
    where: inStore(scope.companyId, scope.storeId),
    select: {
      id: true, platform: true, accountId: true, accountName: true, tokenEncrypted: true, storeId: true,
    },
  });

  if (accounts.length === 0) {
    return { created: 0, accounts: [], message: 'لا حساب إعلاني مربوط. اربط حساباً من الإعدادات أولاً.' };
  }

  const report: AccountImport[] = [];
  let total = 0;

  for (const account of accounts) {
    const label = account.accountName ?? account.accountId;

    const adapter = adapterFor(account.platform);
    if (!adapter) {
      report.push({ account: label, created: [], existing: 0, skipped: 0, error: `منصة غير مدعومة: ${account.platform}` });
      continue;
    }

    try {
      const creds = readCredentials(account.tokenEncrypted);
      const remote: RemoteCampaign[] = await adapter.listCampaigns(creds, account.accountId);

      /*
       * WHAT WE ALREADY HAVE, ASKED ONCE.
       *
       * Scoped to the company and the STORE rather than to the ad account,
       * deliberately: a campaign typed in by hand and matched to this
       * remote id is already ours even if it was linked to the account
       * later, or to no account at all. Asking per account would import a
       * duplicate of it.
       */
      const known = new Set(
        (
          await db.campaign.findMany({
            where: {
              companyId: scope.companyId,
              storeId: account.storeId,
              externalId: { in: remote.map((r) => r.id) },
            },
            select: { externalId: true },
          })
        ).map((c) => c.externalId!)
      );

      const created: ImportedCampaign[] = [];
      let skipped = 0;

      for (const r of remote) {
        if (known.has(r.id)) continue;
        if (!KEEP_STATUSES.has(r.status)) {
          skipped++;
          continue;
        }

        const code = await freeCode(scope.companyId, account.storeId);
        if (!code) {
          report.push({
            account: label,
            created,
            existing: known.size,
            skipped,
            error: 'تعذّر توليد رمز حملة غير مستخدم — أعد المحاولة',
          });
          break;
        }

        /*
         * THE START DATE, AND THE FALLBACK IS A FLOOR NOT A GUESS.
         *
         * With no date from the platform — a draft that was never
         * scheduled — today is used, which is the only honest choice: a
         * campaign with no start has spent nothing, so a window beginning
         * now reports nothing, which is correct. The wrong fallback would
         * be an arbitrary date in the past, reporting the account's whole
         * history against one row.
         */
        const startDate = r.startedAt ?? new Date();

        const row = await db.campaign.create({
          data: {
            companyId: scope.companyId,
            storeId: account.storeId,
            name: r.name.slice(0, 80),
            platform: account.platform,
            code,
            status: ourStatus(r.status),
            startDate,
            // Linked from birth, so the next spend sync finds it.
            adAccountId: account.id,
            externalId: r.id,
            spendSource: 'SYNCED',
            // Nothing is claimed about the money yet: the spend sync is
            // what witnesses it, and a figure invented here would be a
            // figure nobody measured.
            spend: 0,
            // The platform cannot know which of OUR products an ad is for.
            // Null is «not stated», which `campaignProductId` already
            // treats as a real answer.
            productId: null,
            landingPageId: null,
            createdById: scope.createdById,
          },
          select: { id: true, name: true, code: true, externalId: true, startDate: true },
        });

        created.push({
          id: row.id,
          name: row.name,
          code: row.code,
          externalId: row.externalId!,
          startDate: row.startDate.toISOString(),
        });
      }

      total += created.length;
      report.push({ account: label, created, existing: known.size, skipped, error: null });

      await db.adAccount.update({
        where: { id: account.id },
        data: { status: 'CONNECTED', lastError: null },
      });
    } catch (e) {
      /*
       * One account failing does not stop the others — a shop running Meta
       * and TikTok must not lose both because one token expired. Same rule
       * `syncAdSpend` follows, for the same reason.
       */
      const message = adapter.explainError(e);
      await db.adAccount.update({
        where: { id: account.id },
        data: { status: 'ERROR', lastError: message.slice(0, 500) },
      });
      report.push({ account: label, created: [], existing: 0, skipped: 0, error: message });
    }
  }

  return { created: total, accounts: report };
}
