/**
 * Where a store's uploaded logo is served from — publicly, because shoppers
 * on the storefront see it without signing in. One definition, used by the
 * upload route that writes it and by anything that needs to recognise it.
 */
export const STORE_LOGO_PREFIX = '/api/public/store-logo/';

export function storeLogoUrl(storeId: string, fileName: string): string {
  return `${STORE_LOGO_PREFIX}${storeId}/${fileName}`;
}

/** The exact shape of an uploaded file name: a uuid and an image extension. */
export const STORE_LOGO_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i;
