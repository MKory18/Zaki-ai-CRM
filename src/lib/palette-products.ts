import { db } from './db';
import { getPermissionScope } from './authorization';
import { productScopeWhere } from './product-scope';
import { typed } from './text-search';
import type { SessionUser } from '@/types/auth';

/**
 * PRODUCTS, FOR THE COMMAND PALETTE — A NAME, A CODE, AND NOTHING ELSE.
 *
 * Ctrl+K found order numbers and colleagues, and a product by name meant leaving for the
 * catalogue to type it again. Typing «كريم» now offers the product itself, one press from its page.
 *
 * What it will NOT do is the point of the file:
 *   · it asks `products.view` and reads the SAME scope the catalogue lists (`productScopeWhere`),
 *     so a grant narrowed to one category finds that category and no other;
 *   · it selects an id, a name and a code — no cost, no price, no stock. The catalogue decides who
 *     may see those (`cost-visibility`), and a search box is not a way around it;
 *   · customers are not here. They are personal data, and the owner's answer (24/10) was products only;
 *   · it is four rows, ordered by name: a palette is a shortcut, not a second catalogue.
 */

export interface PaletteProduct {
  id: string;
  name: string;
  sku: string;
}

export async function paletteProducts(
  user: SessionUser,
  tenant: { companyId: string; storeId: string },
  term: string
): Promise<PaletteProduct[]> {
  const scope = getPermissionScope(user, 'products.view');
  if (!scope) return [];
  return db.product.findMany({
    where: {
      AND: [
        productScopeWhere(scope, tenant.companyId, tenant.storeId),
        { OR: [{ name: typed(term) }, { nameEn: typed(term) }, { sku: typed(term) }] },
      ],
    },
    orderBy: { name: 'asc' },
    take: 4,
    select: { id: true, name: true, sku: true },
  });
}
