import { db } from './db';

/**
 * Which countries and stores an employee may enter.
 *
 * Two paths write this: creating the account (POST /api/users) and editing it
 * later (PUT /api/users/:id/geo-access). They validate identically because
 * they are the same question — a store assigned outside its country, or one
 * belonging to another company, is a tenant leak whichever screen it came
 * from.
 */

export interface GeoAccessSelection {
  countryIds: string[];
  storeIds: string[];
}

/** Arabic reason the selection is invalid, or null when it is sound. */
export async function geoAccessError(
  companyId: string,
  countryIds: string[],
  storeIds: string[]
): Promise<string | null> {
  if (countryIds.length) {
    const valid = await db.country.count({ where: { companyId, id: { in: countryIds } } });
    if (valid !== countryIds.length) return 'بلد غير موجود';
  }
  if (storeIds.length) {
    if (!countryIds.length) return 'كل متجر يجب أن يكون ضمن بلد مُسند للمستخدم';
    const valid = await db.store.count({
      where: { companyId, id: { in: storeIds }, countryId: { in: countryIds } },
    });
    if (valid !== storeIds.length) return 'كل متجر يجب أن يكون ضمن بلد مُسند للمستخدم';
  }
  return null;
}

/** What the user can reach today (for the audit trail and the editor). */
export async function currentGeoAccess(userId: string): Promise<GeoAccessSelection> {
  const [countries, stores] = await Promise.all([
    db.userCountryAccess.findMany({ where: { userId }, select: { countryId: true } }),
    db.userStoreAccess.findMany({ where: { userId }, select: { storeId: true } }),
  ]);
  return { countryIds: countries.map((c) => c.countryId), storeIds: stores.map((s) => s.storeId) };
}

type Tx = {
  userCountryAccess: { deleteMany: Function; createMany: Function };
  userStoreAccess: { deleteMany: Function; createMany: Function };
};

/**
 * Replace the assignments wholesale — the selection on screen IS the access,
 * so a removed country has to disappear, not linger.
 */
export async function replaceGeoAccess(
  tx: Tx,
  userId: string,
  countryIds: string[],
  storeIds: string[]
): Promise<void> {
  await tx.userCountryAccess.deleteMany({ where: { userId } });
  await tx.userStoreAccess.deleteMany({ where: { userId } });
  if (countryIds.length) {
    await tx.userCountryAccess.createMany({ data: countryIds.map((countryId) => ({ userId, countryId })) });
  }
  if (storeIds.length) {
    await tx.userStoreAccess.createMany({ data: storeIds.map((storeId) => ({ userId, storeId })) });
  }
}
