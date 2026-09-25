import type { Prisma } from '@prisma/client';
import type { db as DB } from './db';
import { bandsForRole } from './performance-score';

type Tx = Prisma.TransactionClient | typeof DB;

/**
 * WHO A PERSON IS RANKED AGAINST.
 *
 * The same role, in the same store, and active. All three matter:
 *
 * A different role is a different set of bands, so the numbers are not
 * comparable and a rank across them would be a comparison of two different
 * measurements wearing one name.
 *
 * A different store is a different business — different products, different
 * couriers, different customers. That is the store isolation rule, and a
 * league table is exactly where it would be broken by accident.
 *
 * And somebody who left is not competition. Leaving them in would let a
 * strong month by a person who is gone keep lowering everybody's volume
 * band forever.
 */
export async function peersOf(
  tx: Tx,
  scope: { companyId: string; storeId: string; role: string }
): Promise<{ id: string; name: string }[]> {
  // A role this score does not measure has no peers — there is nothing to
  // rank, and returning the whole company would invent a league.
  if (bandsForRole(scope.role).length === 0) return [];

  return tx.user.findMany({
    where: {
      companyId: scope.companyId,
      role: scope.role,
      status: 'ACTIVE',
      // A user assigned to no store is assigned to all of them.
      OR: [{ storeAccess: { some: { storeId: scope.storeId } } }, { storeAccess: { none: {} } }],
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
