/**
 * THE ONE WAY A QUERY ASKS FOR "THIS STORE'S ROWS".
 *
 * A tenant filter that is written by hand at each call site is a tenant
 * filter that is eventually forgotten at one of them, and the one that is
 * forgotten does not fail — it returns MORE rows, which looks like working
 * software. That is exactly how the stock ledger came to show every store's
 * movements to every store: the column was there and populated, and two
 * queries out of dozens simply said `{ companyId }` and stopped.
 *
 * So: a function whose name is the question, used everywhere, and a test
 * that asserts the refusing case rather than the working one.
 *
 * `null` storeId means the user has not selected a store. That must match
 * NOTHING, not everything — "no store chosen" is the state a fresh session
 * is in, and answering it with the whole company is the leak in its most
 * convenient disguise.
 */

export interface StoreFilter {
  companyId: string;
  storeId?: string | { in: string[] };
  id?: { in: string[] };
}

/**
 * Rows belonging to the caller's store.
 *
 * With no store selected this returns a clause that matches nothing, which
 * is the safe answer and the honest one: a screen that needs a store should
 * say so, not quietly widen.
 */
export function inStore(companyId: string, storeId: string | null | undefined): StoreFilter {
  if (!storeId) return { companyId, id: { in: [] as string[] } };
  return { companyId, storeId };
}

/**
 * Rows belonging to the caller's store, plus rows belonging to no store.
 *
 * For tables that predate stores and still hold unassigned rows. Use it
 * only where leaving those rows invisible would hide real history from
 * everyone — never as a convenience to avoid filling the column in.
 */
export function inStoreOrShared(companyId: string, storeId: string | null | undefined) {
  if (!storeId) return { companyId, storeId: null };
  return { companyId, OR: [{ storeId }, { storeId: null }] };
}

/**
 * Does a row the caller already has belong to their store?
 *
 * For the check after a lookup by id, where the filter above cannot be
 * used. A row with no store belongs to no store and so never passes.
 */
export function belongsToStore(
  row: { companyId: string; storeId?: string | null } | null | undefined,
  companyId: string,
  storeId: string | null | undefined
): boolean {
  if (!row) return false;
  if (row.companyId !== companyId) return false;
  if (!storeId) return false;
  if (row.storeId == null) return false;
  return row.storeId === storeId;
}
