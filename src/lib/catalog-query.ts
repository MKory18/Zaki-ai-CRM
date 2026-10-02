import { matchesAttributes, type ProductAttributes } from './product-attributes';

/**
 * NARROWING A GRID, AND PUTTING IT IN AN ORDER.
 *
 * Pure, over the products the page already loaded. Three rules earn their
 * place here rather than in whatever component draws the grid:
 *
 * THE PRICE FILTERED ON IS THE PRICE SHOWN. A shopper drags a slider
 * against the number on the card — `fromPrice`, the cheapest per-unit
 * bundle. Filtering on `basePrice` while showing `fromPrice` makes a
 * product vanish at a figure it never displayed, and there is no message
 * that explains that to anybody.
 *
 * «الأكثر مبيعاً» IS NOT A DEFAULT WE MAY FALL BACK TO. It is a claim about
 * delivered orders. When nothing can prove it, this returns the sort it
 * ACTUALLY used, so the page can put «مختارات» over the grid instead of a
 * sentence that is not true. The brief says it in those words, and a silent
 * fallback would have made the label the lie.
 *
 * AND «عرض المزيد» IS A BUTTON. Not an infinite scroll: it costs less on a
 * weak phone, and it leaves the footer reachable — which on a shop is where
 * the return policy and the phone number live.
 */

export const SORTS = ['bestSelling', 'newest', 'priceAsc', 'priceDesc'] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABEL_AR: Record<Sort, string> = {
  bestSelling: 'الأكثر مبيعاً',
  newest: 'الأحدث',
  priceAsc: 'الأقل سعراً',
  priceDesc: 'الأعلى سعراً',
};

/**
 * What the grid says when it could not prove «الأكثر مبيعاً».
 *
 * A hand-picked or merely recent order is «مختارات». The word matters: the
 * other one is a statement about what other customers did.
 */
export const CURATED_LABEL_AR = 'مختارات';

export const DEFAULT_PER_PAGE = 24;
export const MAX_PER_PAGE = 60;

export interface Listable {
  id: string;
  name: string;
  /** The number on the card — and so the number a price filter compares. */
  fromPrice: number;
  createdAt?: Date | string | null;
  category?: { id: string; name: string } | null;
  attributes?: ProductAttributes;
}

export interface CatalogFilters {
  categoryId?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  /** key → the options ticked. One field is «or»; two fields are «and». */
  attributes?: Record<string, string[]>;
  sort?: Sort;
  /** 1-based, and «عرض المزيد» asks for the next one. */
  page?: number;
  perPage?: number;
}

export interface CatalogPage<T> {
  items: T[];
  /** How many matched, before the page was cut out of them. */
  total: number;
  /** Whether «عرض المزيد» has anything to show. */
  hasMore: boolean;
  /**
   * The sort ACTUALLY used, which is not always the one asked for — see the
   * note on «الأكثر مبيعاً» above.
   */
  sort: Sort;
  /** What to write over the grid. Never «الأكثر مبيعاً» unless it was. */
  sortLabel: string;
}

const time = (v: Date | string | null | undefined): number => {
  if (!v) return 0;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : 0;
};

/**
 * The page of the catalogue a shopper asked for.
 *
 * `sales` is how many of each product real delivered orders carried. It is
 * the only thing that may produce «الأكثر مبيعاً», and it is passed in
 * rather than read here so this stays pure and so the caller cannot get it
 * from anywhere else by accident.
 */
export function catalogPage<T extends Listable>(
  products: T[],
  filters: CatalogFilters = {},
  sales?: Map<string, number>
): CatalogPage<T> {
  const {
    categoryId = null,
    minPrice = null,
    maxPrice = null,
    attributes = {},
    page = 1,
    perPage = DEFAULT_PER_PAGE,
  } = filters;

  const matched = products.filter((p) => {
    if (categoryId && p.category?.id !== categoryId) return false;
    if (minPrice !== null && p.fromPrice < minPrice) return false;
    if (maxPrice !== null && p.fromPrice > maxPrice) return false;
    return matchesAttributes(p.attributes ?? {}, attributes);
  });

  // Asked for, and whether it can be honoured. A sales map with nothing in
  // it proves nothing, so it is treated as absent rather than as «everybody
  // sold zero» — which would rank the catalogue by its own name.
  const asked: Sort = filters.sort && SORTS.includes(filters.sort) ? filters.sort : 'newest';
  const canProveBestSelling = Boolean(sales && sales.size > 0);
  const sort: Sort = asked === 'bestSelling' && !canProveBestSelling ? 'newest' : asked;

  const sorted = [...matched].sort((a, b) => {
    switch (sort) {
      case 'bestSelling': {
        const d = (sales!.get(b.id) ?? 0) - (sales!.get(a.id) ?? 0);
        if (d !== 0) return d;
        break;
      }
      case 'priceAsc':
        if (a.fromPrice !== b.fromPrice) return a.fromPrice - b.fromPrice;
        break;
      case 'priceDesc':
        if (a.fromPrice !== b.fromPrice) return b.fromPrice - a.fromPrice;
        break;
      case 'newest': {
        const d = time(b.createdAt) - time(a.createdAt);
        if (d !== 0) return d;
        break;
      }
    }
    // Ties go alphabetically rather than by whatever order the rows arrived
    // in: a grid that reshuffles between two identical requests looks broken.
    return a.name.localeCompare(b.name, 'ar');
  });

  const size = Math.max(1, Math.min(MAX_PER_PAGE, Math.trunc(perPage) || DEFAULT_PER_PAGE));
  const at = Math.max(1, Math.trunc(page) || 1);
  const start = (at - 1) * size;

  return {
    items: sorted.slice(start, start + size),
    total: sorted.length,
    hasMore: start + size < sorted.length,
    sort,
    sortLabel: sort === asked ? SORT_LABEL_AR[sort] : CURATED_LABEL_AR,
  };
}

/**
 * The cheapest and dearest thing on the shelf, for the slider's ends.
 *
 * From the products BEFORE any price narrowing — a slider whose ends move
 * to wherever it was last dragged cannot be dragged back.
 */
export function priceBounds(products: Listable[]): { min: number; max: number } | null {
  const prices = products.map((p) => p.fromPrice).filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? null : { min, max };
}
