/**
 * What a store's type is called, everywhere it is shown.
 *
 * One constant, because the badge used to be written out by hand in four
 * screens — and the product's own name for this kind of store is "Single
 * Product". Client-safe: no database import.
 */
export const STORE_TYPE_LABEL: Record<'SINGLE_PRODUCT' | 'MULTI_PRODUCT', string> = {
  SINGLE_PRODUCT: 'Single Product',
  MULTI_PRODUCT: 'متعدد المنتجات',
};

export function storeTypeLabel(type: string | null | undefined): string {
  return type === 'SINGLE_PRODUCT' ? STORE_TYPE_LABEL.SINGLE_PRODUCT : STORE_TYPE_LABEL.MULTI_PRODUCT;
}
