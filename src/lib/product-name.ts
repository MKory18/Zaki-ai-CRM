/** Locale-aware product name/description resolution with graceful fallback */
export function productName(
  product: { name?: string | null; nameEn?: string | null },
  locale: 'ar' | 'en'
): string {
  if (!product) return '';
  if (locale === 'en') {
    return product.nameEn || product.name || '';
  }
  return product.name || product.nameEn || '';
}
