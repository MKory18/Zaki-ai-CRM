/**
 * ONE WORD PER PRODUCT STATUS.
 *
 * The schema says the column is `ACTIVE | INACTIVE | OUT_OF_STOCK`. The
 * screens said five different things about it:
 *
 *   OUT_OF_STOCK   «نفد المخزون» on the products badge
 *                  «نفد من المخزون» in that same screen's own dropdown
 *                  «نفد المخزون» in its other dropdown
 *                  «نفد من المخزن» in `i18n.ts` — المخزن, not المخزون
 *   ACTIVE         «نشط» in the list, and the raw word `ACTIVE` on the
 *                  product's own page
 *
 * So a person reading the badge and then opening the dropdown beside it
 * read two different words for the state they had just been shown, and the
 * product's own page showed them the database's.
 *
 * `INACTIVE` is «غير نشط» and not «موقوف»: a withdrawn product is not
 * suspended, and `product-grade.ts` already says so where it refuses to
 * grade one — «A withdrawn product is not a defect».
 */

export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK'] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_AR: Record<ProductStatus, string> = {
  ACTIVE: 'نشط',
  INACTIVE: 'غير نشط',
  // «المخزون» is the stock; «المخزن» is the building it sits in.
  OUT_OF_STOCK: 'نفد المخزون',
};

/**
 * The word for a stored value, whatever it turns out to be.
 *
 * A status the schema does not name is a bug upstream, and printing the
 * raw value down a column is not how anybody finds out about it — but it
 * is better than an empty badge, so the value itself is the fallback.
 */
export function productStatusAr(status: string | null | undefined): string {
  if (!status) return '—';
  return PRODUCT_STATUS_AR[status as ProductStatus] ?? status;
}

/** Good, or needing attention. The third state is not a failure. */
export function productStatusTone(status: string | null | undefined): 'success' | 'warning' {
  return status === 'ACTIVE' ? 'success' : 'warning';
}
