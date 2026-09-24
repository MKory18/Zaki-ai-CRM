import { db } from './db';
import { campaignCodeSchema } from './campaigns';

/**
 * RESOLVING THE CODE A VISITOR ARRIVED WITH.
 *
 * Apart from `campaigns.ts` because that file is imported by the screen,
 * and a screen that imports the database drags a Prisma client into the
 * browser bundle. Pure arithmetic and lists there; anything that touches a
 * row, here.
 */

/**
 * The campaign a visitor arrived with, if the code is real and this store's.
 *
 * The browser sends a CODE and never an id. An id taken from a request
 * would let anyone credit another shop's spend with their own order, and
 * attribution that can be forged is attribution nobody can act on.
 *
 * A code that matches nothing returns null and the order is still created:
 * a mistyped link in an ad must never cost a sale. The order simply does
 * not know which campaign brought it, which is the truth.
 */
export async function resolveCampaign(
  companyId: string,
  storeId: string,
  rawCode: unknown
): Promise<string | null> {
  if (typeof rawCode !== 'string') return null;
  const parsed = campaignCodeSchema.safeParse(rawCode);
  if (!parsed.success) return null;

  const found = await db.campaign.findFirst({
    // Scoped to the store, not just the company: two shops may well pick
    // the same short code, and the unique index only promises they cannot
    // do it within one shop.
    where: { companyId, storeId, code: parsed.data },
    select: { id: true },
  });
  return found?.id ?? null;
}
