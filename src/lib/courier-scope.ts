/**
 * WHICH COURIERS A STORE MAY SEE AND USE.
 *
 * The owner runs stores that are separate businesses. Each holds its own
 * account with the same courier — its own login, its own company id there,
 * its own statements coming back. A courier row therefore belongs to one
 * store, or to all of them.
 *
 * `storeId = null` means every store, which is what every row meant before
 * this existed. Nothing that already works stops working, and no order
 * changes hands.
 *
 * One function, used by every listing and every guard. Six places built
 * their own `where` before; six copies of a rule is six chances for one of
 * them to drift, and the one that drifts here creates a parcel under
 * another store's account, with the money coming back to the wrong books.
 */

/** The `where` fragment for couriers this store may use. */
export function courierScope(companyId: string, storeId: string | null | undefined) {
  if (!storeId) return { companyId };
  return { companyId, OR: [{ storeId }, { storeId: null }] };
}

/** True when this courier row may be used by this store. */
export function courierBelongsToStore(
  provider: { companyId: string; storeId?: string | null },
  companyId: string,
  storeId: string | null | undefined
): boolean {
  if (provider.companyId !== companyId) return false;
  // Shared couriers serve everyone; a store-owned one serves only its store.
  if (provider.storeId == null) return true;
  return provider.storeId === storeId;
}

/**
 * Everything that would lose its courier if this row were deleted.
 *
 * A hard delete sets `deliveryProviderId` to null on orders, batches and
 * attempts, and CASCADES the delivery-fee rows out of existence. An order
 * that no longer knows who shipped it cannot be settled, matched to a
 * statement, or explained to the customer — and it is history, so there is
 * nothing to re-enter.
 *
 * Counting orders alone is not enough: a courier can hold fee rows, batches
 * or a statement with no order against it yet.
 */
export interface CourierUsage {
  orders: number;
  batches: number;
  statements: number;
  fees: number;
  attempts: number;
}

export function isCourierInUse(usage: CourierUsage): boolean {
  return Object.values(usage).some((n) => n > 0);
}

/** Arabic for what is holding the courier in place, for the refusal message. */
export function describeUsage(usage: CourierUsage): string {
  const parts: string[] = [];
  if (usage.orders) parts.push(`${usage.orders} طلب`);
  if (usage.batches) parts.push(`${usage.batches} دفعة شحن`);
  if (usage.statements) parts.push(`${usage.statements} كشف`);
  if (usage.fees) parts.push(`${usage.fees} أجرة توصيل`);
  if (usage.attempts) parts.push(`${usage.attempts} محاولة توصيل`);
  return parts.join(' · ');
}
